import { lazy, Suspense, useCallback } from "react";
import { DiagramView } from "./components/DiagramView";
import { useViewState } from "./useViewState";
import { useDiagramsList } from "./useDiagramsList";
import { useTimelinesList } from "./useTimelinesList";
import { createEmptyDiagram } from "./loadDiagram";

// Lazy-load the timeline view so diagram-only users don't pay for it.
// Pulls in TimelineCanvas, TransportBar, AddEventMenu, etc.
const TimelineView = lazy(() =>
  import("./components/TimelineView").then((m) => ({ default: m.TimelineView }))
);

// Re-export for backwards compatibility with components that import Selection
// from "../App" (e.g. DiagramCanvas).
export type { Selection } from "./components/DiagramView";

export function App() {
  const { view, navigate, isDefault } = useViewState();
  const { diagrams, refresh: refreshDiagrams } = useDiagramsList();
  const { timelines } = useTimelinesList();

  const goHome = useCallback(
    () => navigate({ kind: "diagram", id: "overview" }),
    [navigate]
  );

  // The diagram view manages its own create-diagram flow (since it has
  // the active state). The timeline view delegates back to the diagram
  // flow if a user picks "+ New diagram…" from there.
  const handleCreateDiagramFromTimeline = useCallback(async () => {
    const rawId = window.prompt(
      "New diagram id (lowercase letters, digits, hyphens):",
      ""
    );
    if (rawId === null) return;
    const id = rawId.trim();
    if (!id) return;
    if (!/^[a-z0-9-]+$/.test(id)) {
      window.alert("Invalid id.");
      return;
    }
    if (diagrams.some((d) => d.id === id)) {
      window.alert(`A diagram with id "${id}" already exists.`);
      return;
    }
    const title =
      window.prompt(
        "Title:",
        id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      ) ?? id;
    try {
      await createEmptyDiagram(id, title);
      refreshDiagrams();
      navigate({ kind: "diagram", id });
    } catch (e) {
      window.alert(
        `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [diagrams, refreshDiagrams, navigate]);

  if (view.kind === "timeline") {
    return (
      <Suspense
        fallback={
          <div className="app timeline-app">
            <div className="topbar">
              <div className="title">loom-spec</div>
            </div>
            <div
              className="canvas-wrap"
              style={{ padding: 24, color: "var(--text-muted)" }}
            >
              Loading timeline view…
            </div>
            <div className="inspector">
              <div className="empty">—</div>
            </div>
          </div>
        }
      >
        <TimelineView
          id={view.id}
          diagrams={diagrams}
          timelines={timelines}
          isDefault={isDefault}
          onClickHome={goHome}
          onNavigate={navigate}
          onCreateDiagram={handleCreateDiagramFromTimeline}
        />
      </Suspense>
    );
  }

  return (
    <DiagramView
      id={view.id}
      diagrams={diagrams}
      timelines={timelines}
      refreshDiagrams={refreshDiagrams}
      isDefault={isDefault}
      onClickHome={goHome}
      onNavigate={navigate}
    />
  );
}
