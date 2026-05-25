# loom-spec — Project Status

## Goal

`loom-spec` is a lightweight tool that keeps a **node-based architectural spec** alongside the code of a project, inside the repo itself. It is designed to be edited by both humans (through a browser-based node editor) and AI coding agents (directly via JSON files or MCP tool calls).

The core idea: instead of describing app structure in prose, in stale diagrams, or letting it live only in the model weights of a coding agent, keep it as a **structured, machine-readable, git-diffable** set of nodes and edges. Humans see and edit it visually; agents read it before implementing and update it as code changes.

It is **a spec layer, not an execution layer**. The nodes don't run — they describe.

## Where it lives

- **`.loom/`** in the user's repo holds the data — diagram files, timeline files, node-type definitions, optional `exports.json` for named HTML-export bundles, README.
- **`.claude/skills/loom-spec/SKILL.md`** in the user's repo tells coding agents (Claude Code et al.) when and how to maintain the spec.
- **`.mcp.json`** in the user's repo registers the loom-spec MCP server (auto-written by `loom-spec init --mcp` or `loom-spec install-mcp`).
- **`loom-spec`** npm package provides the browser viewer/editor (`loom-spec view`), drift validator (`loom-spec validate`), MCP server (`loom-spec mcp`), trace importer (`loom-spec import-trace`), HTML exporter (`loom-spec export-html`), and the scaffolder (`loom-spec init`). Nothing of the package itself is committed to the user's repo.

## Current state

**v0.4.0 published on npm** ([npmjs.com/package/loom-spec](https://www.npmjs.com/package/loom-spec)). Both phases of the original plan plus Phase 3 (interactive HTML export with tag-based scoping) are shipped end-to-end. **First real-world adoption confirmed.**

For the per-version detail of what shipped when, see [`done/`](./done/):

- [Phase 1 — Foundation](./done/phase-1-foundation.md) (v0.1.0 → v0.1.1)
- [Phase 2 — Timeline view](./done/phase-2-timeline.md) (v0.2.0 → v0.3.0)
- [Phase 3 — Interactive HTML export](./done/phase-3-export.md) (v0.4.0)

Next planned chunk: **[Journeys](./journeys-plan.md)** — a separate file kind for ordered, untimed workflow documentation. v0.5.0 target.

## Capabilities at a glance

| Layer | What works as of v0.4.0 |
|---|---|
| Data | 3 schema-validated file kinds: diagrams, timelines, node-types. Optional `exports.json` for named bundles. |
| CLI | `init [--mcp]`, `install-mcp`, `view`, `validate`, `mcp`, `import-trace`, `export-html`. |
| MCP server | 15 tools — 10 for diagrams (list/read/add-node/update/mark-stale/delete-node/add-edge/delete-edge/validate/read-node-types), 5 for timelines (list/read/add-event/update/delete). All mutations schema-validated before write; timeline mutations cross-check the referenced node exists in the diagram. |
| Browser editor | xyflow-based diagram canvas with light/dark theme, drag, debounced auto-save, code-refs editing, tags chips, ports, inline validation, drill-down between diagrams, group frames, parallel-edge offsets. |
| Timeline view | SVG-based; drag/resize/delete clips; playback (play/pause/scrub/0.25×–4× speed); side-by-side mini graph with NodeCard glow + animated edge pulse; horizontal zoom 1×–20×; `+ Event` button with anchored node picker. |
| Live sync | chokidar watcher with self-write suppression; SSE; UI refetches on external edits. |
| Agent skill | `.claude/skills/loom-spec/SKILL.md` with 7 worked examples + tagging hygiene + security warnings. |
| Drift detection | `loom-spec validate` walks all `code_refs[]` (nodes + timeline events). Exits non-zero for CI / pre-commit. |
| Trace import | OTLP-JSON → timeline. Heuristic span-to-node mapping with `--map` override. `--append` for accumulation. Causation via `triggered_by`. |
| Export | Standalone interactive HTML (~560 kB for the demo); tag-based filter with cascade rules (drop edges to dropped nodes, shrink groups, clear drill-downs to empty diagrams, drop empty timelines); named bundles via `.loom/exports.json`; `--diagram <id>` / `--no-timelines` flags; explicit `--include-tag` / `--exclude-tag`. |

## Architecture

### Data model

The single source of truth is JSON files in `.loom/`. Three file kinds (plus optional config):

- **`.loom/node-types.json`** — declares the available node-type vocabulary for the project. Each type has color, icon, fields (typed: string/number/boolean/enum/markdown/code-ref/array), and optional named ports (in/out).
- **`.loom/diagrams/*.flow.json`** — one diagram per file. `{ nodes, edges, groups }`. Nodes have `id`, `type`, `label`, `position`, `status` (planned/implemented/stale/deprecated), `code_refs` (path + symbol), `properties` (typed by the node's type), `tags`, optional `drill_down`. Edges have `from`, `to` (optionally with `:port` suffix), `kind` (request/event/data-read/data-write/signal/dependency/control), `label`, `direction`. Groups nest (via `subgroups`) and can `drill_down` like nodes.
- **`.loom/timelines/*.timeline.json`** — `{ events, tracks?, diagram }`. Each event has `id`, `node` (refers to a node id in the referenced diagram), optional `track`, `start_ms`, `duration_ms`, optional `label`, `description`, `kind` (compute/io/wait/error), `code_refs`, `triggered_by`, `tags`.
- **`.loom/exports.json`** (optional) — named export bundles. `{ exports: { "<name>": { "include-tags"?, "exclude-tags"?, diagram?, "no-timelines"?, out? } } }`.

Schemas live at `packages/loom-spec/schema/{diagram,node-types,timeline}.schema.json`. TypeScript types are autogenerated via `json-schema-to-typescript`, so the runtime validator (ajv 2020) and compile-time types stay aligned. `TimelineEvent` and `TimelineTrack` are named (not `Event`/`Track`) to avoid shadowing the global DOM `Event`.

### Runtime layout

```
graphical-programming/                          # workspace root, pnpm
├── examples/todo-app/                          # Demo fixture used during dev
│   ├── .claude/skills/loom-spec/SKILL.md
│   └── .loom/
│       ├── node-types.json                    # 5 default types + audio-track demo
│       ├── diagrams/
│       │   ├── overview.flow.json
│       │   └── celebration-detail.flow.json
│       └── timelines/
│           └── todo-completion.timeline.json  # 6 events, 4 tracks, 1865ms total
└── packages/loom-spec/                         # The npm package
    ├── schema/{diagram,node-types,timeline}.schema.json
    ├── templates/                              # Scaffolded by `loom-spec init`
    │   ├── .loom/{README,node-types.json,diagrams/overview.flow.json}
    │   └── .claude/skills/loom-spec/SKILL.md
    ├── scripts/{generate-types,validate-examples,smoke-mcp-timelines,smoke-import-trace,smoke-export-html}.ts
    └── src/
        ├── cli/{index,init,view,validate,mcp,installMcp,importTrace,exportHtml,mcpConfig}.ts
        ├── server/{app,findLoomRoot,fileOps,watch,drift,otel,exportFilter,exportConfig}.ts
        ├── mcp/server.ts                       # MCP stdio server
        ├── view/                               # Vite-built React + xyflow SPA
        │   ├── App.tsx                         # thin router (DiagramView | lazy TimelineView)
        │   ├── exportMode.ts                   # runtime detector for standalone-HTML mode
        │   ├── components/
        │   │   ├── DiagramView.tsx
        │   │   ├── DiagramCanvas.tsx, NodeCard.tsx, GroupNode.tsx, ParallelEdge.tsx, PulseEdge.tsx
        │   │   ├── Inspector.tsx, AddNodeMenu.tsx
        │   │   ├── TimelineView.tsx, TimelineCanvas.tsx (SVG, not xyflow)
        │   │   ├── TimelineInspector.tsx, TransportBar.tsx, AddEventMenu.tsx
        │   │   ├── TopBar.tsx, DiagramSwitcher.tsx
        │   ├── state.ts, useTimelineState.ts
        │   ├── useViewState.ts                 # URL-hash routing: #diagram:x | #timeline:x
        │   ├── useDiagramsList.ts, useTimelinesList.ts
        │   ├── validate-client.ts              # inline schema validation
        │   ├── loadDiagram.ts                  # client API wrappers (diagrams + timelines)
        │   ├── groupLayout.ts                  # bbox math for nested groups
        │   ├── vite.config.ts                  # live editor build
        │   └── vite.config.export.ts           # single-chunk build for HTML embed
        ├── types/                              # autogenerated from schema
        └── validate.ts                         # ajv 2020, server-side
```

### Two view modes, one app

- `App.tsx` is a thin router. It reads `useViewState()` (which parses `location.hash` like `#diagram:overview` or `#timeline:todo-completion`) and renders either `DiagramView` or `TimelineView`. The default empty hash maps to `diagram:overview`.
- Both views share the same `TopBar` (which renders the switcher listing diagrams + timelines), the same Inspector layout pattern, the same SSE + auto-save plumbing, the same theme handling.
- **DiagramView** uses xyflow (`@xyflow/react`) for the canvas.
- **TimelineView** uses **pure SVG + React** — different layout problem (1D time axis vs 2D graph). It does its own pointer-event handling for drag/resize/scrub.
- **Export mode** is the same source compiled with a different rollup config (`vite.config.export.ts`, single-chunk) plus runtime detection (`exportMode.ts`). When `window.__LOOM_DATA__` is present, loaders short-circuit, SSE is skipped, edits are silently dropped, edit UI is hidden.

### Playback loop (timeline)

- `useState(positionMs)`, `useState(playing)`, `useState(speed)` live in `TimelineView`.
- A `useEffect` starts a `setInterval(16ms)` when `playing` becomes true and clears it when false. We use `setInterval` rather than `requestAnimationFrame` because rAF is throttled to ≈0 in iframes/background tabs; setInterval keeps the loop running everywhere with no visible difference at 60Hz target.
- The tick reads `performance.now()`, computes delta from `lastTickRef`, and advances `positionMs += dt * speed`. Auto-stop at `totalMs`.
- The playhead in `TimelineCanvas` is just `position * pixelsPerMs + LABEL_COL_W`; the "active" CSS class on clips is computed by checking if `playheadMs` is within `[start_ms, start_ms + duration_ms]`.

### MCP server

`loom-spec mcp` boots a stdio MCP server (using `@modelcontextprotocol/sdk`) that exposes 15 tools (10 for diagrams, 5 for timelines). Each mutation re-reads, applies the patch, validates against the schema, and writes — so invalid edits never corrupt the file. Timeline mutations additionally cross-check that the referenced node exists in the underlying diagram, catching agent typos at write time.

`init --mcp` and `install-mcp` write `.mcp.json` with idempotent merge semantics — existing servers (e.g. Playwright MCP) and unrelated top-level keys are preserved.

## How it works in practice

### User opens a diagram

1. `npx loom-spec view` from project root.
2. CLI finds the nearest `.loom/`, starts Hono + chokidar.
3. Browser loads, fetches `/api/diagrams/overview` + `/api/node-types`, opens `EventSource('/api/events')`.
4. User clicks **+ Add**, drags, edits inspector. Every change debounces (500ms) and PUTs to the server. Server validates against the schema; only valid payloads land on disk.

### Agent edits the diagram via MCP

1. Agent calls `loom_read_diagram("overview")`.
2. Agent calls `loom_add_node({ diagram: "overview", type: "service", label: "Payments", status: "planned" })`. Server validates, writes deterministic JSON.
3. chokidar fires; it's not a self-write. SSE event fires.
4. UI's EventSource receives, refetches, the new node appears live.

### User publishes architecture docs

1. Tag the public-facing nodes: `loom_update_node({ ..., patch: { tags: ["public"] } })`.
2. Optionally write `.loom/exports.json` with a named bundle.
3. `loom-spec export-html user-manual --out docs/architecture.html`.
4. Filter cascade drops orphaned edges, empty groups, dangling drill-downs, timeline events on dropped nodes.
5. Standalone HTML drops into a docs site, wiki, GitHub Pages, or email attachment. Works offline.

### User imports a real trace

1. `loom-spec import-trace ./traces/checkout.json --as observed-checkout --diagram overview`.
2. OTLP JSON → timeline; span/service heuristic maps to nodes; causation preserved via `triggered_by`.
3. New `.timeline.json` appears in `.loom/timelines/`; opens in the editor like any hand-authored timeline.

### Drift handling

- Agents are instructed (per SKILL.md) to mark nodes `status: stale` instead of deleting when code disappears.
- `loom-spec validate` (or `loom_validate` MCP tool) walks every `code_refs` (also on timeline events now) and reports missing files / symbols / out-of-range line refs. Skips `planned` and `deprecated` nodes since their code may legitimately not exist.

## What's verified

End-to-end checks that currently pass (via `pnpm --filter loom-spec typecheck` plus three smoke tests in `packages/loom-spec/scripts/`):

- Schemas validate the example fixtures.
- TypeScript types autogenerate and the entire codebase typechecks cleanly.
- **MCP timeline tools**: 14 checks (stdio round-trip via SDK Client; list/read/add/update/delete; node-existence cross-check rejects bad ids; byte-for-byte cleanup).
- **Import-trace**: 12 checks (3-span OTLP trace against todo-app fixture; node mapping; causation; schema-validity; cleanup).
- **Export-html**: 28 checks (full / `--no-timelines` / `--diagram` / `--include-tag` cascade / `--exclude-tag` / named bundle from `.loom/exports.json` / unknown-bundle error).
- Production build path: `node dist/cli/index.js view` serves SPA + API on one port without Vite. Plus `dist/view-export/` (single chunk) for the standalone HTML embed.
- npm-installed flow via the published `loom-spec@0.4.0`.

## What is not yet verified

- Behaviour of very large diagrams or timelines (hundreds of nodes / events).
- Adoption by anyone other than the author + one in-progress real-world project.
- OTLP shapes beyond what the smoke fixture covers (e.g. spans with `links`, `events`, `status`; very deep trace trees; very long span names).
- Jaeger / Zipkin / OTLP-protobuf trace formats (#27 in backlog).
- Bundle-size win from a pure-SVG mini-renderer (#26 in backlog).
