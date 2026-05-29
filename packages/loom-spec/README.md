# loom-spec

> A node-based architecture spec that lives in your repo. AI-readable, AI-writable, git-diffable.

`loom-spec` keeps a structured visual spec of your application's architecture **inside your repo**, designed to be edited by both humans (in a browser-based node editor) and AI coding agents (directly via JSON files or MCP tool calls).

It's a spec layer, not an execution layer. The nodes describe; they don't run.

## Why

- **Architecture drift.** Mermaid diagrams in `docs/` go stale the moment you refactor.
- **Agents losing the forest for the trees.** An agent grepping through `src/` doesn't see the system. Every session rebuilds the mental model from scratch.
- **The mental-model gap.** People who think in signal flow but don't read code well get cut out.

`loom-spec` is one canonical, machine-readable file-set under `.loom/` that says what exists and how it connects. Humans edit it visually. The agent reads it before implementing and updates it when code changes. `code_refs` anchor each node to actual source, so [`loom-spec validate`](#commands) catches drift instead of letting it accumulate.

## Highlights

- **Browser editor** with live sync, custom node types, group frames, drill-down sub-diagrams.
- **MCP server** — 19 semantic tools for agents (diagrams + journeys), all schema-validated before write.
- **Drift detection** — code-ref existence, **signature drift** (Python / TypeScript / Rust / Svelte / C++), and **edge wiring** checks.
- **Real-time-safety lint** for audio plugins (JUCE / C++) — see [Audio / DSP](#audio--dsp-real-time-safety).
- **Journeys** — ordered guided walkthroughs of an architecture; see [Journeys](#journeys).
- **Standalone HTML export** — one self-contained interactive file, tag-filtered, with `--from-journey` tour mode.

## Install + first run

```bash
cd your-project
npx loom-spec init --mcp        # scaffolds .loom/, the agent skill, and .mcp.json
npx loom-spec view              # opens the editor on http://localhost:7777
```

`--mcp` is optional but recommended — it auto-registers the MCP server for Claude Code (and other MCP-capable agents). Skip it if you want to wire that up manually later via `npx loom-spec install-mcp`.

If you prefer it as a dev dependency:

```bash
npm install --save-dev loom-spec
```

```json
{
  "scripts": {
    "loom": "loom-spec view",
    "loom:check": "loom-spec validate"
  }
}
```

## A typical workflow

1. **Sketch the high-level architecture once.** Open `loom-spec view`, click **+ Add** to drop services, data stores, and UI components onto the canvas. Connect them with edges. Mark nodes as `planned` if you haven't built them yet, `implemented` once the code exists.
2. **Let the agent grow it.** With Claude Code (or any MCP-capable agent) in the same repo, tell it what to build: *"add a payments service that the checkout flow calls"*. The agent calls `loom_add_node` and `loom_add_edge`, then writes the actual code. Your open editor updates live via SSE.
3. **Anchor nodes to code.** When a feature is done, the agent (or you) adds `code_refs`: `{ "path": "src/server/payments.ts", "symbol": "chargeCard" }`. This is what makes drift detection work.
4. **Catch drift in CI.** Add `loom-spec validate` as a pre-commit hook or CI step. It exits non-zero if any `code_refs` point at missing files or unresolved symbols.
5. **Stale, don't delete.** When the underlying code goes away, the agent marks the node `status: stale` instead of deleting it. Humans review staleness — the architectural history stays.

## What lives in your repo

```
.loom/
├── README.md                Why this directory exists; for humans.
├── node-types.json          The vocabulary: ui, service, data, event, external (plus your customs).
└── diagrams/
    └── overview.flow.json   { nodes, edges, groups }

.loom/journeys/              (optional) ordered walkthroughs of a diagram
.loom/exports.json           (optional) named HTML-export bundles

.claude/
└── skills/
    └── loom-spec/
        ├── SKILL.md         Core: when/how to maintain the spec (Agent Skills standard).
        └── reference/       Loaded on demand: examples, validation, audio-dsp,
                             exports, journeys.

.mcp.json                    Registers the MCP server, if you ran init --mcp.
```

Nothing of the `loom-spec` package itself is committed — the npm install lives in `node_modules/`. Only the spec and the skill are tracked.

## Commands

### `loom-spec init [--path <dir>] [--force]`

Scaffolds the spec directory and the agent skill in the target project (defaults to current working directory).

Writes:

- `.loom/README.md` — explains the directory to humans
- `.loom/node-types.json` — five default types (`ui`, `service`, `data`, `event`, `external`)
- `.loom/diagrams/overview.flow.json` — empty starter diagram
- `.claude/skills/loom-spec/SKILL.md` — tells Claude Code (and any tool following the Agent Skills standard) when and how to maintain the spec

Refuses to overwrite an existing `.loom/` unless `--force`.

Add `--mcp` to also register the MCP server in `.mcp.json` (idempotent merge — existing entries are preserved). Or run `npx loom-spec install-mcp` to register it after the fact.

### `loom-spec view [--root <dir>] [--port <n>]`

Starts a local browser editor. Walks up from `--root` (default: cwd) to find the nearest `.loom/`. Opens on port 7777 by default.

In the editor you can:

- Drag nodes; edits debounce and write to disk within ~500ms
- Click a node or edge to inspect and edit fields, code refs, tags, type-specific properties
- Drag from a node's right handle to another node to create an edge
- Use the **+ Add** menu in the top bar to add a new node by type
- Use the diagram switcher (top-left dropdown) to navigate between diagrams or create new ones
- Use the "Drill into" chevron on any node or group with `drill_down` set to jump to a sub-diagram
- Toggle light/dark theme; preference is persisted

External edits to the JSON files (e.g. by an AI agent) propagate to the open UI live via Server-Sent Events — no reload needed.

### `loom-spec validate [--root <dir>] [--json] [--capture | --recapture]`

Checks every diagram **and journey** for schema validity plus drift. Skips nodes marked `planned` or `deprecated` (their code may legitimately not exist). Exit code is non-zero on errors — useful as a CI step or pre-commit hook. Checks:

- **Code-ref existence** — missing files, missing symbols, out-of-range line ranges.
- **Signature drift** — compares a captured `signature_hint` against the current source; flags when a function's contract changed even though the symbol still exists. Languages: Python, TypeScript (incl. JSX/JS), Rust, Svelte, C/C++. Others skip silently.
- **Real-time safety** — for `code_refs` marked `realtime: true` (C/C++); see [Audio / DSP](#audio--dsp-real-time-safety).
- **Edge wiring** — endpoint nodes exist, `node:port` references a declared port, signal types are compatible.
- **Edge-property vocabulary** — if `edge_types` is declared in `node-types.json`.

```bash
loom-spec validate
# ✗ overview.flow.json — Todo App
#   5 nodes, 5 edges, 3 code refs checked
#   ✗ todo-api → src/server/routes/todos.ts#todoRouter: symbol 'todoRouter' not found
```

`--capture` fills missing `signature_hint`s from current source (writes back to JSON); run once after adding code_refs so future drift is detectable. `--recapture` overwrites all hints — the "current state is the new baseline" gesture after an intentional refactor. Don't run capture in CI (it masks drift); use read-only `validate` there.

### `loom-spec mcp [--root <dir>]`

Starts a **Model Context Protocol** server on stdio. Wire it into Claude Code (or any MCP-capable agent) via the host's `mcp.json`:

```json
{
  "mcpServers": {
    "loom-spec": {
      "command": "npx",
      "args": ["-y", "loom-spec", "mcp"]
    }
  }
}
```

If you'd rather not hand-edit, `npx loom-spec install-mcp` writes this entry into `.mcp.json` for you (merging with any existing servers, idempotent).

The server exposes 19 semantic tools that validate against the schema before writing, more token-efficient than re-reading and re-writing the JSON on every change:

Diagrams:
- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types`
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_update_edge`, `loom_delete_edge`
- `loom_validate` (same drift + RT-safety + wiring check as the CLI; pass `{ capture: "capture" | "recapture" }` to manage signature baselines)

Journeys:
- `loom_list_journeys`, `loom_read_journey`
- `loom_create_journey`, `loom_add_step`, `loom_update_step`, `loom_delete_step`, `loom_reorder_steps`, `loom_delete_journey` (all cross-check that referenced nodes exist before writing)

### `loom-spec export-html [<bundle>] [--out <path>] [--diagram <id>] [--include-tag <list>] [--exclude-tag <list>] [--from-journey <id>] [--root <dir>]`

Builds a single self-contained interactive HTML file — the same viewer as `loom-spec view`, minus the server (no editing, no live sync). Pan/zoom, drill-down, switch diagrams, walk journeys; works offline. Drop it into a docs site, wiki, GitHub Pages, or email attachment.

```bash
loom-spec export-html                                  # everything
loom-spec export-html --include-tag public --out docs/architecture.html
loom-spec export-html --from-journey checkout --out docs/tour.html   # opens at the journey
loom-spec export-html user-manual                      # a named bundle from .loom/exports.json
```

Tag filters cascade (drop edges to dropped nodes, shrink groups, clear dangling drill-downs). `--from-journey` scopes to one journey's nodes and opens the HTML at that walkthrough by default.

### `loom-spec install-mcp [--path <dir>]`

Writes the MCP-server entry into `.mcp.json` without touching anything else. Idempotent (safe to run repeatedly) and non-destructive (other MCP servers and unrelated top-level keys are preserved).

## File format

### `.loom/node-types.json`

Defines the available types for nodes in this project. Each type has a label, color, lucide icon name, optional typed fields (string / number / boolean / enum / markdown / code-ref / array), and optional named ports for typed connections.

```json
{
  "types": {
    "service": {
      "label": "Service",
      "color": "#34d399",
      "icon": "server",
      "fields": [
        { "name": "language", "type": "string" },
        { "name": "runtime", "type": "string" }
      ]
    }
  }
}
```

### `.loom/diagrams/*.flow.json`

Each diagram is `{ nodes, edges, groups }`. Nodes:

```json
{
  "id": "todo-api",
  "type": "service",
  "label": "Todo API",
  "description": "REST endpoints for todos.",
  "position": { "x": 400, "y": 160 },
  "status": "implemented",
  "code_refs": [
    { "path": "src/server/routes/todos.ts", "symbol": "todoRouter" }
  ],
  "properties": { "language": "typescript", "runtime": "node" },
  "tags": ["public"]
}
```

Edges:

```json
{
  "id": "e1",
  "from": "todo-list-view",
  "to": "todo-api",
  "kind": "request",
  "label": "fetch / mutate"
}
```

Status enum: `planned`, `implemented`, `stale`, `deprecated`.
Edge kinds: `request`, `event`, `data-read`, `data-write`, `signal`, `dependency`, `control`.

Full JSON Schemas ship with the package — see `schema/diagram.schema.json` and `schema/node-types.schema.json`.

### Adding custom node types

`node-types.json` is yours to edit. Add a type for whatever domain you're modelling. A worker with typed ports:

```json
{
  "types": {
    "worker": {
      "label": "Worker",
      "color": "#fb923c",
      "icon": "server",
      "fields": [
        { "name": "queue", "type": "string", "required": true },
        { "name": "concurrency", "type": "number" }
      ],
      "ports": {
        "in":  [{ "name": "jobs", "signal": "data" }],
        "out": [{ "name": "results", "signal": "data" }, { "name": "errors", "signal": "data" }]
      }
    }
  }
}
```

Once that's saved, the **+ Add** menu shows "Worker"; new worker nodes render with three labeled handles instead of one generic one. Edges can target a specific port via `from: "worker-1:results"`.

### Drill-down between diagrams

For LangGraph-style multi-step agents or anything with non-trivial internal flow: one node in the overview, plus a sub-diagram with the steps inside.

```json
// overview.flow.json
{
  "id": "agent",
  "type": "service",
  "label": "Agent",
  "drill_down": "agent-internals",
  "code_refs": [{ "path": "agent.py" }]
}
```

```json
// agent-internals.flow.json
{
  "nodes": [
    { "id": "decide", "type": "service", "label": "decide_next_step",
      "code_refs": [{ "path": "agent.py", "symbol": "decide_next_step" }] },
    { "id": "call-tool", "type": "service", "label": "call_tool",
      "code_refs": [{ "path": "agent.py", "symbol": "call_tool" }] },
    { "id": "format", "type": "service", "label": "format_response",
      "code_refs": [{ "path": "agent.py", "symbol": "format_response" }] }
  ],
  "edges": [
    { "id": "e1", "from": "decide", "to": "call-tool", "kind": "control", "label": "if tool needed" },
    { "id": "e2", "from": "call-tool", "to": "format", "kind": "control" },
    { "id": "e3", "from": "decide", "to": "format", "kind": "control", "label": "if final" }
  ]
}
```

Click the chevron on the overview's `agent` node to navigate in.

## Journeys

A **Journey** (`.loom/journeys/<id>.journey.json`) is an ordered list of steps, each tied to a node in a diagram — for documenting "how a request flows", an onboarding tour, or a deploy runbook. The viewer renders it as a step-navigator (prev/next; current node glows, prior steps dim-highlight, non-journey nodes fade) so the reader sees one step at a time instead of the whole graph.

```json
{
  "version": "1", "id": "checkout", "title": "Customer Checkout",
  "diagram": "overview",
  "steps": [
    { "id": "click-pay", "node": "checkout-page", "title": "User clicks Pay",
      "code_refs": [{ "path": "src/views/Checkout.tsx", "symbol": "handlePay" }] },
    { "id": "charge", "node": "payments", "title": "Stripe charge" }
  ]
}
```

Author them with the MCP tools (`loom_create_journey`, `loom_add_step`, …) — each step's `node` is cross-checked against the diagram before writing. Export a focused walkthrough with `loom-spec export-html --from-journey checkout`. Journeys are *ordered* (sequence matters); use **tags** when you only want to mark a *set* of nodes.

## Audio / DSP (real-time safety)

For audio plugins (JUCE / C++) and other real-time systems, loom-spec models signal flow with **typed ports** and catches **real-time-safety** bugs — the #1 cause of audio dropouts.

Declare ports with a `signal` type, then wire `node:port` edges. The viewer colors edges by signal (audio / midi / cv), and `validate` checks port existence and signal compatibility:

```json
"dsp": {
  "label": "DSP Module", "color": "#34d399", "icon": "sliders",
  "ports": {
    "in":  [{ "name": "in", "signal": "audio" }],
    "out": [{ "name": "out", "signal": "audio" }]
  }
}
```

Mark a `code_ref` that runs on the audio thread with `realtime: true`:

```json
{ "id": "eq", "type": "dsp", "label": "EQ",
  "code_refs": [
    { "path": "Source/DSP/EQProcessor.cpp", "symbol": "EQProcessor::process", "realtime": true }
  ] }
```

`loom-spec validate` extracts that function's **body** (C/C++) and flags audio-thread hazards: heap allocation (`new`/`.resize`/`.push_back`/`std::vector`…), blocking locks (`ScopedLock`/`.lock()`), `juce::String`, logging (`DBG`/`std::cout`), file I/O. It whitelists the correct patterns — atomics, `SmoothedValue`, `ScopedNoDenormals`, non-blocking try-locks. Because the scan is **function-body-scoped**, a blocking lock in a sibling GUI method (not marked `realtime`) is correctly ignored.

## How AI agents use it

`loom-spec init` writes a `SKILL.md` (plus a `reference/` directory) to `.claude/skills/loom-spec/` following the [Agent Skills open standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). Claude Code (and other tools that adopt the convention) auto-discovers it. The core `SKILL.md` stays lean (progressive disclosure); domain detail — worked examples, validation, audio-dsp, exports, journeys — lives in `reference/` files the agent reads only when relevant.

The skill tells the agent to:

1. Read the relevant diagram before implementing.
2. Add new components as `status: planned`, flip to `implemented` after the code lands.
3. Always populate `code_refs` — prefer `symbol` over `lines` because symbols survive refactors.
4. On code deletion, set `status: stale` rather than removing the node — humans review.
5. Don't invent node types — extend `node-types.json` first.

You can extend the skill with project-specific rules; it's committed in your repo.

## Tech

- TypeScript end-to-end
- [Hono](https://hono.dev/) server (Node), serves the SPA and the REST/SSE API on a single port
- [React Flow / xyflow](https://reactflow.dev/) for the canvas
- [Vite](https://vitejs.dev/) for the SPA build
- [Ajv](https://ajv.js.org/) for runtime schema validation
- [Chokidar](https://github.com/paulmillr/chokidar) for filesystem watching

## License

MIT
