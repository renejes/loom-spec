import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import type { LoomDiagram } from "../types/diagram.js";
import type { LoomNodeTypes } from "../types/node-types.js";
import type { LoomTimeline } from "../types/timeline.js";

export interface DiagramSummary {
  id: string;
  title: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
}

function diagramsDir(loomPath: string) {
  return resolve(loomPath, "diagrams");
}

function diagramFilePath(loomPath: string, id: string) {
  return resolve(diagramsDir(loomPath), `${id}.flow.json`);
}

export async function listDiagrams(loomPath: string): Promise<DiagramSummary[]> {
  const dir = diagramsDir(loomPath);
  try {
    const entries = await readdir(dir);
    const summaries: DiagramSummary[] = [];
    for (const file of entries) {
      if (!file.endsWith(".flow.json")) continue;
      const id = basename(file, ".flow.json");
      try {
        const raw = await readFile(resolve(dir, file), "utf8");
        const diagram = JSON.parse(raw) as LoomDiagram;
        summaries.push({
          id,
          title: diagram.title,
          description: diagram.description,
          nodeCount: diagram.nodes?.length ?? 0,
          edgeCount: diagram.edges?.length ?? 0,
        });
      } catch {
        // skip unreadable files; the validate step elsewhere flags them
      }
    }
    return summaries.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function readDiagram(loomPath: string, id: string): Promise<LoomDiagram> {
  const raw = await readFile(diagramFilePath(loomPath, id), "utf8");
  return JSON.parse(raw) as LoomDiagram;
}

export async function writeDiagram(
  loomPath: string,
  id: string,
  data: LoomDiagram,
  onWritten?: (path: string) => void
): Promise<void> {
  await mkdir(diagramsDir(loomPath), { recursive: true });
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const path = diagramFilePath(loomPath, id);
  await writeFile(path, serialized, "utf8");
  onWritten?.(path);
}

export async function readNodeTypes(loomPath: string): Promise<LoomNodeTypes> {
  const raw = await readFile(resolve(loomPath, "node-types.json"), "utf8");
  return JSON.parse(raw) as LoomNodeTypes;
}

// ─── Timelines ────────────────────────────────────────────────────────

export interface TimelineSummary {
  id: string;
  title: string;
  description?: string;
  diagram: string;
  eventCount: number;
  totalDurationMs: number;
}

function timelinesDir(loomPath: string) {
  return resolve(loomPath, "timelines");
}

function timelineFilePath(loomPath: string, id: string) {
  return resolve(timelinesDir(loomPath), `${id}.timeline.json`);
}

export async function listTimelines(loomPath: string): Promise<TimelineSummary[]> {
  const dir = timelinesDir(loomPath);
  try {
    const entries = await readdir(dir);
    const summaries: TimelineSummary[] = [];
    for (const file of entries) {
      if (!file.endsWith(".timeline.json")) continue;
      const id = basename(file, ".timeline.json");
      try {
        const raw = await readFile(resolve(dir, file), "utf8");
        const tl = JSON.parse(raw) as LoomTimeline;
        const totalDurationMs = (tl.events ?? []).reduce(
          (max, e) => Math.max(max, (e.start_ms ?? 0) + (e.duration_ms ?? 0)),
          0
        );
        summaries.push({
          id,
          title: tl.title,
          description: tl.description,
          diagram: tl.diagram,
          eventCount: tl.events?.length ?? 0,
          totalDurationMs,
        });
      } catch {
        // skip unreadable files
      }
    }
    return summaries.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function readTimeline(loomPath: string, id: string): Promise<LoomTimeline> {
  const raw = await readFile(timelineFilePath(loomPath, id), "utf8");
  return JSON.parse(raw) as LoomTimeline;
}

export async function writeTimeline(
  loomPath: string,
  id: string,
  data: LoomTimeline,
  onWritten?: (path: string) => void
): Promise<void> {
  await mkdir(timelinesDir(loomPath), { recursive: true });
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const path = timelineFilePath(loomPath, id);
  await writeFile(path, serialized, "utf8");
  onWritten?.(path);
}
