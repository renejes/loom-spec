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

## Preferred tools (when the MCP server is wired up)

If a `loom-spec` MCP server is registered with the host (e.g. via
`.mcp.json`), prefer its tools over raw JSON edits:

- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types`
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_delete_edge`
- `loom_list_timelines`, `loom_read_timeline`
- `loom_add_event`, `loom_update_event`, `loom_delete_event`
- `loom_validate` (schema + code-ref drift across every diagram)

They validate against the schema before writing, so invalid edits fail fast
instead of corrupting the file. They're also more token-efficient than
re-reading + re-writing JSON on every mutation.

If the MCP server is not available, edit the JSON files directly using the
rules above — the format is stable and tools-agnostic by design.

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

### 6. User wants to document a sequence as a timeline

> User: "Document the checkout flow on a timeline so I can see the latency
> breakdown."

A timeline is a horizontal time-axis overlay on a specific diagram. Each
event references a node in that diagram and a `[start_ms, duration_ms]`
interval. The view plays the events back like a DAW edit, lighting up the
referenced nodes in a mini graph beside the timeline.

```
# Step 1: Pick the diagram this sequence belongs to.
loom_list_diagrams()
loom_read_diagram("overview")

# Step 2: Create the timeline file. There's no MCP tool for creating one
# from scratch — write the empty shell directly:
#
# .loom/timelines/checkout.timeline.json
{
  "version": "1",
  "id": "checkout",
  "title": "Checkout — happy path",
  "description": "Click 'pay' → Stripe charge → confirmation render.",
  "diagram": "overview",
  "tracks": [
    { "id": "client", "label": "Browser",   "color": "#dbeafe" },
    { "id": "server", "label": "API",       "color": "#dcfce7" },
    { "id": "data",   "label": "Postgres",  "color": "#ede9fe" }
  ],
  "events": []
}

# Step 3: Append events with the MCP tool — it validates that each `node`
# actually exists in the referenced diagram, so typos fail fast.
loom_add_event({
  timeline: "checkout",
  node: "checkout-page",
  track: "client",
  start_ms: 0,
  duration_ms: 8,
  kind: "compute",
  label: "click pay",
  code_refs: [{ path: "src/views/Checkout.tsx", symbol: "handlePay" }],
  tags: ["critical-path", "user-input"]
})
# → { ok: true, id: "ev1" }

loom_add_event({
  timeline: "checkout",
  node: "payments-api",
  track: "server",
  start_ms: 12,
  duration_ms: 320,
  kind: "io",
  label: "POST /checkout (Stripe)",
  triggered_by: "ev1",      # explicit causation arrow
  tags: ["critical-path", "external-io"]
})
# → { ok: true, id: "ev2" }

# Step 4: Adjust if you got something wrong.
loom_update_event({
  timeline: "checkout",
  id: "ev2",
  patch: { duration_ms: 280 }
})

# Step 5: Validate.
loom_validate()
```

**When to reach for a timeline rather than extra diagram detail:**

- The *order* and *latency* matter (perf review, race conditions, end-to-end
  flow). The diagram alone shows topology, not sequencing.
- You want one node referenced multiple times because it does different
  things at different moments (e.g. an auth-service that validates *then
  later* re-issues a JWT). Use `code_refs` on each event for function-level
  granularity inside the same node.
- The user describes a *trace*, a *user journey*, or a *failure case* that
  has a clock.

**Don't create a timeline for static structure** — that's what diagrams are
for. A timeline of "the app boots, then runs forever" adds noise.

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
