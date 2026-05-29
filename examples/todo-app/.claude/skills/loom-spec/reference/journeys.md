# loom-spec — Documenting workflows with Journeys

A **Journey** (`.loom/journeys/<id>.journey.json`) is an ordered list of
steps, each tied to a node in a diagram. The viewer renders it as a
step-navigator (prev/next, current step glows, prior steps subtly
highlighted, non-journey nodes dimmed). Exportable via
`loom-spec export-html --from-journey <id>` as a focused walkthrough HTML.

See examples.md §7 for an end-to-end authoring walkthrough.

## Contents
- Journey vs. Tags (the decision)
- Out of scope
- Composing with tags
- Don'ts

---

## Journey vs. Tags

**Default to a Journey when the user says:** "user journey", "customer
journey", "workflow", "step-by-step", "onboarding", "tour", "guided
walkthrough", "deploy runbook", or describes an *ordered sequence of steps*
through the architecture.

**Default to Tags when the user says:** "the auth nodes", "everything in the
billing subsystem", "the public surface" — i.e. wants to mark a *set* of
nodes with no sequence implied.

The difference is **order**. Tags express membership; Journeys express
sequence. If the order in which the reader visits the nodes matters, it's a
Journey.

## Out of scope

If the user wants something **time-based** (latency measurements, perf
regression replay, OpenTelemetry traces), loom-spec doesn't ship that
anymore (removed in v0.5.0). Capture the static topology as a Journey
instead and note the timing gap.

## Composing with tags

A Journey can include nodes that are also tagged `public`, and an export
bundle can apply tag filters on top of a journey. When both shape the same
export, the cascade is: tag filter narrows nodes → journey scope narrows
further → any journey step whose node was dropped gets removed (and if all
steps go, the journey is dropped — the export fails rather than ship a
broken walkthrough).

## Don'ts

- Don't create a Journey for a sequence that's < 3 steps — the reader can
  take in the static diagram. Journeys carry overhead (separate file,
  step-by-step UI) only worth it when the walkthrough adds value over the
  plain view.
- Don't put `code_refs` on a Journey step that duplicate the underlying
  node's `code_refs` — step-level refs are for *narrowing focus* to a
  specific symbol within the node's code, not restating what the node says.
- Don't reuse step `id`s across journeys to mean different things — the
  system doesn't enforce uniqueness across journeys, but consistent ids
  (e.g. `click-pay` across all checkout-flavoured journeys) make diffs and
  refactors readable.
- Don't `loom_delete_journey` to "tidy up" — journeys are documentation
  artefacts that often have value as history. Rename or archive instead.
