# loom-spec

> A node-based architecture spec that lives in your repo. AI-readable, AI-writable, git-diffable.

`loom-spec` keeps a structured visual spec of your application's architecture **inside your repo**, designed to be edited by both humans (in a browser-based node editor) and AI coding agents (directly via JSON files or MCP tool calls).

It's a spec layer, not an execution layer. The nodes describe; they don't run.

## Why

- **Architecture drift.** Mermaid diagrams in `docs/` go stale the moment you refactor.
- **Agents losing the forest for the trees.** An agent grepping through `src/` doesn't see the system. Every session rebuilds the mental model from scratch.
- **The mental-model gap.** People who think in signal flow but don't read code well get cut out.

`loom-spec` is one canonical, machine-readable file-set under `.loom/` that says what exists and how it connects. Humans edit it visually. The agent reads it before implementing and updates it when code changes. `code_refs` anchor each node to actual source, so [`loom-spec validate`](#loom-spec-validate---root-dir---json) catches drift instead of letting it accumulate.

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

.claude/
└── skills/
    └── loom-spec/
        └── SKILL.md         Tells Claude Code (or any Agent-Skills-aware tool)
                             when and how to maintain the spec, with five
                             worked examples.

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

### `loom-spec validate [--root <dir>] [--json]`

Checks every diagram for schema validity plus **code-ref drift**: missing files, missing symbols, out-of-range line ranges. Skips nodes marked `planned` or `deprecated` (their code may legitimately not exist). Exit code is non-zero if any issue is found — useful as a CI step or pre-commit hook.

```bash
loom-spec validate
# ✗ overview.flow.json — Todo App
#   5 nodes, 5 edges, 3 code refs checked
#   ✗ todo-api → src/server/routes/todos.ts#todoRouter: symbol 'todoRouter' not found
```

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

The server exposes semantic tools that validate against the schema before writing, more token-efficient than re-reading and re-writing the JSON on every change:

- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types`
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_delete_edge`
- `loom_validate` (same drift check as the CLI)

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

## How AI agents use it

`loom-spec init` writes a `SKILL.md` to `.claude/skills/loom-spec/` following the [Agent Skills open standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). Claude Code (and other tools that adopt the convention) auto-discovers it.

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
