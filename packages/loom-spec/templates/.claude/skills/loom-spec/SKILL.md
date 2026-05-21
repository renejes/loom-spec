---
name: loom-spec
description: |
  Use when modifying application architecture, components, services, data flow,
  events, or any code with corresponding nodes in .loom/diagrams/. Reads and
  updates the visual architecture spec, keeps code_refs accurate, and flags
  stale nodes. Trigger on: new features, refactors, file moves, module
  deletions, or when the user references "the diagram", "the architecture",
  or "the spec".
---

# loom-spec — Architecture Spec Maintenance

This project keeps a node-based architecture spec in `.loom/`. Treat it as
source-of-truth documentation that must stay in sync with code.

## Before implementing a feature

1. List `.loom/diagrams/` and read the relevant file(s).
2. Check existing node IDs to avoid collisions within a diagram.
3. Confirm available node types in `.loom/node-types.json`. If you need a
   type that doesn't exist, propose adding it before using it.

## When adding code

- New component / service / store → add a node with `status: "planned"`
  first if you're scaffolding, then flip to `"implemented"` after the code
  lands.
- Always set `code_refs` to actual files. Prefer `symbol` over `lines` —
  symbols survive refactors.
- Use only types defined in `.loom/node-types.json`.

## When editing code

- If you touch a file referenced by a node, verify the `symbol` still
  exists and the `path` is still accurate. Update if not.
- If you rename or move a file, update every `code_refs` pointing at it.

## When deleting code

- Don't delete the node. Set `status: "stale"` and leave it. Humans
  review staleness — silent deletion loses architectural history.

## When the user describes a new subsystem

- If it's clearly its own area (auth, billing, ingestion), create a new
  `<name>.flow.json` instead of cramming it into an existing diagram.
- Link from the overview with a `drill_down` reference if appropriate.

## Preferred tools (when the MCP server is wired up)

If a `loom-spec` MCP server is registered with the host (e.g. via
`.mcp.json`), prefer its tools over raw JSON edits:

- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types` for reading
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_delete_edge`
- `loom_validate` to check the whole spec for schema errors and code-ref drift

They validate against the schema before writing, so invalid edits fail
fast instead of corrupting the file. They're also more token-efficient
than re-reading + re-writing JSON on every mutation.

If the MCP server is not available, edit the JSON files directly using
the rules above — the format is stable and tools-agnostic by design.

## Format reference

- Status enum: `planned`, `implemented`, `stale`, `deprecated`.
- Edge kinds: `request`, `event`, `data-read`, `data-write`, `signal`,
  `dependency`, `control`.

## Don't

- Don't create new top-level diagrams without checking if one already
  covers the area.
- Don't move node `position` coordinates unless explicitly asked.
- Don't invent node types — extend `node-types.json` first.
- Don't write invalid JSON. The browser viewer will refuse to load it.
