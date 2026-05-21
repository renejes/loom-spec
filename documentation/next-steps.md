# Next Steps

Open items, grouped by priority. Detailed implementation notes are in [implementation-plan.md](./implementation-plan.md).

## Blockers for v1.0 release

These need to be done before publishing to npm and recommending the tool to others.

1. **Verify the production build path.** `pnpm build` must produce a `dist/` containing both the server JS and the prebuilt SPA, and `loom-spec view` (without `--dev`) must serve everything from that bundle on a single port. Currently only the dev path is exercised.
2. **Reserve and publish to npm.** Check that `loom-spec` is free; otherwise pick a scoped name like `@loomspec/cli`. Publish `0.1.0`.
3. **End-to-end test the installed flow.** In a brand-new directory outside this repo: `npx loom-spec init`, then `npx loom-spec view`, then edit something, then quit. Must work without the workspace context.
4. **SSE reconnect on the client.** When the server restarts or the connection drops, `EventSource` should reconnect — by default it does, but we should verify and add a visible status if it stays broken.

## Important UX gaps

Functional but feel-incomplete:

5. **Render groups.** The schema and the example fixture both have groups; the canvas renderer ignores them. Groups should show as labeled background rectangles around their children.
6. **Drill-down navigation.** Nodes and groups have an optional `drill_down: "<diagram-id>"` field that does nothing yet. Clicking such a node should navigate to that diagram. Need a way to switch diagrams in the URL/top bar.
7. **Diagram switcher in the top bar.** Right now we hardcode `overview`. The view should fetch `/api/diagrams`, show a list, and let the user switch.
8. **Add Node menu doesn't overlap inspector.** Currently it pops out of the top bar and visually overlaps the inspector pane. Reposition or restructure.
9. **Parallel-edge label collision.** When two edges connect the same pair of nodes (e.g. read + write), their labels overlap. xyflow supports curve offsets — apply them.

## Quality polish

Things that aren't broken but should be sharper:

10. **Code-refs editing in the Inspector.** Currently read-only. Need at least add/remove + edit `path`, `symbol`, `lines` per ref.
11. **Tags editing.** Read-only; add a simple chip input.
12. **Inspector for edges that touches ports.** Edges can target `node-id:port-name`; the UI ignores ports completely. Render port handles where node types define them, and let users connect to specific ports.
13. **Validation feedback in the Inspector.** Show field-level errors when an edit would make the diagram invalid (instead of just rolling them up at save time).
14. **Server restart resilience for the watcher.** If `.loom/` is renamed or removed at runtime, the watcher errors out. Should degrade gracefully.

## Phase 2 — beyond the v1.0 cut

Larger pieces of work, not blocking initial release.

### 15. Timeline view (in progress)

The DAW-edit-view mental model from the original brief: same node universe, rendered along a horizontal time axis. Tracks per subsystem; "clips" per event with start/duration. **Plus** a play-mode with a moving playhead that highlights active nodes in real time and pulses signal edges in a side-by-side mini graph view. The combination of static-timing + animated-flow is what makes this distinct from any existing tool.

Broken into 7 incremental steps so each lands something demoable on its own:

| # | Step | Effort | What you have after |
|---|---|---|---|
| 15a | Schema + autogen types + example timeline + validator | 0.5d | `.timeline.json` format defined, validating end-to-end |
| 15b | Read-only Timeline View — clips on tracks, basic layout | 1.5d | Static visualization of a timeline file |
| 15c | Edit mode — drag clips, resize, add/delete via mouse | 1d | Authoring timelines from scratch in the UI |
| 15d | Playhead + Play/Pause/Scrub + node glow on active events | 1d | The DAW-style experience: hit play, watch active nodes light up in real time |
| 15e | Side-by-side mini graph view; pulse edges when source is active | 1d | The "signal travels through the modules" effect; turns the timeline into living docs |
| 15f | MCP tools (`loom_list_timelines`, `loom_add_event`, etc.) | 0.5d | Agents can author / update timelines too |
| 15g | (Optional) OpenTelemetry / log import — `loom-spec import-trace` | 1d | Compare planned vs. actual timing; performance regression detection |

Total: 6–7 days. Steps 15a→15e are the core DAW experience; 15f adds agent integration; 15g is the optional differentiator that turns this into a perf-regression tool.

### 16. Custom-type fields beyond primitives

Right now `array` is a flat list of primitives. Real custom types may want nested objects, multi-value refs, etc. Decide when to extend the field-type vocabulary vs. push complexity into separate diagrams.

### 17. Cross-tool skill discovery

Currently we only place the skill at `.claude/skills/loom-spec/`. If Codex/Cursor/others adopt different conventions, add `--agent=codex` style flags to `init`.

### 18. `loom-spec init --upgrade`

Bump existing repos to a newer schema version when the schema changes. Needs a migration path.

### 19. Read-only "share" mode

A flag that disables editing so the tool can be used as a static viewer (e.g., in a docs site).

## Status of items 1–14 (Phase 1)

All shipped in v0.1.0 and v0.1.1 on npm. Production build verified, MCP server wired, drift detection working, polish items closed.

## Suggested order from here

- Timeline view (15a → 15e in order); 15f and 15g whenever appropriate.
- The other Phase 2 items (16–19) are independent — pick by what real-world use surfaces as the next pain.
