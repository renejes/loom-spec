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

## Quick-start workflow

For any task that touches structure:

1. **Read first.** Find the relevant diagram(s) before editing code.
2. **Plan in the spec.** Add planned nodes/edges for what you're about to build.
3. **Implement the code.**
4. **Update the spec.** Flip status to `implemented`, set accurate `code_refs`.
5. **Validate.** Run `loom_validate` (MCP) or `loom-spec validate` (CLI) to
   confirm no drift.

## Rules

### Before implementing a feature

- List `.loom/diagrams/` and read the relevant file(s).
- Check existing node IDs to avoid collisions within a diagram.
- Confirm available node types in `.loom/node-types.json`. If you need a type
  that doesn't exist, add it there first (with a sensible color and icon).

### When adding code

- New component / service / store → add a node with `status: "planned"` first
  while scaffolding, then flip to `"implemented"` once it works.
- Always set `code_refs` to actual files. **Prefer `symbol` over `lines`** —
  symbols survive refactors; line numbers do not.
- Use only types defined in `.loom/node-types.json`.

### When editing code

- If you touch a file referenced by a node, verify the `symbol` still exists
  and the `path` is still accurate. Update if not.
- If you rename or move a file, update every `code_refs` pointing at it.

### When deleting code

- Don't delete the node. Set `status: "stale"`. Humans review staleness —
  silent deletion loses architectural history.

### When the user describes a new subsystem

- If it's clearly its own area (auth, billing, ingestion), create a new
  `<name>.flow.json` instead of cramming it into an existing diagram.
- Link from the overview with a `drill_down` reference if appropriate.

### Tagging hygiene for exports

`loom-spec export-html` filters by node `tags` to produce scoped bundles
(public manual, ops runbook, internal overview). Tagging is the source
of truth for what ships where. Conventions:

- **`public`** — shows up in user-facing documentation. Default-off
  (untagged nodes are *not* in public exports).
- **`internal`** — explicitly internal; can be used as `--exclude-tag`
  for public exports, or as `--include-tag` for an internal-only bundle.
- **`ops`** — for operational runbooks (deploy paths, monitoring,
  on-call docs).
- **`wip`** — work-in-progress; always exclude from any export.

When you set `tags: ["public"]` on a node, remember the cascade:

- Edges between two `public` nodes survive. Edges where one endpoint is
  untagged are **dropped** in the public export. If the user-facing
  flow depends on an "internal" node visually, either tag that node
  `public` too or accept the dangling visualisation.
- A group with no `public` children disappears entirely.
- A `drill_down` chevron pointing at a diagram that has zero `public`
  nodes is removed (the diagram doesn't ship).

**Security check before tagging `public`:** look at the node's
`code_refs[].path` and `description`. Tags filter nodes, not their
content. If a `code_ref` points at `src/server/admin/secrets.ts` or
the description names an internal system, that *text* ships in the
public export. Either remove the sensitive ref / rewrite the
description, or split the node into a public surface and an internal
implementation node and tag accordingly.

## Preferred tools (when the MCP server is wired up)

If a `loom-spec` MCP server is registered with the host (e.g. via
`.mcp.json`), prefer its tools over raw JSON edits:

- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types`
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_delete_edge`
- `loom_validate` (schema + code-ref drift across every diagram)

They validate against the schema before writing, so invalid edits fail fast
instead of corrupting the file. They're also more token-efficient than
re-reading + re-writing JSON on every mutation.

If the MCP server is not available, edit the JSON files directly using the
rules above — the format is stable and tools-agnostic by design.

For exporting the spec to a self-contained interactive HTML (for manuals,
docs sites, GitHub Pages, embed-in-Notion, etc.), use the CLI:

- `loom-spec export-html` (full export)
- `loom-spec export-html <bundle-name>` (from `.loom/exports.json`)
- `loom-spec export-html --include-tag public --out manual.html`
  (ad-hoc filter)

See Example 6 for the full workflow.

---

## Examples

### 1. User asks for a new feature

> User: "Add a payments service. The checkout flow calls it to charge the card."

```
# Step 1: Inspect the current state
loom_read_diagram("overview")

# Step 2: Add the new service as planned
loom_add_node({
  diagram: "overview",
  type: "service",
  label: "Payments",
  description: "Stripe wrapper. Handles charges, refunds, and the webhook.",
  status: "planned",
  code_refs: [{ path: "src/server/payments.ts" }],
  properties: { language: "typescript", runtime: "node" }
})
# → { ok: true, id: "service-2" }

# Step 3: Connect it
loom_add_edge({
  diagram: "overview",
  from: "checkout-flow",
  to: "service-2",
  kind: "request",
  label: "charge card"
})

# Step 4: Write the code (using your normal Write/Edit tools).

# Step 5: Update the node to reflect reality
loom_update_node({
  diagram: "overview",
  id: "service-2",
  patch: {
    status: "implemented",
    code_refs: [
      { path: "src/server/payments.ts", symbol: "createCharge" },
      { path: "src/server/payments.ts", symbol: "handleWebhook" }
    ]
  }
})
```

### 2. User describes a multi-step agent (e.g. LangGraph)

> User: "agent.py has a LangGraph with three steps: decide_step, call_tool, format_response."

Two valid shapes, choose by **how much the flow between steps matters**:

**A) Tightly coupled, internal detail — one node with many refs:**

```
loom_add_node({
  diagram: "overview",
  type: "service",
  label: "Agent",
  description: "LangGraph agent. Steps inside agent.py.",
  status: "implemented",
  code_refs: [
    { path: "agent.py", symbol: "decide_step" },
    { path: "agent.py", symbol: "call_tool" },
    { path: "agent.py", symbol: "format_response" }
  ]
})
```

**B) Step flow itself is the architecture — drill down to a sub-diagram:**

```
# Top-level: one node, drill_down to detail
loom_add_node({
  diagram: "overview",
  type: "service",
  label: "Agent",
  status: "implemented",
  code_refs: [{ path: "agent.py" }],
  drill_down: "agent-internals"
})

# Create the sub-diagram via the file system (no dedicated MCP tool):
# Write .loom/diagrams/agent-internals.flow.json
{
  "version": "1",
  "id": "agent-internals",
  "title": "Agent — internal steps",
  "nodes": [
    { "id": "decide", "type": "service", "label": "decide_step",
      "position": { "x": 80, "y": 100 }, "status": "implemented",
      "code_refs": [{ "path": "agent.py", "symbol": "decide_step" }] },
    { "id": "call", "type": "service", "label": "call_tool",
      "position": { "x": 380, "y": 100 }, "status": "implemented",
      "code_refs": [{ "path": "agent.py", "symbol": "call_tool" }] },
    { "id": "format", "type": "service", "label": "format_response",
      "position": { "x": 680, "y": 100 }, "status": "implemented",
      "code_refs": [{ "path": "agent.py", "symbol": "format_response" }] }
  ],
  "edges": [
    { "id": "e1", "from": "decide", "to": "call",
      "kind": "control", "label": "if tool needed" },
    { "id": "e2", "from": "decide", "to": "format",
      "kind": "control", "label": "if final answer" },
    { "id": "e3", "from": "call", "to": "format",
      "kind": "control", "label": "after tool" }
  ]
}
```

**B is usually right for LangGraph** because the structure between steps *is*
the logic — the diagram makes routing errors visible at a glance.

### 3. User renames or moves a function

> User refactored `validate_email` → `validateEmail` and moved it to `lib/validation.ts`.

```
# Step 1: Find the drift
loom_validate()
# → reports nodes whose code_refs no longer resolve

# Step 2: For each affected node, update the ref
loom_update_node({
  diagram: "overview",
  id: "auth-form",
  patch: {
    code_refs: [{ path: "lib/validation.ts", symbol: "validateEmail" }]
  }
})

# Step 3: Re-validate
loom_validate()
# → clean
```

### 4. User deletes a chunk of code

> User: "I removed the legacy /v1 API."

```
loom_read_diagram("overview")
# → identify nodes whose code is gone

# Mark them stale instead of deleting:
loom_mark_stale({ diagram: "overview", id: "api-v1-router" })
loom_mark_stale({ diagram: "overview", id: "api-v1-auth" })
```

The user will review and decide whether to truly remove, archive, or
re-purpose those nodes.

### 5. The user wants a new domain

> User: "Build out billing — invoices, subscriptions, dunning."

Don't pile this into `overview.flow.json`. Create a dedicated diagram:

```
# Write .loom/diagrams/billing.flow.json with the planned nodes/edges.

# Then, in overview, add a single placeholder node that drills into billing:
loom_add_node({
  diagram: "overview",
  type: "service",
  label: "Billing",
  status: "planned",
  drill_down: "billing"
})
```

### 6. User wants to publish architecture docs to a manual

> User: "We need to ship the checkout flow as an interactive diagram in
> our public user manual. Don't expose anything internal."

```
# Step 1: Identify which nodes belong in the public manual.
loom_read_diagram("overview")
# → review nodes; confirm with the user if scope is unclear

# Step 2: Tag the public-facing surface. Skip anything that exposes
# internal services, security-sensitive paths, or work-in-progress.
loom_update_node({ diagram: "overview", id: "checkout-page",
                   patch: { tags: ["public"] } })
loom_update_node({ diagram: "overview", id: "checkout-api",
                   patch: { tags: ["public"] } })
loom_update_node({ diagram: "overview", id: "payments-service",
                   patch: { tags: ["public"] } })
# … but NOT fraud-screening, admin-tools, internal-billing, etc.

# Step 3: Verify the tag set covers a connected slice. Edges between
# two public nodes survive; edges to untagged neighbours get dropped
# in the export. If the export would have orphans, either tag the
# missing neighbour or accept that the link disappears.

# Step 4: Write a named bundle to .loom/exports.json so the export is
# reproducible. (No MCP tool for this yet — write the file directly.)
#
# .loom/exports.json
{
  "exports": {
    "user-manual": {
      "include-tags": ["public"],
      "exclude-tags": ["wip"],
      "out": "docs/architecture.html"
    }
  }
}

# Step 5: Generate the HTML.
# (Shell, not MCP — agents can invoke via Bash tool or similar.)
$ loom-spec export-html user-manual

# Step 6: Sanity-check the output. Open docs/architecture.html in a
# browser and confirm: no internal node names visible, no surprising
# code_refs paths leaked in the inspector, the flow makes sense as a
# standalone visualisation.
```

**Don't auto-publish** — the export is intentional. A `git add` of the
generated `.html` belongs in the change that updates the architecture,
not in an automated commit triggered by every `.loom/` edit.

---

## Format reference

- Status enum: `planned`, `implemented`, `stale`, `deprecated`.
- Edge kinds: `request`, `event`, `data-read`, `data-write`, `signal`,
  `dependency`, `control`.
- A node's `id` must match `^[a-z0-9-]+$`.
- Use `from`/`to` like `node-id:port-name` only when the node's type declares
  ports in `node-types.json`.

## Don't

- Don't create new top-level diagrams without checking if one already covers
  the area.
- Don't move node `position` coordinates unless explicitly asked — the user
  arranges the canvas.
- Don't invent node types — extend `node-types.json` first.
- Don't write invalid JSON. The validator (server-side or `loom_validate`)
  will refuse it.
- Don't add a node for every function. A node is a **concept**; multiple
  functions per node is normal (use `code_refs[]`).
- Don't create a diagram per directory. Create one per **subsystem** or
  **flow**.
- Don't leave `drill_down` pointing at a non-existent diagram id.
- Don't `loom_delete_node` for code that was just removed — `mark_stale` it.
- Don't tag everything `public` "just in case" — the value of a tag is
  that it means something. If `public` is on every node, scoped exports
  stop being scoped.
- Don't manually edit the generated `.html` from `export-html` — re-run
  the export instead. Edits to the generated file are lost on the next
  run and obscure the source of truth.
- Don't add `loom-spec export-html` to `init` defaults or auto-run it
  from a hook. Exports are intentional, not background.
