/**
 * Smoke-test for `loom-spec export-html` (#28). Runs the CLI against the
 * todo-app fixture, asserts the output HTML structure (inlined CSS, inlined
 * JS bundle, embedded data shape), then cleans up the tmp file.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-export-html.ts
 */
import { readFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixture = resolve(repoRoot, "examples/todo-app");

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

function extractLoomData(html: string): unknown {
  const m = html.match(/<script>window\.__LOOM_DATA__\s*=\s*([\s\S]*?);<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

async function main() {
  // Ensure export bundle exists. The CLI fails loudly if it doesn't, but
  // we'd rather fail with a clearer error here.
  try {
    await readFile(resolve(repoRoot, "packages/loom-spec/dist/view-export/index.html"));
  } catch {
    console.error(
      "✗ dist/view-export missing — run `pnpm --filter loom-spec build:export` first."
    );
    process.exit(1);
  }

  const tmp = await mkdtemp(join(tmpdir(), "loom-export-"));
  const outPath = join(tmp, "loom.html");

  try {
    const cliEntry = resolve(repoRoot, "packages/loom-spec/src/cli/index.ts");

    // ─── Default: full export ───────────────────────────────────────
    const out1 = execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect("CLI succeeded (full export)", /Wrote/.test(out1), out1);

    const html = await readFile(outPath, "utf8");
    expect("File is non-trivial size (> 200 kB)", html.length > 200_000,
      `actual: ${html.length}`);
    expect("HTML doctype present", /^<!doctype html>/i.test(html));
    expect("Root mount point present", /<div id="root"><\/div>/.test(html));
    expect("Inlined <style> tag (CSS)", /<style>[\s\S]+?<\/style>/.test(html));
    expect("Inlined <script type=\"module\"> tag (JS)",
      /<script type="module">[\s\S]+?<\/script>/.test(html));
    // Only check <head> for residual external refs. We can't reliably grep
    // for "no external script src=" because the inlined bundle contains
    // string literals like "/assets/bundle.js" inside Vite's preload
    // helpers (harmless — nothing fetches them). The presence of the
    // single inlined <script type="module"> tag (asserted above) is the
    // real signal that bundling worked.
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch?.[0] ?? "";
    expect("No leftover stylesheet link in <head>",
      !/<link[^>]*rel=["']stylesheet["'][^>]*href=["']\/assets/i.test(head));

    const data = extractLoomData(html) as {
      diagrams?: Record<string, { id: string; nodes: unknown[] }>;
      timelines?: Record<string, { id: string; events: unknown[] }>;
      nodeTypes?: { types?: Record<string, unknown> };
      generatedAt?: string;
    } | null;
    expect("__LOOM_DATA__ parses as JSON", data !== null);
    expect("Contains 2 diagrams (overview + celebration-detail)",
      Object.keys(data?.diagrams ?? {}).length === 2);
    expect("Contains overview diagram with > 0 nodes",
      (data?.diagrams?.["overview"]?.nodes.length ?? 0) > 0);
    expect("Contains 1 timeline (todo-completion)",
      Object.keys(data?.timelines ?? {}).length === 1);
    expect("Timeline has events",
      (data?.timelines?.["todo-completion"]?.events.length ?? 0) > 0);
    expect("nodeTypes inlined", !!data?.nodeTypes?.types);
    expect("generatedAt is an ISO timestamp",
      typeof data?.generatedAt === "string" &&
        /\d{4}-\d{2}-\d{2}T/.test(data!.generatedAt));

    await unlink(outPath);

    // ─── --no-timelines flag ────────────────────────────────────────
    execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath, "--no-timelines"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const html2 = await readFile(outPath, "utf8");
    const data2 = extractLoomData(html2) as {
      timelines?: Record<string, unknown>;
    } | null;
    expect("--no-timelines drops all timelines",
      Object.keys(data2?.timelines ?? {}).length === 0);
    await unlink(outPath);

    // ─── --diagram <id> flag ────────────────────────────────────────
    execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath,
       "--diagram", "celebration-detail"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const html3 = await readFile(outPath, "utf8");
    const data3 = extractLoomData(html3) as {
      diagrams?: Record<string, unknown>;
      timelines?: Record<string, unknown>;
    } | null;
    expect("--diagram filters to a single diagram",
      Object.keys(data3?.diagrams ?? {}).length === 1 &&
        "celebration-detail" in (data3?.diagrams ?? {}));
    expect(
      "--diagram skips timelines that target other diagrams",
      Object.keys(data3?.timelines ?? {}).length === 0
    );
    await unlink(outPath);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
