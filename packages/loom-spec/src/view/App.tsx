import { useCallback } from "react";
import { DiagramView } from "./components/DiagramView";
import { useViewState } from "./useViewState";
import { useDiagramsList } from "./useDiagramsList";

// Re-export for backwards compatibility with components that import Selection
// from "../App" (e.g. DiagramCanvas).
export type { Selection } from "./components/DiagramView";

export function App() {
  const { view, navigate, isDefault } = useViewState();
  const { diagrams, refresh: refreshDiagrams } = useDiagramsList();

  const goHome = useCallback(
    () => navigate({ kind: "diagram", id: "overview" }),
    [navigate]
  );

  return (
    <DiagramView
      id={view.id}
      diagrams={diagrams}
      refreshDiagrams={refreshDiagrams}
      isDefault={isDefault}
      onClickHome={goHome}
      onNavigate={navigate}
    />
  );
}
