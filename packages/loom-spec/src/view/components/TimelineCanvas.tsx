import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LoomTimeline,
  TimelineEvent,
  TimelineTrack,
} from "../../types/timeline";
import type { LoomDiagram } from "../../types/diagram";
import type { LoomNodeTypes } from "../../types/node-types";

interface Props {
  timeline: LoomTimeline;
  diagram: LoomDiagram;
  nodeTypes: LoomNodeTypes;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  /** Edit callback — when omitted, the canvas is fully read-only. */
  onUpdateEvent?: (
    eventId: string,
    updater: (e: TimelineEvent) => TimelineEvent
  ) => void;
  /** Playback position in ms. When provided, clips containing this time
   *  glow as "active" and a playhead line is drawn. */
  playheadMs?: number;
  /** Optional callback when the user scrubs/clicks on the time axis. */
  onScrub?: (ms: number) => void;
}

const LABEL_COL_W = 110;
const AXIS_H = 30;
const TRACK_H = 52;
const RIGHT_PAD = 24;
const CLIP_V_PAD = 8;
const MIN_CLIP_W = 4;
const RESIZE_HANDLE_W = 8;
const SNAP_MS = 10;

type DragMode = "move" | "resize";

interface DragState {
  mode: DragMode;
  eventId: string;
  startX: number;
  startY: number;
  /** Snapshot of the event when drag started — applied delta computes preview. */
  originalEvent: TimelineEvent;
  pixelsPerMs: number;
  /** Current preview offsets (in ms / track index). null until the
   *  pointer has actually moved. */
  deltaMs: number;
  deltaTracks: number;
}

function pickTickStep(totalMs: number): number {
  const targetTicks = 10;
  const raw = Math.max(totalMs / targetTicks, 1);
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const ratio = raw / base;
  let step: number;
  if (ratio < 1.5) step = base;
  else if (ratio < 3.5) step = 2 * base;
  else if (ratio < 7.5) step = 5 * base;
  else step = 10 * base;
  return Math.max(step, 1);
}

function formatMs(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1000) return `${ms}ms`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function computeTracks(timeline: LoomTimeline): TimelineTrack[] {
  const out: TimelineTrack[] = [];
  const seen = new Set<string>();
  for (const t of timeline.tracks ?? []) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  for (const e of timeline.events ?? []) {
    const id = e.track ?? `node:${e.node}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ id, label: id });
    }
  }
  if (out.length === 0) out.push({ id: "default", label: "" });
  return out;
}

function eventTrackId(e: TimelineEvent): string {
  return e.track ?? `node:${e.node}`;
}

function snap(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

export function TimelineCanvas({
  timeline,
  diagram,
  nodeTypes,
  selectedEventId,
  onSelectEvent,
  onUpdateEvent,
  playheadMs,
  onScrub,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number>(800);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  // Container width → recompute layout
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const tracks = computeTracks(timeline);
    const events = timeline.events ?? [];
    const totalMs = events.reduce(
      (m, e) => Math.max(m, e.start_ms + e.duration_ms),
      0
    );

    const trackOf = new Map<string, number>();
    tracks.forEach((t, i) => trackOf.set(t.id, i));

    const usableW = Math.max(width - LABEL_COL_W - RIGHT_PAD, 100);
    const pixelsPerMs = totalMs > 0 ? usableW / totalMs : 1;
    const tickStep = pickTickStep(totalMs);
    const ticks: number[] = [];
    for (let t = 0; t <= totalMs + tickStep * 0.001; t += tickStep) {
      ticks.push(t);
    }

    const nodeTypeOf = new Map<string, string>();
    diagram.nodes.forEach((n) => nodeTypeOf.set(n.id, n.type));
    const colorOf = (e: TimelineEvent): string => {
      const type = nodeTypeOf.get(e.node);
      const def = type ? nodeTypes.types[type] : undefined;
      return def?.color ?? "#71717a";
    };

    const svgHeight = AXIS_H + tracks.length * TRACK_H + 8;
    return {
      tracks,
      trackOf,
      totalMs,
      pixelsPerMs,
      tickStep,
      ticks,
      colorOf,
      svgHeight,
    };
  }, [timeline, diagram, nodeTypes, width]);

  const { tracks, trackOf, ticks, pixelsPerMs, colorOf, svgHeight, totalMs } =
    layout;

  // Resolve preview position for a clip mid-drag
  const previewFor = (e: TimelineEvent) => {
    if (!drag || drag.eventId !== e.id) return { event: e };
    const orig = drag.originalEvent;
    if (drag.mode === "move") {
      const startMs = Math.max(0, snap(orig.start_ms + drag.deltaMs));
      const currentTrackIdx = trackOf.get(eventTrackId(orig)) ?? 0;
      const nextTrackIdx = Math.min(
        Math.max(0, currentTrackIdx + drag.deltaTracks),
        tracks.length - 1
      );
      const nextTrack = tracks[nextTrackIdx]?.id ?? orig.track;
      return {
        event: { ...orig, start_ms: startMs, track: nextTrack },
      };
    } else {
      // resize
      const dur = Math.max(SNAP_MS, snap(orig.duration_ms + drag.deltaMs));
      return { event: { ...orig, duration_ms: dur } };
    }
  };

  // Mouse events on document while dragging
  useEffect(() => {
    if (!drag) return;
    const handleMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - drag.startX;
      const deltaY = ev.clientY - drag.startY;
      const deltaMs = deltaX / drag.pixelsPerMs;
      const deltaTracks = Math.round(deltaY / TRACK_H);
      setDrag({ ...drag, deltaMs, deltaTracks });
    };
    const handleUp = () => {
      // Commit on pointer up
      const preview = previewFor(drag.originalEvent);
      if (
        onUpdateEvent &&
        (preview.event.start_ms !== drag.originalEvent.start_ms ||
          preview.event.duration_ms !== drag.originalEvent.duration_ms ||
          preview.event.track !== drag.originalEvent.track)
      ) {
        onUpdateEvent(drag.eventId, () => preview.event);
      }
      setDrag(null);
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [drag, onUpdateEvent]);

  // Scrub: drag on axis area
  useEffect(() => {
    if (!scrubbing || !onScrub) return;
    const svg = svgRef.current;
    if (!svg) return;
    const handleMove = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const x = ev.clientX - rect.left - LABEL_COL_W;
      const ms = Math.max(0, Math.min(totalMs, x / pixelsPerMs));
      onScrub(ms);
    };
    const handleUp = () => setScrubbing(false);
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [scrubbing, onScrub, totalMs, pixelsPerMs]);

  // Helper to start a clip drag
  const startDrag = (
    e: React.PointerEvent,
    event: TimelineEvent,
    mode: DragMode
  ) => {
    if (!onUpdateEvent) return; // read-only
    e.stopPropagation();
    setDrag({
      mode,
      eventId: event.id,
      startX: e.clientX,
      startY: e.clientY,
      originalEvent: event,
      pixelsPerMs,
      deltaMs: 0,
      deltaTracks: 0,
    });
  };

  const isActive = (e: TimelineEvent): boolean => {
    if (playheadMs === undefined) return false;
    return playheadMs >= e.start_ms && playheadMs <= e.start_ms + e.duration_ms;
  };

  const playheadX =
    playheadMs !== undefined
      ? LABEL_COL_W + playheadMs * pixelsPerMs
      : null;

  return (
    <div className="timeline-wrap" ref={wrapperRef}>
      <svg
        ref={svgRef}
        className="timeline-svg"
        width={width}
        height={svgHeight}
        onClick={(e) => {
          if ((e.target as Element).tagName === "svg") onSelectEvent(null);
        }}
      >
        {/* Lanes */}
        {tracks.map((t, i) => {
          const y = AXIS_H + i * TRACK_H;
          return (
            <g key={`lane-${t.id}`}>
              {t.color && (
                <rect
                  x={LABEL_COL_W}
                  y={y}
                  width={width - LABEL_COL_W - RIGHT_PAD}
                  height={TRACK_H}
                  fill={t.color}
                  opacity={0.4}
                />
              )}
              <line
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                className="timeline-lane-sep"
              />
              <text
                x={12}
                y={y + TRACK_H / 2}
                className="timeline-track-label"
                dominantBaseline="middle"
              >
                {t.label}
              </text>
            </g>
          );
        })}
        <line
          x1={0}
          x2={width}
          y1={AXIS_H + tracks.length * TRACK_H}
          y2={AXIS_H + tracks.length * TRACK_H}
          className="timeline-lane-sep"
        />

        {/* Scrub hit-area + time axis */}
        <rect
          x={LABEL_COL_W}
          y={0}
          width={width - LABEL_COL_W - RIGHT_PAD}
          height={AXIS_H}
          fill="transparent"
          style={{ cursor: onScrub ? "ew-resize" : "default" }}
          onPointerDown={(e) => {
            if (!onScrub) return;
            e.preventDefault();
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left - LABEL_COL_W;
            const ms = Math.max(0, Math.min(totalMs, x / pixelsPerMs));
            onScrub(ms);
            setScrubbing(true);
          }}
        />

        <g className="timeline-axis">
          <line
            x1={LABEL_COL_W}
            x2={width - RIGHT_PAD}
            y1={AXIS_H - 1}
            y2={AXIS_H - 1}
            className="timeline-axis-line"
          />
          {ticks.map((t) => {
            const x = LABEL_COL_W + t * pixelsPerMs;
            return (
              <g key={`tick-${t}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={AXIS_H - 6}
                  y2={AXIS_H}
                  className="timeline-tick-mark"
                />
                <line
                  x1={x}
                  x2={x}
                  y1={AXIS_H}
                  y2={svgHeight}
                  className="timeline-tick-grid"
                />
                <text
                  x={x}
                  y={AXIS_H - 9}
                  className="timeline-tick-label"
                  textAnchor="middle"
                >
                  {formatMs(t)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Clips */}
        {(timeline.events ?? []).map((origEvent) => {
          const { event } = previewFor(origEvent);
          const trackIdx = trackOf.get(eventTrackId(event)) ?? 0;
          const x = LABEL_COL_W + event.start_ms * pixelsPerMs;
          const w = Math.max(event.duration_ms * pixelsPerMs, MIN_CLIP_W);
          const y = AXIS_H + trackIdx * TRACK_H + CLIP_V_PAD;
          const h = TRACK_H - CLIP_V_PAD * 2;
          const color = colorOf(event);
          const selected = origEvent.id === selectedEventId;
          const active = isActive(event);
          const ghost = drag?.eventId === origEvent.id;

          return (
            <g
              key={origEvent.id}
              className={`timeline-clip kind-${event.kind ?? "compute"}${selected ? " selected" : ""}${active ? " active" : ""}${ghost ? " ghost" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent(origEvent.id);
              }}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={4}
                ry={4}
                fill={color}
                fillOpacity={active ? 1 : 0.85}
                stroke={selected ? "var(--accent)" : color}
                strokeWidth={selected ? 2 : 1}
                style={{ cursor: onUpdateEvent ? "grab" : "pointer" }}
                onPointerDown={(e) => startDrag(e, origEvent, "move")}
              />
              {/* Resize handle on the right edge */}
              {onUpdateEvent && w > RESIZE_HANDLE_W && (
                <rect
                  x={x + w - RESIZE_HANDLE_W}
                  y={y}
                  width={RESIZE_HANDLE_W}
                  height={h}
                  fill="transparent"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(e, origEvent, "resize")}
                />
              )}
              {w > 40 && event.label && (
                <text
                  x={x + 6}
                  y={y + h / 2}
                  className="timeline-clip-label"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {event.label}
                </text>
              )}
              <title>
                {(event.label ?? event.node) +
                  ` — ${formatMs(event.start_ms)}, ${formatMs(event.duration_ms)} long`}
              </title>
            </g>
          );
        })}

        {/* Playhead */}
        {playheadX !== null && (
          <g className="timeline-playhead" pointerEvents="none">
            <line
              x1={playheadX}
              x2={playheadX}
              y1={4}
              y2={svgHeight}
              className="timeline-playhead-line"
            />
            <polygon
              points={`${playheadX - 5},4 ${playheadX + 5},4 ${playheadX},14`}
              className="timeline-playhead-handle"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
