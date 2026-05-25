# `loom-spec export-html`

Build a **standalone interactive HTML file** from the spec — one file that
anyone can drop into a manual, wiki, docs site, GitHub Pages, Notion embed,
or just attach to an email. The viewer is the same React + xyflow UI as
`loom-spec view`, minus everything that requires a server: no editing,
no live sync, no add buttons. The reader can still pan/zoom, drill down
between diagrams, and inspect individual nodes.

## Usage

```sh
loom-spec export-html [<bundle-name>]
                      [--out <path>] [--diagram <id>]
                      [--include-tag <comma-list>] [--exclude-tag <comma-list>]
                      [--root <dir>]
```

- `<bundle-name>` — optional first positional arg. Resolves settings from
  a named export in `.loom/exports.json` (see [Named bundles](#named-bundles)).
- `--out` — output file path. Default: `loom.html` in cwd.
- `--diagram` — only this diagram. Omit for a full export.
- `--include-tag` — comma-separated list. Only nodes whose `tags` field
  includes at least one of these survive. Default: keep all nodes.
- `--exclude-tag` — comma-separated list. Drop any node whose `tags`
  includes one of these. Default: drop nothing.
- `--root` — walk up from this directory to find `.loom/`. Defaults to cwd.

CLI flags override values set in a named bundle.

## Output

A single self-contained HTML file (~530 kB for the todo-app demo with
2 diagrams). Contains, inlined:

- The Vite-built React + xyflow viewer bundle (JS + CSS).
- All `.loom/` data as a `<script>window.__LOOM_DATA__ = {...}</script>`
  block before the bundle. Loaders short-circuit to read from there
  instead of calling `/api/*`.
- A theme bootstrap so dark/light pref is honored before paint.

Open the file directly in any modern browser. No server. No
dependencies. Works offline.

## What's interactive vs. disabled

Interactive in the export:
- Pan + zoom on the diagram canvas (xyflow Controls)
- Click a node → inspector shows fields (read-only)
- Drill-down navigation (chevron button on nodes / groups)
- Diagram switcher dropdown to flip between diagrams
- Light/dark theme toggle

Disabled in the export:
- "+ Add" node button
- Drag to move, delete with Delete key
- Inspector inputs are present but no-op on change
- "+ New diagram…" entry in the switcher
- Server-sent live updates (there's no server)

## Deploy targets

### GitHub Pages

```sh
loom-spec export-html --out docs/architecture.html
git add docs/architecture.html
git commit -m "Update architecture export"
git push
```

Then link from your repo README:

```markdown
[Architecture overview](https://YOUR-USER.github.io/REPO/architecture.html)
```

### Notion / Confluence / any embed

Both support HTML embed blocks via iframe. Host the `.html` somewhere
(GitHub Pages, S3, Netlify) and embed:

```html
<iframe src="https://YOUR-DOMAIN/architecture.html"
        style="width:100%;height:800px;border:0"></iframe>
```

### Direct distribution

Attach the `.html` to a PR comment, email it, drop it in a Slack thread.
The file is fully self-contained — no broken assets, no relative-path
woes. Recipients double-click and the spec opens in their browser.

### Static docs sites (Docusaurus, MkDocs, Sphinx, …)

Place the `.html` in the static-assets dir and link from your docs.

## Size + performance

- Bundle: ~530 kB raw, ~165 kB gzipped.
- Data inlined: ~10 kB raw for the todo-app demo; scales linearly with
  the number of nodes.
- Time to interactive: <100 ms on a modern laptop (everything is inline
  — no network).

The single-chunk export build is intentional. A standalone HTML can't
load a separate chunk on demand (there's no server to fetch from), so
for the export we force everything into one chunk. Backlog #26
(pure-SVG mini-renderer) would let xyflow leave the export bundle
entirely, cutting another ~150 kB.

## Updating an exported file

There's no `--watch` mode. To refresh, re-run the CLI:

```sh
loom-spec export-html --out docs/architecture.html
```

If the spec is part of your repo and the export is in `docs/`, wire
this into your docs build step or a pre-commit hook so the published
file never drifts from the source.

## Scoped / public-only exports — tags

Most architectures have parts you want in a public manual and parts you
don't (internal services, security-sensitive paths, work-in-progress).
Use the `tags` field on nodes to mark them, then filter on export.

```sh
# Author flow (or via MCP / hand-editing JSON):
# Tag nodes that belong in the public manual.
loom_update_node({
  diagram: "overview",
  id: "checkout-flow",
  patch: { tags: ["public"] }
})

# Then at export time:
loom-spec export-html --include-tag public --out user-manual.html
```

### Filter semantics

A node survives iff:

- (`--include-tag` is unset OR the node has at least one matching tag)
  AND
- (`--exclude-tag` is unset OR the node has none of those tags)

So `--include-tag public` is an **allowlist** (untagged = hidden);
`--exclude-tag wip` is a **blocklist** (only the explicitly-tagged is
hidden); the two combine naturally.

### Cascade rules (what happens to the rest of the graph)

When a node is dropped, everything that depended on it is cleaned up
automatically — no dangling references in the export:

1. **Edges**: drop any edge whose source or target was dropped.
2. **Groups**: shrink to surviving children; if all children were dropped,
   drop the group.
3. **Drill-down chevrons**: if a node's `drill_down` points at a diagram
   with zero surviving nodes after filtering, clear the chevron (the
   diagram still ships, but the link goes away). Same for group drill-downs.

The CLI prints a summary line after exporting (`Filter dropped: 3 nodes,
4 edges, 1 group.`) so you can sanity-check what you're shipping.

### Security warning

Tags are a coarse instrument. They filter **nodes**, not their content.
If a node is tagged `public` but its `code_refs[].path` points at
`src/server/admin/secrets.ts`, that path string ships in the export.

Before tagging `public`, check:

- `code_refs[]` paths don't expose internal directory structure you
  consider sensitive.
- `description` and `properties` don't reference internal systems by
  name in a way that gives away your architecture.

If you need to expose a node but hide a `code_ref`, split into two nodes
(public + internal) or remove that ref from the public one.

## Named bundles

Most teams have a handful of recurring export configurations
(`user-manual`, `ops-runbook`, `internal-overview`). Versioning those in
the repo via `.loom/exports.json` means everyone — humans, agents, CI —
produces the same output without remembering CLI flags.

### Schema

```json
{
  "exports": {
    "user-manual": {
      "include-tags": ["public"],
      "exclude-tags": ["wip"],
      "diagram": "overview",
      "out": "docs/architecture.html"
    },
    "ops-runbook": {
      "include-tags": ["ops"]
    }
  }
}
```

All fields are optional. Unknown keys are tolerated for forward-compat.

### Use

```sh
loom-spec export-html user-manual              # uses bundle as-is
loom-spec export-html user-manual --out /tmp/preview.html  # override out
```

CLI flags override the bundle's values. Useful for previews
(`--out /tmp/...`) or one-off variations.

## Testing

A smoke test at `packages/loom-spec/scripts/smoke-export-html.ts`:

- Runs the CLI multiple times against the todo-app fixture: full,
  `--diagram celebration-detail`, `--include-tag public`,
  `--exclude-tag critical-path`, and a named bundle.
- Asserts the output is a non-trivial HTML file with the expected
  `<style>`, inlined `<script type="module">`, and `__LOOM_DATA__` shape.
- Verifies `--include-tag` cascade drops orphaned edges + groups.
- Verifies `--include-tag` matching 0 nodes exits non-zero.
- Verifies named bundle resolution from `.loom/exports.json` works
  (and that an unknown bundle name exits non-zero).

Run it directly:

```sh
pnpm --filter loom-spec build:export          # produce dist/view-export/
pnpm --filter loom-spec exec tsx scripts/smoke-export-html.ts
```
