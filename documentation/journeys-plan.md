# Journeys — implementation plan

A separate file kind for **guided, ordered, untimed walkthroughs** of
the architecture. Renders as a step-navigator with prev/next buttons
and a diagram pane that highlights the current step's node.
Exportable as standalone HTML for manuals, onboarding docs, or
interactive product tours.

This is the planned replacement for the Phase 2 timeline view (which
was removed in v0.5.0 — see
[`done/phase-4-timeline-removal.md`](./done/phase-4-timeline-removal.md)
for the scope-down reasoning). Same "show me the relevant slice of
the architecture for this workflow" need, with a much lighter mental
model.

## Why a new file kind (not just tags)

| Concern | Tags only | Journeys |
|---|---|---|
| Express **set** of relevant nodes | ✅ | ✅ |
| Express **order** | ❌ | ✅ |
| Render as step-by-step walkthrough | ❌ | ✅ |
| Right vocabulary for the use case | "scope" | "user journey" |

Tags handle "filter to the relevant nodes for this subsystem".
Journeys handle "show this ordered slice with one step at a time".
They compose: a journey can include nodes that are also tagged
`public`; an export bundle can include both a journey and the
diagrams it references.

The name **Journey** is chosen because "Flow" is already taken by
the `.flow.json` diagram extension. "Journey" is also the common
UX/product term (user journey, customer journey, onboarding journey),
which lands the right mental model.

## Components we already have ready for this

The Phase 2 timeline scope-down (v0.5.0) deliberately kept the bits
that apply to Journeys:

- **`PulseEdge.tsx`** — SVG-animated marker traveling along an edge
  path. Originally for "pulse edges while source node active during
  timeline playback"; here for "pulse edges between consecutive
  journey steps".
- **`DiagramCanvas` non-interactive mode** with `activeNodeIds` +
  `pulsingEdgeIds` props. Originally for the timeline mini graph;
  here for the journey current-step + path-so-far highlight.
- **`exportMode.ts`** runtime detector — same standalone-HTML
  short-circuit pattern.

So a lot of the visual primitives are already in place. The new code
is mostly the journey-specific schema, MCP tools, step-navigator UI,
and routing.

## Schema

New file: `packages/loom-spec/schema/journey.schema.json`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://loom-spec.dev/schema/journey-v1.json",
  "title": "Loom Journey",
  "description": "An ordered, untimed walkthrough of a diagram. Each step references a node; the renderer highlights nodes one at a time as the reader advances.",
  "type": "object",
  "required": ["version", "id", "title", "diagram", "steps"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "version": { "const": "1" },
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "title": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "diagram": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "steps": {
      "type": "array",
      "items": { "$ref": "#/$defs/JourneyStep" }
    }
  },
  "$defs": {
    "JourneyStep": {
      "type": "object",
      "required": ["id", "node"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "node": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "title": { "type": "string", "maxLength": 80 },
        "description": { "type": "string" },
        "code_refs": {
          "type": "array",
          "items": { "$ref": "#/$defs/CodeRef" }
        }
      }
    },
    "CodeRef": {
      "type": "object",
      "required": ["path"],
      "additionalProperties": false,
      "properties": {
        "path": { "type": "string" },
        "symbol": { "type": "string" },
        "lines": { "type": "string", "pattern": "^[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*$" }
      }
    }
  }
}
```

Deliberate non-additions:
- No `start_ms` / `duration_ms` / `track` / `kind` — journeys are
  untimed by design. If timing matters, that's a different feature.
- No `triggered_by` — ordering is implicit from array position.
- No `tags` on steps — taglike scoping happens by being-in-a-journey-or-not.
- `code_refs` is included so drift detection works on journey steps
  too. Same shape as everywhere else.

## File layout

```
.loom/journeys/
├── checkout.journey.json
├── new-user-onboarding.journey.json
└── deploy-runbook.journey.json
```

Mirrors `.loom/diagrams/`. Extension `.journey.json`. URL hash
`#journey:<id>`.

## View (browser editor + standalone export)

New file: `packages/loom-spec/src/view/components/JourneyView.tsx`.

### Layout

3-region grid:

```
┌──────────────────────────────────────────────────────────────┐
│  TopBar (switcher includes Journeys, theme toggle, etc.)     │
├──────────────────────────────────────────────────────────────┤
│  StepBar: « Prev   [Step 3 of 7]   Next »   (title)          │
├─────────────────────────────────────┬────────────────────────┤
│                                     │  Step list             │
│      DiagramCanvas (read-only)      │  ┌──────────────────┐  │
│      • current node glows           │  │ 1. Click Pay     │  │
│      • visited nodes dim-highlight  │  │ 2. Validate cart │  │
│      • future nodes normal          │  │ ▶ 3. Server call │  │
│      • edges between consecutive    │  │   description... │  │
│        steps pulse                  │  │   code_refs:     │  │
│                                     │  │     src/api.ts   │  │
│                                     │  │ 4. Confirm       │  │
│                                     │  │ 5. ...           │  │
│                                     │  └──────────────────┘  │
│        ~60%                         │       ~40%             │
└─────────────────────────────────────┴────────────────────────┘
```

Editor-mode vs export-mode (`isExportMode()`):
- Same UI both modes. Editor adds a `+ Step` button in the StepBar
  and per-step delete/edit affordances in the step list. Export
  hides them.
- Keyboard shortcuts: `←` / `→` for prev/next, `Home` for first
  step, `End` for last.

### Reuse from existing components

- **DiagramCanvas** is the diagram pane. Pass:
  - `interactive={false}`
  - `activeNodeIds={new Set([currentStep.node])}` — glow on current
  - `visitedNodeIds={new Set(stepsBeforeCurrent.map(s => s.node))}` —
    NEW prop, dim-highlight via a separate CSS class
  - `pulsingEdgeIds={edgesBetweenConsecutiveSteps}` — reuse the
    existing `PulseEdge` for the path-so-far. Originally built for
    the timeline mini graph; kept after the v0.5.0 scope-down
    specifically for this.
- **NodeCard** needs a new CSS variant `node-visited` (e.g. ~60%
  opacity + subtle border) in addition to the existing `node-active`
  (also kept from the timeline mini-graph code).
- **DiagramSwitcher** (currently lists diagrams only) gets a Journeys
  section. New `useJourneysList()` hook analogous to the now-removed
  `useTimelinesList()`.

### State

New `src/view/useJourneyState.ts`:
- Loads the journey + the referenced diagram.
- Tracks `currentStepIndex`.
- Exposes mutators (`addStep`, `updateStep`, `deleteStep`,
  `reorderSteps`) with debounced auto-save + SSE refetch. All
  short-circuit in export mode (`isExportMode()`). Same patterns the
  existing `state.ts` (diagram state) uses.

## Hono routes + fileOps

`src/server/fileOps.ts` gains:
- `listJourneys(loomPath): Promise<JourneySummary[]>`
- `readJourney(loomPath, id): Promise<LoomJourney>`
- `writeJourney(loomPath, id, data): Promise<void>`

`src/server/app.ts` gains:
- `GET /api/journeys` → list
- `GET /api/journeys/:id` → read
- `PUT /api/journeys/:id` → validate + write
- Extend SSE `change` events with `{ type: "journey-changed", id }`.

`src/server/watch.ts` watches `.loom/journeys/*.journey.json` too.

## MCP tools

Add to `src/mcp/server.ts`:

1. `loom_list_journeys()` — summaries (id, title, diagram, step count).
2. `loom_read_journey({ id })` — full JSON.
3. `loom_create_journey({ id, title, diagram, description?, steps? })`
   — make a new journey from scratch. Validates the diagram exists.
   Optional initial steps array.
4. `loom_add_step({ journey, node, title?, description?, code_refs?,
   after?: stepId })` — append by default; insert after a specific
   step if `after` is given. Cross-checks the node exists in the
   journey's diagram.
5. `loom_update_step({ journey, id, patch })` — patch step fields.
   If `node` is in the patch, validate it exists in the diagram.
6. `loom_delete_step({ journey, id })` — remove and re-sequence.
7. `loom_reorder_steps({ journey, order: [stepId, ...] })` — replace
   the step order. Validates the input is a permutation of existing
   ids.
8. `loom_delete_journey({ id })` — full delete (rare; prefer renaming).

Same validation pattern as the existing diagram tools (schema check
before write, cross-check referential integrity — the `node` of
every step must exist in the diagram).

## Export integration

Add to `src/cli/exportHtml.ts`:

- New flag `--from-journey <id>`: filter the export to only nodes
  referenced by the named journey's steps (plus edges between them,
  per the existing cascade rules in `exportFilter.ts`). The journey
  itself ships in the export and the standalone HTML opens at
  `#journey:<id>` by default.

Cascade rules in `src/server/exportFilter.ts` extend to journeys:
- If the journey's referenced diagram is filtered out entirely, drop
  the journey.
- If a step references a node that was filtered out by tag rules,
  drop the step (warn — user should fix the journey, not silently
  ship a broken walkthrough).
- If all steps of a journey are filtered out, drop the journey.

`.loom/exports.json` named bundles gain an optional `from-journey`
field:

```json
{
  "exports": {
    "checkout-tour": {
      "from-journey": "checkout",
      "out": "docs/checkout-walkthrough.html"
    }
  }
}
```

## SKILL.md updates

Add a new section under Rules:

### When the user wants to document a workflow

- Default to a Journey if the user says "user journey", "customer
  journey", "workflow", "step-by-step", "onboarding", "tour", "guided
  walkthrough", or describes an ordered sequence of steps.
- Use Tags if the user just wants to mark which nodes belong to a
  subsystem ("the auth nodes", "the public surface") with no
  sequence implied.
- If the user wants something time-based (latency, perf
  regression, OTel traces), that's a feature we don't currently
  ship — note it as out of scope and offer to capture the static
  topology as a Journey instead.

Add **Example 8: User wants to document a customer journey** that
walks through:
1. Identify the relevant diagram (or create one).
2. `loom_create_journey({ id: "checkout", title: "Customer Checkout",
   diagram: "overview", steps: [] })`.
3. `loom_add_step` for each step, in order, with `title` +
   `description` + `code_refs`.
4. Optionally write `.loom/exports.json` with a `from-journey`
   bundle.
5. `loom-spec export-html checkout-tour --out docs/checkout.html`.
6. Open in browser to verify the walkthrough flows correctly.

Add **Don'ts**:
- Don't create a Journey just because a sequence has a few steps —
  if it's < 3 steps, the user can read the diagram. Journeys carry
  overhead (separate file, step-by-step UI) that's only worth it
  when the walkthrough actually adds value over the static view.
- Don't put `code_refs` on a Journey step that point at the same
  symbol as the underlying node — that's redundant. Step-level
  `code_refs` are for narrowing the focus (e.g. node is the
  `Checkout` page; step's `code_refs` point at `handlePayClick`
  specifically).
- Don't reuse the same step `id` across journeys — they're
  unique-per-journey, but consistent naming (e.g. `click-pay`)
  across journeys for the same user action makes diffs easier to
  read.

Update **Preferred tools** section to list the 8 new MCP tools.

## Smoke test

New `packages/loom-spec/scripts/smoke-mcp-journeys.ts` mirroring the
existing `smoke-export-html.ts` shape (spawn the CLI, exercise the
tools via stdio, assert byte-for-byte cleanup). Asserts:
- All 8 tools register.
- `list_journeys` returns empty initially.
- `create_journey` writes a file; `read_journey` returns it.
- `add_step` with valid node succeeds, returns id; with invalid
  node fails.
- `update_step` patches fields; with invalid node rejects.
- `reorder_steps` accepts a permutation; rejects a non-permutation.
- `delete_step` removes; `delete_journey` removes.
- Fixture file restored byte-for-byte (no leftover test files).

Also extend `smoke-export-html.ts` with two cases:
- `--from-journey <id>` produces an export containing only the
  journey's nodes.
- A `.loom/exports.json` bundle with `from-journey` resolves
  correctly.

## Docs

New `documentation/journeys.md`: user-facing feature doc parallel to
`export-html.md`. Cover:
- What a journey is and when to use it (vs tags).
- File format walkthrough.
- CLI / MCP usage.
- Export integration.
- Authoring tips (titles vs descriptions, how to scope steps,
  when to split into multiple journeys).

## Files touched (summary)

**New:**
- `packages/loom-spec/schema/journey.schema.json`
- `packages/loom-spec/src/view/components/JourneyView.tsx`
- `packages/loom-spec/src/view/useJourneyState.ts`
- `packages/loom-spec/src/view/useJourneysList.ts`
- `packages/loom-spec/scripts/smoke-mcp-journeys.ts`
- `documentation/journeys.md`
- `examples/todo-app/.loom/journeys/checkout.journey.json` (demo
  fixture for the smoke test)

**Modified:**
- `packages/loom-spec/scripts/generate-types.ts` — emit `LoomJourney`
  type from the new schema.
- `packages/loom-spec/src/validate.ts` — add `validateJourney`.
- `packages/loom-spec/src/server/fileOps.ts` — `listJourneys` /
  `readJourney` / `writeJourney`.
- `packages/loom-spec/src/server/app.ts` — three new routes + SSE
  extension.
- `packages/loom-spec/src/server/watch.ts` — watch journey files.
- `packages/loom-spec/src/server/exportFilter.ts` — cascade rules
  for journeys.
- `packages/loom-spec/src/server/exportConfig.ts` — optional
  `from-journey` field in named bundles.
- `packages/loom-spec/src/cli/index.ts` — wire `--from-journey`,
  add journey to HELP.
- `packages/loom-spec/src/cli/exportHtml.ts` — implement
  `--from-journey`.
- `packages/loom-spec/src/mcp/server.ts` — 8 new tools.
- `packages/loom-spec/src/view/App.tsx` — `#journey:<id>` route +
  lazy-load `JourneyView`.
- `packages/loom-spec/src/view/useViewState.ts` — add
  `kind: "journey"` variant.
- `packages/loom-spec/src/view/components/TopBar.tsx` and
  `DiagramSwitcher.tsx` — include journeys in the switcher list.
- `packages/loom-spec/src/view/components/DiagramCanvas.tsx` —
  accept `visitedNodeIds` prop.
- `packages/loom-spec/src/view/components/NodeCard.tsx` — read
  `data.visited`, apply `node-visited` CSS class.
- `packages/loom-spec/src/view/styles.css` — `node-visited`,
  StepBar, step-list styles.
- `packages/loom-spec/src/view/exportMode.ts` — extend
  `ExportData` type with `journeys` map.
- `packages/loom-spec/scripts/smoke-export-html.ts` — add
  `--from-journey` cases.
- `packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md`
  AND `examples/todo-app/.claude/skills/loom-spec/SKILL.md` — new
  rules section, Example 8, Don'ts, Preferred-tools update.
- `documentation/project-status.md` — capabilities table +
  architecture description.
- `documentation/next-steps.md` — move Journeys out of backlog.
- `documentation/done/` — add a Phase-4 entry once shipped.

## Effort estimate

| Slice | Time |
|---|---|
| Schema + types + example fixture | ~30 min |
| Validator + Hono routes + fileOps | ~30 min |
| `useJourneyState` + `useJourneysList` | ~30 min |
| `JourneyView` (StepBar, step list, diagram pane wiring) | ~2 h |
| `visitedNodeIds` plumbing through DiagramCanvas + NodeCard CSS | ~30 min |
| 8 MCP tools | ~1 h |
| `--from-journey` export filter + named-bundle field | ~30 min |
| Smoke tests (mcp-journeys + export-html cases) | ~45 min |
| Docs (`journeys.md` + project-status/next-steps updates) | ~45 min |
| SKILL.md (template + fixture mirror) | ~30 min |
| Buffer for unexpected friction | ~30 min |

**Total: ~6.5–7 h focused work.** Realistic afternoon.

## Build / ship sequence

1. Schema + types + validator + Hono routes + smoke fixture
2. MCP tools + smoke test (`smoke-mcp-journeys.ts`)
3. View component + state + URL routing
4. Export integration (`--from-journey`) + extended smoke tests
5. SKILL.md + `journeys.md` + project-status update
6. Bump to v0.5.0; publish; tag; GitHub release.

Slices 1–4 can each commit/ship independently if needed (each
yields a working subset). v0.5.0 publish happens after slice 4 +
docs.
