import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import type { LoomJourney } from "../types/journey";
import { loadDiagram } from "./loadDiagram";
import { loadJourney } from "./loadJourney";
import { isExportMode } from "./exportMode";

interface JourneyStateInternal {
  journey: LoomJourney | null;
  diagram: LoomDiagram | null;
  nodeTypes: LoomNodeTypes | null;
  loadError: string | null;
}

/**
 * Loads a journey + the diagram it walks through, and tracks the current
 * step index. Read-only: edits are not yet exposed here (the MCP server
 * is the editing surface; the editor UI lives in a future slice).
 *
 * In editor mode, subscribes to SSE for live reload when the journey or
 * its diagram changes externally (e.g. agent edits while UI is open).
 */
export function useJourneyState(id: string) {
  const [state, setState] = useState<JourneyStateInternal>({
    journey: null,
    diagram: null,
    nodeTypes: null,
    loadError: null,
  });
  const [currentStepIndex, setCurrentStepIndexRaw] = useState(0);

  const load = useCallback(async () => {
    const journey = await loadJourney(id);
    const spec = await loadDiagram(journey.diagram);
    return { journey, diagram: spec.diagram, nodeTypes: spec.nodeTypes };
  }, [id]);

  // Initial load + reset step index on id change
  useEffect(() => {
    let cancelled = false;
    setCurrentStepIndexRaw(0);
    load()
      .then((r) => {
        if (cancelled) return;
        setState({
          journey: r.journey,
          diagram: r.diagram,
          nodeTypes: r.nodeTypes,
          loadError: null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loadError: e instanceof Error ? e.message : String(e),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  // Clamp the index when steps change (e.g. external delete reduces count).
  const stepCount = state.journey?.steps.length ?? 0;
  useEffect(() => {
    if (stepCount === 0) {
      if (currentStepIndex !== 0) setCurrentStepIndexRaw(0);
      return;
    }
    if (currentStepIndex >= stepCount) {
      setCurrentStepIndexRaw(stepCount - 1);
    }
  }, [stepCount, currentStepIndex]);

  const setCurrentStepIndex = useCallback(
    (i: number) => {
      if (stepCount === 0) {
        setCurrentStepIndexRaw(0);
        return;
      }
      const clamped = Math.max(0, Math.min(stepCount - 1, i));
      setCurrentStepIndexRaw(clamped);
    },
    [stepCount]
  );

  const next = useCallback(
    () => setCurrentStepIndex(currentStepIndex + 1),
    [currentStepIndex, setCurrentStepIndex]
  );
  const prev = useCallback(
    () => setCurrentStepIndex(currentStepIndex - 1),
    [currentStepIndex, setCurrentStepIndex]
  );
  const first = useCallback(() => setCurrentStepIndex(0), [setCurrentStepIndex]);
  const last = useCallback(
    () => setCurrentStepIndex(stepCount - 1),
    [stepCount, setCurrentStepIndex]
  );

  // SSE subscription for live reload (editor mode only — exported HTML has
  // no server). Mirrors the pattern in state.ts.
  const idRef = useRef(id);
  idRef.current = id;
  useEffect(() => {
    if (isExportMode()) return;
    const es = new EventSource("/api/events");
    const refetch = () => {
      load()
        .then((r) =>
          setState({
            journey: r.journey,
            diagram: r.diagram,
            nodeTypes: r.nodeTypes,
            loadError: null,
          })
        )
        .catch(() => {
          // keep existing state on failure
        });
    };
    es.addEventListener("change", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          type: string;
          id?: string;
        };
        const journey = state.journey;
        if (data.type === "journey-changed" && data.id === idRef.current) {
          refetch();
        } else if (
          data.type === "diagram-changed" &&
          journey &&
          data.id === journey.diagram
        ) {
          refetch();
        } else if (data.type === "node-types-changed") {
          refetch();
        }
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      es.close();
    };
    // state.journey is read inside the handler via closure; we don't depend
    // on it because each new journey reload re-mounts via the id-change
    // effect above. Re-subscribing on every state change would churn the
    // EventSource needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, load]);

  const api = useMemo(
    () => ({
      ...state,
      currentStepIndex,
      stepCount,
      setCurrentStepIndex,
      next,
      prev,
      first,
      last,
    }),
    [
      state,
      currentStepIndex,
      stepCount,
      setCurrentStepIndex,
      next,
      prev,
      first,
      last,
    ]
  );

  return api;
}
