---
name: loom-spec
description: |
  Use when modifying application architecture, components, services, data
  flow, events, real-time/audio code, or anything with corresponding nodes
  in .loom/diagrams/. Reads and updates the visual architecture spec, keeps
  code_refs accurate, flags stale nodes, and (for C++/audio) checks
  real-time safety. Trigger on: new features, refactors, file moves, module
  deletions, DSP/processBlock changes, or when the user references "the
  diagram", "the architecture", or "the spec".
---

# loom-spec — Architecture Spec Maintenance

This project keeps a node-based architecture spec in `.loom/`. Treat it as
source-of-truth documentation that must stay in sync with code.

This file is the overview + core rules. Domain-specific detail lives in
`reference/` files — load them only when the task needs them (see
[Reference files](#reference-files) at the bottom).

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
- If you change a function's **signature** materially (parameter types,
  return type, async-ness), the existence check passes but the spec is
  semantically stale. `loom_validate` flags this as signature-drift —
  see [reference/validation.md](reference/validation.md) for the
  capture/recapture workflow.

### When deleting code

- Don't delete the node. Set `status: "stale"`. Humans review staleness —
  silent deletion loses architectural history.

### When the user describes a new subsystem

- If it's clearly its own area (auth, billing, ingestion), create a new
  `<name>.flow.json` instead of cramming it into an existing diagram.
- Link from the overview with a `drill_down` reference if appropriate.

### Granularity — how many nodes?

A node represents a **concept**, not a function. The two failure modes
are equally bad: one node per file (no architecture, just an outline),
or ten nodes per file (chaos, no signal). When in doubt: fewer nodes,
more `code_refs[]`. Three patterns the architecture usually fits:

**Sidecar / controller with N endpoints** — *one* node, N `code_refs`.
The endpoints are not architecturally distinct; the *service* is the unit.

**Multi-stage pipeline** — *split into a `drill_down` sub-diagram when the
stages are conceptually separate*, otherwise one node + N refs. The test:
does the user talk about a single stage in isolation, or always about
"the pipeline"? (A drill-down sub-diagram is just another
`.loom/diagrams/<id>.flow.json` that the parent node points at via
`drill_down`. Works at any depth; validation + RT-safety apply there too.)

**Adapter with N implementations** — *one* node + tags, unless
implementations have different connectivity. "The storage layer" is one
concept; `S3Storage` vs. `LocalStorage` is a deployment detail.

**When to break the rule and split**: if two pieces of the same file have
*different upstream/downstream connections* in the diagram, they need to be
separate nodes — otherwise you can't draw the edges honestly. Architecture
is about connections.

## Preferred tools (when the MCP server is wired up)

If a `loom-spec` MCP server is registered with the host (e.g. via
`.mcp.json`), prefer its tools over raw JSON edits — they validate against
the schema before writing, so invalid edits fail fast instead of corrupting
the file, and they're more token-efficient than re-reading + re-writing JSON.

Diagrams:
- `loom_list_diagrams`, `loom_read_diagram`, `loom_read_node_types`
- `loom_add_node`, `loom_update_node`, `loom_mark_stale`, `loom_delete_node`
- `loom_add_edge`, `loom_update_edge`, `loom_delete_edge`
- `loom_validate` (schema + code-ref drift + RT-safety + wiring across every
  diagram & journey; pass `{ capture: "capture" | "recapture" }` to manage
  signature_hint baselines — see reference/validation.md)

Journeys:
- `loom_list_journeys`, `loom_read_journey`
- `loom_create_journey`, `loom_add_step`, `loom_update_step`,
  `loom_delete_step`, `loom_reorder_steps`, `loom_delete_journey`

If the MCP server is not available, edit the JSON files directly — the format
is stable and tools-agnostic by design.

## Format reference

- Status enum: `planned`, `implemented`, `stale`, `deprecated`.
- Edge kinds: `request`, `event`, `data-read`, `data-write`, `signal`,
  `dependency`, `control`.
- A node's `id` must match `^[a-z0-9-]+$`.
- Use `from`/`to` like `node-id:port-name` only when the node's type declares
  ports in `node-types.json`.

## Don't

- Don't create new top-level diagrams without checking if one already covers
  the area. Create one per **subsystem** or **flow**, not per directory.
- Don't move node `position` coordinates unless explicitly asked — the user
  arranges the canvas.
- Don't invent node types — extend `node-types.json` first.
- Don't write invalid JSON. The validator will refuse it.
- Don't add a node for every function. A node is a **concept**; multiple
  `code_refs[]` per node is normal.
- Don't leave `drill_down` pointing at a non-existent diagram id.
- Don't `loom_delete_node` for code that was just removed — `mark_stale` it.

(Domain-specific don'ts live in the matching reference file.)

## Reference files

Load these only when the task calls for them — they consume no context
until you read them:

- **[reference/examples.md](reference/examples.md)** — worked end-to-end
  walkthroughs: new feature, multi-step agent (drill-down), rename, delete,
  new domain, publish-to-manual, journey.
- **[reference/validation.md](reference/validation.md)** — signature-drift
  workflow (capture/recapture), edge-property vocabulary, what fails CI.
- **[reference/audio-dsp.md](reference/audio-dsp.md)** — audio/DSP graphs:
  typed ports, signal-flow coloring, real-time-safety lint for C++/JUCE.
- **[reference/exports.md](reference/exports.md)** — tag-based HTML export,
  scoped bundles, security review before publishing.
- **[reference/journeys.md](reference/journeys.md)** — documenting ordered
  workflows; the Journey-vs-Tags decision.
