/**
 * Smoke-test for the edge-property vocabulary check.
 *
 * Spins up a tmp `.loom/` with a node-types.json that declares an
 * `edge_types.request` vocabulary, plus a diagram with one good edge
 * and several edges that violate the vocabulary in different ways.
 * Runs `runDriftCheck` and asserts findings.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-edge-vocab.ts
 */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDriftCheck } from "../src/server/drift.js";
import {
  validateEdgeProperties,
  formatEdgePropertyIssue,
} from "../src/server/edgeValidate.js";
import type { LoomNodeTypes } from "../src/types/node-types.js";
import type { Edge as LoomEdge } from "../src/types/diagram.js";

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

// ─── Unit-style: validateEdgeProperties direct ─────────────────────

const VOCAB: LoomNodeTypes = {
  types: {
    service: { label: "Service", color: "#34d399" },
  },
  edge_types: {
    request: {
      properties: [
        { name: "sync", type: "boolean", required: false },
        {
          name: "retry_policy",
          type: "enum",
          values: ["none", "exponential", "linear"],
          required: false,
        },
        { name: "timeout_ms", type: "number", min: 0, max: 600000 },
      ],
    },
  },
} as LoomNodeTypes;

const goodEdge: LoomEdge = {
  id: "e1",
  from: "a",
  to: "b",
  kind: "request",
  properties: { sync: false, retry_policy: "exponential", timeout_ms: 5000 },
};
expect(
  "good edge produces no findings",
  validateEdgeProperties(goodEdge, VOCAB).length === 0
);

const unknownKey: LoomEdge = {
  id: "e2",
  from: "a",
  to: "b",
  kind: "request",
  properties: { is_async: true }, // wrong vocabulary
};
const r2 = validateEdgeProperties(unknownKey, VOCAB);
expect(
  "unknown key reports unknown-property",
  r2.length === 1 && r2[0]!.issue.kind === "unknown-property"
);

const wrongType: LoomEdge = {
  id: "e3",
  from: "a",
  to: "b",
  kind: "request",
  properties: { sync: "true" }, // string instead of bool
};
const r3 = validateEdgeProperties(wrongType, VOCAB);
expect(
  "wrong type reports wrong-type",
  r3.length === 1 && r3[0]!.issue.kind === "wrong-type"
);

const badEnum: LoomEdge = {
  id: "e4",
  from: "a",
  to: "b",
  kind: "request",
  properties: { retry_policy: "infinite" },
};
const r4 = validateEdgeProperties(badEnum, VOCAB);
expect(
  "enum value not allowed reports enum-value-not-allowed",
  r4.length === 1 && r4[0]!.issue.kind === "enum-value-not-allowed"
);

const outOfRange: LoomEdge = {
  id: "e5",
  from: "a",
  to: "b",
  kind: "request",
  properties: { timeout_ms: -100 },
};
const r5 = validateEdgeProperties(outOfRange, VOCAB);
expect(
  "out-of-range reports out-of-range",
  r5.length === 1 && r5[0]!.issue.kind === "out-of-range"
);

// Edge kind without a vocabulary entry is unconstrained
const eventEdge: LoomEdge = {
  id: "e6",
  from: "a",
  to: "b",
  kind: "event",
  properties: { anything: 1, goes: "here" },
};
expect(
  "edge kind without vocabulary entry is unconstrained",
  validateEdgeProperties(eventEdge, VOCAB).length === 0
);

// Format helper sanity
expect(
  "formatter mentions the property name",
  formatEdgePropertyIssue(r2[0]!.issue).includes("is_async")
);

// ─── End-to-end via runDriftCheck ─────────────────────────────────

async function endToEnd() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-edge-vocab-"));
  try {
    const loomPath = join(tmp, ".loom");
    await mkdir(join(loomPath, "diagrams"), { recursive: true });
    await writeFile(
      join(loomPath, "node-types.json"),
      JSON.stringify(VOCAB, null, 2) + "\n"
    );
    await writeFile(
      join(loomPath, "diagrams/test.flow.json"),
      JSON.stringify(
        {
          version: "1",
          id: "test",
          title: "Edge vocab fixture",
          nodes: [
            {
              id: "a",
              type: "service",
              label: "A",
              position: { x: 80, y: 80 },
              status: "implemented",
            },
            {
              id: "b",
              type: "service",
              label: "B",
              position: { x: 380, y: 80 },
              status: "implemented",
            },
          ],
          edges: [
            // good
            {
              id: "e-good",
              from: "a",
              to: "b",
              kind: "request",
              properties: { sync: true, retry_policy: "none" },
            },
            // unknown key
            {
              id: "e-unknown",
              from: "a",
              to: "b",
              kind: "request",
              properties: { is_async: true },
            },
            // wrong type
            {
              id: "e-type",
              from: "a",
              to: "b",
              kind: "request",
              properties: { sync: "yes" },
            },
          ],
        },
        null,
        2
      ) + "\n"
    );

    const report = await runDriftCheck(tmp, loomPath);
    expect(
      "e2e: 2 edge issues across diagram",
      report.totalEdgeIssues === 2
    );
    expect(
      "e2e: totalDrift unchanged (edge issues tracked separately)",
      report.totalDrift === 0
    );
    expect(
      "e2e: failCount-equivalent (drift+schema+edge) is 2",
      report.totalDrift + report.totalSchemaErrors + report.totalEdgeIssues === 2
    );
    const d = report.perDiagram[0]!;
    expect(
      "e2e: edge issues attached to right edges",
      d.edgeIssues.some((i) => i.edgeId === "e-unknown") &&
        d.edgeIssues.some((i) => i.edgeId === "e-type") &&
        !d.edgeIssues.some((i) => i.edgeId === "e-good")
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await endToEnd();
