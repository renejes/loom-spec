import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findLoomRoot } from "../server/findLoomRoot.js";
import {
  listDiagrams,
  readDiagram,
  listTimelines,
  readTimeline,
  readNodeTypes,
} from "../server/fileOps.js";
import { applyFilter, type FilterSpec } from "../server/exportFilter.js";
import { loadExportsConfig } from "../server/exportConfig.js";
import type { LoomDiagram } from "../types/diagram.js";
import type { LoomTimeline } from "../types/timeline.js";
import type { LoomNodeTypes } from "../types/node-types.js";

export interface ExportHtmlArgs {
  /** Output file path. Default: "loom.html" in cwd. */
  out: string;
  /** Working directory root (walked up to find .loom/). */
  root: string;
  /** If set, only this diagram (plus any timelines that reference it). */
  diagram?: string;
  /** Skip all timelines. Useful for manuals where the static topology is
   *  the whole story. */
  noTimelines: boolean;
  /** Only export nodes carrying at least one of these tags. */
  includeTags?: string[];
  /** Drop nodes carrying any of these tags. */
  excludeTags?: string[];
  /** Named bundle from .loom/exports.json. Settings from the bundle become
   *  defaults; explicit CLI flags override. */
  bundle?: string;
}

interface ExportData {
  generatedAt: string;
  diagrams: Record<string, LoomDiagram>;
  timelines: Record<string, LoomTimeline>;
  nodeTypes: LoomNodeTypes;
}

const here = dirname(fileURLToPath(import.meta.url));

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the export-mode view bundle. Tries both layouts:
 *   - Production: alongside cli/ in dist/ → ../view-export/
 *   - Dev (tsx running from src/cli/): ../../dist/view-export/
 */
async function findExportBundle(): Promise<string> {
  const candidates = [
    resolve(here, "../view-export"),
    resolve(here, "../../dist/view-export"),
  ];
  for (const c of candidates) {
    if (await fileExists(resolve(c, "index.html"))) return c;
  }
  throw new Error(
    `Could not find the export view bundle. Looked in:\n  - ${candidates.join("\n  - ")}\n` +
      `Did you run 'pnpm build' (or 'pnpm build:export') to produce dist/view-export?`
  );
}

/**
 * Used by the bundle-merge logic to tell "user passed --out" from "we are
 * using the default". Exported so the CLI dispatcher can default-init the
 * field once and stay consistent with this module's notion of "default".
 */
export const DEFAULT_OUT = "loom.html";

async function loadAllData(args: ExportHtmlArgs): Promise<ExportData> {
  const loomRoot = await findLoomRoot(args.root);
  const nodeTypes = await readNodeTypes(loomRoot.loomPath);

  // Diagrams — either one specific or all
  const diagrams: Record<string, LoomDiagram> = {};
  if (args.diagram) {
    diagrams[args.diagram] = await readDiagram(loomRoot.loomPath, args.diagram);
  } else {
    const summaries = await listDiagrams(loomRoot.loomPath);
    for (const s of summaries) {
      diagrams[s.id] = await readDiagram(loomRoot.loomPath, s.id);
    }
  }

  // Timelines — include those that reference at least one diagram we exported
  const timelines: Record<string, LoomTimeline> = {};
  if (!args.noTimelines) {
    const summaries = await listTimelines(loomRoot.loomPath);
    for (const s of summaries) {
      if (!(s.diagram in diagrams)) continue;
      timelines[s.id] = await readTimeline(loomRoot.loomPath, s.id);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    diagrams,
    timelines,
    nodeTypes,
  };
}

/**
 * Inline the view bundle (HTML + CSS + JS) and the exported data into a
 * single self-contained HTML string.
 *
 * The export bundle's index.html looks roughly like:
 *   <html><head><link rel="stylesheet" href="/assets/bundle.css">
 *     <script type="module" crossorigin src="/assets/bundle.js"></script>
 *   </head><body><div id="root"></div></body></html>
 *
 * We rewrite the link/script tags to inline contents and inject a
 * <script>window.__LOOM_DATA__ = {...}</script> before the bundle.
 */
function buildHtml(
  bundleHtml: string,
  bundleCss: string,
  bundleJs: string,
  data: ExportData,
  meta: { sourceRoot: string }
): string {
  // Sanitize the JSON for inlining inside a <script> tag.
  // Replace </script> sequences and <!-- inside string values so they can't
  // close the surrounding script element or confuse parsers.
  const safeJson = JSON.stringify(data)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");

  const inlineDataTag = `<script>window.__LOOM_DATA__ = ${safeJson};</script>`;
  const inlineCssTag = `<style>${bundleCss}</style>`;
  const inlineJsTag = `<script type="module">${bundleJs}</script>`;

  let out = bundleHtml;

  // CRITICAL: pass replacement as a function rather than a string. With a
  // string second arg, JS treats `$$` as a literal `$`, which mangles any
  // `$$typeof` / `$&` / `$'` in the JS bundle (React's reconciler uses
  // `$$typeof` heavily). Function form bypasses the pattern processing.
  out = out.replace(
    /<link\s+rel=["']stylesheet["'][^>]*>/i,
    () => inlineCssTag
  );
  out = out.replace(
    /<script\s+type=["']module["'][^>]*><\/script>/i,
    () => inlineDataTag + inlineJsTag
  );
  out = out.replace(
    /<title>[^<]*<\/title>/i,
    () => `<title>loom-spec export · ${escapeHtml(meta.sourceRoot)}</title>`
  );

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function runExportHtml(args: ExportHtmlArgs): Promise<void> {
  // If a bundle name was given, resolve its settings from .loom/exports.json
  // first. Explicit CLI args take precedence (for ad-hoc overrides).
  let effective = args;
  if (args.bundle) {
    const loomRoot = await findLoomRoot(args.root);
    const config = await loadExportsConfig(loomRoot.loomPath);
    if (!config) {
      console.error(
        `export-html: no .loom/exports.json found, but '${args.bundle}' looks like a named bundle.\n` +
          `  Create .loom/exports.json with an 'exports.${args.bundle}' entry, or pass ad-hoc flags instead.`
      );
      process.exit(1);
    }
    const bundle = config.exports[args.bundle];
    if (!bundle) {
      const available = Object.keys(config.exports).sort().join(", ") || "(none)";
      console.error(
        `export-html: bundle '${args.bundle}' not found in .loom/exports.json. ` +
          `Available: ${available}.`
      );
      process.exit(1);
    }
    // Merge: explicit CLI args (in `args`) override config-supplied values.
    effective = {
      ...args,
      out: args.out !== DEFAULT_OUT ? args.out : bundle.out ?? args.out,
      diagram: args.diagram ?? bundle.diagram,
      noTimelines: args.noTimelines || (bundle.noTimelines ?? false),
      includeTags: args.includeTags ?? bundle.includeTags,
      excludeTags: args.excludeTags ?? bundle.excludeTags,
    };
  }

  const bundleDir = await findExportBundle();
  const [bundleHtml, bundleCss, bundleJs] = await Promise.all([
    readFile(resolve(bundleDir, "index.html"), "utf8"),
    readFile(resolve(bundleDir, "assets/bundle.css"), "utf8"),
    readFile(resolve(bundleDir, "assets/bundle.js"), "utf8"),
  ]);

  const data = await loadAllData(effective);

  if (Object.keys(data.diagrams).length === 0) {
    console.error("export-html: no diagrams found — refusing to write an empty export.");
    process.exit(1);
  }

  const filterSpec: FilterSpec = {
    includeTags: effective.includeTags,
    excludeTags: effective.excludeTags,
  };
  const { payload: filtered, summary } = applyFilter(data, filterSpec);

  // After filtering, if everything's gone, bail. Better to fail loud than
  // silently emit a blank HTML the user will wonder about.
  const survivingNodes = Object.values(filtered.diagrams).reduce(
    (n, d) => n + d.nodes.length,
    0
  );
  if (survivingNodes === 0) {
    console.error(
      "export-html: filter matched 0 nodes — refusing to write an empty export."
    );
    if (filterSpec.includeTags?.length || filterSpec.excludeTags?.length) {
      console.error(
        `  filter was: include=[${(filterSpec.includeTags ?? []).join(", ")}], ` +
          `exclude=[${(filterSpec.excludeTags ?? []).join(", ")}]`
      );
    }
    process.exit(1);
  }

  const finalData: ExportData = {
    ...data,
    diagrams: filtered.diagrams,
    timelines: filtered.timelines,
  };

  const html = buildHtml(bundleHtml, bundleCss, bundleJs, finalData, {
    sourceRoot: effective.root,
  });

  const outPath = resolve(effective.out);
  await writeFile(outPath, html, "utf8");

  const sizeKb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  const diagramCount = Object.keys(finalData.diagrams).length;
  const timelineCount = Object.keys(finalData.timelines).length;
  console.log(
    `Wrote ${outPath} (${sizeKb} kB): ` +
      `${diagramCount} diagram${diagramCount === 1 ? "" : "s"}, ` +
      `${timelineCount} timeline${timelineCount === 1 ? "" : "s"}.`
  );
  const droppedParts: string[] = [];
  if (summary.nodesDropped > 0) droppedParts.push(`${summary.nodesDropped} nodes`);
  if (summary.edgesDropped > 0) droppedParts.push(`${summary.edgesDropped} edges`);
  if (summary.groupsDropped > 0) droppedParts.push(`${summary.groupsDropped} groups`);
  if (summary.eventsDropped > 0)
    droppedParts.push(`${summary.eventsDropped} events`);
  if (summary.timelinesDropped > 0)
    droppedParts.push(`${summary.timelinesDropped} timelines`);
  if (summary.drillDownsCleared > 0)
    droppedParts.push(`${summary.drillDownsCleared} drill-down refs`);
  if (droppedParts.length > 0) {
    console.log(`Filter dropped: ${droppedParts.join(", ")}.`);
  }
  console.log(
    `Open it directly in a browser, or drop it into any docs / wiki / GitHub-Pages site.`
  );
}
