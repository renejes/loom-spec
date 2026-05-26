import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findLoomRoot } from "../server/findLoomRoot.js";
import {
  listDiagrams,
  readDiagram,
  readNodeTypes,
  listJourneys,
  readJourney,
} from "../server/fileOps.js";
import { applyFilter, type FilterSpec } from "../server/exportFilter.js";
import { loadExportsConfig } from "../server/exportConfig.js";
import type { LoomDiagram } from "../types/diagram.js";
import type { LoomNodeTypes } from "../types/node-types.js";
import type { LoomJourney } from "../types/journey.js";

export interface ExportHtmlArgs {
  /** Output file path. Default: "loom.html" in cwd. */
  out: string;
  /** Working directory root (walked up to find .loom/). */
  root: string;
  /** If set, only this diagram. */
  diagram?: string;
  /** Only export nodes carrying at least one of these tags. */
  includeTags?: string[];
  /** Drop nodes carrying any of these tags. */
  excludeTags?: string[];
  /** Scope the export to a single journey: implicitly narrows the
   *  diagram to the journey's nodes and embeds only that journey. The
   *  resulting HTML opens at #journey:<id> by default. */
  fromJourney?: string;
  /** Named bundle from .loom/exports.json. Settings from the bundle become
   *  defaults; explicit CLI flags override. */
  bundle?: string;
}

interface DefaultView {
  kind: "diagram" | "journey";
  id: string;
}

interface ExportData {
  generatedAt: string;
  diagrams: Record<string, LoomDiagram>;
  journeys?: Record<string, LoomJourney>;
  nodeTypes: LoomNodeTypes;
  /** Which view the standalone HTML should land on when the URL hash is
   *  empty. Set by --from-journey; omitted otherwise. */
  defaultView?: DefaultView;
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

  // Journeys — when scoped via --from-journey, ship just that one. Otherwise
  // ship all journeys; the cascade in applyFilter drops the ones whose
  // diagrams didn't make it through tag filtering.
  let journeys: Record<string, LoomJourney> | undefined;
  if (args.fromJourney) {
    const j = await readJourney(loomRoot.loomPath, args.fromJourney);
    journeys = { [args.fromJourney]: j };
  } else {
    const summaries = await listJourneys(loomRoot.loomPath);
    if (summaries.length > 0) {
      journeys = {};
      for (const s of summaries) {
        journeys[s.id] = await readJourney(loomRoot.loomPath, s.id);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    diagrams,
    journeys,
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
      includeTags: args.includeTags ?? bundle.includeTags,
      excludeTags: args.excludeTags ?? bundle.excludeTags,
      fromJourney: args.fromJourney ?? bundle.fromJourney,
    };
  }

  // --from-journey implies a single-diagram export of the journey's
  // diagram, unless the user explicitly overrode --diagram. Do this after
  // the bundle merge so that bundle's fromJourney also gets the implicit
  // diagram narrowing.
  if (effective.fromJourney && !effective.diagram) {
    const loomRoot = await findLoomRoot(effective.root);
    const j = await readJourney(loomRoot.loomPath, effective.fromJourney).catch(
      () => null
    );
    if (!j) {
      console.error(
        `export-html: journey '${effective.fromJourney}' not found in .loom/journeys/.`
      );
      process.exit(1);
    }
    effective = { ...effective, diagram: j.diagram };
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

  // Build the journey-scope restriction, if any. The journey was already
  // loaded into data.journeys by loadAllData.
  let fromJourneyScope: FilterSpec["fromJourney"] | undefined;
  if (effective.fromJourney) {
    const j = data.journeys?.[effective.fromJourney];
    if (!j) {
      console.error(
        `export-html: journey '${effective.fromJourney}' could not be loaded.`
      );
      process.exit(1);
    }
    fromJourneyScope = {
      diagramId: j.diagram,
      nodeIds: new Set(j.steps.map((s) => s.node)),
    };
  }

  const filterSpec: FilterSpec = {
    includeTags: effective.includeTags,
    excludeTags: effective.excludeTags,
    fromJourney: fromJourneyScope,
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

  // If --from-journey was set, ensure the journey we asked for actually
  // survived the cascade. If it didn't, the user has a broken bundle (tag
  // filter dropped all the journey's nodes) — fail loud.
  if (effective.fromJourney && !filtered.journeys?.[effective.fromJourney]) {
    console.error(
      `export-html: --from-journey '${effective.fromJourney}' produced no surviving steps after filtering — refusing to write.`
    );
    process.exit(1);
  }

  const finalData: ExportData = {
    ...data,
    diagrams: filtered.diagrams,
    journeys: filtered.journeys,
    defaultView: effective.fromJourney
      ? { kind: "journey", id: effective.fromJourney }
      : undefined,
  };

  const html = buildHtml(bundleHtml, bundleCss, bundleJs, finalData, {
    sourceRoot: effective.root,
  });

  const outPath = resolve(effective.out);
  await writeFile(outPath, html, "utf8");

  const sizeKb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  const diagramCount = Object.keys(finalData.diagrams).length;
  const journeyCount = Object.keys(finalData.journeys ?? {}).length;
  const parts = [`${diagramCount} diagram${diagramCount === 1 ? "" : "s"}`];
  if (journeyCount > 0) {
    parts.push(`${journeyCount} journey${journeyCount === 1 ? "" : "s"}`);
  }
  console.log(`Wrote ${outPath} (${sizeKb} kB): ${parts.join(", ")}.`);
  const droppedParts: string[] = [];
  if (summary.nodesDropped > 0) droppedParts.push(`${summary.nodesDropped} nodes`);
  if (summary.edgesDropped > 0) droppedParts.push(`${summary.edgesDropped} edges`);
  if (summary.groupsDropped > 0) droppedParts.push(`${summary.groupsDropped} groups`);
  if (summary.drillDownsCleared > 0)
    droppedParts.push(`${summary.drillDownsCleared} drill-down refs`);
  if (summary.journeyStepsDropped > 0)
    droppedParts.push(`${summary.journeyStepsDropped} journey steps`);
  if (summary.journeysDropped > 0)
    droppedParts.push(`${summary.journeysDropped} journeys`);
  if (droppedParts.length > 0) {
    console.log(`Filter dropped: ${droppedParts.join(", ")}.`);
  }
  console.log(
    `Open it directly in a browser, or drop it into any docs / wiki / GitHub-Pages site.`
  );
}
