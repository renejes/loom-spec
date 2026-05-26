import { useCallback } from "react";
import { DiagramView } from "./components/DiagramView";
import { JourneyView } from "./components/JourneyView";
import { useViewState } from "./useViewState";
import { useDiagramsList } from "./useDiagramsList";
import { useJourneysList } from "./useJourneysList";

// Re-export for backwards compatibility with components that import Selection
// from "../App" (e.g. DiagramCanvas).
export type { Selection } from "./components/DiagramView";

export function App() {
  const { view, navigate, isDefault } = useViewState();
  const { diagrams, refresh: refreshDiagrams } = useDiagramsList();
  const { journeys } = useJourneysList();

  const goHome = useCallback(
    () => navigate({ kind: "diagram", id: "overview" }),
    [navigate]
  );

  if (view.kind === "journey") {
    return (
      <JourneyView
        id={view.id}
        diagrams={diagrams}
        journeys={journeys}
        isDefault={isDefault}
        onClickHome={goHome}
        onNavigate={navigate}
      />
    );
  }

  return (
    <DiagramView
      id={view.id}
      diagrams={diagrams}
      journeys={journeys}
      refreshDiagrams={refreshDiagrams}
      isDefault={isDefault}
      onClickHome={goHome}
      onNavigate={navigate}
    />
  );
}
