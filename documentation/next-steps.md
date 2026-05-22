# Next Steps

Forward-looking task list. For implementation detail, see [implementation-plan.md](./implementation-plan.md). For where the project stands, see [project-status.md](./project-status.md).

## Active line of work

Phase 2 (timeline view) is complete end-to-end — schema → renderer → edit
mode → playback → mini graph → MCP tools → OTel import. The next push
should land **release v0.3.0** to npm bundling everything since 0.2.0
(items #22, #21, #20, 15g), then pick from the backlog below by what
real-world use surfaces as the next pain.

## Phase 2 backlog (still open)

Independent of each other; pick by next pain.

23. **Editable timeline inspector.** The TimelineInspector is read-only today;
    clip details are editable via drag/resize, +Add Event button (since #22),
    or hand-editing JSON. Field-level editing (label, kind, description,
    code_refs, tags, triggered_by) would round it out and remove the last
    reason to drop into JSON for timeline work.

24. **Planned-vs-observed diff view.** With `import-trace` shipped, the
    natural next step is letting the editor render an imported timeline
    on top of a hand-authored one for the same diagram — same horizontal
    axis, different opacity per source. Makes regression / drift between
    "what we said the system does" and "what it actually does" visible.

25. **Sticky track labels at high zoom.** With #21 shipped, scrolling
    horizontally at zoom ≥ 2× pushes the LABEL_COL out of view. Re-render
    the label column as a sticky overlay (or split the SVG into two
    elements) so users keep context while panning.

16. **Custom-type fields beyond primitives.** `array` is a flat list of
    primitives. Real custom types may want nested objects, multi-value refs,
    etc. Decide when to extend the field-type vocabulary vs. push complexity
    into separate diagrams.

17. **Cross-tool skill discovery.** Currently we only place the skill at
    `.claude/skills/loom-spec/`. If Codex / Cursor / others adopt different
    conventions, add `--agent=codex` style flags to `init`.

18. **`loom-spec init --upgrade`.** Bump existing repos to a newer schema
    version when the schema changes. Needs a migration path.

19. **Read-only "share" mode.** A flag that disables editing so the tool can
    be used as a static viewer (e.g. in a docs site).

26. **Pure-SVG mini graph (vs. xyflow reuse).** Code-splitting (#20) only
    saves ~14 kB today because xyflow stays in the main bundle — both the
    full diagram view and the mini graph use it. A hand-rolled SVG
    mini-renderer that takes positioned nodes + edges and renders them
    statically would let xyflow leave the timeline chunk entirely, dropping
    the initial timeline-load payload by ~150 kB.

27. **OTLP protobuf + Jaeger/Zipkin trace formats.** `import-trace` currently
    handles OTLP JSON only. Adding `otel-proto-converter` or supporting
    Jaeger / Zipkin export shapes would let users pipe in raw exporter
    output without preprocessing.

## Shipped (v0.1.0 → v0.2.0 → unreleased)

Captured here so the docs don't claim "todo" for things that are done. See
[project-status.md](./project-status.md) for the full breakdown.

**v0.1.0–v0.1.1** (Phase 1 — items 1–14 of the original plan)
- bootstrap, schema, types, viewer, server, edit mode, live sync, groups,
  drill-down, switcher, prod build, parallel edges, repo polish, SSE
  reconnect, code-refs/tags editing, watcher resilience, ports in UI,
  inline validation, drift detection CLI, MCP server, SKILL.md examples,
  code-refs badge.
- v0.1.0 published; v0.1.1 added `init --mcp` + `install-mcp` for
  auto-registration.

**v0.2.0** (Phase 2 — timeline view core)
- 15a / 15a+: schema + types + example + validator; `code_refs`,
  `triggered_by`, `tags` on events.
- 15b: read-only renderer (URL hash routing, SVG canvas, switcher entry).
- 15c: edit mode (drag start / track, resize duration, delete, snap-to-10ms,
  debounced auto-save).
- 15d: playback (TransportBar, `setInterval(16ms)` loop, scrubbable axis,
  active-clip glow, keyboard).
- 15e: side-by-side mini graph + edge pulse (NodeCard glow,
  `PulseEdge`/`<animateMotion>`, mini graph in DiagramCanvas
  `interactive={false}` mode).
- 15f: 5 timeline MCP tools (`loom_list_timelines`, `loom_read_timeline`,
  `loom_add_event`, `loom_update_event`, `loom_delete_event`) with
  node-existence cross-check + stdio smoke test.

**Unreleased on `main` (target v0.3.0)**
- #22: `+ Event` button in TransportBar with anchored node-picker; creates
  event at playhead, auto-selects.
- #21: Horizontal timeline zoom (1× fit / 2× / 5× / 10× / 20×) with native
  overflow scrolling and adaptive tick density.
- #20: Lazy-loaded TimelineView via React.lazy + Suspense; production build
  now ships a 18 kB timeline chunk separate from the 513 kB main chunk.
- 15g: `loom-spec import-trace` CLI subcommand — OTLP JSON → timeline,
  span/service heuristic mapping with optional `--map` override file,
  `--append`, smoke test, `documentation/import-trace.md`.
