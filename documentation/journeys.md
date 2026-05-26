# Journeys — ordered walkthroughs of an architecture

A **Journey** is an ordered list of steps, each tied to a node in a
diagram. The browser viewer renders it as a step-navigator (prev/next +
counter), with the current step's node glowing, prior steps subtly
highlighted, and everything outside the journey faded into the
background. Exportable as a standalone HTML focused on just that
walkthrough.

Journeys are a documentation artifact, not an execution layer. They
*describe* the order in which something happens; they don't run
anything.

## When to use a Journey (vs. Tags)

| Need | Use |
|---|---|
| Mark a set of nodes that belong together (e.g. "the public surface", "the billing subsystem") | **Tags** |
| Tell the reader *what happens in what order* through the architecture | **Journey** |
| Both — a journey through nodes that are also part of a public manual | Both compose; see [Composing with tags](#composing-with-tags) |

Journeys carry overhead (separate file, step-by-step UI). They're worth
it when the walkthrough adds value over the plain diagram — usually
once the sequence is **3 steps or more** and the reader benefits from
seeing one step at a time. For a 2-step "A talks to B" interaction,
the diagram says it all.

If you need timing (latency budgets, perf-trace replay), Journeys
aren't it — that feature was removed in v0.5.0
([Phase 4](./done/phase-4-timeline-removal.md) for the why).

## File format

`.loom/journeys/<id>.journey.json`:

```json
{
  "version": "1",
  "id": "complete-a-todo",
  "title": "Complete a Todo",
  "description": "User toggles a todo as done. Walks from the UI through the API to the database.",
  "diagram": "overview",
  "steps": [
    {
      "id": "user-toggles",
      "node": "todo-list-view",
      "title": "User clicks the toggle",
      "description": "The Todo List view captures the click and dispatches a PATCH request.",
      "code_refs": [
        { "path": "src/views/TodoList.tsx", "symbol": "handleToggle" }
      ]
    },
    {
      "id": "api-receives",
      "node": "todo-api",
      "title": "API handles the request"
    }
  ]
}
```

- `id` — matches the filename and the URL hash (`#journey:<id>`). Lowercase kebab-case.
- `title` — shown in the switcher and TopBar. Up to 80 chars.
- `description` — optional; markdown allowed; shown above the step list.
- `diagram` — id of the diagram this journey walks through. Every
  `step.node` is cross-checked against the nodes in that diagram.
- `steps[]` — ordered. Each step has its own `id` (unique within the
  journey), a `node` reference, and optional `title`, `description`,
  and `code_refs`.

The `code_refs` on a step are for *narrowing focus* to a specific
symbol or line range inside the node's larger surface — e.g. the
node references `src/views/TodoList.tsx` (the whole file), while the
step zooms into `handleToggle` specifically. If a step's `code_refs`
would just restate the node's, omit them.

## Browser viewer

`loom-spec view`, then either click a journey in the switcher or
navigate to `#journey:<id>` directly.

What you see:

- **TopBar** — journey title + description, the same switcher (now
  with a "Journeys" section), theme toggle.
- **StepBar** — `« Prev | Step n of m | Next »` plus the current
  step's title, plus a button that toggles the step sidebar.
- **Diagram pane** (read-only):
  - Current step's node glows in its type color.
  - Steps before the current one are subtly outlined (visited).
  - Steps after the current one render at full opacity, normal.
  - Nodes *not in the journey at all* are dimmed to ~28% opacity
    (hover to restore). This is the bit that makes the journey feel
    focused — the rest of the diagram fades into context.
  - The edge between the previous step's node and the current one
    pulses (one pulse at a time; multiplying would just be noise).
- **Step sidebar** (collapsible, default closed) — the full step list
  with titles, descriptions, code_refs. Click any step to jump to it.

Keyboard:

- `←` / `→` — previous / next step
- `Home` / `End` — first / last step

If a journey's diagram or its referenced nodes change while the
viewer is open (e.g. an agent edits via MCP), the journey reloads
automatically over the live-sync SSE channel.

## MCP tools

Eight tools, all schema- + cross-check-validated before write:

- `loom_list_journeys()` — summaries (id, title, diagram, step count).
- `loom_read_journey({ id })` — full JSON.
- `loom_create_journey({ id, title, diagram, description?, steps? })`
  — refuses to overwrite; verifies the diagram exists.
- `loom_add_step({ journey, node, title?, description?, code_refs?, after?, id? })`
  — appends by default; `after: <stepId>` inserts after that step.
  Cross-checks the node exists in the journey's diagram.
- `loom_update_step({ journey, id, patch })` — same patch shape as
  `loom_update_node`. If `node` is in the patch, validates the new
  reference.
- `loom_delete_step({ journey, id })`
- `loom_reorder_steps({ journey, order: [stepId, ...] })` — requires a
  strict permutation of existing step ids.
- `loom_delete_journey({ id })` — hard delete. Prefer renaming.

See [SKILL.md Example 7](../packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md)
for an agent-driven walkthrough.

## Server API

When `loom-spec view` is running, agents and other tools can use the
HTTP routes directly:

- `GET /api/journeys` — list summaries
- `GET /api/journeys/:id` — full JSON
- `PUT /api/journeys/:id` — write (validates schema + cross-checks
  referenced nodes; rejects with 422 if either fails)

SSE event `journey-changed` fires for external edits (via MCP or
hand-edit), matching the existing `diagram-changed` /
`node-types-changed` shape.

## Export integration

```sh
loom-spec export-html --from-journey complete-a-todo --out tour.html
```

This:

1. Implicitly narrows the export to the journey's diagram.
2. Filters that diagram to only the journey's nodes (plus edges
   between them — cascade rules from the tag filter apply).
3. Embeds *only* the named journey (not all journeys).
4. Writes a `defaultView` hint into `window.__LOOM_DATA__` so the
   HTML opens at `#journey:<id>` on first load — the reader lands
   directly in the walkthrough.

Without `--from-journey`, the default export ships **all** journeys
alongside all diagrams; readers discover them through the switcher.

### Composing with tags

`--from-journey` and tag filters can stack:

```sh
loom-spec export-html --from-journey checkout --exclude-tag wip
```

Cascade order: tag filter prunes nodes first, then the journey
narrows further. Any journey step whose node was dropped gets
pruned; if all steps are gone, the journey itself is dropped (and
the CLI exits non-zero — better to fail than ship a broken
walkthrough silently).

The CLI reports drops:

```
Wrote tour.html (542 kB): 1 diagram, 1 journey.
Filter dropped: 2 nodes, 2 edges, 1 group, 1 journey steps.
```

### Named bundles

`.loom/exports.json` gains an optional `from-journey` field per bundle:

```json
{
  "exports": {
    "checkout-tour": {
      "from-journey": "checkout",
      "out": "docs/checkout-walkthrough.html"
    },
    "deploy-runbook": {
      "from-journey": "deploy",
      "exclude-tags": ["wip"],
      "out": "docs/deploy.html"
    }
  }
}
```

```sh
loom-spec export-html checkout-tour
```

## Drift handling

Journeys participate in `loom-spec validate` just like nodes do:

- Step `code_refs[]` are walked for missing files / symbols /
  out-of-range line refs.
- Step `code_refs[].signature_hint` (filled by
  `loom-spec validate --capture`) is compared against the current
  source signature; drift = warning. Supported languages: Python,
  TypeScript/JSX, Rust, Svelte.
- Referential integrity is re-checked: every `step.node` must still
  resolve to a node in the journey's diagram.

`loom_validate` (MCP) does the same.

## Authoring tips

- **Titles vs. descriptions.** Titles are the StepBar headline — keep
  them short (under ~40 chars). Descriptions are the sidebar prose —
  one or two sentences explaining what *actually* happens.
- **Don't reuse step ids across journeys to mean different things.**
  IDs are unique-per-journey, but consistent naming
  (`click-pay` across all checkout-flavoured journeys) makes diffs
  and refactors readable.
- **Split long journeys.** A 12-step walkthrough usually means two
  journeys. The reader's attention budget is short.
- **One journey per workflow, not per file.** A checkout flow with
  optional 3DS detour is still one journey; create a second journey
  for "checkout with refund" if that's a meaningfully different walk.

## Testing

A smoke test at
`packages/loom-spec/scripts/smoke-mcp-journeys.ts` exercises every MCP
tool over stdio against a tmpfs copy of the todo-app fixture (29
assertions, byte-for-byte cleanup of the original fixture).

The HTML-export smoke
(`packages/loom-spec/scripts/smoke-export-html.ts`) covers the
`--from-journey` integration — node/edge narrowing, journey embedding,
defaultView, step pruning under tag conflict, named bundle resolution
(35 assertions).

Run them:

```sh
pnpm --filter loom-spec build:export   # only needed for smoke-export-html
pnpm --filter loom-spec exec tsx scripts/smoke-mcp-journeys.ts
pnpm --filter loom-spec exec tsx scripts/smoke-export-html.ts
```
