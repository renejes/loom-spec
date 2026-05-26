# Phase 6 — Quality-of-life round (v0.7.0)

Four small wins driven by real-world feedback from a separate
Claude Code session using `loom-spec@0.6.0` on a real project. The
feedback flagged four concrete pain points; this phase fixes the
three cheapest and most immediately useful, plus a doc gap. The
fourth (signature-fingerprint drift) lands as backlog item #21
because the only honest implementation is a multi-week,
multi-language parser project.

## What shipped

### Auto-layout for new nodes

Picking `{x, y}` coordinates by hand sucks. The default of
`{x: 200, y: 200}` led to overlapping nodes whenever an agent (or
human) added a node without an explicit position.

`computeNewNodePosition(diagram)` in `src/layout.ts` is a pure
function used by both the MCP `loom_add_node` tool and the browser
editor's +Add button. Heuristic: place the new node to the right of
the rightmost existing node at the median y. If that spot collides,
slide down; if it runs off, start a fresh column further right.

Deliberately *not* a full graph layout — that would re-arrange
existing nodes, which users do not expect. This only places the
*new* node well.

### Edge `properties` field

Real architecture questions don't fit the existing `kind` enum:
*is this request sync or async? streaming or one-shot? does it
retry?* The plan-doc voice would be to add named enums to the
schema, but Phase 4 burned that on the timeline view. Instead:
edges get an optional, free-form `properties` object — same shape
that nodes have had since v0.1.

Projects pick their own vocabulary. If a convention emerges across
the loom-spec userbase, it can graduate into the schema later. Until
then, `properties: { sync: false, retry: "exponential", timeout_ms: 5000 }`
is just data that flows through.

### New `loom_update_edge` MCP tool

To make edge properties editable from agents without delete+re-add
(which loses the edge id), `loom_update_edge` rounds out the
diagram CRUD. Mirror of `loom_update_node`'s patch shape.

Total MCP tools: 19 (was 18).

### SKILL.md: Granularity patterns

The "how many nodes per file / per subsystem" question was
documented sparsely (Example 2 covered LangGraph). The skill now
has a dedicated **Granularity — how many nodes?** Rules section
with three concrete patterns:

- Sidecar / controller with N endpoints → 1 node + N code_refs
- Multi-stage pipeline → split when stages are conceptually
  separate; else 1 node + N refs
- Adapter with N implementations → 1 node + tags

Plus an explicit override rule: split when two pieces of the same
file have different upstream/downstream connections in the diagram.

### `.loom/README.md` template rewrite

Cold-reader discoverability was thin — someone cloning a repo with
a `.loom/` directory saw raw JSON files and a sparse README.
Rewrote the template with `npx loom-spec view` front-and-center,
called out Journeys, mentioned the MCP authoring path, and added
the validate / export sections.

## What didn't ship — punted to backlog

**Signature-fingerprint drift check (now backlog #21).** The
reporter wished for a check that catches semantically-broken
`code_refs` even when the symbol still exists — e.g. you change
`parse_stage_1(file_path: str)` to `parse_stage_1(input_data: dict)`
and the spec's description is now a lie.

The honest implementation needs language-aware AST parsing. Either
we ship one language (Python first, per the reporter's usage) and
let the open-source community add the rest, or we settle for a
hash-based heuristic that fires false positives on auto-formatter
diffs. The hash route would generate enough noise to be ignored —
worse than no warning. The per-language route is real work.

Left as #21 in `next-steps.md` with the Option A/B/C/D sketch
preserved in the conversation that generated this phase. If the
pain comes back, that's where to start.

## Effort

| Slice | Time |
|---|---|
| README template | ~15 min |
| Granularity SKILL.md section | ~30 min |
| Edge properties + update_edge tool | ~45 min |
| Auto-layout + smoke test | ~60 min |
| Phase doc + status updates + bump | ~30 min |
| **Total** | **~3 h** |

## Test coverage delta

New: `scripts/smoke-mcp-diagrams.ts` (13 assertions) — covers the
v0.7.0 additions and fills the gap where diagram MCP tools had no
smoke. Auto-placement: confirms a new node lands to the right of
the rightmost existing one, doesn't overlap, and that explicit
positions still win. Edge properties: round-trip through write +
read. `update_edge`: patches fields, replaces properties on patch
(no merge), errors on missing id.

Total smoke coverage now: 29 (journeys) + 35 (export-html) + 13
(diagrams) = 77 assertions across three suites. Each suite cleans
up byte-for-byte.

## Files touched (summary)

**New:**
- `packages/loom-spec/src/layout.ts` — pure layout helpers
- `packages/loom-spec/scripts/smoke-mcp-diagrams.ts`

**Modified:**
- `packages/loom-spec/schema/diagram.schema.json` — Edge gets `properties`
- `packages/loom-spec/src/mcp/server.ts` — auto-layout default,
  edge `properties` in `loom_add_edge`, new `loom_update_edge`,
  description updates
- `packages/loom-spec/src/view/components/DiagramView.tsx` — +Add
  button now auto-places
- `packages/loom-spec/templates/.loom/README.md` — full rewrite
- `packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md`
  AND `examples/todo-app/.claude/skills/loom-spec/SKILL.md` —
  Granularity section
- `packages/loom-spec/package.json` — 0.6.0 → 0.7.0
- `documentation/{project-status,next-steps,handover,done/README}.md`
