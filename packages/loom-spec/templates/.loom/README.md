# .loom — Architecture Spec

This directory holds the **node-based architecture spec** for the project — a structured, git-diffable description of how the app is put together. The bet: keep it in the repo, edited by humans (visually) and AI agents (programmatically), and the spec stops drifting from reality.

This is a **spec layer, not an execution layer**. Nodes describe; they don't run.

## See what's in here

```bash
npx loom-spec view
```

Opens an interactive editor on `localhost:7777`. You can pan/zoom the diagrams, click nodes to inspect them, drill down between subsystems, and pick a Journey from the switcher to walk through a workflow step by step. Edits are auto-saved back to the JSON files in this directory.

## Files

- `node-types.json` — node-type vocabulary for this project (color, icon, fields). Add types specific to your domain. Can optionally declare an `edge_types` section to enforce a property vocabulary on edges — see [Edge property vocabulary](#edge-property-vocabulary) below.
- `diagrams/*.flow.json` — one file per subsystem. Each is a self-contained graph of nodes and edges; `drill_down` references link between them.
- `journeys/*.journey.json` — *(optional)* ordered walkthroughs of a diagram. Each step references a node; the viewer shows them one at a time with the rest of the diagram faded into context. Good for onboarding, runbooks, customer-flow tours.
- `exports.json` — *(optional)* named export bundles for `loom-spec export-html` (e.g. a `user-manual` bundle that filters to `tags: ["public"]`, or a `checkout-tour` bundle that scopes to one Journey).

## Editing

- **Visual editor** — `npx loom-spec view` (above). Drag nodes, edit fields in the inspector, click + Add for new ones.
- **AI agents** — use the MCP server (`npx loom-spec mcp`, register in `.mcp.json`). 18 tools for diagram + journey editing, all schema-validated before write. See `.claude/skills/loom-spec/SKILL.md` for when and how.
- **By hand** — the JSON files are stable and human-editable. The `loom-spec view` server validates on every write, so invalid JSON gets rejected with a clear error.

## Publishing

```bash
npx loom-spec export-html --out docs/architecture.html
```

Produces a single self-contained HTML file with the same interactive viewer baked in — drop it into a docs site, wiki, GitHub Pages, email attachment, anywhere. Tag-based filtering (`--include-tag public`) lets you ship scoped versions for different audiences. `--from-journey <id>` produces a focused walkthrough.

## Drift detection

```bash
npx loom-spec validate
```

Walks every `code_refs` on nodes and journey steps; warns when the referenced file or symbol is gone. Wire into CI or a pre-commit hook to catch the spec going stale.

## Edge property vocabulary

Edges carry a free-form `properties` object for architectural attributes (`sync: false`, `retry: "exponential"`, `timeout_ms: 5000`, etc.). To prevent the same concept getting different names over time (`sync` vs `synchronous` vs `is_sync`), declare the vocabulary in `node-types.json` under `edge_types`:

```json
{
  "types": { /* ... */ },
  "edge_types": {
    "request": {
      "properties": [
        { "name": "sync", "type": "boolean", "required": false },
        {
          "name": "retry_policy",
          "type": "enum",
          "values": ["none", "exponential", "linear"]
        },
        { "name": "timeout_ms", "type": "number", "min": 0, "max": 600000 }
      ]
    }
  }
}
```

`loom-spec validate` then warns on edges that use undeclared keys, wrong value types, or out-of-range numbers. Per-kind: only request-kind edges are constrained in the example above; other kinds (event, data-read, …) stay unconstrained until you add their own entry.

Opt-in: leave `edge_types` out entirely and edges are unconstrained, just like before v0.8.0.

## Format reference

The JSON Schemas ship with the `loom-spec` npm package at `node_modules/loom-spec/schema/`. The format is intentionally stable and tools-agnostic — you can read and edit `.loom/` files without the CLI installed.
