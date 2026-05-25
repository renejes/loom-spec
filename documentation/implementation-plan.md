# Implementation Plan

Forward-looking implementation plans only. For what has shipped, see
[`done/`](./done/). For the open backlog, see [`next-steps.md`](./next-steps.md).
For the current state of the codebase, see
[`project-status.md`](./project-status.md).

## Active

### Journeys — guided ordered walkthroughs of an architecture

Full plan in [`journeys-plan.md`](./journeys-plan.md). Goal: a separate
file kind for "user journey" / "workflow" documentation — an ordered
list of steps, each tied to a node in a diagram. Different from
timelines (no `start_ms` / `duration_ms`) and from tags (sequence
matters). Renders as a step-navigator with prev/next + a diagram pane
that highlights the current and visited nodes. Exportable as a
standalone HTML via `--from-journey <id>`.

## Backlog (planning sketches)

Each item has a brief sketch — turn into a full plan when picked.

### #23 — Editable timeline inspector

TimelineInspector is currently read-only; clip details are mutable via
drag/resize, the `+ Event` button, or hand-editing JSON. Field-level
editing (`label`, `kind`, `description`, `code_refs`, `tags`,
`triggered_by`) would remove the last reason to drop into JSON. Mirror
the existing `Inspector.tsx` patterns from the node case.

**Effort.** ~3–4 h.

### #24 — Planned-vs-observed diff view

With `import-trace` shipped, the natural next step is overlaying an
imported timeline on top of a hand-authored one for the same diagram —
same horizontal axis, different visual treatment per source. Makes
drift between "what we said" and "what actually happens" visible.

**Approach.** TimelineCanvas takes a second optional `LoomTimeline`
prop. When provided, its events render at ~40% opacity in a separate
band per track (above the primary clips). Hover shows the time delta
(`observed: 280ms, planned: 200ms — +40%`).

**Effort.** ~1 day.

### #25 — Sticky track labels at high zoom

At zoom ≥ 2× the `LABEL_COL` scrolls off the left when the user pans
horizontally. Render the label column as a sticky overlay (or split
the SVG into a fixed-label `<svg>` plus a scrollable canvas `<svg>`)
so users keep context while panning.

**Effort.** ~2–3 h.

### #26 — Pure-SVG mini-renderer (drop xyflow from the timeline path)

Code-splitting (#20) only saves ~14 kB today because xyflow stays in
the main bundle — both the full diagram view and the mini graph use
it. A hand-rolled SVG mini-renderer (positioned nodes + edges, no
interaction beyond fitView) would let xyflow leave the timeline
chunk and the export bundle entirely, dropping payloads by ~150 kB+.

**Approach.** New `<MiniDiagram nodes edges activeIds pulsingIds>`
component. ~150 lines of SVG. Computes a fit transform on mount and
on container resize. Reuses NodeCard's visual styling but renders
into the SVG layer. The interactive DiagramCanvas stays xyflow-based.

**Effort.** ~1 day.

### #27 — OTLP-protobuf + Jaeger / Zipkin trace formats

`import-trace` currently handles OTLP JSON only. Add adapters in
`src/server/otel.ts` that detect the format from the file shape and
project all of them down to the same `ParsedSpan[]` array. Per-format
work, can ship one at a time.

**Effort.** ~half day per format.

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

- Items 1–14 of the original plan, plus 15a–15g and the export work
  in Phase 3, are all archived in [`done/`](./done/).
- The next concrete planned chunk is **Journeys**
  ([`journeys-plan.md`](./journeys-plan.md)) — a new file kind for
  ordered, untimed workflows distinct from both timelines and tags.
- After that, **#26 Pure-SVG mini-renderer** is the highest-leverage
  remaining item — it shrinks the export bundle dramatically and
  removes xyflow as a hard dependency of the read-only path.
- Everything else is demand-driven polish. Pick by what real-world
  use surfaces as the next pain.
