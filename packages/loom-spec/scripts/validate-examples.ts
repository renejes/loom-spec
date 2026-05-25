/**
 * Validates the example .loom files against the schemas.
 * Sanity check that schemas and examples stay in sync.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDiagram, validateNodeTypes } from "../src/validate.js";

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
  try {
    const files = await readdir(diagramsDir);
    for (const f of files) {
      if (!f.endsWith(".flow.json")) continue;
      const raw = await readFile(resolve(diagramsDir, f), "utf8");
      const result = await validateDiagram(JSON.parse(raw));
      if (result.ok) {
        console.log(`  ✓ diagrams/${f}`);
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

}

if (failed > 0) {
  console.log(`\n❌ ${failed} validation failure(s)`);
  process.exit(1);
}
console.log(`\n✅ All examples valid.`);
