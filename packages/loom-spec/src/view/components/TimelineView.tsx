import { useState } from "react";
import { TopBar } from "./TopBar";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineInspector } from "./TimelineInspector";
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
        saveStatus="idle"
        saveError={null}
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
      <div className="canvas-wrap timeline-canvas-wrap">
        <TimelineCanvas
          timeline={state.timeline}
          diagram={state.diagram}
          nodeTypes={state.nodeTypes}
          selectedEventId={selectedId}
          onSelectEvent={setSelectedId}
        />
      </div>
      <TimelineInspector
        selectedEvent={selectedEvent}
        diagram={state.diagram}
      />
    </div>
  );
}
