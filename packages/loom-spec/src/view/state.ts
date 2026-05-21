import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoomDiagram, Node as LoomNode, Edge as LoomEdge } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import { loadDiagram, saveDiagram } from "./loadDiagram";
import { validateDiagramClient, type ValidationError } from "./validate-client";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface DiagramState {
  diagram: LoomDiagram | null;
  nodeTypes: LoomNodeTypes | null;
  loadError: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  connectionStatus: ConnectionStatus;
  validationErrors: ValidationError[];
}

const SAVE_DEBOUNCE_MS = 500;

export function useDiagramState(id: string) {
  const [state, setState] = useState<DiagramState>({
    diagram: null,
    nodeTypes: null,
    loadError: null,
    saveStatus: "idle",
    saveError: null,
    connectionStatus: "connecting",
    validationErrors: [],
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDiagram = useRef<LoomDiagram | null>(null);
  const initialLoadDone = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    loadDiagram(id)
      .then((spec) => {
        if (cancelled) return;
        latestDiagram.current = spec.diagram;
        initialLoadDone.current = true;
        setState((s) => ({
          ...s,
          diagram: spec.diagram,
          nodeTypes: spec.nodeTypes,
          validationErrors: validateDiagramClient(spec.diagram),
        }));
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
  }, [id]);

  // Debounced save
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setState((s) => ({ ...s, saveStatus: "dirty", saveError: null }));
    saveTimer.current = setTimeout(async () => {
      const d = latestDiagram.current;
      if (!d) return;
      setState((s) => ({ ...s, saveStatus: "saving" }));
      try {
        await saveDiagram(d);
        setState((s) => ({ ...s, saveStatus: "saved" }));
      } catch (e) {
        setState((s) => ({
          ...s,
          saveStatus: "error",
          saveError: e instanceof Error ? e.message : String(e),
        }));
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Diagram mutators
  const updateDiagram = useCallback(
    (updater: (d: LoomDiagram) => LoomDiagram) => {
      if (!initialLoadDone.current) return;
      setState((s) => {
        if (!s.diagram) return s;
        const next = updater(s.diagram);
        latestDiagram.current = next;
        return {
          ...s,
          diagram: next,
          validationErrors: validateDiagramClient(next),
        };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const updateNode = useCallback(
    (nodeId: string, updater: (n: LoomNode) => LoomNode) => {
      updateDiagram((d) => ({
        ...d,
        nodes: d.nodes.map((n) => (n.id === nodeId ? updater(n) : n)),
      }));
    },
    [updateDiagram]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      updateDiagram((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== nodeId),
        edges: d.edges.filter((e) => {
          const from = e.from.split(":")[0];
          const to = e.to.split(":")[0];
          return from !== nodeId && to !== nodeId;
        }),
      }));
    },
    [updateDiagram]
  );

  const addNode = useCallback(
    (node: LoomNode) => {
      updateDiagram((d) => ({ ...d, nodes: [...d.nodes, node] }));
    },
    [updateDiagram]
  );

  const updateEdge = useCallback(
    (edgeId: string, updater: (e: LoomEdge) => LoomEdge) => {
      updateDiagram((d) => ({
        ...d,
        edges: d.edges.map((e) => (e.id === edgeId ? updater(e) : e)),
      }));
    },
    [updateDiagram]
  );

  const addEdge = useCallback(
    (edge: LoomEdge) => {
      updateDiagram((d) => ({ ...d, edges: [...d.edges, edge] }));
    },
    [updateDiagram]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      updateDiagram((d) => ({
        ...d,
        edges: d.edges.filter((e) => e.id !== edgeId),
      }));
    },
    [updateDiagram]
  );

  // Subscribe to server-sent events for live updates from other writers
  // (e.g. an AI agent editing the JSON while the UI is open).
  useEffect(() => {
    setState((s) => ({ ...s, connectionStatus: "connecting" }));
    const es = new EventSource("/api/events");

    const refetchDiagram = () => {
      // Don't clobber unsaved local edits.
      const status = stateRef.current.saveStatus;
      if (status === "dirty" || status === "saving") return;
      loadDiagram(id)
        .then((spec) => {
          latestDiagram.current = spec.diagram;
          setState((s) => ({
            ...s,
            diagram: spec.diagram,
            nodeTypes: spec.nodeTypes,
            saveStatus: "idle",
            saveError: null,
            validationErrors: validateDiagramClient(spec.diagram),
          }));
        })
        .catch(() => {
          // Keep existing state on failure; user can manually reload.
        });
    };

    es.onopen = () => {
      setState((s) => ({ ...s, connectionStatus: "connected" }));
    };
    es.onerror = () => {
      // EventSource auto-reconnects with its own backoff; we just expose
      // the current state. If the browser drops back to CONNECTING, the
      // status will flip back to "connected" on the next open.
      setState((s) => ({ ...s, connectionStatus: "disconnected" }));
    };

    es.addEventListener("change", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          type: string;
          id?: string;
        };
        if (data.type === "diagram-changed" && data.id === id) {
          refetchDiagram();
        } else if (data.type === "node-types-changed") {
          refetchDiagram();
        }
      } catch {
        // ignore malformed events
      }
    });

    return () => {
      es.close();
    };
  }, [id]);

  // Cleanup pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const api = useMemo(
    () => ({
      ...state,
      updateNode,
      deleteNode,
      addNode,
      updateEdge,
      addEdge,
      deleteEdge,
    }),
    [state, updateNode, deleteNode, addNode, updateEdge, addEdge, deleteEdge]
  );

  return api;
}

// Helpers
export function uniqueNodeId(diagram: LoomDiagram, prefix: string): string {
  const ids = new Set(diagram.nodes.map((n) => n.id));
  let i = 1;
  while (ids.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

export function uniqueEdgeId(diagram: LoomDiagram): string {
  const ids = new Set(diagram.edges.map((e) => e.id));
  let i = diagram.edges.length + 1;
  while (ids.has(`e${i}`)) i++;
  return `e${i}`;
}
