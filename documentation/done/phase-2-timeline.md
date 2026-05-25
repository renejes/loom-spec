# Phase 2 — Timeline view (v0.2.0 → v0.3.0)

> **⚠ Removed in v0.5.0.** Everything described below was real work
> that shipped, but the only confirmed user never opened the timeline
> view in practice. v0.5.0 stripped it all out to sharpen the product
> story and shrink the conceptual surface. See
> [`phase-4-timeline-removal.md`](./phase-4-timeline-removal.md) for
> the scope-down details and what got salvaged for the upcoming
> Journeys feature.
>
> This page stays as honest history. Pretending the timeline was never
> built would lose useful context — both for understanding why some
> code patterns exist (e.g. `PulseEdge`, `DiagramCanvas`
> `interactive=false` mode, the export-mode runtime detector) and for
> documenting that scope-downs are an acceptable move when an
> assumption doesn't pan out.

DAW-style timeline overlay on top of any diagram. Schema → renderer →
edit mode → playback → mini-graph with edge pulse → MCP tools →
OpenTelemetry trace import → +Add Event button → zoom + pan →
code-split.

## Substeps

| Step | Shipped in | What it added |
|---|---|---|
| 15a | v0.2.0 | Timeline schema + autogen types + example fixture (`todo-completion.timeline.json` with 6 events on 4 tracks) + validator |
| 15a+ | v0.2.0 | Schema extended with `code_refs`, `triggered_by`, `tags` on events (function-level granularity, causation chains, filtering) |
| 15b | v0.2.0 | Server routes (`GET`/`PUT /api/timelines`), URL hash routing (`#timeline:id`), `useTimelineState` hook, SVG TimelineCanvas with tracks + clips + time axis, TimelineInspector, switcher integration |
| 15c | v0.2.0 | Edit mode: drag clips horizontally (`start_ms`), vertically (track), resize the right edge (`duration_ms`), Delete key removes. Snap to 10ms grid. Debounced auto-save |
| 15d | v0.2.0 | TransportBar (play/pause/reset + speed selector), `setInterval(16ms)` playback loop, playhead vertical line, scrubbable axis, active clip glow when playhead is inside their interval. Keyboard: Space = play/pause, Home = reset |
| 15e | v0.2.0 | Side-by-side mini graph (DiagramCanvas in `interactive={false}` mode); `NodeCard` glows when an event on that node contains the playhead; new `PulseEdge` renders an SVG `<animateMotion>` marker traveling along edges whose source node is active. `pulsingEdgeIds` derived from `activeNodeIds` in `TimelineView`. fitView clamp lowered to `minZoom=0.05` so narrow mini-panes don't crop. Refs badge moved to bottom-right. |
| 15f | v0.2.0 | 5 MCP tools for timelines: `loom_list_timelines`, `loom_read_timeline`, `loom_add_event`, `loom_update_event`, `loom_delete_event`. `add_event` / `update_event` validate that the referenced node exists in the timeline's diagram before writing. `delete_event` scrubs dangling `triggered_by` references. Stdio smoke test (`scripts/smoke-mcp-timelines.ts`) covers all 5 tools end-to-end. SKILL.md gained a 6th example showing timeline authoring. |
| #22 | v0.3.0 | `+ Event` button in TransportBar opens an anchored node-picker (`AddEventMenu`); pick → creates event at the playhead (200ms long), auto-selects so drag/resize takes it from there. TransportBar gained an `actions` slot so TimelineView can hand it children without coupling. |
| #21 | v0.3.0 | Horizontal zoom (1× fit / 2× / 5× / 10× / 20×). `pixelsPerMs = (fitUsableW / totalMs) * zoom`; SVG grows past wrapper at zoom > 1, native overflow-x:auto handles pan; `pickTickStep` adapts to `totalMs / zoom`. Fixes the confetti compression in the demo fixture. |
| #20 | v0.3.0 | Lazy-loaded TimelineView via React.lazy + Suspense in `App.tsx`. Prod build now ships two chunks: main 513 kB (gz 161) + TimelineView 18 kB (gz 6). xyflow stays in main because the mini graph also uses DiagramCanvas — bigger savings would need a pure-SVG mini-renderer (backlog #26). |
| 15g | v0.3.0 | `loom-spec import-trace <trace.json> --as <id> --diagram <id>` CLI subcommand. Parses OTLP JSON via `src/server/otel.ts`, maps spans → nodes via `--map` overrides or a four-step heuristic (id-exact, id-substring-in-candidate, candidate-substring-in-label, candidate-substring-in-code-ref-path), preserves causation via `triggered_by`, supports `--append`. Smoke test (`scripts/smoke-import-trace.ts`) covers a 3-span OTLP trace against the todo-app fixture end-to-end. Docs at `documentation/import-trace.md`. |

## Original 15a–15g design notes

These were the planning sketches in the original `implementation-plan.md`
section 15. Implementations followed the plans with only minor tweaks.

### 15a — Schema, types, example, validator

`packages/loom-spec/schema/timeline.schema.json`. Top-level
`{ version, id, title, diagram, events, tracks? }`. Events have
`{ id, node, track?, start_ms, duration_ms, label?, description?, kind? }`.
Added a `LoomTimeline` TS type via `scripts/generate-types.ts`. Extended
`src/validate.ts` with a `validateTimeline` function on the same ajv 2020
instance. Added an example `examples/todo-app/.loom/timelines/todo-completion.timeline.json`
with the full mark-as-done flow.

### 15b — Read-only timeline view

URL hash variant `#timeline:<id>`. New `src/view/components/TimelineCanvas.tsx`.
SVG-based, NOT xyflow — different layout problem (1D time axis vs 2D
graph). Pure React + SVG kept it simple. Layout: horizontal time axis
with tick marks; vertical tracks auto-distributed from `event.track`;
clips as rounded rectangles colored by node type. Hover shows label +
start/duration tooltip.

### 15c — Edit mode

Drag clip horizontally → `start_ms`. Drag right edge → `duration_ms`.
Drag vertically across tracks → `track`. Delete key on selected clip →
remove. Snap to 10ms grid. Debounced auto-save (500ms).

### 15d — Playback

Global state `{ playing, position_ms, speed: 1 | 0.25 | 0.5 | 2 | 4 }`.
`setInterval(16ms)` loop while playing — **NOT** `requestAnimationFrame`
(rAF gets throttled to ≈0 in iframes / background tabs, which broke
playback verification). Top-bar controls + Space/Home/arrow keyboard
shortcuts.

### 15e — Side-by-side mini graph + edge pulse

`TimelineView` 60/40 split (Timeline | MiniGraph). MiniGraph reuses
`DiagramCanvas` in non-interactive mode with new `interactive`,
`activeNodeIds`, `pulsingEdgeIds` props. New `PulseEdge` custom edge
type — same quadratic-bezier path math as `ParallelEdge`, plus a
small `<circle>` with SVG `<animateMotion>` along the path.

### 15f — MCP tools

5 tools matching the diagram tool pattern. `add_event` /
`update_event` cross-check referenced node exists in the diagram
(otherwise typos produce dead clips). `delete_event` scrubs dangling
`triggered_by` references.

### 15g — OpenTelemetry trace import

`loom-spec import-trace`. Parses OTLP JSON (the standard
`resourceSpans[].scopeSpans[].spans[]` shape). Earliest span start
becomes `t = 0`; relative `start_ms`/`duration_ms`. Span/service
heuristic maps to nodes (overridable via `--map mapping.json`).
Causation preserved via `triggered_by`.

## Subsequent polish (#22, #21, #20)

### #22 — `+ Event` button

Last reason to drop into JSON for "add a clip" gone. Button in
TransportBar opens anchored node-picker; pick creates event at
playhead, 200ms long, on the picked node, auto-selected.

### #21 — Horizontal zoom

`1× (fit) / 2× / 5× / 10× / 20×` dropdown. SVG grows past wrapper at
zoom > 1; native `overflow-x:auto` handles pan. Tick density adapts.
Fixes the confetti-tail compression in the demo fixture.

### #20 — Code-split timeline view

`React.lazy(() => import("./components/TimelineView"))` in `App.tsx`.
Production build emits a separate `TimelineView-*.js` chunk
(18 kB / gz 6 kB). Savings are modest (~14 kB raw) because xyflow
stays in main — but the timeline-specific UI no longer loads for
diagram-only sessions. Bigger drop would need pure-SVG mini-renderer
(backlog #26).
