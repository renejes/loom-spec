/**
 * Smoke-test for `loom-spec import-trace` (15g). Generates an OTLP-JSON
 * trace in /tmp, runs the CLI against the todo-app fixture, validates the
 * resulting timeline, then cleans up so the fixture is untouched.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-import-trace.ts
 */
import { writeFile, readFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateTimeline } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixture = resolve(repoRoot, "examples/todo-app");
const timelinePath = resolve(
  fixture,
  ".loom/timelines/imported-smoke.timeline.json"
);

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

// Build a hand-crafted OTLP JSON trace shaped like a real export from a
// Node OpenTelemetry collector. The span names + service.name are chosen
// so the heuristic mapping can resolve them onto the todo-app nodes.
function buildTrace(): unknown {
  const t0 = 1_700_000_000_000_000_000n; // arbitrary epoch nanos
  const ms = (n: number) => (t0 + BigInt(n) * 1_000_000n).toString();
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "todo-list-view" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                spanId: "aaaaaaaaaaaa0001",
                name: "handleToggle",
                kind: 1, // INTERNAL
                startTimeUnixNano: ms(0),
                endTimeUnixNano: ms(12),
              },
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "todo-api" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                spanId: "bbbbbbbbbbbb0002",
                parentSpanId: "aaaaaaaaaaaa0001",
                name: "PATCH /todos/:id",
                kind: 2, // SERVER
                startTimeUnixNano: ms(18),
                endTimeUnixNano: ms(56),
                attributes: [
                  { key: "http.method", value: { stringValue: "PATCH" } },
                ],
              },
              {
                spanId: "cccccccccccc0003",
                parentSpanId: "bbbbbbbbbbbb0002",
                name: "todo-store update",
                kind: 3, // CLIENT
                startTimeUnixNano: ms(24),
                endTimeUnixNano: ms(48),
              },
            ],
          },
        ],
      },
    ],
  };
}

async function main() {
  // Write trace to a temp file
  const tmp = await mkdtemp(join(tmpdir(), "loom-import-"));
  const tracePath = join(tmp, "trace.json");
  await writeFile(tracePath, JSON.stringify(buildTrace(), null, 2), "utf8");

  try {
    // Run the CLI. Use tsx so we run against the live TS source.
    const cliEntry = resolve(repoRoot, "packages/loom-spec/src/cli/index.ts");
    const out = execFileSync(
      "pnpm",
      [
        "--filter",
        "loom-spec",
        "exec",
        "tsx",
        cliEntry,
        "import-trace",
        tracePath,
        "--as",
        "imported-smoke",
        "--diagram",
        "overview",
        "--root",
        fixture,
      ],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect("CLI succeeded", true, "exit 0");
    expect("CLI reported 3 events", /Wrote 3 events/.test(out), out);

    // Inspect the file
    const raw = await readFile(timelinePath, "utf8");
    const tl = JSON.parse(raw);
    expect("File written", !!tl);
    expect("Diagram reference correct", tl.diagram === "overview");
    expect("3 events written", tl.events.length === 3);
    expect(
      "First event is on todo-list-view at t=0",
      tl.events[0].node === "todo-list-view" && tl.events[0].start_ms === 0
    );
    expect(
      "Second event is on todo-api with PATCH label",
      tl.events[1].node === "todo-api" && /PATCH/.test(tl.events[1].label)
    );
    expect(
      "Third event is on todo-store",
      tl.events[2].node === "todo-store"
    );
    expect(
      "triggered_by wired (ev2 → ev1)",
      tl.events[1].triggered_by === tl.events[0].id
    );
    expect(
      "triggered_by wired (ev3 → ev2)",
      tl.events[2].triggered_by === tl.events[1].id
    );

    // Validate against the schema directly to be sure.
    const v = await validateTimeline(tl);
    expect("Schema validates", v.ok, !v.ok ? v.errors.join("; ") : undefined);

    // Cleanup
    await unlink(timelinePath);
    expect("Fixture file cleaned up", true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
