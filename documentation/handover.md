# Handover prompt — continue after v0.8.1 release

Copy everything in the fenced block below into a fresh Claude Code chat in the project root. It briefs the assistant on context, current state, conventions, and what's next.

---

````
I'm continuing work on `loom-spec`, an open-source spec-as-code tool
that keeps a node-based architecture spec inside the repo. You're
picking up after v0.8.1 — a bug-fix release that actually delivers
the Phase 7+8 features which v0.8.0 fumbled at publish time (stale
`dist/` shipped to npm, see `done/phase-9-publish-fix.md`). The
underlying features (signature drift, edge vocabulary) are
correctly v0.8.0-vintage work — read those archives for the
substance. Read the briefing below, then read the five docs in
order, then propose what to do next.

## What loom-spec is (30 seconds)

A node-based architecture spec that lives in a repo. File kinds:

- `.loom/diagrams/*.flow.json` — graph of nodes (components / services /
  data stores) and edges. One per subsystem; drill-down between them.
- `.loom/journeys/*.journey.json` — ordered, untimed walkthroughs of a
  diagram. Each step references a node; the viewer renders a
  step-navigator with the current node glowing and non-journey nodes
  dimmed.
- `.loom/exports.json` (optional) — named export bundles for the HTML
  exporter (include/exclude tags, single-diagram mode, from-journey,
  etc.).

The tool is a spec layer, NOT an execution layer. Nodes describe.
The bet: keep the spec in the repo, edited by humans (browser-based
editor) AND AI agents (via JSON directly OR via the MCP server we
ship — 19 tools, 11 for diagrams + 8 for journeys). Drift detection
catches when `code_refs` point at code that no longer exists.
Standalone HTML export embeds the same viewer into manuals / wikis /
docs sites with tag-based filtering for public vs internal, and
`--from-journey` for focused walkthrough exports that open at the
journey by default.

## What v0.8.0 changed (critical context)

v0.8.0 added two related drift-detection features:

**Phase 7 — signature drift** for Python, TS/JSX, Rust, Svelte.
Closes the gap that the existence check left open: if a function's
contract changes but the symbol name stays the same, the spec is
silently stale. Now `loom-spec validate` catches it.

**Phase 8 — edge property vocabulary**. Optional `edge_types`
declaration in `node-types.json` lets a project type its edge
properties (`sync: boolean`, `retry_policy: enum`, etc.). Validate
warns on undeclared keys, wrong types, invalid enums. Solves the
"three months later I've forgotten what I called this property"
drift inside the spec itself.

Mechanics:
- `code_refs[].signature_hint` (optional string) captures the
  canonical declaration line: `def parse_pdf(file_path: str) -> dict:`.
- `loom-spec validate --capture` fills missing hints. `--recapture`
  overwrites all hints (acknowledge current state as new baseline).
- Default `validate` is read-only and exits non-zero on drift.
- `loom_validate` MCP tool accepts `capture: "capture" | "recapture" | "none"`.
- Validate also now walks journey step refs (the v0.6.0 docs claimed
  this but it was a lie — fixed in v0.8.0).
- Other languages (Go, Java, etc.) skip the signature check
  silently; backlog #25 documents the path for adding more.

Implementation: regex+state-machine extractors per language, no
tree-sitter dep. Trade-off discussed in the Phase 7 archive — the
short version is "agents review warnings with more context than any
heuristic provides; false-positive bias beats silent breakage."

## What v0.7.0 changed (critical context — still relevant)

v0.7.0 was a small quality-of-life round triggered by real-world
feedback. Four concrete pain points; that release fixed three and
punted the fourth (which became Phase 7):

- **Auto-layout for new nodes** (`src/layout.ts`). `loom_add_node`
  without a position now picks a non-overlapping spot to the right
  of existing nodes. Same heuristic powers the browser editor's
  +Add button. Explicit positions still win.
- **Edge `properties` field**. Free-form object on edges for
  project-specific architectural attributes (sync/async, retry
  policy, timeout). Deliberately *not* a named enum — the v0.5.0
  timeline removal is the cautionary tale against locking in
  vocabulary too early.
- **New `loom_update_edge` MCP tool** so agents can change edge
  properties without delete+re-add (which would lose the edge id).
- **Granularity patterns** section in SKILL.md — three concrete
  patterns (sidecar, multi-stage pipeline, adapter) for the "how
  many nodes per file" question.
- **`.loom/README.md` template rewrite** for cold-reader
  onboarding.

**Note**: backlog #21 (signature-fingerprint) was the one we deferred
from Phase 6; it then shipped in Phase 7 because the author's stated
goal — "spec stays up-to-date, agent can't miss staleness" — made it
the highest-leverage thing to build next. Pragmatic regex approach
landed in ~10 h, not the multi-week project I originally feared.

## What v0.6.0 changed (critical context — still relevant)

v0.6.0 added Phase 5 — Journeys. The work shipped in four slices
plus a docs/skill/version slice:

1. Schema + types + validator + Hono routes + example fixture.
2. 8 MCP tools (`loom_create_journey`, `loom_add_step`, etc.) + a
   stdio smoke test that exercises every tool against a tmpfs copy
   of the todo-app fixture (29 assertions).
3. Read-only browser viewer with switcher integration. Pick a journey
   from the dropdown → the diagram canvas narrows: current node
   glows, prior steps subtly outlined, non-journey nodes fade to ~28%
   opacity (hover restores). Pulse marker travels the edge between
   the previous and current step. Collapsible step sidebar (default
   closed) shows step titles/descriptions/code-refs. Keyboard:
   ←/→/Home/End.
4. HTML export with `--from-journey <id>`: scopes to the journey's
   diagram + nodes, embeds only that journey, writes a `defaultView`
   hint so the standalone HTML opens at `#journey:<id>` by default.
   Tag filters compose on top (step pruning under conflict).

Deliberate non-additions in this phase:
- **No in-browser Journey editor.** Authoring goes through MCP. If
  the lack of a `+ Step` button in the StepBar starts to hurt during
  real-world use, that's backlog item #20 — see `next-steps.md`.
- The dimming treatment for non-journey nodes is new compared to the
  original plan-doc; we added it because the plan-doc default of
  "non-journey nodes stay at full opacity" didn't address the "alle
  Nodes und Edges sind zu viel" pain that motivated the feature.

## Where it stands right now

- **`loom-spec@0.8.1`** is the latest on npm. (v0.8.0 was broken on publish — Phase 9.)
- Real-world adoption confirmed (the author uses it on a separate
  project; the diagram editor + MCP tools + drift detection + export
  + signature-fingerprint workflow all see real use. Journey use is
  light so far).
- Repo: https://github.com/renejes/loom-spec
- Working directory: `/Users/renejesser/Desktop/Programming - Projekte/graphical-programming`
- pnpm workspace; the package lives in `packages/loom-spec/`.

## The leading candidates for this session

There's no active line of work right now. Pick from the backlog
based on real pain, or wait for it. Top candidates:

- **In-browser Journey editor** (#20) — only worth it if you've
  actually felt friction authoring via MCP. The Phase 5 archive
  explains why we deliberately deferred this.
- **Pure-SVG mini-renderer** (#26) — drops ~150 kB from the export
  bundle by replacing xyflow in the read-only paths (Journey + HTML
  export). Particularly impactful now that JourneyView is the second
  read-only consumer.
- **Wait for real-world friction** — Phase 4's lesson: don't ship
  features speculatively. If nothing is hurting, the highest-value
  move might be to use the tool more and let pain surface.

## What you should read in (in this order)

1. `documentation/project-status.md` — current state, what works,
   how it's wired together. **Most important read.**
2. `documentation/next-steps.md` — open backlog with priorities.
3. `documentation/done/phase-7-signature-drift.md` and
   `phase-8-edge-vocabulary.md` — the most recent shipped work,
   both in v0.8.0. Phase 7 explains the signature-drift extractors
   and why regex over tree-sitter. Phase 8 explains why edge_types
   went into node-types.json instead of a separate file.
4. `documentation/journeys.md` — user-facing feature doc for the
   v0.6.0 Journeys addition. Understand what Journeys are and aren't.
5. `documentation/done/phase-4-timeline-removal.md` — the v0.5.0
   scope-down reasoning. The "don't hoard features" principle that
   governs everything else here.
6. Skim `packages/loom-spec/src/view/components/JourneyView.tsx`
   and `packages/loom-spec/src/view/useJourneyState.ts` if you'll
   touch the journey UI.
7. Skim `packages/loom-spec/src/cli/exportHtml.ts` and
   `packages/loom-spec/src/server/exportFilter.ts` if you'll touch
   the export pipeline (the `--from-journey` cascade lives there).

## Conventions and watch-outs

- **pnpm**, not npm. `pnpm --filter loom-spec <script>` to run
  anything package-scoped.
- **Schema-first**: TypeScript types are autogenerated from
  `packages/loom-spec/schema/*.schema.json` via
  `pnpm --filter loom-spec generate-types`. Don't hand-edit
  `src/types/*.ts`. Three schemas now: diagram, node-types, journey.
- **Validation everywhere**: server PUTs validate against the
  schema before writing. Journeys additionally cross-check that the
  referenced diagram exists and every `step.node` resolves. Client-
  side validation runs on every diagram edit. Drift check walks
  `code_refs` on nodes AND on journey steps. MCP tools cross-check
  referential integrity before write.
- **The view's URL-hash router**: `useViewState()` parses
  `location.hash` like `#diagram:overview` or `#journey:checkout`.
  Empty hash → `diagram:overview` by default, *unless* the standalone
  HTML was built with `--from-journey` (then `ExportData.defaultView`
  kicks in and lands the reader directly in the journey).
- **Export mode is runtime-detected** via `window.__LOOM_DATA__`.
  Any new loader / state hook MUST short-circuit when
  `isExportMode()` returns true (look at how `state.ts` /
  `useJourneyState.ts` / `loadJourney.ts` do it).
- **`String.replace` second-arg gotcha**: passing a STRING that
  contains `$$` corrupts the output (`$$` → `$`). Always pass a
  FUNCTION when the replacement contains arbitrary content (e.g.
  inlining a JS bundle). See the comment in
  `src/cli/exportHtml.ts` `buildHtml()` for the war story.
- **Naming**: avoid `Event` / `Step` as top-level TS type names
  (DOM `Event` shadowing). Use `JourneyStep` (already in
  `src/types/journey.ts`).
- **xyflow fitView clamps to minZoom**. For read-only embeds, we
  override `minZoom: 0.05` so narrow panes don't get cropped.
- **Diff stability**: server writes JSON with
  `JSON.stringify(data, null, 2) + "\n"` and self-write
  suppression (1.5s). Don't break this.
- **The Phase 4 mindset still matters**: if a feature isn't earning
  its keep, removing it is acceptable and encouraged. We did it
  to ~30% of the codebase in v0.5.0. The same scrutiny applies to
  Journeys themselves if they don't pull their weight in real-world
  use.

## Tooling notes

- Preview tool can render the dev UI and run JS in it. Dev server
  config at `.claude/launch.json`. Use the `loom-spec-view` config —
  it runs `pnpm --filter loom-spec dev` which boots both Hono
  (port 7778) and Vite (port 7777 with proxy to 7778). There's also
  `loom-export-verify` which serves `/tmp/loom-export-verify/` via
  Python http.server on 8765 for testing exported HTML files.
- Example fixture at `examples/todo-app/.loom/`. 2 diagrams + 1
  journey (`complete-a-todo`). Drift findings on the example are
  expected (it's a docs fixture, not real code).
- `pnpm --filter loom-spec typecheck` and
  `pnpm --filter loom-spec validate-examples` are both fast (~1s).
  Run them after changes.
- Smoke tests:
  - `packages/loom-spec/scripts/smoke-export-html.ts` (35 assertions,
    includes `--from-journey` cases)
  - `packages/loom-spec/scripts/smoke-mcp-journeys.ts` (29 assertions,
    spawns the MCP server and exercises all 8 journey tools)
  - `packages/loom-spec/scripts/smoke-mcp-diagrams.ts` (13 assertions,
    covers auto-layout + edge properties + `loom_update_edge`)
  - `packages/loom-spec/scripts/smoke-signatures.ts` (30 assertions,
    extractor units + e2e capture/drift/recapture across 4 languages)
  - `packages/loom-spec/scripts/smoke-edge-vocab.ts` (11 assertions,
    edge property validation unit + e2e)
  All five clean up byte-for-byte. Run them after changes that touch
  the export pipeline, the MCP server, the signatures module, or the
  edge-property validator.
- npm publishing: account has `auth-and-writes` 2FA. The reliable
  flow is `npm logout && npm login` (browser passkey) then
  `npm publish` (interactive OTP). If the token in `~/.npmrc` ever
  goes stale, `npm publish` will report E404 — that's actually
  E401 in disguise; re-login fixes it.
- **`prepublishOnly` and `check-dist` are now in place** — `npm publish`
  automatically runs `pnpm run build && pnpm run check-dist` first.
  You don't need to manually build before publishing anymore (and
  shouldn't try — `check-dist` will refuse to ship a stale tarball).
  If `check-dist` fails: read the error, fix the cause, retry.

## What I want from you on turn 1

1. Confirm you've read the five docs.
2. If you have an opinion on what to work on, share it — push back
   on anything I'm proposing if you have a better idea.
3. If we agree there's no concrete pain to chase, propose nothing
   and wait. The phase-4 lesson applies: better to under-build than
   to over-build.

Tone: opinionated, honest about trade-offs, push back when I'm
wrong. The project has a track record of cutting/postponing
features that don't earn their keep: v0.5.0 removed the timeline
view entirely; v0.6.0's Phase 5 shipped journeys as read-only-first
(no editor UI); v0.7.0's Phase 6 deferred signature-fingerprint
behind real pain (which then triggered in Phase 7's v0.8.0). Apply
the same scrutiny going forward.

Working directory is
`/Users/renejesser/Desktop/Programming - Projekte/graphical-programming`.
Start by reading the five docs.
````

---

## How to use this

1. Open a new Claude Code chat in the project working directory.
2. Paste the entire fenced block above as your first message.
3. The assistant should read the five docs, then come back with
   questions or a plan. Confirm and proceed.

If the assistant skips the reading step or starts coding
immediately, push back — the briefing makes clear that reading and
confirming the plan comes first.
