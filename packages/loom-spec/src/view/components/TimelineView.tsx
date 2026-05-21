import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineInspector } from "./TimelineInspector";
import { TransportBar } from "./TransportBar";
import { useTimelineState } from "../useTimelineState";
import type { ViewState } from "../useViewState";
import type { DiagramSummary, TimelineSummary } from "../loadDiagram";

interface Props {
  id: string;
  diagrams: DiagramSummary[];
  timelines: TimelineSummary[];
  isDefault: boolean;
  onClickHome: () => void;
  onNavigate: (view: ViewState) => void;
  onCreateDiagram: () => void;
}

export function TimelineView({
  id,
  diagrams,
  timelines,
  isDefault,
  onClickHome,
  onNavigate,
  onCreateDiagram,
}: Props) {
  const state = useTimelineState(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ─── Playback state (transient, not persisted) ──────────────────
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);

  const totalMs = useMemo(() => {
    if (!state.timeline) return 0;
    return state.timeline.events.reduce(
      (m, e) => Math.max(m, e.start_ms + e.duration_ms),
      0
    );
  }, [state.timeline]);

  // Playback tick. setInterval (not rAF) so the loop keeps running even
  // when the tab is in the background or inside an iframe that throttles
  // rAF. The visible difference at 60Hz is negligible for a playhead.
  useEffect(() => {
    if (!playing) {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    lastTickRef.current = performance.now();
    tickRef.current = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      setPositionMs((p) => {
        const next = p + dt * speed;
        if (next >= totalMs) {
          setPlaying(false);
          return totalMs;
        }
        return next;
      });
    }, 16);
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current);
    };
  }, [playing, speed, totalMs]);

  const onPlayPause = useCallback(() => {
    if (totalMs === 0) return;
    setPlaying((p) => {
      if (!p && positionMs >= totalMs) setPositionMs(0);
      return !p;
    });
  }, [positionMs, totalMs]);

  const onReset = useCallback(() => {
    setPositionMs(0);
    setPlaying(false);
  }, []);

  const onScrub = useCallback((ms: number) => {
    setPositionMs(ms);
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when focus is in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        onPlayPause();
      } else if (e.key === "Home") {
        e.preventDefault();
        onReset();
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        state.deleteEvent(selectedId);
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPlayPause, onReset, selectedId, state]);

  if (state.loadError) {
    return (
      <div className="app timeline-app">
        <div className="topbar">
          <div className="title">loom-spec</div>
        </div>
        <div className="canvas-wrap" style={{ padding: 24 }}>
          <code style={{ color: "var(--status-stale)" }}>
            Failed to load: {state.loadError}
          </code>
        </div>
        <div className="inspector">
          <div className="empty">—</div>
        </div>
      </div>
    );
  }

  if (!state.timeline || !state.diagram || !state.nodeTypes) {
    return (
      <div className="app timeline-app">
        <div className="topbar">
          <div className="title">loom-spec</div>
        </div>
        <div className="canvas-wrap" style={{ padding: 24, color: "var(--text-muted)" }}>
          Loading timeline…
        </div>
        <div className="inspector">
          <div className="empty">—</div>
        </div>
      </div>
    );
  }

  const selectedEvent =
    selectedId
      ? state.timeline.events.find((e) => e.id === selectedId) ?? null
      : null;

  return (
    <div className="app timeline-app">
      <TopBar
        viewKind="timeline"
        viewId={id}
        title={state.timeline.title}
        subtitle={state.timeline.description}
        diagrams={diagrams}
        timelines={timelines}
        saveStatus={state.saveStatus}
        saveError={state.saveError}
        connectionStatus={state.connectionStatus}
        onClickAdd={() => {}}
        addMenuOpen={false}
        isDefault={isDefault}
        onClickHome={onClickHome}
        onNavigate={onNavigate}
        onCreateDiagram={onCreateDiagram}
        addButtonRef={null}
        hideAddButton
      />
      <TransportBar
        playing={playing}
        positionMs={positionMs}
        totalMs={totalMs}
        speed={speed}
        onPlayPause={onPlayPause}
        onReset={onReset}
        onSpeed={setSpeed}
      />
      <div className="canvas-wrap timeline-canvas-wrap">
        <TimelineCanvas
          timeline={state.timeline}
          diagram={state.diagram}
          nodeTypes={state.nodeTypes}
          selectedEventId={selectedId}
          onSelectEvent={setSelectedId}
          onUpdateEvent={state.updateEvent}
          playheadMs={positionMs}
          onScrub={onScrub}
        />
      </div>
      <TimelineInspector
        selectedEvent={selectedEvent}
        diagram={state.diagram}
      />
    </div>
  );
}
