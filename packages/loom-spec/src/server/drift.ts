import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { listDiagrams, readDiagram } from "./fileOps.js";
import { validateDiagram } from "../validate.js";
import type { LoomDiagram, Node as LoomNode, CodeRef } from "../types/diagram.js";

export interface DriftFinding {
  diagramId: string;
  nodeId: string;
  refIndex: number;
  ref: CodeRef;
  issue: "missing-file" | "missing-symbol" | "lines-out-of-range" | "invalid-lines";
  detail?: string;
}

export interface SchemaFinding {
  diagramId: string;
  errors: string[];
}

export interface DiagramReport {
  diagramId: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  refsChecked: number;
  staleNodes: number; // nodes already marked stale
  drift: DriftFinding[];
  schemaErrors: string[];
}

export interface DriftReport {
  perDiagram: DiagramReport[];
  totalDrift: number;
  totalSchemaErrors: number;
}

const LINES_RE = /^(\d+)(?:-(\d+))?(?:,(\d+)(?:-(\d+))?)*$/;

function parseLineRange(spec: string): Array<[number, number]> | null {
  if (!LINES_RE.test(spec)) return null;
  const ranges: Array<[number, number]> = [];
  for (const part of spec.split(",")) {
    const dash = part.indexOf("-");
    if (dash === -1) {
      const n = Number(part);
      ranges.push([n, n]);
    } else {
      ranges.push([Number(part.slice(0, dash)), Number(part.slice(dash + 1))]);
    }
  }
  return ranges;
}

async function checkRef(
  rootPath: string,
  ref: CodeRef
): Promise<{ issue: DriftFinding["issue"]; detail?: string } | null> {
  const abs = resolve(rootPath, ref.path);

  // Path exists?
  let contents: string;
  try {
    await stat(abs);
    contents = await readFile(abs, "utf8");
  } catch {
    return { issue: "missing-file" };
  }

  // If symbol is set, grep for it.
  if (ref.symbol) {
    // Match as whole word; tolerate def/class/function/const prefixes implicitly
    // by just looking for the identifier surrounded by non-word characters.
    const symRe = new RegExp(
      `(?:^|[^\\w])${ref.symbol.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:[^\\w]|$)`,
      "m"
    );
    if (!symRe.test(contents)) {
      return {
        issue: "missing-symbol",
        detail: `'${ref.symbol}' not found in ${ref.path}`,
      };
    }
  }

  // If lines is set, validate
  if (ref.lines) {
    const ranges = parseLineRange(ref.lines);
    if (!ranges) {
      return { issue: "invalid-lines", detail: `bad format: '${ref.lines}'` };
    }
    const totalLines = contents.split("\n").length;
    for (const [from, to] of ranges) {
      if (from < 1 || to < from || to > totalLines) {
        return {
          issue: "lines-out-of-range",
          detail: `${from}-${to} (file has ${totalLines} lines)`,
        };
      }
    }
  }

  return null;
}

export async function runDriftCheck(
  rootPath: string,
  loomPath: string
): Promise<DriftReport> {
  const summaries = await listDiagrams(loomPath);
  const perDiagram: DiagramReport[] = [];
  let totalDrift = 0;
  let totalSchemaErrors = 0;

  for (const s of summaries) {
    let diagram: LoomDiagram;
    try {
      diagram = await readDiagram(loomPath, s.id);
    } catch (e) {
      perDiagram.push({
        diagramId: s.id,
        title: s.title,
        nodeCount: 0,
        edgeCount: 0,
        refsChecked: 0,
        staleNodes: 0,
        drift: [],
        schemaErrors: [`failed to read: ${(e as Error).message}`],
      });
      totalSchemaErrors++;
      continue;
    }

    const schemaResult = await validateDiagram(diagram);
    const schemaErrors = schemaResult.ok ? [] : schemaResult.errors;
    totalSchemaErrors += schemaErrors.length;

    const drift: DriftFinding[] = [];
    let refsChecked = 0;
    let staleNodes = 0;
    for (const node of diagram.nodes) {
      if (node.status === "stale") staleNodes++;
      // Skip drift checking on nodes that are explicitly planned or deprecated;
      // their code may legitimately not exist yet, or have moved on.
      if (node.status === "planned" || node.status === "deprecated") continue;
      for (const [i, ref] of (node.code_refs ?? []).entries()) {
        refsChecked++;
        const finding = await checkRef(rootPath, ref);
        if (finding) {
          drift.push({
            diagramId: s.id,
            nodeId: node.id,
            refIndex: i,
            ref,
            ...finding,
          });
        }
      }
    }
    totalDrift += drift.length;

    perDiagram.push({
      diagramId: s.id,
      title: s.title,
      nodeCount: diagram.nodes.length,
      edgeCount: diagram.edges.length,
      refsChecked,
      staleNodes,
      drift,
      schemaErrors,
    });
  }

  return { perDiagram, totalDrift, totalSchemaErrors };
}
