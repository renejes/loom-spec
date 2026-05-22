# Handover prompt — continue after Phase 2 completion

Copy everything in the fenced block below into a fresh Claude Code chat in the project root. It briefs the assistant on context, current state, conventions, and what's likely next.

---

````
I'm continuing work on `loom-spec`, an open-source spec-as-code tool that
keeps a node-based architecture spec inside the repo. You're picking up
after Phase 2 wrapped. Read the briefing below, then read three docs in
order, then propose what to do next.

## What loom-spec is (30 seconds)

A node-based architecture spec that lives in a repo. Two file kinds
describe an app:

- `.loom/diagrams/*.flow.json` — graph of nodes (components / services /
  data stores) and edges (request / event / data-write / …). One per
  subsystem; drill-down navigation between them.
- `.loom/timelines/*.timeline.json` — overlays one diagram with a sequence
  of timed events. Each event references a node id in the diagram and has
  `start_ms`, `duration_ms`, optional `code_refs`, `triggered_by`, `tags`,
  `kind`.

The tool is a spec layer, NOT an execution layer. Nodes describe, they
don't run. The bet: keep the spec in the repo, edited by humans (in a
browser-based node editor + DAW-style timeline editor) and AI agents
(directly via JSON or via the MCP server we ship). Drift detection
catches when `code_refs` point at code that no longer exists.

## Where it stands right now

- **`loom-spec@0.2.0`** is the latest on npm; a v0.3.0 release is queued
  on `main` covering #22, #21, #20, and 15g.
- Repo: https://github.com/renejes/loom-spec
- Working directory: `/Users/renejesser/Desktop/Programming - Projekte/graphical-programming`
- pnpm workspace; the package lives in `packages/loom-spec/`.
- **Phase 1 fully shipped** (editor for diagrams, MCP server with 10
  tools, drift validator, init/install-mcp commands, full docs + npm
  package + GitHub releases).
- **Phase 2 fully shipped** (15a–15g + backlog #20 / #21 / #22). Timeline
  view has edit mode, playback, side-by-side mini graph with edge pulse,
  5 MCP tools for agents, `+ Event` UI button, horizontal zoom, lazy
  loading, and OpenTelemetry trace import.

## What you should read in (in this order)

1. `documentation/project-status.md` — full picture of what works, the
   architecture, how it's wired together. **Most important read.**
2. `documentation/next-steps.md` — what's open. The "Phase 2 backlog"
   section is where the next pick should come from.
3. `documentation/import-trace.md` — context for the most recently added
   CLI subcommand; useful because the most natural Phase 3 ideas
   (planned-vs-observed diff, more trace formats) sit on top of it.
4. Skim `packages/loom-spec/src/view/components/TimelineView.tsx` and
   `packages/loom-spec/src/view/components/TransportBar.tsx` — the patterns
   established in 15c/15d/15e/15f/#22/#21 for state + UI in the timeline.
5. Skim `packages/loom-spec/src/cli/importTrace.ts` and
   `packages/loom-spec/src/server/otel.ts` — for any work that touches
   trace handling.

## Likely next directions

In rough order of value-per-effort:

- **Ship v0.3.0 to npm.** `main` has four merged features since the
  v0.2.0 publish. Bump version, build, publish, tag, GH release. Standard
  flow (the previous handover described the exact commands; user has an
  npm classic-token-free account so use `npm publish` interactively with
  OTP, or have them switch to "Authorization only" 2FA mode briefly).
- **#23 — Editable timeline inspector.** Today TimelineInspector is
  read-only; users edit clips via drag, resize, +Event button, or
  hand-editing JSON. Field-level editing (label, kind, description,
  code_refs, tags, triggered_by) would remove the last reason to drop
  into JSON for timeline work. Similar shape to the existing
  Inspector.tsx for nodes — copy that pattern. Estimated ~3-4 h.
- **#24 — Planned-vs-observed diff view.** With `import-trace` shipped,
  the natural next step is rendering an imported timeline on top of a
  hand-authored one for the same diagram — same horizontal axis,
  different visual treatment per source. Makes drift between "what we
  said" and "what actually happens" visible. Likely ~1 day.
- **#25 — Sticky track labels at high zoom.** With #21 shipped, scrolling
  horizontally at zoom ≥ 2× pushes the LABEL_COL out of view. Re-render
  the label column as a sticky overlay (or split the SVG into two
  elements). Easy UX win, ~2-3 h.
- **#26 — Pure-SVG mini graph.** Real bundle-size win — drop xyflow from
  the timeline path entirely by rendering a static positioned-nodes-and-
  edges SVG for the mini graph. Bigger refactor (~1 day) but unlocks
  meaningful savings (the code-split in #20 only saved 14 kB raw because
  xyflow stayed in main).
- **#27 — OTLP-protobuf / Jaeger / Zipkin trace formats.** Right now
  `import-trace` is OTLP JSON only. Adding adapters would let users
  import from raw exporter output without preprocessing. Per-format
  work, can ship one at a time.

## Conventions and watch-outs

- **pnpm**, not npm. `pnpm --filter loom-spec <script>` to run anything
  package-scoped.
- **Schema-first**: TypeScript types are autogenerated from
  `packages/loom-spec/schema/*.schema.json` via
  `pnpm --filter loom-spec generate-types`. Don't hand-edit
  `src/types/*.ts`.
- **Validation everywhere**: server PUTs validate against the schema
  before writing. Client-side validation runs on every diagram edit.
  Drift check (`loom-spec validate`) walks `code_refs`. MCP timeline
  tools additionally cross-check that the referenced `node` exists in
  the timeline's diagram. If you add a new file kind or field, update
  the schema first.
- **Animation**: use `setInterval(16)` for animation loops, NOT
  `requestAnimationFrame`. We learned the hard way that rAF is throttled
  to ≈0 in iframes / hidden tabs, which broke playback verification.
  setInterval keeps running and is visually indistinguishable at 60Hz.
- **The view's URL-hash router**: `useViewState()` parses `location.hash`
  like `#diagram:overview` or `#timeline:todo-completion`. Empty hash →
  `diagram:overview`. Pass `ViewState` (`{ kind, id }`) to `navigate()`
  to switch.
- **`TimelineEvent` and `TimelineTrack`** are the autogenerated type
  names (intentionally not `Event`/`Track` to avoid shadowing the global
  DOM `Event`).
- **Diff stability**: server writes JSON with `JSON.stringify(data, null, 2) + "\n"`
  and self-write suppression (1.5s) so the UI doesn't react to its own
  saves. Don't break this.
- **MCP server vs. HTTP server**: separate processes. The MCP server
  doesn't have access to the chokidar watcher — that's fine; MCP writes
  are external to the UI, so chokidar picks them up and the UI refetches
  via SSE.
- **TimelineView is lazy-loaded** (since #20). When adding a new top-
  level route or component that timeline depends on, double-check it
  doesn't pull anything new into the main bundle.
- **xyflow fitView clamps to minZoom**. For read-only embeds (mini
  graph), we override `minZoom: 0.05` so narrow panes don't get
  cropped. If you re-use DiagramCanvas in another context, check this.

## Tooling notes

- You have a Preview tool that can render the dev UI and run JS in it.
  The dev server config is at `.claude/launch.json`. Use the
  `loom-spec-view` config — it runs `pnpm --filter loom-spec dev` which
  boots both Hono (port 7778) and Vite (port 7777 with proxy to 7778).
- The example fixture lives at `examples/todo-app/.loom/`. It has 2
  diagrams (`overview`, `celebration-detail`) and 1 timeline
  (`todo-completion`). Pre-built fully-populated demo of every feature.
- `pnpm --filter loom-spec typecheck` and
  `pnpm --filter loom-spec validate-examples` are both fast (~1s) — run
  them after changes.
- Smoke tests live in `packages/loom-spec/scripts/`. Run via tsx:
  `pnpm --filter loom-spec exec tsx scripts/smoke-mcp-timelines.ts`
  or `…/scripts/smoke-import-trace.ts`. Both clean up after themselves
  byte-for-byte.
- Drift findings on the example are expected: the fixture references
  files like `src/server/routes/todos.ts` that don't exist (it's a docs
  fixture, not real code). That's fine.
- npm publishing: the account has `auth-and-writes` 2FA. Classic
  Automation tokens aren't available for newer accounts. Options:
  (a) user runs `npm publish` interactively, types OTP; (b) user
  temporarily switches 2FA mode to "Authorization only", publishes,
  switches back; (c) granular token with bypass-2FA checkbox if the UI
  offers it.

## What I want from you on turn 1

1. Confirm you've read the three docs.
2. Tell me which of the "Likely next directions" you think is highest-
   value. Push back if you disagree with my ordering. In particular, is
   the v0.3.0 release the right thing to do *first*, or should we
   bundle one more feature (e.g. #23) into the release?
3. Then propose a concrete plan for whatever you'd start. I'll confirm
   and we go.

Tone-wise I prefer: opinionated, honest about trade-offs, push back when
I'm wrong. We've been going fast — 25+ commits in the previous sessions.
Keep that pace.

Working directory is
`/Users/renejesser/Desktop/Programming - Projekte/graphical-programming`.
Start by reading the three docs.
````

---

## How to use this

1. Open a new Claude Code chat in the project working directory.
2. Paste the entire fenced block above as your first message.
3. The assistant should read the three docs, then come back with questions
   or a plan. Confirm and proceed.

If the assistant skips the reading step or starts coding immediately,
push back — the briefing makes clear that reading and confirming the plan
comes first.
