import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
  Paperclip,
} from "lucide-react";
import { TopBar } from "./TopBar";
import { DiagramCanvas } from "./DiagramCanvas";
import { useJourneyState } from "../useJourneyState";
import type { DiagramSummary } from "../loadDiagram";
import type { JourneySummary } from "../loadJourney";
import type { ViewState } from "../useViewState";
import type { JourneyStep } from "../../types/journey";

interface Props {
  id: string;
  diagrams: DiagramSummary[];
  journeys: JourneySummary[];
  isDefault: boolean;
  onClickHome: () => void;
  onNavigate: (view: ViewState) => void;
}

export function JourneyView({
  id,
  diagrams,
  journeys,
  isDefault,
  onClickHome,
  onNavigate,
}: Props) {
  const state = useJourneyState(id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Set of all node ids referenced anywhere in this journey. Anything
  // outside this set is rendered dimmed — that's how we shave the visual
  // noise the user complained about.
  const journeyNodeIds = useMemo(
    () => new Set((state.journey?.steps ?? []).map((s) => s.node)),
    [state.journey]
  );

  const currentStep: JourneyStep | null =
    state.journey?.steps[state.currentStepIndex] ?? null;

  const activeNodeIds = useMemo(
    () => (currentStep ? new Set([currentStep.node]) : new Set<string>()),
    [currentStep]
  );

  const visitedNodeIds = useMemo(
    () =>
      new Set(
        (state.journey?.steps ?? [])
          .slice(0, state.currentStepIndex)
          .map((s) => s.node)
      ),
    [state.journey, state.currentStepIndex]
  );

  const dimmedNodeIds = useMemo(() => {
    if (!state.diagram) return new Set<string>();
    return new Set(
      state.diagram.nodes
        .filter((n) => !journeyNodeIds.has(n.id))
        .map((n) => n.id)
    );
  }, [state.diagram, journeyNodeIds]);

  // Pulse the edge(s) connecting the previous step's node to the current
  // one. Just one transition at a time — "path so far" multiplied out
  // would be the visual noise we're trying to avoid.
  const pulsingEdgeIds = useMemo(() => {
    const out = new Set<string>();
    if (!state.diagram || !state.journey) return out;
    if (state.currentStepIndex === 0) return out;
    const prevNode = state.journey.steps[state.currentStepIndex - 1]!.node;
    const currNode = state.journey.steps[state.currentStepIndex]!.node;
    for (const e of state.diagram.edges) {
      const f = e.from.split(":")[0]!;
      const t = e.to.split(":")[0]!;
      if (f === prevNode && t === currNode) out.add(e.id);
      else if (
        e.direction === "bidirectional" &&
        f === currNode &&
        t === prevNode
      ) {
        out.add(e.id);
      }
    }
    return out;
  }, [state.diagram, state.journey, state.currentStepIndex]);

  // Keyboard navigation. Skip when focus is in a form control so users
  // can still type in (e.g. a future sidebar comment box).
  const { prev, next, first, last } = state;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Home") {
        e.preventDefault();
        first();
      } else if (e.key === "End") {
        e.preventDefault();
        last();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, first, last]);

  const handleDrillDown = useCallback(
    (diagramId: string) => {
      onNavigate({ kind: "diagram", id: diagramId });
    },
    [onNavigate]
  );

  if (state.loadError) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="title">loom-spec</div>
        </div>
        <div className="canvas-wrap" style={{ padding: 24 }}>
          <code style={{ color: "var(--status-stale)" }}>
            Failed to load journey: {state.loadError}
          </code>
        </div>
      </div>
    );
  }

  if (!state.journey || !state.diagram || !state.nodeTypes) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="title">loom-spec</div>
        </div>
        <div
          className="canvas-wrap"
          style={{ padding: 24, color: "var(--text-muted)" }}
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className={`journey-view${sidebarOpen ? "" : " sidebar-closed"}`}>
      <TopBar
        viewKind="journey"
        viewId={state.journey.id}
        title={state.journey.title}
        subtitle={state.journey.description}
        diagrams={diagrams}
        journeys={journeys}
        saveStatus="idle"
        saveError={null}
        connectionStatus="connected"
        isDefault={isDefault}
        onClickHome={onClickHome}
        onNavigate={onNavigate}
        hideAddButton
      />
      <StepBar
        currentStepIndex={state.currentStepIndex}
        stepCount={state.stepCount}
        currentStep={currentStep}
        onPrev={prev}
        onNext={next}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <DiagramCanvas
        diagram={state.diagram}
        nodeTypesConfig={state.nodeTypes}
        interactive={false}
        activeNodeIds={activeNodeIds}
        visitedNodeIds={visitedNodeIds}
        dimmedNodeIds={dimmedNodeIds}
        pulsingEdgeIds={pulsingEdgeIds}
        onDrillDown={handleDrillDown}
      />
      {sidebarOpen && (
        <StepSidebar
          steps={state.journey.steps}
          currentStepIndex={state.currentStepIndex}
          onSelect={state.setCurrentStepIndex}
        />
      )}
    </div>
  );
}

interface StepBarProps {
  currentStepIndex: number;
  stepCount: number;
  currentStep: JourneyStep | null;
  onPrev: () => void;
  onNext: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function StepBar({
  currentStepIndex,
  stepCount,
  currentStep,
  onPrev,
  onNext,
  sidebarOpen,
  onToggleSidebar,
}: StepBarProps) {
  const atFirst = currentStepIndex <= 0;
  const atLast = currentStepIndex >= stepCount - 1;
  const stepTitle = currentStep?.title ?? currentStep?.node ?? "";
  return (
    <div className="step-bar">
      <button
        className="step-nav"
        onClick={onPrev}
        disabled={atFirst || stepCount === 0}
        title="Previous step (←)"
        aria-label="Previous step"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <div className="step-counter">
        {stepCount === 0 ? (
          <span className="step-empty">No steps yet</span>
        ) : (
          <>
            Step <strong>{currentStepIndex + 1}</strong> of {stepCount}
          </>
        )}
      </div>
      <button
        className="step-nav"
        onClick={onNext}
        disabled={atLast || stepCount === 0}
        title="Next step (→)"
        aria-label="Next step"
      >
        Next <ChevronRight size={14} />
      </button>
      <div className="step-title" title={stepTitle}>
        {stepTitle}
      </div>
      <button
        className="step-sidebar-toggle"
        onClick={onToggleSidebar}
        title={sidebarOpen ? "Hide step details" : "Show step details"}
        aria-label={sidebarOpen ? "Hide step details" : "Show step details"}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? (
          <PanelRightClose size={14} />
        ) : (
          <PanelRightOpen size={14} />
        )}
      </button>
    </div>
  );
}

interface StepSidebarProps {
  steps: JourneyStep[];
  currentStepIndex: number;
  onSelect: (i: number) => void;
}

function StepSidebar({ steps, currentStepIndex, onSelect }: StepSidebarProps) {
  return (
    <aside className="step-sidebar">
      <div className="step-sidebar-header">Steps</div>
      <ol className="step-list">
        {steps.map((s, i) => {
          const isCurrent = i === currentStepIndex;
          const isVisited = i < currentStepIndex;
          return (
            <li
              key={s.id}
              className={`step-list-item${isCurrent ? " current" : ""}${isVisited ? " visited" : ""}`}
            >
              <button className="step-list-button" onClick={() => onSelect(i)}>
                <span className="step-list-num">{i + 1}</span>
                <div className="step-list-text">
                  <div className="step-list-title">
                    {s.title ?? <code>{s.node}</code>}
                  </div>
                  {s.description && (
                    <div className="step-list-desc">{s.description}</div>
                  )}
                  {(s.code_refs?.length ?? 0) > 0 && (
                    <div className="step-list-refs">
                      {(s.code_refs ?? []).map((r, idx) => (
                        <code key={idx}>
                          <Paperclip size={10} /> {r.path}
                          {r.symbol ? ` · ${r.symbol}` : ""}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
