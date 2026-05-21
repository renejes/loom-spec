import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import type { LoomTimeline } from "../types/timeline";

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

export async function listDiagrams(): Promise<DiagramSummary[]> {
  return fetchJson<DiagramSummary[]>("/api/diagrams");
}

export async function loadDiagram(id = "overview"): Promise<LoadedSpec> {
  const [diagram, nodeTypes] = await Promise.all([
    fetchJson<LoomDiagram>(`/api/diagrams/${id}`),
    fetchJson<LoomNodeTypes>("/api/node-types"),
  ]);
  return { diagram, nodeTypes };
}

export async function saveDiagram(diagram: LoomDiagram): Promise<void> {
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
  return fetchJson<TimelineSummary[]>("/api/timelines");
}

export async function loadTimeline(id: string): Promise<LoomTimeline> {
  return fetchJson<LoomTimeline>(`/api/timelines/${id}`);
}

export async function saveTimeline(timeline: LoomTimeline): Promise<void> {
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
