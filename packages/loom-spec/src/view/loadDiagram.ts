import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
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
