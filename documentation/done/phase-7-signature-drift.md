# Phase 7 — Signature-drift detection (v0.8.0)

The check that's been on the backlog since Phase 6, brought forward
because the user's stated goal — "spec stays continuously up-to-date
and the agent can't miss staleness" — is exactly what this catches.

The existing existence check fires when a symbol *disappears* (renamed,
moved, deleted). But the failure mode that motivated this phase is
subtler: the symbol still exists, the spec still references it, but the
function's contract changed. `parse_stage_1(file_path: str) → dict`
became `parse_stage_1(input_data: dict) → str`. validate was happy.
The spec lied. Phase 7 closes that gap for the languages the author
actually uses.

## What shipped

### Signature extraction in 4 languages

`src/server/signatures/` — one module per language plus a dispatcher:

- **`python.ts`** — `def name(args) -> ret:` and `class Name(Base):`
  including multi-line signatures, async def, decorators ignored
- **`typescript.ts`** — covers function declarations, arrow functions
  assigned to const/let, class methods (with modifier soup),
  interface signatures, generics. Also handles `.js`/`.jsx`/`.tsx`
- **`rust.ts`** — `pub fn`, `async fn`, `pub(crate)`, generics,
  lifetimes, where clauses, trait method declarations
- **`svelte.ts`** — extracts `<script>` block content and delegates
  to the TS extractor

All four output a **canonical single-line signature**: whitespace
collapsed, multi-line declarations folded. Comparable as plain
strings — robust against autoformatter line-break differences.

Approach: hand-written regex + state-machine walks. No tree-sitter or
language-AST dependency. Trade-off: ~80% accuracy with a bias toward
false positives (a warning that turns out to be benign) over false
negatives (a real drift that goes unnoticed). The agent reading a
spurious warning has more context than the heuristic; better that
than silent breakage.

### `signature_hint` field on CodeRef

Optional string field on `CodeRef`, added to both the diagram and
journey schemas. Filled by `validate --capture`; compared against
current source by `validate` (default mode).

### Validate workflow

`loom-spec validate` (and `loom_validate` MCP) gains three modes:

- **default**: read-only. Reports drift on existing hints, reports
  signature-missing for refs without a hint. Exit-code-tripping:
  schema errors, broken refs, signature-drift. Informational:
  signature-missing (doesn't fail CI).
- **`--capture`**: fills missing `signature_hint` from current source,
  writes back to JSON. Existing hints left alone.
- **`--recapture`**: overwrites all hints from current source.
  Silently fixes signature-drift findings — this is the explicit "I
  acknowledge the current state as the new baseline" gesture.

Validate now also walks journey step `code_refs` (the docs claimed it
did since v0.6.0; this is the first release where it actually does).

### Drift report structure

`DriftReport` extended:

- New issue types: `signature-drift`, `signature-missing`
- New `perJourney: JourneyReport[]` parallel to `perDiagram`
- New `totalSignatureMissing` counter (informational; doesn't sum
  into `totalDrift`)
- New `capturedCount` (how many hints were written this run)

CLI output and MCP `loom_validate` both consume the new shape.

## Workflow for agents (and humans)

1. **After adding a node/step with code_refs**: run
   `loom_validate({ capture: "capture" })`. Hints land in the JSON.
2. **During work**: `loom_validate({})` reports drift. Run before
   declaring "feature done".
3. **When drift is intentional**: update the spec's `description` to
   reflect the new contract, then
   `loom_validate({ capture: "recapture" })`.
4. **In CI**: `loom-spec validate` exits non-zero on real drift.
   Don't put `--capture` in CI — it would mask drift instead of
   reporting it.

## What didn't ship — intentionally

- **AST parsers for each language.** Regex+state-machine is "good
  enough" and dependency-free. Tree-sitter would add ~10 MB to the
  npm package for a robustness improvement that doesn't change the
  outcome much (the warnings are reviewed by agents, not lint
  tools).
- **More languages.** Python, TS, Rust, Svelte covers the author's
  active stack. Go/Java/Kotlin/C#/Ruby silently skip the check.
  Backlog #25 documents the "copy a module and adapt" path for
  contributors.
- **Auto-capture on MCP write.** The MCP tools don't auto-fill
  hints on add — capture is explicit. Reasons: (a) avoids reading
  potentially-large source files on every node edit, (b) keeps the
  add-node path fast, (c) the explicit capture step gives the
  author a chance to confirm "yes, this is the right baseline".

## Effort

| Phase | Time |
|---|---|
| Schema + types | 15 min |
| 4 extractors + canonicalize helper | 4 h |
| drift.ts rewrite (capture/recapture, journey traversal) | 2 h |
| CLI + MCP wiring | 30 min |
| Smoke test (30 assertions: extractor units + e2e capture/drift/recapture) | 2 h |
| Bug fix: `->` token in Rust walker | 15 min |
| Docs (SKILL.md + journeys.md + Phase 7 + status/handover) | 1 h |
| **Total** | **~10 h** |

Roughly 1.5 focused days, well under my original 2–3 day estimate
because the regex+state-machine approach scaled cleaner than I
expected across the three quite-different languages.

## Test coverage delta

New: `scripts/smoke-signatures.ts` (30 assertions):
- 16 extractor unit assertions (4-5 per language, covering canonical
  shapes + edge cases like generics, lifetimes, async, modifiers)
- 14 end-to-end assertions: write source in 4 languages, capture
  hints, no-op pass, mutate one signature, detect drift, recapture
  acknowledges new baseline

Total smoke coverage now: 77 (existing) + 30 (new) = **107
assertions across 4 suites**. All clean up byte-for-byte.

## Bug found during build

Rust `->` return-type arrow was mis-parsed by the bracket-tracker:
the `>` decremented depth thinking it was closing a generic, so the
function-body `{` was never recognized at depth-0. One-line fix:
treat `->` as a single token before the `>` handler.

This kind of bug is exactly why I chose hand-rolled extractors over
tree-sitter — the test fixture caught it immediately, and the fix is
~3 lines anyone can reason about. Tree-sitter would have buried this
in the grammar's binding layer.

## Files touched (summary)

**New:**
- `packages/loom-spec/src/server/signatures/{index,python,typescript,rust,svelte}.ts`
- `packages/loom-spec/scripts/smoke-signatures.ts`
- `documentation/done/phase-7-signature-drift.md`

**Modified:**
- `packages/loom-spec/schema/{diagram,journey}.schema.json` — `signature_hint?` on CodeRef
- `packages/loom-spec/src/types/{diagram,journey}.ts` — regenerated
- `packages/loom-spec/src/server/drift.ts` — capture modes, journey traversal, new issue types
- `packages/loom-spec/src/cli/validate.ts` — formatter + capture flag wiring
- `packages/loom-spec/src/cli/index.ts` — `--capture` / `--recapture` flags + HELP
- `packages/loom-spec/src/mcp/server.ts` — `loom_validate` accepts `capture` param
- `packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md`
  AND `examples/todo-app/.claude/skills/loom-spec/SKILL.md` — signature workflow section
- `documentation/journeys.md` — drift section mentions signature_hint
- `documentation/{project-status,next-steps,handover}.md`
- `packages/loom-spec/package.json` — 0.7.0 → 0.8.0
