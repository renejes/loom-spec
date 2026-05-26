import { readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { resolve, basename } from "node:path";
import type { LoomDiagram } from "../types/diagram.js";
import type { LoomNodeTypes } from "../types/node-types.js";
import type { LoomJourney } from "../types/journey.js";

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

export interface JourneySummary {
  id: string;
  title: string;
  description?: string;
  diagram: string;
  stepCount: number;
}

function journeysDir(loomPath: string) {
  return resolve(loomPath, "journeys");
}

function journeyFilePath(loomPath: string, id: string) {
  return resolve(journeysDir(loomPath), `${id}.journey.json`);
}

export async function listJourneys(loomPath: string): Promise<JourneySummary[]> {
  const dir = journeysDir(loomPath);
  try {
    const entries = await readdir(dir);
    const summaries: JourneySummary[] = [];
    for (const file of entries) {
      if (!file.endsWith(".journey.json")) continue;
      const id = basename(file, ".journey.json");
      try {
        const raw = await readFile(resolve(dir, file), "utf8");
        const journey = JSON.parse(raw) as LoomJourney;
        summaries.push({
          id,
          title: journey.title,
          description: journey.description,
          diagram: journey.diagram,
          stepCount: journey.steps?.length ?? 0,
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

export async function readJourney(loomPath: string, id: string): Promise<LoomJourney> {
  const raw = await readFile(journeyFilePath(loomPath, id), "utf8");
  return JSON.parse(raw) as LoomJourney;
}

export async function writeJourney(
  loomPath: string,
  id: string,
  data: LoomJourney,
  onWritten?: (path: string) => void
): Promise<void> {
  await mkdir(journeysDir(loomPath), { recursive: true });
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const path = journeyFilePath(loomPath, id);
  await writeFile(path, serialized, "utf8");
  onWritten?.(path);
}

export async function deleteJourney(
  loomPath: string,
  id: string,
  onDeleted?: (path: string) => void
): Promise<void> {
  const path = journeyFilePath(loomPath, id);
  await unlink(path);
  onDeleted?.(path);
}
