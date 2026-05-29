# loom-spec — Validation, drift & code-ref hygiene

How `loom-spec validate` (and the `loom_validate` MCP tool) keeps the spec
honest, and the workflows for the checks that need a baseline.

## Contents
- What validate checks (and what fails CI)
- Signature-drift workflow (capture / recapture)
- Edge-property vocabulary
- Granularity don'ts

---

## What validate checks

`loom-spec validate` (read-only) and `loom_validate({})` run across every
diagram and journey:

| Check | Severity |
|---|---|
| Schema validity | error (fails CI) |
| code_ref existence (file + symbol + line range) | error |
| Signature drift (captured signature vs. current source) | error |
| Edge-property vocabulary violations (if `edge_types` declared) | error |
| Real-time-safety hazards (on `realtime` C/C++ refs) | error — see reference/audio-dsp.md |
| Edge wiring: unknown node / unknown port | error |
| Edge wiring: signal mismatch across a connection | warning |
| `signature-missing` (no hint captured yet) | informational |

Exit code is non-zero if any **error**-level finding exists. Warnings and
informational findings don't fail CI.

## Signature-drift workflow

The existence check catches *renamed/deleted* symbols. Signature drift
catches the subtler case: the symbol still exists, but its contract
changed (parameter types, return type, async-ness) — so the spec is
semantically stale even though nothing is "missing".

`validate` stores a `signature_hint` (the canonical declaration line) on
each code_ref. On later runs it re-extracts and compares.

Supported languages: Python, TypeScript (incl. JSX/JS), Rust, Svelte, C/C++.
Other extensions skip the signature check silently (existence check still runs).

Lifecycle:

1. **After adding a node/step with code_refs** — run
   `loom_validate({ capture: "capture" })` (or `loom-spec validate
   --capture`). Fills missing hints so future drift is detectable.
2. **As you work** — `loom_validate({})` is read-only and reports drift.
   Run it before declaring "feature done".
3. **When drift is real and intentional** — update the node's
   `description`/`properties` to match the new code, then
   `loom_validate({ capture: "recapture" })` writes the new hint as the
   acknowledged baseline. `recapture` silently clears signature-drift
   findings — it's the explicit "this is the new normal" gesture.
4. **In CI** — `loom-spec validate` (no flags). Don't put `--capture` in
   CI; that would mask drift instead of reporting it. Capture belongs in
   the spec-author's commit.

Don't silently `recapture` without updating the surrounding spec — the
hint and the node's description should tell the same story.

## Edge-property vocabulary

Edges have a free-form `properties` object for architectural attributes
(`sync: false`, `retry_policy: "exponential"`, `timeout_ms: 5000`).
Without a declared vocabulary, naming drifts over time — `sync` one day,
`is_async` the next, `synchronous` later. That's internal spec drift the
existence check can't see.

Declare `edge_types` in `node-types.json` to have validate enforce it:

```json
// .loom/node-types.json
{
  "types": { /* ... */ },
  "edge_types": {
    "request": {
      "properties": [
        { "name": "sync", "type": "boolean", "required": false },
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

Then on an edge:

- `properties: { sync: false }` — fine
- `properties: { is_async: true }` — warning: `unknown property 'is_async'`
- `properties: { sync: "yes" }` — warning: `expected boolean, got string`
- `properties: { retry_policy: "infinite" }` — warning: not in declared enum

`edge_types` keys are constrained to the seven edge kinds. The `properties`
entries reuse the same `Field` shape as node-type fields (string / number /
boolean / enum / markdown / code-ref / array, with required / values / min /
max / pattern / max_length). Opt-in: omit `edge_types` and edges are
unconstrained.

When the user wants a new edge attribute: **add the field declaration to
`node-types.json` first, then set it on edges**. Default to extending the
vocabulary, not inventing keys — that's the whole point.

## Don'ts

- Don't write invalid JSON — the validator refuses it (server-side and via
  `loom_validate`).
- Don't suppress a drift finding by deleting the code_ref or the
  `signature_hint`. Fix the ref or `recapture` after updating the spec.
- Don't run `--capture` / `--recapture` in CI. Read-only validate only.
