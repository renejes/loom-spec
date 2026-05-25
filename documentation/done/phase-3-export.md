# Phase 3 — Interactive HTML Export (v0.4.0)

A standalone interactive HTML viewer of the spec, suitable for embedding
into a manual, wiki, GitHub Pages site, Notion, or just emailing as an
attachment. Same React + xyflow viewer as the live editor, minus
everything that requires a server. The export is filterable by
node tags — so the same `.loom/` repo can produce a public manual
(only `tags: ["public"]` nodes), an ops runbook (`["ops"]`), and an
internal architecture overview (no filter) without forking content.

## Substeps

| Step | What it added |
|---|---|
| #28-a | New `vite.config.export.ts`: like the live config but with `manualChunks: () => "all"` so the React.lazy() in App.tsx resolves synchronously from the single in-page bundle (no separate chunk to fetch). Stable filenames (`bundle.js` / `bundle.css` / `index.html`) make the inlining step trivial. `pnpm build` runs both vite configs. |
| #28-b | New `src/view/exportMode.ts`: tiny runtime detector — `isExportMode()` returns true iff `window.__LOOM_DATA__` is present. `loadDiagram.ts`, `state.ts`, `useTimelineState.ts` short-circuit when in export mode: data from inlined object, SSE skipped, auto-save bails. UI components (DiagramView, TimelineView, TopBar, Inspector, DiagramSwitcher) hide their edit affordances. |
| #28-c | `src/cli/exportHtml.ts`: reads `.loom/`, reads `dist/view-export/`, inlines CSS as `<style>`, inlines JS as `<script type="module">`, injects `<script>window.__LOOM_DATA__ = {...}</script>` before the bundle. CLI flags: `--out`, `--diagram`, `--root`. (The `--no-timelines` flag was added in v0.4.0 and removed in v0.5.0 with timelines.) |
| #28-d | Smoke test (`scripts/smoke-export-html.ts`): 28 checks (full / no-timelines / single-diagram / tag-filter / named-bundle). Docs at `documentation/export-html.md`. |
| #29 | Tag-based filter (`--include-tag`, `--exclude-tag`) with cascade rules in `src/server/exportFilter.ts`. Drops nodes not matching, then drops edges touching dropped nodes, shrinks groups, clears drill-down chevrons to fully-empty diagrams. (The original v0.4.0 implementation also cascaded into timelines / events / `triggered_by` — that path was removed in v0.5.0 along with timelines themselves.) |
| #30 | `.loom/exports.json` named bundles (`src/server/exportConfig.ts`). `loom-spec export-html <bundle-name>` resolves settings from the file; explicit CLI flags override. Refactored `parseFlags` in `src/cli/index.ts` to also return positional args (previous greedy `rest.find(...)` was eating the value of `--root`). |
| #31 | SKILL.md (template + example) gained Example 7 ("user wants to publish architecture docs to a manual"), Tagging-Hygiene-Section with standard tags + security warning, new Don'ts. |

## Critical bug avoided during build

`String.replace`'s string second-arg treats `$$` as a literal `$`,
which would mangle React's `$$typeof` (used heavily by the reconciler)
throughout the inlined bundle and silently truncate it. Fixed by
passing the replacement as a function — bypasses pattern processing
entirely. Took finding 5+ kB of corrupted JS literals to nail this
down. See the comment block at the top of `buildHtml` in
`src/cli/exportHtml.ts`.

## Bundle size

- Production build now emits both `dist/view/` (split, for the live
  editor) and `dist/view-export/` (single chunk, for inlining).
- Single-chunk export bundle: 531 kB JS + 32 kB CSS.
- Generated HTML for the todo-app demo (2 diagrams + 1 timeline,
  un-filtered): 560 kB raw.
- Real bundle-size win still pending: pure-SVG mini-renderer (#26 in
  backlog) would drop xyflow from the export and bring it under ~200 kB.

## Schema additions

None. Both `--include-tag` filtering and the `.loom/exports.json` config
use existing primitives:

- Tags are already part of the diagram schema (`Node.tags?: string[]`)
  since v0.1.0. Phase 3 only added consumption.
- `.loom/exports.json` is a new optional file at the `.loom/` root, not
  a schema change to any existing kind.

This was deliberate. Adding a new field per node (`exportable: bool`)
was rejected during planning in favour of reusing tags — composable,
multi-scope, no migration.
