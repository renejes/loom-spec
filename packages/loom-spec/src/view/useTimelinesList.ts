import { useCallback, useEffect, useState } from "react";
import { listTimelines, type TimelineSummary } from "./loadDiagram";

/**
 * Fetches the list of all timelines from the server. Refresh on demand.
 */
export function useTimelinesList() {
  const [timelines, setTimelines] = useState<TimelineSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listTimelines()
      .then(setTimelines)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { timelines, error, refresh };
}
