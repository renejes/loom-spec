import { useCallback, useEffect, useState } from "react";
import { listJourneys, type JourneySummary } from "./loadJourney";

/**
 * Fetches the list of all journeys from the server. Refresh on demand
 * (e.g. after creating a new journey via MCP and seeing the SSE event).
 */
export function useJourneysList() {
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listJourneys()
      .then(setJourneys)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { journeys, error, refresh };
}
