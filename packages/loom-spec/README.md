# loom-spec

> A node-based architecture spec that lives in your repo. AI-readable, AI-writable, git-diffable.

`loom-spec` keeps a structured visual spec of your application's architecture **inside your repo**, designed to be edited by both humans (in a browser-based node editor) and AI coding agents (directly via JSON files).

It's a spec layer, not an execution layer. The nodes don't run — they describe.

## Install

```bash
# No global install needed — use via npx
npx loom-spec init
npx loom-spec view
```

Or as a dev dependency:

```bash
npm install --save-dev loom-spec
```

Then in `package.json`:

```json
{
  "scripts": {
    "loom": "loom-spec view"
  }
}
```

## Commands

### `loom-spec init [--path <dir>] [--force]`

Scaffolds the spec directory and the agent skill in the target project (defaults to current working directory).

Writes:

- `.loom/README.md` — explains the directory to humans
- `.loom/node-types.json` — five default types (`ui`, `service`, `data`, `event`, `external`)
- `.loom/diagrams/overview.flow.json` — empty starter diagram
- `.claude/skills/loom-spec/SKILL.md` — tells Claude Code (and any tool following the Agent Skills standard) when and how to maintain the spec

Refuses to overwrite an existing `.loom/` unless `--force`.

### `loom-spec view [--root <dir>] [--port <n>]`

Starts a local browser editor. Walks up from `--root` (default: cwd) to find the nearest `.loom/`. Opens on port 7777 by default.

In the editor you can:

- Drag nodes; edits debounce and write to disk within ~500ms
- Click a node or edge to inspect and edit fields, code refs, tags, type-specific properties
- Drag from a node's right handle to another node to create an edge
- Use the "+ Add" menu in the top bar to add a new node by type
- Use the diagram switcher (top-left dropdown) to navigate between diagrams or create new ones
- Use the "Drill into" chevron on any node or group with `drill_down` set to jump to a sub-diagram
- Toggle light/dark theme; preference is persisted

External edits to the JSON files (e.g. by an AI agent) propagate to the open UI live via Server-Sent Events — no reload needed.

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
