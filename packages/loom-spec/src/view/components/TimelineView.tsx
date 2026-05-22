import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { TopBar } from "./TopBar";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineInspector } from "./TimelineInspector";
import { TransportBar } from "./TransportBar";
import { DiagramCanvas } from "./DiagramCanvas";
import { AddEventMenu } from "./AddEventMenu";
import { useTimelineState, uniqueEventId } from "../useTimelineState";
import type { ViewState } from "../useViewState";
import type { DiagramSummary, TimelineSummary } from "../loadDiagram";
import type { TimelineEvent } from "../../types/timeline";

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
  const [addOpen, setAddOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(1);

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

  // Nodes whose events contain the playhead — drives both the NodeCard glow
  // in the mini graph and (via edge derivation) the pulsing edges.
  const activeNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!state.timeline) return set;
    for (const e of state.timeline.events) {
      if (positionMs >= e.start_ms && positionMs <= e.start_ms + e.duration_ms) {
        set.add(e.node);
      }
    }
    return set;
  }, [state.timeline, positionMs]);

  // Edges whose source node is currently active. Strip ":port" suffixes so
  // handle-specific edges still match their source node.
  const pulsingEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (!state.diagram) return set;
    for (const edge of state.diagram.edges) {
      const colon = edge.from.indexOf(":");
      const fromNode = colon === -1 ? edge.from : edge.from.slice(0, colon);
      if (activeNodeIds.has(fromNode)) set.add(edge.id);
    }
    return set;
  }, [state.diagram, activeNodeIds]);

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

  // Create a new event with sensible defaults: anchored at the playhead,
  // 200ms long, on the picked node. Drag/resize takes it from there.
  const onAddEvent = useCallback(
    (nodeId: string) => {
      const tl = state.timeline;
      if (!tl) return;
      const start = Math.max(0, Math.round(positionMs));
      const event: TimelineEvent = {
        id: uniqueEventId(tl),
        node: nodeId,
        start_ms: start,
        duration_ms: 200,
        kind: "compute",
      };
      state.addEvent(event);
      setSelectedId(event.id);
      setAddOpen(false);
    },
    [state, positionMs]
  );

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
        actions={
          <>
            <button
              ref={addButtonRef}
              className="transport-add-event"
              onClick={() => setAddOpen((v) => !v)}
              title="Add event at playhead"
            >
              <Plus size={14} /> Event
            </button>
            <label className="transport-zoom">
              <span className="muted">Zoom</span>
              <select
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                <option value={1}>1× (fit)</option>
                <option value={2}>2×</option>
                <option value={5}>5×</option>
                <option value={10}>10×</option>
                <option value={20}>20×</option>
              </select>
            </label>
          </>
        }
      />
      {addOpen && (
        <AddEventMenu
          diagram={state.diagram}
          nodeTypes={state.nodeTypes}
          anchorRef={addButtonRef}
          onPick={onAddEvent}
          onClose={() => setAddOpen(false)}
        />
      )}
      <div className="canvas-wrap timeline-canvas-wrap">
        <div className="timeline-split">
          <div className="timeline-split-pane timeline-split-left">
            <TimelineCanvas
              timeline={state.timeline}
              diagram={state.diagram}
              nodeTypes={state.nodeTypes}
              selectedEventId={selectedId}
              onSelectEvent={setSelectedId}
              onUpdateEvent={state.updateEvent}
              playheadMs={positionMs}
              onScrub={onScrub}
              zoom={zoom}
            />
          </div>
          <div className="timeline-split-pane timeline-split-right">
            <DiagramCanvas
              diagram={state.diagram}
              nodeTypesConfig={state.nodeTypes}
              interactive={false}
              activeNodeIds={activeNodeIds}
              pulsingEdgeIds={pulsingEdgeIds}
            />
          </div>
        </div>
      </div>
      <TimelineInspector
        selectedEvent={selectedEvent}
        diagram={state.diagram}
      />
    </div>
  );
}
