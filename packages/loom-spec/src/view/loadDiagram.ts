import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import type { LoomTimeline } from "../types/timeline";
import { getExportData, isExportMode } from "./exportMode";

export interface LoadedSpec {
  diagram: LoomDiagram;
  nodeTypes: LoomNodeTypes;
}

export interface DiagramSummary {
  id: string;
  title: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = ` — ${(body as { error?: string }).error ?? ""}`;
    } catch {
      // ignore
    }
    throw new Error(`${url}: ${res.status} ${res.statusText}${detail}`);
  }
  return (await res.json()) as T;
}

function summarizeDiagram(id: string, d: LoomDiagram): DiagramSummary {
  return {
    id,
    title: d.title,
    description: d.description,
    nodeCount: d.nodes?.length ?? 0,
    edgeCount: d.edges?.length ?? 0,
  };
}

function summarizeTimeline(id: string, tl: LoomTimeline): TimelineSummary {
  const totalDurationMs = (tl.events ?? []).reduce(
    (m, e) => Math.max(m, (e.start_ms ?? 0) + (e.duration_ms ?? 0)),
    0
  );
  return {
    id,
    title: tl.title,
    description: tl.description,
    diagram: tl.diagram,
    eventCount: tl.events?.length ?? 0,
    totalDurationMs,
  };
}

export async function listDiagrams(): Promise<DiagramSummary[]> {
  const d = getExportData();
  if (d) {
    return Object.entries(d.diagrams)
      .map(([id, diagram]) => summarizeDiagram(id, diagram))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return fetchJson<DiagramSummary[]>("/api/diagrams");
}

export async function loadDiagram(id = "overview"): Promise<LoadedSpec> {
  const d = getExportData();
  if (d) {
    const diagram = d.diagrams[id];
    if (!diagram) throw new Error(`Diagram '${id}' not in this export.`);
    return { diagram, nodeTypes: d.nodeTypes };
  }
  const [diagram, nodeTypes] = await Promise.all([
    fetchJson<LoomDiagram>(`/api/diagrams/${id}`),
    fetchJson<LoomNodeTypes>("/api/node-types"),
  ]);
  return { diagram, nodeTypes };
}

export async function saveDiagram(diagram: LoomDiagram): Promise<void> {
  if (isExportMode()) {
    throw new Error("Edits are disabled in exported HTML.");
  }
  const res = await fetch(`/api/diagrams/${diagram.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(diagram),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `save failed: ${res.status} ${(body as { error?: string }).error ?? ""}`
    );
  }
}

export async function createEmptyDiagram(id: string, title: string): Promise<void> {
  const diagram: LoomDiagram = {
    version: "1",
    id,
    title,
    nodes: [],
    edges: [],
  };
  await saveDiagram(diagram);
}

// ─── Timelines ────────────────────────────────────────────────────

export interface TimelineSummary {
  id: string;
  title: string;
  description?: string;
  diagram: string;
  eventCount: number;
  totalDurationMs: number;
}

export async function listTimelines(): Promise<TimelineSummary[]> {
  const d = getExportData();
  if (d) {
    return Object.entries(d.timelines)
      .map(([id, tl]) => summarizeTimeline(id, tl))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return fetchJson<TimelineSummary[]>("/api/timelines");
}

export async function loadTimeline(id: string): Promise<LoomTimeline> {
  const d = getExportData();
  if (d) {
    const tl = d.timelines[id];
    if (!tl) throw new Error(`Timeline '${id}' not in this export.`);
    return tl;
  }
  return fetchJson<LoomTimeline>(`/api/timelines/${id}`);
}

export async function saveTimeline(timeline: LoomTimeline): Promise<void> {
  if (isExportMode()) {
    throw new Error("Edits are disabled in exported HTML.");
  }
  const res = await fetch(`/api/timelines/${timeline.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(timeline),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `save failed: ${res.status} ${(body as { error?: string }).error ?? ""}`
    );
  }
}
