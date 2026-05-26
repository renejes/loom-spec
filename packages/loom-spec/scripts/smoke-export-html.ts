/**
 * Smoke-test for `loom-spec export-html`. Runs the CLI against the
 * todo-app fixture, asserts the output HTML structure (inlined CSS,
 * inlined JS bundle, embedded data shape), then cleans up the tmp file.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-export-html.ts
 */
import { readFile, writeFile, unlink, mkdtemp, rm, stat } from "node:fs/promises";
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
    // helpers (harmless — nothing fetches them).
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch?.[0] ?? "";
    expect("No leftover stylesheet link in <head>",
      !/<link[^>]*rel=["']stylesheet["'][^>]*href=["']\/assets/i.test(head));

    const data = extractLoomData(html) as {
      diagrams?: Record<string, { id: string; nodes: unknown[] }>;
      journeys?: Record<string, { id: string; steps: unknown[] }>;
      defaultView?: { kind: string; id: string };
      nodeTypes?: { types?: Record<string, unknown> };
      generatedAt?: string;
    } | null;
    expect("__LOOM_DATA__ parses as JSON", data !== null);
    expect("Contains 2 diagrams (overview + celebration-detail)",
      Object.keys(data?.diagrams ?? {}).length === 2);
    expect("Contains overview diagram with > 0 nodes",
      (data?.diagrams?.["overview"]?.nodes.length ?? 0) > 0);
    expect("nodeTypes inlined", !!data?.nodeTypes?.types);
    expect("generatedAt is an ISO timestamp",
      typeof data?.generatedAt === "string" &&
        /\d{4}-\d{2}-\d{2}T/.test(data!.generatedAt));
    expect("Default export ships journeys map",
      !!data?.journeys && "complete-a-todo" in data.journeys);
    expect("Default export does not set defaultView",
      data?.defaultView === undefined);

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
    } | null;
    expect("--diagram filters to a single diagram",
      Object.keys(data3?.diagrams ?? {}).length === 1 &&
        "celebration-detail" in (data3?.diagrams ?? {}));
    await unlink(outPath);

    // ─── --include-tag public (only todo-list-view has it) ──────────
    const out4 = execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath,
       "--include-tag", "public"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect("--include-tag prints filter-drop summary",
      /Filter dropped/.test(out4), out4);
    const html4 = await readFile(outPath, "utf8");
    const data4 = extractLoomData(html4) as {
      diagrams?: Record<string, { nodes: { id: string }[]; edges: unknown[]; groups?: unknown[] }>;
    } | null;
    const overview4 = data4?.diagrams?.["overview"];
    expect("--include-tag=public retains only todo-list-view in overview",
      overview4?.nodes.length === 1 && overview4.nodes[0]?.id === "todo-list-view");
    expect("--include-tag drops all edges (both endpoints needed)",
      (overview4?.edges.length ?? -1) === 0);
    expect("--include-tag drops empty groups",
      (overview4?.groups?.length ?? 0) === 0);
    await unlink(outPath);

    // ─── --include-tag bogus → refuses to write ─────────────────────
    let bogusFailed = false;
    try {
      execFileSync(
        "pnpm",
        ["--filter", "loom-spec", "exec", "tsx", cliEntry,
         "export-html", "--root", fixture, "--out", outPath,
         "--include-tag", "this-tag-matches-nothing"],
        { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }
      );
    } catch {
      bogusFailed = true;
    }
    expect("--include-tag matching 0 nodes exits non-zero", bogusFailed);

    // ─── --exclude-tag critical-path (drops todo-list-view) ─────────
    execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath,
       "--exclude-tag", "critical-path"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const html5 = await readFile(outPath, "utf8");
    const data5 = extractLoomData(html5) as {
      diagrams?: Record<string, { nodes: { id: string }[] }>;
    } | null;
    const overview5 = data5?.diagrams?.["overview"];
    expect("--exclude-tag=critical-path drops todo-list-view",
      !overview5?.nodes.some((n) => n.id === "todo-list-view"));
    expect("--exclude-tag keeps the other 4 nodes",
      overview5?.nodes.length === 4);
    await unlink(outPath);

    // ─── --from-journey complete-a-todo ─────────────────────────────
    execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath,
       "--from-journey", "complete-a-todo"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const htmlJ = await readFile(outPath, "utf8");
    const dataJ = extractLoomData(htmlJ) as {
      diagrams?: Record<string, { nodes: { id: string }[]; edges: { id: string }[] }>;
      journeys?: Record<string, { steps: { node: string }[] }>;
      defaultView?: { kind: string; id: string };
    } | null;
    expect("--from-journey ships only the journey's diagram",
      Object.keys(dataJ?.diagrams ?? {}).length === 1 &&
        "overview" in (dataJ?.diagrams ?? {}));
    const overviewJ = dataJ?.diagrams?.["overview"];
    expect("--from-journey narrows overview to the journey's 3 nodes",
      overviewJ?.nodes.length === 3 &&
        overviewJ.nodes.map((n) => n.id).sort().join(",") ===
          "todo-api,todo-list-view,todo-store");
    expect("--from-journey ships only the journey's edges (between its nodes)",
      // overview has 5 edges; 3 connect journey nodes (e1, e2, e3), 2 are
      // to nodes that got dropped (e4, e5).
      overviewJ?.edges.length === 3 &&
        overviewJ.edges.map((e) => e.id).sort().join(",") === "e1,e2,e3");
    expect("--from-journey embeds the journey itself",
      !!dataJ?.journeys && "complete-a-todo" in dataJ.journeys);
    expect("--from-journey embeds only the named journey",
      Object.keys(dataJ?.journeys ?? {}).length === 1);
    expect("--from-journey embedded journey has 3 steps",
      dataJ?.journeys?.["complete-a-todo"]?.steps.length === 3);
    expect("--from-journey sets defaultView to the journey",
      dataJ?.defaultView?.kind === "journey" &&
        dataJ.defaultView.id === "complete-a-todo");
    await unlink(outPath);

    // ─── --from-journey + tag conflict prunes steps ─────────────────
    // todo-list-view carries 'critical-path' → step 1 is pruned. Steps
    // 2+3 survive (todo-api, todo-store).
    execFileSync(
      "pnpm",
      ["--filter", "loom-spec", "exec", "tsx", cliEntry,
       "export-html", "--root", fixture, "--out", outPath,
       "--from-journey", "complete-a-todo",
       "--exclude-tag", "critical-path"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const htmlJ2 = await readFile(outPath, "utf8");
    const dataJ2 = extractLoomData(htmlJ2) as {
      diagrams?: Record<string, { nodes: { id: string }[] }>;
      journeys?: Record<string, { steps: { node: string }[] }>;
    } | null;
    expect("--from-journey + exclude-tag drops the conflicting node",
      !dataJ2?.diagrams?.["overview"]?.nodes.some((n) => n.id === "todo-list-view"));
    expect("--from-journey + exclude-tag prunes the conflicting step",
      dataJ2?.journeys?.["complete-a-todo"]?.steps.length === 2 &&
        !dataJ2.journeys["complete-a-todo"].steps.some(
          (s) => s.node === "todo-list-view"
        ));
    await unlink(outPath);

    // ─── --from-journey unknown id → fails ──────────────────────────
    let unknownJourneyFailed = false;
    try {
      execFileSync(
        "pnpm",
        ["--filter", "loom-spec", "exec", "tsx", cliEntry,
         "export-html", "--root", fixture, "--out", outPath,
         "--from-journey", "no-such-journey"],
        { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }
      );
    } catch {
      unknownJourneyFailed = true;
    }
    expect("--from-journey on unknown id exits non-zero", unknownJourneyFailed);

    // ─── Named bundle from .loom/exports.json ───────────────────────
    // Write a temp config into the fixture; restore at the end.
    const exportsPath = resolve(fixture, ".loom/exports.json");
    const hadExisting = await stat(exportsPath).then(() => true).catch(() => false);
    const backup = hadExisting ? await readFile(exportsPath, "utf8") : null;
    try {
      await writeFile(
        exportsPath,
        JSON.stringify(
          {
            exports: {
              "user-manual": {
                "include-tags": ["public"],
              },
            },
          },
          null,
          2
        ) + "\n",
        "utf8"
      );

      execFileSync(
        "pnpm",
        ["--filter", "loom-spec", "exec", "tsx", cliEntry,
         "export-html", "user-manual", "--root", fixture, "--out", outPath],
        { cwd: repoRoot, encoding: "utf8" }
      );
      const html6 = await readFile(outPath, "utf8");
      const data6 = extractLoomData(html6) as {
        diagrams?: Record<string, { nodes: { id: string }[] }>;
      } | null;
      const overview6 = data6?.diagrams?.["overview"];
      expect("named bundle applies include-tags filter",
        overview6?.nodes.length === 1 &&
          overview6.nodes[0]?.id === "todo-list-view");
      await unlink(outPath);

      // ─── Named bundle with from-journey ───────────────────────────
      await writeFile(
        exportsPath,
        JSON.stringify(
          {
            exports: {
              "checkout-tour": {
                "from-journey": "complete-a-todo",
              },
            },
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
      execFileSync(
        "pnpm",
        ["--filter", "loom-spec", "exec", "tsx", cliEntry,
         "export-html", "checkout-tour", "--root", fixture, "--out", outPath],
        { cwd: repoRoot, encoding: "utf8" }
      );
      const htmlB = await readFile(outPath, "utf8");
      const dataB = extractLoomData(htmlB) as {
        diagrams?: Record<string, { nodes: { id: string }[] }>;
        journeys?: Record<string, unknown>;
        defaultView?: { kind: string; id: string };
      } | null;
      expect("named bundle resolves from-journey",
        Object.keys(dataB?.diagrams ?? {}).length === 1 &&
          dataB?.diagrams?.["overview"]?.nodes.length === 3 &&
          dataB?.defaultView?.kind === "journey" &&
          dataB.defaultView.id === "complete-a-todo");
      await unlink(outPath);

      // Bundle not found
      let unknownBundleFailed = false;
      try {
        execFileSync(
          "pnpm",
          ["--filter", "loom-spec", "exec", "tsx", cliEntry,
           "export-html", "no-such-bundle", "--root", fixture, "--out", outPath],
          { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }
        );
      } catch {
        unknownBundleFailed = true;
      }
      expect("unknown bundle name exits non-zero", unknownBundleFailed);
    } finally {
      if (backup !== null) {
        await writeFile(exportsPath, backup, "utf8");
      } else {
        await unlink(exportsPath).catch(() => {});
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
