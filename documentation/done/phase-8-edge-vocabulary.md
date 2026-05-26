# Phase 8 — Edge property vocabulary (v0.8.0)

A small companion feature shipping alongside Phase 7 (signature-drift)
in the same v0.8.0 release. Solves the consistency-within-spec problem
that emerges once edge `properties` get used in anger: in three months
you've forgotten whether you called it `sync` or `synchronous` or
`is_sync`. Without a declared vocabulary, agents drift naming over
time — that's internal spec drift the existence + signature checks
can't catch.

## What shipped

### Schema: optional `edge_types` in `node-types.json`

```json
{
  "types": { /* ... */ },
  "edge_types": {
    "request": {
      "description": "Synchronous request-response calls.",
      "properties": [
        { "name": "sync", "type": "boolean" },
        {
          "name": "retry_policy",
          "type": "enum",
          "values": ["none", "exponential", "linear"]
        },
        { "name": "timeout_ms", "type": "number", "min": 0, "max": 600000 }
      ]
    }
  }
}
```

Keys are constrained to the seven edge kinds (`request`, `event`,
`data-read`, `data-write`, `signal`, `dependency`, `control`). The
`properties` array reuses the existing `Field` shape from node-types
— same supported field types (string, number, boolean, enum, markdown,
code-ref, array), same constraint vocabulary (required, values, items,
min, max, pattern, max_length).

### Validation in `loom-spec validate`

For each edge with a declared vocabulary, the validator checks:

- Unknown property keys → warning
- Required-but-missing → warning
- Wrong value type → warning
- Enum value not in declared options → warning
- Numbers outside min/max → warning
- Strings violating pattern / max_length → warning

Findings sum into the report's new `totalEdgeIssues` counter, which
counts toward the CI exit-code criterion alongside `totalDrift` and
`totalSchemaErrors`. Rationale: the vocabulary is opt-in — if the
user took the trouble to declare it, they want it enforced.

Edge kinds without a vocabulary entry are unconstrained — full
backwards compatibility with the v0.7.0 behaviour.

### Why `node-types.json` and not a separate file

The original feedback suggested `.loom/edge-property-schema.json` as a
separate file. Putting it inside `node-types.json` instead is cleaner:

- One file declares the project's full vocabulary (node + edge).
- Node `fields` and edge `properties` reuse the same `Field` shape —
  zero new schema concepts.
- An agent updating node-types is already in the right file to update
  edge_types — no second hop to a sibling file.

## Files touched

**New:**
- `packages/loom-spec/src/server/edgeValidate.ts` — pure-function validator
- `packages/loom-spec/scripts/smoke-edge-vocab.ts` — 11 assertions

**Modified:**
- `packages/loom-spec/schema/node-types.schema.json` — added `edge_types`
  property + `EdgeType` $def
- `packages/loom-spec/src/types/node-types.ts` — regenerated
- `packages/loom-spec/src/server/drift.ts` — `EdgeIssueFinding` type,
  `totalEdgeIssues` counter, walks edges per diagram
- `packages/loom-spec/src/cli/validate.ts` — prints edge issues,
  bumps exit code on them
- `examples/todo-app/.loom/node-types.json` — adds an `edge_types.request`
  demo entry
- `packages/loom-spec/templates/.loom/README.md` — new "Edge property
  vocabulary" section
- `packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md`
  AND `examples/todo-app/.claude/skills/loom-spec/SKILL.md` — agent
  guidance

## Effort

| Slice | Time |
|---|---|
| Schema + types regen | 15 min |
| Pure validator + format helper | 40 min |
| drift.ts integration | 30 min |
| CLI formatter + exit-code logic | 15 min |
| Smoke test (11 assertions: unit + e2e) | 45 min |
| Template + fixture + SKILL.md | 30 min |
| Phase 8 doc + status updates | 30 min |
| **Total** | **~3.5 h** |

In line with the original estimate of 3–4 hours. The "extend
node-types.json" choice (vs. a separate file) saved time by reusing
the existing Field machinery — no new validation primitives.

## Test coverage delta

New: `smoke-edge-vocab.ts` (11 assertions):
- 7 unit checks of `validateEdgeProperties`: good edge passes, each
  failure mode (unknown key, wrong type, bad enum, out-of-range) is
  reported with the right issue kind, edge kinds without vocab are
  unconstrained, formatter mentions the property name
- 4 end-to-end via `runDriftCheck`: counters, finding attachment to
  the right edges

Total smoke coverage now: **118 assertions across 5 suites**:
- smoke-export-html (35)
- smoke-mcp-journeys (29)
- smoke-mcp-diagrams (13)
- smoke-signatures (30)
- smoke-edge-vocab (11, new)

All clean up byte-for-byte.
