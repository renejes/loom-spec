import { useCallback, useEffect, useState } from "react";
import { listDiagrams, type DiagramSummary } from "./loadDiagram";

/**
 * Fetches the list of all diagrams from the server. Refresh on demand
 * (e.g. after creating a new diagram).
 */
export function useDiagramsList() {
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listDiagrams()
      .then(setDiagrams)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { diagrams, error, refresh };
}
