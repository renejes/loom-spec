# loom-spec — Worked examples

End-to-end walkthroughs. Read the one that matches the task at hand.

## Contents
1. User asks for a new feature
2. User describes a multi-step agent (drill-down vs. flat)
3. User renames or moves a function
4. User deletes a chunk of code
5. User wants a new domain
6. User wants to publish architecture docs to a manual
7. User wants a step-by-step walkthrough (Journey)

---

## 1. User asks for a new feature

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

## 2. User describes a multi-step agent (e.g. LangGraph)

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
the logic — the diagram makes routing errors visible at a glance. The same
drill-down pattern documents "which function does what" inside any module
(e.g. a DSP processor — see reference/audio-dsp.md).

## 3. User renames or moves a function

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

## 4. User deletes a chunk of code

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

## 5. The user wants a new domain

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

## 6. User wants to publish architecture docs to a manual

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
# in the export. (Cascade rules: see reference/exports.md.)

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
# code_refs paths leaked in the inspector, the flow makes sense.
```

**Don't auto-publish** — the export is intentional. A `git add` of the
generated `.html` belongs in the change that updates the architecture,
not in an automated commit triggered by every `.loom/` edit. Full tagging
+ security guidance: reference/exports.md.

## 7. User wants a step-by-step walkthrough of a workflow

> User: "Build me an interactive walkthrough of the checkout flow that
> I can drop in our onboarding docs."

```
# Step 1: Confirm the diagram exists (create it if not).
loom_list_diagrams()
# → confirms 'overview' has checkout-page, checkout-api, payments-service, …

# Step 2: Create the journey, scoped to that diagram.
loom_create_journey({
  id: "checkout",
  title: "Customer Checkout",
  diagram: "overview",
  description: "From the cart button to the confirmation page."
})

# Step 3: Add steps in order. Each step.node must exist in the diagram —
# the tool cross-checks before writing.
loom_add_step({
  journey: "checkout",
  node: "checkout-page",
  title: "User clicks Pay",
  description: "Cart view captures the click and POSTs to the API.",
  code_refs: [{ path: "src/views/Checkout.tsx", symbol: "handlePay" }]
})
loom_add_step({
  journey: "checkout",
  node: "checkout-api",
  title: "API validates and charges",
  description: "POST /checkout/charge runs validation, calls Payments."
})
loom_add_step({
  journey: "checkout",
  node: "payments-service",
  title: "Stripe charge",
  description: "createCharge → returns success | failure."
})

# Step 4: Optionally record a named bundle so anyone can re-export it.
# .loom/exports.json (write the file directly; no MCP tool):
{
  "exports": {
    "checkout-tour": {
      "from-journey": "checkout",
      "out": "docs/checkout-walkthrough.html"
    }
  }
}

# Step 5: Export. The HTML opens at #journey:checkout by default —
# the reader steps through prev/next and sees the diagram narrow to
# just the journey's nodes.
$ loom-spec export-html checkout-tour
```

When the user later refactors `handlePay`, run `loom_validate` — drift
catches dead `code_refs` on journey steps too. Journey-vs-Tags decision +
authoring rules: reference/journeys.md.
