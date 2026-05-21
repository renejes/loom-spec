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
}

const LABEL_COL_W = 110;
const AXIS_H = 30;
const TRACK_H = 52;
const RIGHT_PAD = 24;
const CLIP_V_PAD = 8;
const MIN_CLIP_W = 4;

/** Nice tick interval for the given duration so we get ~10 ticks. */
function pickTickStep(totalMs: number): number {
  const targetTicks = 10;
  const raw = totalMs / targetTicks;
  // Snap to a "nice" step: 1, 2, 5, 10, 20, 50, 100, …
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

/** Distinct track ids in render order. Explicit tracks first, then any
 *  tracks discovered from events that weren't declared. */
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
  // Always render at least one fallback track so an empty timeline isn't
  // a 0-height SVG.
  if (out.length === 0) {
    out.push({ id: "default", label: "" });
  }
  return out;
}

function eventTrackId(e: TimelineEvent): string {
  return e.track ?? `node:${e.node}`;
}

export function TimelineCanvas({
  timeline,
  diagram,
  nodeTypes,
  selectedEventId,
  onSelectEvent,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(800);

  // Track wrapper width so the timeline scales to its container.
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

    // Map node id → type → color, for clip fills
    const nodeTypeOf = new Map<string, string>();
    diagram.nodes.forEach((n) => nodeTypeOf.set(n.id, n.type));

    const colorOf = (e: TimelineEvent): string => {
      const type = nodeTypeOf.get(e.node);
      const def = type ? nodeTypes.types[type] : undefined;
      return def?.color ?? "#71717a";
    };

    const clips = events.map((e) => {
      const trackIdx = trackOf.get(eventTrackId(e)) ?? 0;
      const x = LABEL_COL_W + e.start_ms * pixelsPerMs;
      const w = Math.max(e.duration_ms * pixelsPerMs, MIN_CLIP_W);
      const y = AXIS_H + trackIdx * TRACK_H + CLIP_V_PAD;
      const h = TRACK_H - CLIP_V_PAD * 2;
      return { event: e, x, y, w, h, color: colorOf(e) };
    });

    const svgHeight = AXIS_H + tracks.length * TRACK_H + 8;
    return { tracks, totalMs, pixelsPerMs, tickStep, ticks, clips, svgHeight };
  }, [timeline, diagram, nodeTypes, width]);

  const { tracks, ticks, pixelsPerMs, clips, svgHeight, totalMs } = layout;

  return (
    <div className="timeline-wrap" ref={wrapperRef}>
      <svg
        className="timeline-svg"
        width={width}
        height={svgHeight}
        onClick={(e) => {
          // Click on empty area → clear selection
          if ((e.target as Element).tagName === "svg") onSelectEvent(null);
        }}
      >
        {/* Track labels and lane separators */}
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

        {/* Bottom border of the lanes */}
        <line
          x1={0}
          x2={width}
          y1={AXIS_H + tracks.length * TRACK_H}
          y2={AXIS_H + tracks.length * TRACK_H}
          className="timeline-lane-sep"
        />

        {/* Time axis */}
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
        {clips.map(({ event, x, y, w, h, color }) => {
          const selected = event.id === selectedEventId;
          const isPlanned = totalMs === 0; // empty timeline placeholder

          return (
            <g
              key={event.id}
              className={`timeline-clip kind-${event.kind ?? "compute"}${selected ? " selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent(event.id);
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
                fillOpacity={isPlanned ? 0.4 : 0.85}
                stroke={selected ? "var(--accent)" : color}
                strokeWidth={selected ? 2 : 1}
              />
              {/* Label inside the clip if there's room */}
              {w > 40 && event.label && (
                <text
                  x={x + 6}
                  y={y + h / 2}
                  className="timeline-clip-label"
                  dominantBaseline="middle"
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
      </svg>
    </div>
  );
}
