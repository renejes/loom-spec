import { useEffect, useRef, useState } from "react";
import type { LoomTimeline } from "../types/timeline";
import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import { loadDiagram, loadTimeline } from "./loadDiagram";
import type { ConnectionStatus } from "./state";

interface TimelineStateInternal {
  timeline: LoomTimeline | null;
  diagram: LoomDiagram | null;
  nodeTypes: LoomNodeTypes | null;
  loadError: string | null;
  connectionStatus: ConnectionStatus;
}

/**
 * Read-only state for a timeline view. Loads the timeline file, its
 * referenced diagram (for node type lookup), and node-types (for
 * colors). Re-fetches when external edits arrive via SSE.
 *
 * Edit mutators come in step 15c.
 */
export function useTimelineState(id: string) {
  const [state, setState] = useState<TimelineStateInternal>({
    timeline: null,
    diagram: null,
    nodeTypes: null,
    loadError: null,
    connectionStatus: "connecting",
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Initial + reactive loads (re-fires when id changes)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const timeline = await loadTimeline(id);
        if (cancelled) return;
        // Load the referenced diagram + node-types for rendering context.
        const spec = await loadDiagram(timeline.diagram);
        if (cancelled) return;
        setState((s) => ({
          ...s,
          timeline,
          diagram: spec.diagram,
          nodeTypes: spec.nodeTypes,
          loadError: null,
        }));
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loadError: e instanceof Error ? e.message : String(e),
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // SSE subscription — refetch when this timeline (or its underlying
  // diagram/node-types) changes externally.
  useEffect(() => {
    setState((s) => ({ ...s, connectionStatus: "connecting" }));
    const es = new EventSource("/api/events");

    es.onopen = () =>
      setState((s) => ({ ...s, connectionStatus: "connected" }));
    es.onerror = () =>
      setState((s) => ({ ...s, connectionStatus: "disconnected" }));

    const refetch = async () => {
      try {
        const timeline = await loadTimeline(id);
        const spec = await loadDiagram(timeline.diagram);
        setState((s) => ({
          ...s,
          timeline,
          diagram: spec.diagram,
          nodeTypes: spec.nodeTypes,
          loadError: null,
        }));
      } catch {
        // keep current state on transient failure
      }
    };

    es.addEventListener("change", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          type: string;
          id?: string;
        };
        const tl = stateRef.current.timeline;
        if (data.type === "timeline-changed" && data.id === id) {
          refetch();
        } else if (
          data.type === "diagram-changed" &&
          tl &&
          data.id === tl.diagram
        ) {
          refetch();
        } else if (data.type === "node-types-changed") {
          refetch();
        }
      } catch {
        // ignore malformed
      }
    });

    return () => {
      es.close();
    };
  }, [id]);

  return state;
}
