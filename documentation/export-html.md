# `loom-spec export-html`

Build a **standalone interactive HTML file** from the spec — one file that
anyone can drop into a manual, wiki, docs site, GitHub Pages, Notion embed,
or just attach to an email. The viewer is the same React + xyflow UI as
`loom-spec view`, minus everything that requires a server: no editing,
no live sync, no add buttons. The reader can still pan/zoom, drill down
between diagrams, switch to timelines, play them back, and inspect
individual nodes.

## Usage

```sh
loom-spec export-html [--out <path>] [--diagram <id>] [--no-timelines] [--root <dir>]
```

- `--out` — output file path. Default: `loom.html` in cwd.
- `--diagram` — only this diagram, plus any timelines that reference it.
  Omit for a full export.
- `--no-timelines` — skip all timelines. Useful for manuals that only
  need the static architecture diagrams.
- `--root` — walk up from this directory to find `.loom/`. Defaults to cwd.

## Output

A single self-contained HTML file (~560 kB for the todo-app demo with
2 diagrams + 1 timeline). Contains, inlined:

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
- Diagram switcher dropdown to flip between diagrams + timelines
- Timeline playback: Play/Pause (Space), Reset (Home), speed selector,
  scrubbable axis, zoom selector
- Mini-graph glow + edge pulse driven by the playhead
- Light/dark theme toggle

Disabled in the export:
- "+ Add" node / event buttons
- Drag to move, resize clips, delete with Delete key
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
- Data inlined: ~30 kB raw for the todo-app demo; scales linearly with
  the number of nodes + timeline events.
- Time to interactive: <100 ms on a modern laptop (everything is inline
  — no network).

The single-chunk export build is intentional. The regular `loom-spec view`
build code-splits TimelineView for the live editor, but a standalone
HTML can't load a separate chunk on demand (there's no server to fetch
from), so for the export we force everything into one chunk. This adds
~18 kB versus the split build but eliminates the runtime fetch.

## Updating an exported file

There's no `--watch` mode. To refresh, re-run the CLI:

```sh
loom-spec export-html --out docs/architecture.html
```

If the spec is part of your repo and the export is in `docs/`, wire
this into your docs build step or a pre-commit hook so the published
file never drifts from the source.

## What about scoped / public-only exports?

Coming in a follow-up (backlog #29 + #30): tag-based filtering
(`--include-tag public`) and named bundles via `.loom/exports.json`. For
now, the only scope tool is `--diagram <id>` to pick a single diagram.
If you need to hide internal services from a public manual, the
workaround is to maintain them in a separate diagram and export only
the public one.

## Testing

A smoke test at `packages/loom-spec/scripts/smoke-export-html.ts`:

- Runs the CLI three times against the todo-app fixture: full, with
  `--no-timelines`, and with `--diagram celebration-detail`.
- Asserts the output is a non-trivial HTML file with the expected
  `<style>`, inlined `<script type="module">`, and `__LOOM_DATA__` shape.
- Verifies `--no-timelines` empties the timeline map.
- Verifies `--diagram` correctly filters out timelines that target
  other diagrams.

Run it directly:

```sh
pnpm --filter loom-spec build:export          # produce dist/view-export/
pnpm --filter loom-spec exec tsx scripts/smoke-export-html.ts
```
