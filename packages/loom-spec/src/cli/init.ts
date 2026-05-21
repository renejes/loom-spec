import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface InitArgs {
  path: string;
  force: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
// Templates ship alongside dist/ in the package: dist/cli/init.js → ../../templates/
const templatesRoot = resolve(here, "../../templates");

async function copyDir(srcDir: string, destDir: string, force: boolean): Promise<string[]> {
  const written: string[] = [];
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      written.push(...(await copyDir(src, dest, force)));
    } else {
      let exists = false;
      try {
        await stat(dest);
        exists = true;
      } catch {
        // doesn't exist
      }
      if (exists && !force) {
        console.log(`  skip (exists): ${dest}`);
        continue;
      }
      const contents = await readFile(src);
      await writeFile(dest, contents);
      written.push(dest);
    }
  }
  return written;
}

export async function runInit(args: InitArgs): Promise<void> {
  const target = resolve(args.path);
  console.log(`Initializing loom-spec in ${target}`);

  // Pre-flight: warn if .loom already exists
  let existing = false;
  try {
    await stat(resolve(target, ".loom"));
    existing = true;
  } catch {
    // fresh install
  }

  if (existing && !args.force) {
    console.error(
      "error: .loom/ already exists. Use --force to overwrite specific files (existing files are preserved unless overwritten)."
    );
    process.exit(1);
  }

  const written = await copyDir(templatesRoot, target, args.force);

  console.log();
  if (written.length === 0) {
    console.log("Nothing to write. Use --force to overwrite existing files.");
    return;
  }
  console.log(`Created ${written.length} file(s):`);
  for (const f of written) {
    console.log(`  ${relative(target, f)}`);
  }
  console.log();
  console.log("Next steps:");
  console.log("  1. Run `npx loom-spec view` to open the editor.");
  console.log("  2. Edit `.loom/node-types.json` to add project-specific node types.");
  console.log("  3. Start populating `.loom/diagrams/overview.flow.json`.");
}
