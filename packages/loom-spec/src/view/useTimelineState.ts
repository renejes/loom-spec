import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoomTimeline, TimelineEvent } from "../types/timeline";
import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import { loadDiagram, loadTimeline, saveTimeline } from "./loadDiagram";
import { isExportMode } from "./exportMode";
import type { ConnectionStatus, SaveStatus } from "./state";

interface TimelineStateInternal {
  timeline: LoomTimeline | null;
  diagram: LoomDiagram | null;
  nodeTypes: LoomNodeTypes | null;
  loadError: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  connectionStatus: ConnectionStatus;
}

const SAVE_DEBOUNCE_MS = 500;

/**
 * State for a single timeline view: the timeline itself, the referenced
 * diagram, node-types (for coloring), live-sync over SSE, and mutators
 * with debounced auto-save mirroring the diagram state pattern.
 */
export function useTimelineState(id: string) {
  const [state, setState] = useState<TimelineStateInternal>({
    timeline: null,
    diagram: null,
    nodeTypes: null,
    loadError: null,
    saveStatus: "idle",
    saveError: null,
    connectionStatus: "connecting",
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTimeline = useRef<LoomTimeline | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const initialLoadDone = useRef(false);

  // Initial + reactive loads
  useEffect(() => {
    let cancelled = false;
    initialLoadDone.current = false;

    async function load() {
      try {
        const timeline = await loadTimeline(id);
        if (cancelled) return;
        const spec = await loadDiagram(timeline.diagram);
        if (cancelled) return;
        latestTimeline.current = timeline;
        initialLoadDone.current = true;
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

  // Debounced auto-save. No-op in export mode.
  const scheduleSave = useCallback(() => {
    if (isExportMode()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setState((s) => ({ ...s, saveStatus: "dirty", saveError: null }));
    saveTimer.current = setTimeout(async () => {
      const tl = latestTimeline.current;
      if (!tl) return;
      setState((s) => ({ ...s, saveStatus: "saving" }));
      try {
        await saveTimeline(tl);
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

  // Mutators
  const updateTimeline = useCallback(
    (updater: (tl: LoomTimeline) => LoomTimeline) => {
      if (!initialLoadDone.current) return;
      setState((s) => {
        if (!s.timeline) return s;
        const next = updater(s.timeline);
        latestTimeline.current = next;
        return { ...s, timeline: next };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const updateEvent = useCallback(
    (eventId: string, updater: (e: TimelineEvent) => TimelineEvent) => {
      updateTimeline((tl) => ({
        ...tl,
        events: tl.events.map((e) => (e.id === eventId ? updater(e) : e)),
      }));
    },
    [updateTimeline]
  );

  const addEvent = useCallback(
    (event: TimelineEvent) => {
      updateTimeline((tl) => ({ ...tl, events: [...tl.events, event] }));
    },
    [updateTimeline]
  );

  const deleteEvent = useCallback(
    (eventId: string) => {
      updateTimeline((tl) => ({
        ...tl,
        events: tl.events.filter((e) => e.id !== eventId),
      }));
    },
    [updateTimeline]
  );

  // SSE — refetch on external changes, but don't clobber unsaved local
  // edits. Skipped in export mode (no server).
  useEffect(() => {
    if (isExportMode()) {
      setState((s) => ({ ...s, connectionStatus: "connected" }));
      return;
    }
    setState((s) => ({ ...s, connectionStatus: "connecting" }));
    const es = new EventSource("/api/events");

    es.onopen = () =>
      setState((s) => ({ ...s, connectionStatus: "connected" }));
    es.onerror = () =>
      setState((s) => ({ ...s, connectionStatus: "disconnected" }));

    const refetch = async () => {
      const status = stateRef.current.saveStatus;
      if (status === "dirty" || status === "saving") return;
      try {
        const timeline = await loadTimeline(id);
        const spec = await loadDiagram(timeline.diagram);
        latestTimeline.current = timeline;
        setState((s) => ({
          ...s,
          timeline,
          diagram: spec.diagram,
          nodeTypes: spec.nodeTypes,
          saveStatus: "idle",
          saveError: null,
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
      updateEvent,
      addEvent,
      deleteEvent,
    }),
    [state, updateEvent, addEvent, deleteEvent]
  );

  return api;
}

export function uniqueEventId(tl: LoomTimeline): string {
  const ids = new Set(tl.events.map((e) => e.id));
  let i = tl.events.length + 1;
  while (ids.has(`ev${i}`)) i++;
  return `ev${i}`;
}
