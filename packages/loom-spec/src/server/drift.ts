import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  listJourneys,
  readJourney,
  writeJourney,
  readNodeTypes,
} from "./fileOps.js";
import { validateDiagram, validateJourney } from "../validate.js";
import {
  extractSignature,
  canonicalize,
  isSupportedExtension,
} from "./signatures/index.js";
import {
  validateEdgeProperties,
  formatEdgePropertyIssue,
  type EdgePropertyIssue,
} from "./edgeValidate.js";
import type { LoomDiagram, CodeRef } from "../types/diagram.js";
import type { LoomJourney } from "../types/journey.js";
import type { LoomNodeTypes } from "../types/node-types.js";

export type DriftIssue =
  | "missing-file"
  | "missing-symbol"
  | "lines-out-of-range"
  | "invalid-lines"
  | "signature-drift"
  | "signature-missing";

export interface DriftFinding {
  diagramId: string;
  nodeId: string;
  refIndex: number;
  ref: CodeRef;
  issue: DriftIssue;
  detail?: string;
}

export interface JourneyDriftFinding {
  journeyId: string;
  stepId: string;
  refIndex: number;
  ref: CodeRef;
  issue: DriftIssue;
  detail?: string;
}

export interface EdgeIssueFinding {
  diagramId: string;
  edgeId: string;
  issue: EdgePropertyIssue;
  /** Pre-formatted single-line description. */
  detail: string;
}

export interface DiagramReport {
  diagramId: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  refsChecked: number;
  staleNodes: number;
  drift: DriftFinding[];
  edgeIssues: EdgeIssueFinding[];
  schemaErrors: string[];
}

export interface JourneyReport {
  journeyId: string;
  title: string;
  diagram: string;
  stepCount: number;
  refsChecked: number;
  drift: JourneyDriftFinding[];
  schemaErrors: string[];
}

export interface DriftReport {
  perDiagram: DiagramReport[];
  perJourney: JourneyReport[];
  /** Issues that should fail CI: broken refs, schema errors, and signature drift. */
  totalDrift: number;
  /** Refs missing a signature hint — informational only, doesn't fail CI. */
  totalSignatureMissing: number;
  /** Edge property violations against the declared edge_types vocabulary.
   *  Sums into the exit-code criterion alongside totalDrift. */
  totalEdgeIssues: number;
  totalSchemaErrors: number;
  /** When capture mode is on, count of refs whose hint was written/updated. */
  capturedCount: number;
}

export type DriftCaptureMode = "none" | "capture" | "recapture";

export interface RunDriftCheckOptions {
  /** "capture" fills missing signature_hints (existing hints left alone).
   *  "recapture" overwrites all hints with current source. Default "none". */
  capture?: DriftCaptureMode;
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

interface RefCheckResult {
  finding: { issue: DriftIssue; detail?: string } | null;
  /** Captured signature, if extraction succeeded. */
  capturedSignature?: string;
  /** Was the file successfully read (so capture is even possible)? */
  fileReadable?: boolean;
}

async function checkRef(
  rootPath: string,
  ref: CodeRef
): Promise<RefCheckResult> {
  const abs = resolve(rootPath, ref.path);

  let contents: string;
  try {
    await stat(abs);
    contents = await readFile(abs, "utf8");
  } catch {
    return { finding: { issue: "missing-file" } };
  }

  // Symbol existence (existing behaviour — fast grep)
  if (ref.symbol) {
    const symRe = new RegExp(
      `(?:^|[^\\w])${ref.symbol.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:[^\\w]|$)`,
      "m"
    );
    if (!symRe.test(contents)) {
      return {
        finding: {
          issue: "missing-symbol",
          detail: `'${ref.symbol}' not found in ${ref.path}`,
        },
        fileReadable: true,
      };
    }
  }

  // Lines
  if (ref.lines) {
    const ranges = parseLineRange(ref.lines);
    if (!ranges) {
      return {
        finding: { issue: "invalid-lines", detail: `bad format: '${ref.lines}'` },
        fileReadable: true,
      };
    }
    const totalLines = contents.split("\n").length;
    for (const [from, to] of ranges) {
      if (from < 1 || to < from || to > totalLines) {
        return {
          finding: {
            issue: "lines-out-of-range",
            detail: `${from}-${to} (file has ${totalLines} lines)`,
          },
          fileReadable: true,
        };
      }
    }
  }

  // Signature check (only meaningful when we have a symbol AND the file is
  // a language we can parse).
  if (ref.symbol && isSupportedExtension(ref.path)) {
    const current = extractSignature(ref.path, contents, ref.symbol);
    if (current === null) {
      // Couldn't extract — extension supported but heuristic missed it.
      // Treat as missing rather than drift to avoid noise.
      return { finding: null, fileReadable: true };
    }
    if (ref.signature_hint) {
      const stored = canonicalize(ref.signature_hint);
      if (stored !== current) {
        return {
          finding: {
            issue: "signature-drift",
            detail: `expected: ${stored}\n      actual:   ${current}`,
          },
          fileReadable: true,
          capturedSignature: current,
        };
      }
    } else {
      // Hint missing — report as informational; capturer fills it in.
      return {
        finding: { issue: "signature-missing", detail: current },
        fileReadable: true,
        capturedSignature: current,
      };
    }
    return { finding: null, fileReadable: true, capturedSignature: current };
  }

  return { finding: null, fileReadable: true };
}

interface MutationPlan {
  diagramWrites: Map<string, LoomDiagram>;
  journeyWrites: Map<string, LoomJourney>;
}

/**
 * Apply capture/recapture: mutate the in-memory documents so the new hints
 * land on disk when `applyMutations` runs. Returns whether anything changed.
 */
function applyCaptureToRef(
  ref: CodeRef,
  result: RefCheckResult,
  mode: DriftCaptureMode
): boolean {
  if (mode === "none" || !result.capturedSignature) return false;
  if (mode === "capture" && ref.signature_hint) return false; // existing left alone
  if (ref.signature_hint === result.capturedSignature) return false;
  ref.signature_hint = result.capturedSignature;
  return true;
}

export async function runDriftCheck(
  rootPath: string,
  loomPath: string,
  options: RunDriftCheckOptions = {}
): Promise<DriftReport> {
  const captureMode: DriftCaptureMode = options.capture ?? "none";
  const summaries = await listDiagrams(loomPath);
  const journeySummaries = await listJourneys(loomPath);

  // Load node-types once for the edge vocabulary check. If unavailable
  // (rare; would mean .loom/ is broken), all edges silently pass that
  // check — the diagram schema validation will report the underlying
  // problem.
  let nodeTypes: LoomNodeTypes | null = null;
  try {
    nodeTypes = await readNodeTypes(loomPath);
  } catch {
    nodeTypes = null;
  }

  const perDiagram: DiagramReport[] = [];
  const perJourney: JourneyReport[] = [];
  let totalDrift = 0;
  let totalSignatureMissing = 0;
  let totalEdgeIssues = 0;
  let totalSchemaErrors = 0;
  let capturedCount = 0;

  const mutations: MutationPlan = {
    diagramWrites: new Map(),
    journeyWrites: new Map(),
  };

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
        edgeIssues: [],
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
    let diagramMutated = false;
    for (const node of diagram.nodes) {
      if (node.status === "stale") staleNodes++;
      if (node.status === "planned" || node.status === "deprecated") continue;
      const refs = node.code_refs ?? [];
      for (let i = 0; i < refs.length; i++) {
        refsChecked++;
        const ref = refs[i]!;
        const result = await checkRef(rootPath, ref);
        // In recapture mode, signature-drift findings are silently fixed —
        // the user explicitly acknowledged "current state is the new
        // baseline". Schema/file/symbol errors still report.
        const suppressFinding =
          captureMode === "recapture" &&
          result.finding?.issue === "signature-drift";
        if (result.finding && !suppressFinding) {
          drift.push({
            diagramId: s.id,
            nodeId: node.id,
            refIndex: i,
            ref,
            ...result.finding,
          });
          if (result.finding.issue === "signature-missing") {
            totalSignatureMissing++;
          } else {
            totalDrift++;
          }
        }
        if (applyCaptureToRef(ref, result, captureMode)) {
          diagramMutated = true;
          capturedCount++;
        }
      }
    }

    if (diagramMutated) {
      mutations.diagramWrites.set(s.id, diagram);
    }

    // Edge vocabulary check (warning-style, but counts as drift for the
    // exit code — the project explicitly opts in by declaring edge_types).
    const edgeIssues: EdgeIssueFinding[] = [];
    if (nodeTypes?.edge_types) {
      for (const edge of diagram.edges) {
        const findings = validateEdgeProperties(edge, nodeTypes);
        for (const f of findings) {
          edgeIssues.push({
            diagramId: s.id,
            edgeId: edge.id,
            issue: f.issue,
            detail: formatEdgePropertyIssue(f.issue),
          });
          totalEdgeIssues++;
        }
      }
    }

    perDiagram.push({
      diagramId: s.id,
      title: s.title,
      nodeCount: diagram.nodes.length,
      edgeCount: diagram.edges.length,
      refsChecked,
      staleNodes,
      drift,
      edgeIssues,
      schemaErrors,
    });
  }

  // Journeys — same flow over step.code_refs
  for (const s of journeySummaries) {
    let journey: LoomJourney;
    try {
      journey = await readJourney(loomPath, s.id);
    } catch (e) {
      perJourney.push({
        journeyId: s.id,
        title: s.title,
        diagram: s.diagram,
        stepCount: 0,
        refsChecked: 0,
        drift: [],
        schemaErrors: [`failed to read: ${(e as Error).message}`],
      });
      totalSchemaErrors++;
      continue;
    }

    const schemaResult = await validateJourney(journey);
    const schemaErrors = schemaResult.ok ? [] : schemaResult.errors;
    totalSchemaErrors += schemaErrors.length;

    const drift: JourneyDriftFinding[] = [];
    let refsChecked = 0;
    let journeyMutated = false;
    for (const step of journey.steps) {
      const refs = step.code_refs ?? [];
      for (let i = 0; i < refs.length; i++) {
        refsChecked++;
        const ref = refs[i]!;
        const result = await checkRef(rootPath, ref);
        const suppressFinding =
          captureMode === "recapture" &&
          result.finding?.issue === "signature-drift";
        if (result.finding && !suppressFinding) {
          drift.push({
            journeyId: s.id,
            stepId: step.id,
            refIndex: i,
            ref,
            ...result.finding,
          });
          if (result.finding.issue === "signature-missing") {
            totalSignatureMissing++;
          } else {
            totalDrift++;
          }
        }
        if (applyCaptureToRef(ref, result, captureMode)) {
          journeyMutated = true;
          capturedCount++;
        }
      }
    }

    if (journeyMutated) {
      mutations.journeyWrites.set(s.id, journey);
    }

    perJourney.push({
      journeyId: s.id,
      title: s.title,
      diagram: s.diagram,
      stepCount: journey.steps.length,
      refsChecked,
      drift,
      schemaErrors,
    });
  }

  // Persist captures
  for (const [id, d] of mutations.diagramWrites) {
    await writeDiagram(loomPath, id, d);
  }
  for (const [id, j] of mutations.journeyWrites) {
    await writeJourney(loomPath, id, j);
  }

  return {
    perDiagram,
    perJourney,
    totalDrift,
    totalSignatureMissing,
    totalEdgeIssues,
    totalSchemaErrors,
    capturedCount,
  };
}
