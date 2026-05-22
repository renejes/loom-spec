# Next Steps

Forward-looking task list. For implementation detail, see [implementation-plan.md](./implementation-plan.md). For where the project stands, see [project-status.md](./project-status.md).

## Active line of work

### Timeline view (continued)

Steps 15a–15f are shipped (schema, read-only renderer, edit mode, playback, mini graph + edge pulse, MCP tools). The remaining piece is optional.

| # | Step | Effort | What you have after |
|---|---|---|---|
| 15g | (Optional) OpenTelemetry / log import — `loom-spec import-trace` | 1d | Generate timelines from real trace data; compare planned vs. actual |

## Phase 2 backlog (still open)

Independent of each other; pick by what real-world use surfaces as the next pain.

16. **Custom-type fields beyond primitives.** `array` is a flat list of primitives. Real custom types may want nested objects, multi-value refs, etc. Decide when to extend the field-type vocabulary vs. push complexity into separate diagrams.

17. **Cross-tool skill discovery.** Currently we only place the skill at `.claude/skills/loom-spec/`. If Codex / Cursor / others adopt different conventions, add `--agent=codex` style flags to `init`.

18. **`loom-spec init --upgrade`.** Bump existing repos to a newer schema version when the schema changes. Needs a migration path.

19. **Read-only "share" mode.** A flag that disables editing so the tool can be used as a static viewer (e.g., in a docs site).

20. **Bundle-size split.** The view JS bundle is ~506KB. Code-split the timeline view route so the diagram-only user doesn't pay for it.

21. **Timeline zoom + pan.** The example timeline (0–1865ms) compresses the early sequence (~65ms) into the first 3% because of the long confetti tail. Add zoom controls (1× / 2× / 5× / 10×), pan on drag, optional "fit selection" button.

22. **`+ Add Event` in timeline edit mode.** Step 15c shipped without UI for adding events — they're added by editing JSON. Provide a button that picks node + creates a default-sized clip at the end of the timeline, then opens the inspector for further edits.

23. **Editable timeline inspector.** The TimelineInspector is read-only today; clip details are editable only by drag/resize. Field-level editing (label, kind, description, code_refs, tags, triggered_by) would round it out.

## Shipped (v0.1.0 → v0.1.1)

Captured here so the docs don't claim "todo" for things that are done. See [project-status.md](./project-status.md) for the full breakdown.

- Phase 1 (items 1–14 of the original plan): bootstrap, schema, types, viewer, server, edit mode, live sync, groups, drill-down, switcher, prod build, parallel edges, repo polish, SSE reconnect, code-refs/tags editing, watcher resilience, ports in UI, inline validation, drift detection CLI, MCP server, SKILL.md examples, code-refs badge.
- v0.1.0 published; v0.1.1 added `init --mcp` + `install-mcp` for auto-registration.
- Timeline 15a (schema + types + example + validator).
- Timeline 15a+ (schema extended with `code_refs`, `triggered_by`, `tags`).
- Timeline 15b (read-only renderer).
- Timeline 15c (edit mode — drag / resize / delete).
- Timeline 15d (playback — transport bar + playhead + active clip glow + scrub + keyboard).
- Timeline 15e (side-by-side mini graph + edge pulse — `NodeCard` glow driven by `activeNodeIds`, new `PulseEdge` with `<animateMotion>`).
- Timeline 15f (5 MCP tools for timelines — `loom_list_timelines`, `loom_read_timeline`, `loom_add_event`, `loom_update_event`, `loom_delete_event`; node-existence cross-check; stdio smoke test).
