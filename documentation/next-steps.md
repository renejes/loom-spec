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

Larger pieces of work, not blocking initial release:

15. **Timeline view.** The DAW-edit-view mental model from the original brief. Same data model, different render: horizontal time axis, tracks per node, "clips" of activity for events and signals. Probably its own schema (`*.timeline.json`) referencing existing node IDs.
16. **MCP server.** Wrap the file ops in a Model Context Protocol server so any MCP-capable agent (Claude Code, Codex, others) can call high-level operations (`add_node`, `find_orphans`, `validate`, `verify_code_refs`) instead of just editing JSON.
17. **Automated drift detection.** Walk every `code_refs`, verify the file exists and (where given) the symbol still resolves. Flag stale ones automatically. Could run as a pre-commit hook or via `loom-spec validate`.
18. **Custom-type fields beyond primitives.** Right now `array` is a flat list of primitives. Real custom types may want nested objects, multi-value refs, etc. Decide when to extend the field-type vocabulary vs. push complexity into separate diagrams.
19. **Cross-tool skill discovery.** Currently we only place the skill at `.claude/skills/loom-spec/`. If Codex/Cursor/others adopt different conventions, add `--agent=codex` style flags to `init`.
20. **`loom-spec init --upgrade`.** Bump existing repos to a newer schema version when the schema changes. Needs a migration path.
21. **Read-only "share" mode.** A flag that disables editing so the tool can be used as a static viewer (e.g., in a docs site).

## Suggested order

If picking up where we left off:

- First the v1.0 blockers (1 → 4), in order.
- Then UX gaps in priority order: 5 (groups) → 6, 7 (drill-down + switcher) → 8, 9 (polish).
- Quality polish (10 → 14) when there's appetite.
- Phase 2 items are independent — pick whichever creates the most leverage. Timeline view (15) is the most novel and the most likely differentiator.
