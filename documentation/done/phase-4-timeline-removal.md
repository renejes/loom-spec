# Phase 4 — Timeline removal (v0.5.0)

Deliberate scope-down. The timeline view, the OpenTelemetry trace
importer, and all 5 timeline-related MCP tools were **removed** in
v0.5.0 because the only confirmed user didn't actually use them, and
the conceptual surface they added (events, tracks, transport, mini
graph, edge pulse, OTel parser, span-to-node mapping) raised the
adoption barrier without delivering for the use cases people actually
care about.

This file documents what went away and why. The full per-step history
of how the timeline was built across v0.2.0 → v0.3.0 is preserved in
[`phase-2-timeline.md`](./phase-2-timeline.md) — those substeps were
real work that shipped and then got rolled back; the archive stands
as honest history, not pretending it never happened.

## What was removed

| Area | Files / surface |
|---|---|
| Schema | `packages/loom-spec/schema/timeline.schema.json` |
| Types | `packages/loom-spec/src/types/timeline.ts` (autogen) |
| Validator | `validateTimeline` + loader in `src/validate.ts` |
| Server routes | `GET`/`PUT /api/timelines/...` in `src/server/app.ts`; SSE `timeline-changed` event type in `src/server/watch.ts`; chokidar watch on `timelines/` |
| File ops | `listTimelines`, `readTimeline`, `writeTimeline`, `TimelineSummary` in `src/server/fileOps.ts` |
| Export filter | Timeline cascade rules (drop-events-on-dropped-nodes, drop-empty-timelines, scrub-triggered-by) in `src/server/exportFilter.ts`; `LoomExportPayload.timelines` field |
| Export config | `no-timelines` field in `.loom/exports.json` schema; `--no-timelines` CLI flag |
| View | `TimelineView.tsx`, `TimelineCanvas.tsx`, `TimelineInspector.tsx`, `TransportBar.tsx`, `AddEventMenu.tsx`, `useTimelineState.ts`, `useTimelinesList.ts` |
| View state | `kind: "timeline"` from `ViewState`; `#timeline:<id>` URL routing |
| Lazy loading | `React.lazy(TimelineView)` in `App.tsx` — code-split chunk no longer needed; single chunk again |
| Top bar | "Timelines" section in `DiagramSwitcher`; the switcher's `currentKind` prop |
| CSS | All `.timeline-*`, `.transport-*` rules in `src/view/styles.css` |
| MCP | 5 tools: `loom_list_timelines`, `loom_read_timeline`, `loom_add_event`, `loom_update_event`, `loom_delete_event` |
| Trace import | `src/cli/importTrace.ts`, `src/server/otel.ts`, `loom-spec import-trace` subcommand, OTLP-JSON parser, span→node heuristic, `--map` / `--append` flags |
| Smoke tests | `scripts/smoke-mcp-timelines.ts`, `scripts/smoke-import-trace.ts` |
| Docs | `documentation/import-trace.md` |
| Skill | Example 6 ("document a sequence as a timeline") from `SKILL.md` + preferred-tools entries for the 5 timeline tools |
| Fixture | `examples/todo-app/.loom/timelines/todo-completion.timeline.json` and its parent directory |

## What was kept (repurposed for Journeys)

- **`src/view/components/PulseEdge.tsx`** — the SVG-animation edge that
  shows a small marker traveling along a path. Built for the timeline
  mini-graph's "edge pulse while source node active" effect; now lives
  on for Journey step-to-step transitions.
- **`DiagramCanvas` non-interactive mode** with `activeNodeIds` and
  `pulsingEdgeIds` props. Originally added for the timeline mini graph;
  reused for the Journey current-step highlight and visited-path
  visualisation. Comments updated to reflect the generic use case.
- **The `interactive=false` plumbing through `DiagramView`,
  `NodeCard`, `Inspector`** — independent of timelines, kept for the
  HTML export and (forthcoming) the Journey view.

## Bundle-size effect

- v0.4.0 npm tarball: 404 kB (with both `dist/view/` and `dist/view-export/`).
- v0.5.0 npm tarball: smaller — the timeline-specific UI (~80–100 kB
  raw, ~30 kB gzipped) is gone from both builds.
- Exact numbers verified at publish time.

## Migration / breaking change

This is a major breaking change in semver terms (removed published
features). Since the package is <1.0, the v0.5.0 bump is sufficient,
but the release notes call it out explicitly.

For users who had created `.timeline.json` files under
`.loom/timelines/`: those files are no longer read by anything in
v0.5.0+. The files themselves are harmless (loom-spec ignores them),
but they're also useless. If the data is precious, consider
hand-converting it to a Journey when that feature lands
([`journeys-plan.md`](../journeys-plan.md)).

## Why this was the right call

1. **The only confirmed user didn't use it.** Architectural-playback-
   as-a-DAW was a cool technical idea; in practice nobody opened the
   timeline view. The OTel import had even thinner demand.
2. **Conceptual surface drop.** Before: diagrams + node-types +
   timelines + events + tracks + tags + exports. After: diagrams +
   node-types + tags + exports + (planned) journeys. That's roughly
   30% less vocabulary for a new adopter to learn.
3. **Pitch sharpens.** "Architecture spec + DAW playback + trace
   import + export + agent skill" was muddled. "Agent-readable
   architecture spec with guided walkthroughs of your workflows,
   exportable as interactive HTML" is one sentence.
4. **Sunk cost isn't a reason to keep things.** Maintaining unused
   features (smoke tests, docs, schemas, multiple MCP tools) has
   ongoing carrying cost.
5. **The valuable bits stayed.** PulseEdge, the mini-graph
   `activeNodeIds` plumbing — they had real value for Journeys, just
   not for timelines. Same code, better fit.
