# Implementation Plan

Forward-looking implementation plans only. For what has shipped (and
what was deliberately removed), see [`done/`](./done/). For the open
backlog, see [`next-steps.md`](./next-steps.md). For the current state
of the codebase, see [`project-status.md`](./project-status.md).

## Active

_Nothing currently in flight._ See [`next-steps.md`](./next-steps.md)
for the backlog. The Journeys feature shipped as v0.6.0 — see
[`done/phase-5-journeys.md`](./done/phase-5-journeys.md).

## Backlog (planning sketches)

Each item has a brief sketch — turn into a full plan when picked.

### #26 — Pure-SVG mini-renderer (drop xyflow from the embedded read-only path)

Currently the standalone HTML export bundles all of xyflow (~150 kB)
even though it only renders a static, non-interactive read of the
diagram. A hand-rolled SVG renderer that takes positioned nodes +
edges + an optional `activeNodeIds` would let xyflow leave the export
bundle entirely.

**Approach.** New `<MiniDiagram nodes edges activeIds pulsingIds>`
component. ~150 lines of SVG. Computes a fit transform on mount and
on container resize. Reuses NodeCard's visual styling but renders
into the SVG layer. The interactive `DiagramCanvas` stays xyflow-based.

The Journey view (planned) is the main beneficiary: its read-only
diagram pane doesn't need xyflow's interaction layer at all.

**Effort.** ~1 day.

### #16 — Custom-type fields beyond primitives

`array` is a flat list of primitives. Real custom types may want
nested objects, multi-value refs, etc. Decide when to extend the
field-type vocabulary vs. push complexity into separate diagrams.

### #17 — Cross-tool skill discovery

Currently we only place the skill at `.claude/skills/loom-spec/`. If
Codex / Cursor / others adopt different conventions, add
`--agent=codex` style flags to `init`.

### #18 — `loom-spec init --upgrade`

Bump existing repos to a newer schema version when the schema
changes. Needs a migration path.

### #19 — Read-only "share" mode

Effectively obsoleted by Phase 3's export (`loom-spec export-html`).
Keep on the list only if a hosted variant ever needs in-process
read-only mode for the live editor.

## Notes on sequencing

- Items 1–14 (Phase 1 foundation) and the v0.4.0 export work (Phase 3)
  are archived in [`done/`](./done/).
- The Phase 2 timeline work and Phase 4 removal are also in
  [`done/`](./done/) as honest history.
- The next concrete planned chunk is **Journeys**
  ([`journeys-plan.md`](./journeys-plan.md)) — a new file kind for
  ordered, untimed workflows.
- After that, **#26 Pure-SVG mini-renderer** is the highest-leverage
  remaining item — it shrinks the export bundle dramatically and
  removes xyflow as a hard dependency of the read-only path. Most
  valuable in combination with the Journey view, which is read-only
  by nature.
- Everything else is demand-driven polish. Pick by what real-world
  use surfaces as the next pain.
