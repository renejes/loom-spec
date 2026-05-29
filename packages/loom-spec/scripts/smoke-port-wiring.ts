/**
 * Smoke-test for edge wiring validation (Phase 10 / Slice 4).
 *
 * Unit checks of validateEdgeWiring: unknown node, unknown port,
 * signal mismatch (warning), and a correctly-wired audio edge (clean).
 * Plus an e2e pass via runDriftCheck for the counters.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-port-wiring.ts
 */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEdgeWiring } from "../src/server/portValidate.js";
import { runDriftCheck } from "../src/server/drift.js";
import type { LoomDiagram, Edge as LoomEdge } from "../src/types/diagram.js";
import type { LoomNodeTypes } from "../src/types/node-types.js";

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

const NT: LoomNodeTypes = {
  types: {
    osc: { label: "Osc", color: "#f472b6", ports: { out: [{ name: "out", signal: "audio" }] } },
    filter: {
      label: "Filter",
      color: "#60a5fa",
      ports: {
        in: [{ name: "in", signal: "audio" }, { name: "cutoff", signal: "cv" }],
        out: [{ name: "out", signal: "audio" }],
      },
    },
    midiSrc: { label: "MIDI", color: "#a78bfa", ports: { out: [{ name: "out", signal: "midi" }] } },
  },
} as LoomNodeTypes;

const diagram: LoomDiagram = {
  version: "1",
  id: "d",
  title: "wiring",
  nodes: [
    { id: "osc", type: "osc", label: "Osc", position: { x: 0, y: 0 }, status: "implemented" },
    { id: "filter", type: "filter", label: "Filter", position: { x: 200, y: 0 }, status: "implemented" },
    { id: "midi", type: "midiSrc", label: "MIDI", position: { x: 0, y: 200 }, status: "implemented" },
  ],
  edges: [],
} as LoomDiagram;

function wire(from: string, to: string): LoomEdge {
  return { id: "e", from, to, kind: "signal" } as LoomEdge;
}

// Correct audio→audio wiring → clean
expect(
  "audio_out → audio_in is clean",
  validateEdgeWiring(wire("osc:out", "filter:in"), diagram, NT).length === 0
);

// Unknown node
const un = validateEdgeWiring(wire("nope:out", "filter:in"), diagram, NT);
expect("unknown source node flagged", un.some((f) => f.issue.kind === "unknown-node"));

// Unknown port (typo)
const up = validateEdgeWiring(wire("osc:otu", "filter:in"), diagram, NT);
expect(
  "unknown out-port (typo) flagged as error",
  up.some((f) => f.issue.kind === "unknown-port" && f.severity === "error")
);

// Signal mismatch: midi out → audio in → warning
const mm = validateEdgeWiring(wire("midi:out", "filter:in"), diagram, NT);
expect(
  "midi→audio is a signal-mismatch WARNING (not error)",
  mm.some((f) => f.issue.kind === "signal-mismatch" && f.severity === "warning")
);

// audio out → cv in (cutoff) is a mismatch warning
const ac = validateEdgeWiring(wire("osc:out", "filter:cutoff"), diagram, NT);
expect(
  "audio→cv (cutoff) is a signal-mismatch warning",
  ac.some((f) => f.issue.kind === "signal-mismatch" && f.severity === "warning")
);

// Untyped edge (no ports) → no wiring issues
expect(
  "portless edge to existing nodes is clean",
  validateEdgeWiring(wire("osc", "filter"), diagram, NT).length === 0
);

// ─── e2e counters ──────────────────────────────────────────────────
async function endToEnd() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-wiring-"));
  try {
    const loomPath = join(tmp, ".loom");
    await mkdir(join(loomPath, "diagrams"), { recursive: true });
    await writeFile(join(loomPath, "node-types.json"), JSON.stringify(NT, null, 2));
    await writeFile(
      join(loomPath, "diagrams/d.flow.json"),
      JSON.stringify(
        {
          ...diagram,
          edges: [
            { id: "ok", from: "osc:out", to: "filter:in", kind: "signal" },
            { id: "typo", from: "osc:out", to: "filter:input", kind: "signal" }, // unknown port → error
            { id: "mismatch", from: "midi:out", to: "filter:in", kind: "signal" }, // warning
          ],
        },
        null,
        2
      ) + "\n"
    );
    const report = await runDriftCheck(tmp, loomPath);
    expect("e2e: 1 wiring error (unknown port)", report.totalWiringErrors === 1);
    expect("e2e: 1 wiring warning (signal mismatch)", report.totalWiringWarnings === 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await endToEnd();
