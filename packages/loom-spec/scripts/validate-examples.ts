/**
 * Validates the example .loom files against the schemas.
 * Sanity check that schemas and examples stay in sync.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDiagram, validateNodeTypes, validateJourney } from "../src/validate.js";
import type { LoomDiagram } from "../src/types/diagram.js";
import type { LoomJourney } from "../src/types/journey.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = resolve(here, "../../../examples");

async function findLoomDirs(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectDir = resolve(root, entry.name);
    const loomDir = resolve(projectDir, ".loom");
    try {
      const stat = await readdir(loomDir);
      if (stat) out.push(loomDir);
    } catch {
      // no .loom in this project, skip
    }
  }
  return out;
}

let failed = 0;

for (const loomDir of await findLoomDirs(examplesRoot)) {
  const project = basename(dirname(loomDir));
  console.log(`\n📁 ${project}`);

  // node-types.json
  try {
    const raw = await readFile(resolve(loomDir, "node-types.json"), "utf8");
    const result = await validateNodeTypes(JSON.parse(raw));
    if (result.ok) {
      console.log(`  ✓ node-types.json`);
    } else {
      failed++;
      console.log(`  ✗ node-types.json`);
      for (const err of result.errors) console.log(`      ${err}`);
    }
  } catch (e) {
    failed++;
    console.log(`  ✗ node-types.json — ${(e as Error).message}`);
  }

  // diagrams/*.flow.json
  const diagramsDir = resolve(loomDir, "diagrams");
  const diagramsById = new Map<string, LoomDiagram>();
  try {
    const files = await readdir(diagramsDir);
    for (const f of files) {
      if (!f.endsWith(".flow.json")) continue;
      const raw = await readFile(resolve(diagramsDir, f), "utf8");
      const parsed = JSON.parse(raw) as LoomDiagram;
      const result = await validateDiagram(parsed);
      if (result.ok) {
        console.log(`  ✓ diagrams/${f}`);
        diagramsById.set(parsed.id, parsed);
      } else {
        failed++;
        console.log(`  ✗ diagrams/${f}`);
        for (const err of result.errors) console.log(`      ${err}`);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      failed++;
      console.log(`  ✗ diagrams — ${(e as Error).message}`);
    }
  }

  // journeys/*.journey.json — schema + referential check against diagrams
  const journeysDir = resolve(loomDir, "journeys");
  try {
    const files = await readdir(journeysDir);
    for (const f of files) {
      if (!f.endsWith(".journey.json")) continue;
      const raw = await readFile(resolve(journeysDir, f), "utf8");
      const parsed = JSON.parse(raw) as LoomJourney;
      const result = await validateJourney(parsed);
      if (!result.ok) {
        failed++;
        console.log(`  ✗ journeys/${f}`);
        for (const err of result.errors) console.log(`      ${err}`);
        continue;
      }
      const diagram = diagramsById.get(parsed.diagram);
      if (!diagram) {
        failed++;
        console.log(`  ✗ journeys/${f}`);
        console.log(`      /diagram: references unknown diagram "${parsed.diagram}"`);
        continue;
      }
      const nodeIds = new Set(diagram.nodes.map((n) => n.id));
      const refErrors: string[] = [];
      const seenStepIds = new Set<string>();
      parsed.steps.forEach((step, i) => {
        if (seenStepIds.has(step.id)) {
          refErrors.push(`/steps/${i}/id: duplicate step id "${step.id}"`);
        }
        seenStepIds.add(step.id);
        if (!nodeIds.has(step.node)) {
          refErrors.push(
            `/steps/${i}/node: node "${step.node}" does not exist in diagram "${parsed.diagram}"`
          );
        }
      });
      if (refErrors.length > 0) {
        failed++;
        console.log(`  ✗ journeys/${f}`);
        for (const err of refErrors) console.log(`      ${err}`);
      } else {
        console.log(`  ✓ journeys/${f}`);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      failed++;
      console.log(`  ✗ journeys — ${(e as Error).message}`);
    }
  }

}

if (failed > 0) {
  console.log(`\n❌ ${failed} validation failure(s)`);
  process.exit(1);
}
console.log(`\n✅ All examples valid.`);
