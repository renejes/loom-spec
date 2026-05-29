# loom-spec — Project Status

## Goal

`loom-spec` is a lightweight tool that keeps a **node-based architectural spec** alongside the code of a project, inside the repo itself. It is designed to be edited by both humans (through a browser-based node editor) and AI coding agents (directly via JSON files or MCP tool calls).

The core idea: instead of describing app structure in prose, in stale diagrams, or letting it live only in the model weights of a coding agent, keep it as a **structured, machine-readable, git-diffable** set of nodes and edges. Humans see and edit it visually; agents read it before implementing and update it as code changes.

It is **a spec layer, not an execution layer**. The nodes don't run — they describe.

## Where it lives

- **`.loom/`** in the user's repo holds the data — diagram files, node-type definitions, optional `exports.json` for named HTML-export bundles, README.
- **`.claude/skills/loom-spec/SKILL.md`** in the user's repo tells coding agents (Claude Code et al.) when and how to maintain the spec.
- **`.mcp.json`** in the user's repo registers the loom-spec MCP server (auto-written by `loom-spec init --mcp` or `loom-spec install-mcp`).
- **`loom-spec`** npm package provides the browser viewer/editor (`loom-spec view`), drift validator (`loom-spec validate`), MCP server (`loom-spec mcp`), HTML exporter (`loom-spec export-html`), and the scaffolder (`loom-spec init`). Nothing of the package itself is committed to the user's repo.

## Current state

**v0.9.0 published on npm** ([npmjs.com/package/loom-spec](https://www.npmjs.com/package/loom-spec)). Real-world use confirmed (the author's day-to-day project + a JUCE audio plugin).

v0.9.0 adds **JUCE / audio support** ([Phase 10](./done/phase-10-juce-rt-safety.md)): a **real-time-safety lint** that scans `realtime`-marked C++ function bodies for audio-thread hazards (heap allocation, blocking locks, juce::String, logging, file I/O) — function-body-scoped so a lock in a sibling GUI method doesn't false-positive; a **C++ signature extractor** (signature drift now works on `.cpp/.h`); **signal-typed edge coloring** (audio/midi/cv visually distinct); and **edge wiring validation** (port existence + signal compatibility). The real channelstrip plugin was bootstrapped with a `.loom/` and validates clean.

v0.8.1 was a bug-fix release ([Phase 9](./done/phase-9-publish-fix.md)) — v0.8.0 shipped with a stale `dist/`, so the Phase 7+8 modules weren't in the published tarball. Added a `prepublishOnly` hook + `check-dist` verifier so no future publish ships a stale build.

v0.8.0 adds two related features:

- **Signature-drift detection** ([Phase 7](./done/phase-7-signature-drift.md)) — closes the gap that motivated the feature in the first place: a code_ref's symbol can still exist while its actual contract changed materially. `code_refs[].signature_hint` captures the canonical declaration line (`def parse_pdf(file_path: str) -> dict:`); on subsequent `loom-spec validate`, the current source is re-extracted and compared. Mismatch = warning. Coverage: Python, TypeScript/JSX, Rust, Svelte. `--capture` and `--recapture` flags manage the baseline. Validate also now walks journey step refs (which the v0.6.0 docs claimed but didn't actually do).
- **Edge property vocabulary** ([Phase 8](./done/phase-8-edge-vocabulary.md)) — optional `edge_types` in `node-types.json` lets a project declare typed property vocabularies per edge kind. `validate` warns on undeclared keys, wrong types, invalid enums. Solves "I forgot if I called it sync or synchronous three months ago" — the internal-consistency half of drift detection.

v0.7.0 was a **quality-of-life round** ([Phase 6](./done/phase-6-quality-of-life.md)) driven by real-world feedback. Auto-layout finds a non-overlapping spot for new nodes (no more guessing `{x, y}`). Edges get a free-form `properties` field for project-specific architectural attributes (sync/async, retry policy, etc.). A new `loom_update_edge` MCP tool rounds out the diagram CRUD. SKILL.md gets a Granularity-patterns section. The `.loom/README.md` template is rewritten for cold-reader onboarding.

v0.6.0 added **Journeys** — a new file kind for ordered, untimed walkthroughs of the architecture. Pick a journey from the switcher and the viewer narrows to its steps: current node glows, prior steps subtly highlighted, non-journey nodes dimmed to ~28% opacity. Same source compiles into an HTML export via `--from-journey <id>` that opens directly at the walkthrough. The 8 MCP tools (`loom_create_journey`, `loom_add_step`, etc.) make it the natural AI-author surface; the in-browser editor for journeys is deliberately deferred until a concrete pain point shows up.

v0.5.0 before that was a **deliberate scope-down**. The timeline view (built across v0.2.0–v0.3.0 as a DAW-style architecture playback) was removed because the only confirmed user didn't use it. Same for `loom-spec import-trace` (OTel JSON → timeline) and the 5 timeline-related MCP tools. The conceptual surface dropped by ~30%, the export bundle shrank, and the product story sharpened to "agent-readable architecture spec exportable as interactive HTML, with guided walkthroughs of common workflows" — Journeys filled the walkthrough half in v0.6.0.

For per-version detail of what shipped when, see [`done/`](./done/):

- [Phase 1 — Foundation](./done/phase-1-foundation.md) (v0.1.0 → v0.1.1)
- [Phase 2 — Timeline view](./done/phase-2-timeline.md) (v0.2.0 → v0.3.0) — **removed in v0.5.0; preserved here as history**
- [Phase 3 — Interactive HTML export](./done/phase-3-export.md) (v0.4.0)
- [Phase 4 — Timeline removal](./done/phase-4-timeline-removal.md) (v0.5.0)
- [Phase 5 — Journeys](./done/phase-5-journeys.md) (v0.6.0)
- [Phase 6 — Quality-of-life round](./done/phase-6-quality-of-life.md) (v0.7.0)
- [Phase 7 — Signature-drift detection](./done/phase-7-signature-drift.md) (v0.8.0)
- [Phase 8 — Edge property vocabulary](./done/phase-8-edge-vocabulary.md) (v0.8.0)
- [Phase 9 — Publish hygiene fix](./done/phase-9-publish-fix.md) (v0.8.1)
- [Phase 10 — JUCE / audio: RT-safety, C++ signatures, signal flow](./done/phase-10-juce-rt-safety.md) (v0.9.0)

## Capabilities at a glance

| Layer | What works as of v0.9.0 |
|---|---|
| Data | 3 schema-validated file kinds (diagrams, node-types, journeys) + optional `.loom/exports.json` for named bundles. Edges carry an optional free-form `properties` object — optionally constrained by `edge_types` declarations in `node-types.json` (typed vocabulary, validate warns on undeclared keys / wrong types / bad enums). Code-refs carry an optional `signature_hint` (filled by `validate --capture`) for drift detection. |
| CLI | `init [--mcp]`, `install-mcp`, `view`, `validate [--capture | --recapture]`, `mcp`, `export-html` (with `--from-journey`). |
| MCP server | 19 tools — 11 for diagrams + 8 for journeys. All mutations schema-validated and (for journeys) cross-checked against the referenced diagram before write. `loom_add_node` auto-places when no position is provided. `loom_validate` accepts `capture: "capture" | "recapture" | "none"` to manage signature_hint baselines. |
| Browser editor | xyflow-based diagram canvas with light/dark theme, drag, debounced auto-save, code-refs editing, tags chips, ports, inline validation, drill-down between diagrams, group frames, parallel-edge offsets. +Add auto-places the new node next to existing ones. Switcher includes a Journeys section. |
| Journey viewer | Read-only step navigator (prev/next, keyboard ←/→/Home/End), current node glows, prior steps subtly highlighted, non-journey nodes dimmed to ~28% opacity, edge between consecutive steps pulses, collapsible step sidebar with code-refs. |
| Live sync | chokidar watcher with self-write suppression; SSE for both diagram and journey changes; UI refetches on external edits. |
| Agent skill | `.claude/skills/loom-spec/` — a ~160-line core `SKILL.md` (quick-start, core rules, granularity, tool list, navigation) plus `reference/` files loaded on demand (examples, validation, audio-dsp, exports, journeys). Follows Anthropic's progressive-disclosure best practice (core under the 500-line guideline; domain detail one level deep). `loom-spec init` copies the whole tree recursively. |
| Drift detection | `loom-spec validate` walks all `code_refs[]` on nodes *and* journey steps. Checks: existence (file + symbol + line range), signature drift (Python/TS/JSX/Rust/Svelte/C++), edge property vocabulary (if `edge_types` declared), real-time safety (C/C++ `realtime` refs — heap/lock/string/logging/IO in the audio thread), and edge wiring (port existence + signal compatibility). Exits non-zero on schema errors, broken refs, signature drift, edge-property issues, rt-unsafe findings, and wiring errors. |
| Audio / DSP | Typed ports (`signal: audio/midi/cv`), signal-typed edge coloring in the viewer, `realtime` code_refs for RT-safety lint. See [`audio-dsp.md`](./audio-dsp.md). |
| Export | Standalone interactive HTML; tag-based filter with cascade rules (drop edges to dropped nodes, shrink groups, clear drill-downs); named bundles via `.loom/exports.json`; `--diagram <id>` for single-diagram exports; `--include-tag` / `--exclude-tag`; `--from-journey <id>` for focused walkthrough exports with `defaultView` hint. |

## Architecture

### Data model

The single source of truth is JSON files in `.loom/`. Three file kinds (plus optional config):

- **`.loom/node-types.json`** — declares the available node-type vocabulary for the project. Each type has color, icon, fields (typed: string/number/boolean/enum/markdown/code-ref/array), and optional named ports (in/out).
- **`.loom/diagrams/*.flow.json`** — one diagram per file. `{ nodes, edges, groups }`. Nodes have `id`, `type`, `label`, `position`, `status` (planned/implemented/stale/deprecated), `code_refs` (path + symbol), `properties` (typed by the node's type), `tags`, optional `drill_down`. Edges have `from`, `to` (optionally with `:port` suffix), `kind` (request/event/data-read/data-write/signal/dependency/control), `label`, `direction`. Groups nest (via `subgroups`) and can `drill_down` like nodes.
- **`.loom/journeys/*.journey.json`** — one journey per file. `{ id, title, diagram, steps[] }`. Each step references a node in the journey's diagram and carries optional title / description / code_refs. Steps are ordered; the runtime cross-checks every `step.node` exists in the referenced diagram before writing.
- **`.loom/exports.json`** (optional) — named export bundles. `{ exports: { "<name>": { "include-tags"?, "exclude-tags"?, diagram?, "from-journey"?, out? } } }`.

Schemas live at `packages/loom-spec/schema/{diagram,node-types,journey}.schema.json`. TypeScript types are autogenerated via `json-schema-to-typescript`, so the runtime validator (ajv 2020) and compile-time types stay aligned.

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
│       └── journeys/
│           └── complete-a-todo.journey.json
└── packages/loom-spec/                         # The npm package
    ├── schema/{diagram,node-types,journey}.schema.json
    ├── templates/                              # Scaffolded by `loom-spec init`
    │   ├── .loom/{README,node-types.json,diagrams/overview.flow.json}
    │   └── .claude/skills/loom-spec/SKILL.md
    ├── scripts/{generate-types,validate-examples,smoke-export-html,smoke-mcp-journeys}.ts
    └── src/
        ├── cli/{index,init,view,validate,mcp,installMcp,exportHtml,mcpConfig}.ts
        ├── server/{app,findLoomRoot,fileOps,watch,drift,exportFilter,exportConfig,journeyCheck}.ts
        ├── mcp/server.ts                       # MCP stdio server (18 tools)
        ├── view/                               # Vite-built React + xyflow SPA
        │   ├── App.tsx                         # router → DiagramView | JourneyView
        │   ├── exportMode.ts                   # runtime detector for standalone-HTML mode
        │   ├── components/
        │   │   ├── DiagramView.tsx, JourneyView.tsx
        │   │   ├── DiagramCanvas.tsx, NodeCard.tsx, GroupNode.tsx, ParallelEdge.tsx, PulseEdge.tsx
        │   │   ├── Inspector.tsx, AddNodeMenu.tsx
        │   │   ├── TopBar.tsx, DiagramSwitcher.tsx
        │   ├── state.ts, useJourneyState.ts
        │   ├── useViewState.ts                 # URL-hash routing: #diagram:x | #journey:x
        │   ├── useDiagramsList.ts, useJourneysList.ts
        │   ├── validate-client.ts              # inline schema validation
        │   ├── loadDiagram.ts, loadJourney.ts  # client API wrappers
        │   ├── groupLayout.ts                  # bbox math for nested groups
        │   ├── vite.config.ts                  # live editor build
        │   └── vite.config.export.ts           # single-chunk build for HTML embed
        ├── types/                              # autogenerated from schema
        └── validate.ts                         # ajv 2020, server-side
```

`PulseEdge.tsx` was kept across the v0.5.0 timeline scope-down specifically for this — Journey step transitions reuse the same SVG-animated marker that the timeline mini-graph originally introduced.

### Two view modes, two render contexts

- `App.tsx` is a thin router. It reads `useViewState()` (which parses `location.hash` like `#diagram:overview` or `#journey:complete-a-todo`) and dispatches on `view.kind` → `DiagramView` | `JourneyView`. When the hash is empty and the page was built by `--from-journey`, an inlined `defaultView` hint lands the reader directly in the walkthrough.
- Both views use xyflow (`@xyflow/react`) for the canvas. `DiagramView` is the interactive editor; `JourneyView` uses the same canvas in non-interactive mode with `activeNodeIds` + `visitedNodeIds` + `dimmedNodeIds` + `pulsingEdgeIds`.
- **Export mode** is the same source compiled with a different rollup config (`vite.config.export.ts`, single-chunk) plus runtime detection (`exportMode.ts`). When `window.__LOOM_DATA__` is present, loaders short-circuit, SSE is skipped, edits are silently dropped, edit UI is hidden.

### MCP server

`loom-spec mcp` boots a stdio MCP server (using `@modelcontextprotocol/sdk`) that exposes 18 tools: 10 for diagrams (list/read/add-node/update-node/mark-stale/delete-node/add-edge/delete-edge/validate/read-node-types) and 8 for journeys (list/read/create/add-step/update-step/delete-step/reorder-steps/delete). Each mutation re-reads, applies the patch, validates against the schema, and writes — so invalid edits never corrupt the file. Journey mutations additionally cross-check that the referenced diagram exists and every `step.node` resolves to a node in it.

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
4. Filter cascade drops orphaned edges, empty groups, dangling drill-downs.
5. Standalone HTML drops into a docs site, wiki, GitHub Pages, or email attachment. Works offline.

### Agent authors a workflow walkthrough

1. Agent calls `loom_create_journey({ id: "checkout", title: "Customer Checkout", diagram: "overview" })`.
2. Agent calls `loom_add_step` for each step in order, with `title`, `description`, and (often) a narrower `code_refs` than the underlying node.
3. Optionally writes a `from-journey` bundle to `.loom/exports.json`.
4. `loom-spec export-html checkout-tour --out docs/checkout.html` — produces a focused walkthrough HTML that opens at `#journey:checkout` by default.

### Drift handling

- Agents are instructed (per SKILL.md) to mark nodes `status: stale` instead of deleting when code disappears.
- `loom-spec validate` (or `loom_validate` MCP tool) walks every `code_refs` on nodes *and* on journey steps, and reports missing files / symbols / out-of-range line refs. Skips `planned` and `deprecated` nodes since their code may legitimately not exist.

## What's verified

End-to-end checks that currently pass (via `pnpm --filter loom-spec typecheck` plus the smoke tests in `packages/loom-spec/scripts/`):

- Schemas validate the example fixtures (incl. the journey + its referential check).
- TypeScript types autogenerate and the entire codebase typechecks cleanly.
- **Export-html smoke** (`scripts/smoke-export-html.ts`, 35 assertions) — full export / `--diagram` / `--include-tag` cascade / `--exclude-tag` / `--from-journey` (single-diagram narrowing, journey embedding, defaultView, step pruning under tag conflict) / named bundles for both tag and journey scopes / unknown-bundle and unknown-journey errors.
- **MCP-journeys smoke** (`scripts/smoke-mcp-journeys.ts`, 29 assertions) — spawns `loom-spec mcp` against a tmpfs copy of the fixture and exercises all 8 journey tools over stdio, with at least one negative path per tool. Byte-for-byte cleanup leaves the original fixture untouched.
- **MCP-diagrams smoke** (`scripts/smoke-mcp-diagrams.ts`, 13 assertions) — covers the v0.7.0 additions: auto-layout placement, edge `properties` round-trip, `loom_update_edge` patch semantics.
- **Signatures smoke** (`scripts/smoke-signatures.ts`, 30 assertions) — 16 extractor unit checks (Python/TS/Rust/Svelte canonical shapes incl. generics, lifetimes, async, modifiers, multi-line) + 14 end-to-end (write source in 4 languages, capture hints, mutate a signature, detect drift, recapture acknowledges new baseline).
- **Edge-vocab smoke** (`scripts/smoke-edge-vocab.ts`, 11 assertions) — unit checks for each failure mode (unknown key / wrong type / bad enum / out-of-range / required-missing) plus end-to-end via `runDriftCheck`.
- **RT-safety smoke** (`scripts/smoke-rt-safety.ts`, 20 assertions) — C++ extractor units + scanRtSafety (clean whitelist pass, every dirty pattern, comment/string masking) + e2e (clean vs dirty process, sibling GUI method not scanned).
- **Port-wiring smoke** (`scripts/smoke-port-wiring.ts`, 8 assertions) — unknown node/port, signal mismatch warning, clean audio chain, e2e counters.
- Production build path: `node dist/cli/index.js view` serves SPA + API on one port without Vite. Plus `dist/view-export/` (single chunk) for the standalone HTML embed.
- npm-installed flow via the published `loom-spec@0.9.0`.
- Real-world JUCE validation: the channelstrip plugin's `.loom/` validates clean (RT-safety + wiring) against actual C++ DSP code.
- `prepublishOnly` + `check-dist` script guarantee that future publishes can't ship a stale `dist/`.
- Real-world use: the author's day-to-day project uses the diagram editor + MCP tools + drift validation + HTML export.

## What is not yet verified

- Behaviour of very large diagrams (hundreds of nodes), or journeys with many steps.
- Adoption by anyone other than the author + one in-progress real-world project.
- Bundle-size win from a pure-SVG mini-renderer (#26 in backlog) — particularly valuable for the Journey view's read-only canvas.
- Whether the in-browser Journey editor is missed enough to build — currently editing goes through MCP only.
