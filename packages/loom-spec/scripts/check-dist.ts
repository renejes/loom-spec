/**
 * Pre-publish sanity check. Runs after `pnpm build` (in the
 * `prepublishOnly` hook) and bails loud if the built `dist/` is
 * missing files that were added in recent phases. Caught v0.8.0
 * shipping a stale dist without the signature/edge-vocab modules
 * — see documentation/done/phase-9-publish-fix.md.
 *
 * The check is dumb and intentional: file existence + a marker
 * grep per known feature. When a new phase adds a module that
 * needs to ship, add it here too.
 */
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "../dist");

interface FileCheck {
  /** Relative path under dist/, with .js extension. */
  path: string;
  /** Substrings the file should contain. If missing, build is stale. */
  markers?: string[];
  /** Phase the file was added in — used for error reporting. */
  phase: string;
}

const CHECKS: FileCheck[] = [
  // Phase 5 — Journeys
  { path: "server/journeyCheck.js", phase: "Phase 5 (v0.6.0)" },
  { path: "types/journey.js", phase: "Phase 5 (v0.6.0)" },
  {
    path: "server/fileOps.js",
    markers: ["listJourneys", "readJourney", "writeJourney", "deleteJourney"],
    phase: "Phase 5 (v0.6.0)",
  },
  // Phase 6 — Quality-of-life
  { path: "layout.js", phase: "Phase 6 (v0.7.0)" },
  // Phase 7 — Signature drift
  { path: "server/signatures/index.js", phase: "Phase 7 (v0.8.0)" },
  { path: "server/signatures/python.js", phase: "Phase 7 (v0.8.0)" },
  { path: "server/signatures/typescript.js", phase: "Phase 7 (v0.8.0)" },
  { path: "server/signatures/rust.js", phase: "Phase 7 (v0.8.0)" },
  { path: "server/signatures/svelte.js", phase: "Phase 7 (v0.8.0)" },
  {
    path: "server/drift.js",
    markers: [
      "signature-drift",
      "extractSignature",
      "captureMode",
      "validateEdgeProperties",
      "rt-unsafe",
      "checkRtSafetyRef",
    ],
    phase: "Phase 7+8+10 (v0.8.0/v0.9.0)",
  },
  {
    path: "cli/validate.js",
    markers: ["capture", "edgeIssues"],
    phase: "Phase 7+8 (v0.8.0)",
  },
  // Phase 8 — Edge vocabulary
  { path: "server/edgeValidate.js", phase: "Phase 8 (v0.8.0)" },
  // Phase 10 — JUCE / RT-safety
  { path: "server/signatures/cpp.js", phase: "Phase 10 (v0.9.0)" },
  { path: "server/rtSafety.js", phase: "Phase 10 (v0.9.0)" },
];

async function main() {
  const failures: string[] = [];
  for (const c of CHECKS) {
    const abs = resolve(distDir, c.path);
    try {
      await stat(abs);
    } catch {
      failures.push(`MISSING: dist/${c.path} (added in ${c.phase})`);
      continue;
    }
    if (c.markers) {
      const content = await readFile(abs, "utf8");
      for (const m of c.markers) {
        if (!content.includes(m)) {
          failures.push(
            `STALE: dist/${c.path} is missing marker '${m}' — looks like an older build snuck in (${c.phase})`
          );
        }
      }
    }
  }
  if (failures.length > 0) {
    console.error(
      "\n✗ Pre-publish check failed — would have shipped a broken release.\n"
    );
    for (const f of failures) console.error(`  - ${f}`);
    console.error("\nRun `pnpm run build` and inspect dist/ before publishing.");
    process.exit(1);
  }
  console.log("✓ check-dist: all expected files present in dist/");
}

main().catch((e) => {
  console.error("check-dist crashed:", e);
  process.exit(1);
});
