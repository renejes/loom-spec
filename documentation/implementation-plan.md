# Implementation Plan

Concrete plans for the open items in [next-steps.md](./next-steps.md). Each item lists the goal, the approach, the files touched, and a rough estimate.

---

## 1. Production build path

**Goal.** `pnpm build` produces a self-contained `dist/` such that `node dist/cli/index.js view` (or `npx loom-spec view`) serves the SPA + API on a single port without Vite.

**Approach.**
- `tsc -p tsconfig.json` already compiles the server + CLI + state to `dist/`.
- `vite build --config src/view/vite.config.ts` builds the SPA to `dist/view/` (already configured in `vite.config.ts` via `build.outDir`).
- `src/cli/view.ts` already passes `serveSpaFrom: resolve(here, "../view")` when `--dev` is false. Verify this resolves to `dist/view/` after build.
- Ensure `dist/cli/index.js` has the `#!/usr/bin/env node` shebang preserved (TypeScript should keep it; verify the output).
- Verify `package.json#files` includes `dist`, `templates`, `schema`. Already does.

**Files touched.** None expected, just verification. If something breaks: probably `tsconfig.json#outDir` or the bin path.

**Verification.** From a clean shell:
```
cd packages/loom-spec
pnpm build
node dist/cli/index.js view --root ../../examples/todo-app
```
Open the printed URL, confirm the diagram renders, edits save, SSE works.

**Estimate.** 30–60 minutes including any fixes.

---

## 2. npm publish

**Goal.** `npm install loom-spec` / `npx loom-spec` works publicly.

**Approach.**
1. Run `npm view loom-spec` — if it exists, pick `@loomspec/cli` and update `package.json#name`.
2. Pick license (MIT already declared).
3. Add a real README to the package (currently only the repo-root README exists; the package itself ships without one — needed for npm).
4. `npm publish --access public` (scoped) or `npm publish`.
5. From a fresh directory, try `npx loom-spec init && npx loom-spec view`.

**Files touched.** `packages/loom-spec/package.json` (name if scoped, plus add `README.md` to `files` and create the README), `packages/loom-spec/README.md` (new).

**Estimate.** 1 hour for the publish itself, plus however long writing the package README takes.

---

## 3. End-to-end test the installed flow

**Goal.** Sanity-check the user journey from zero.

**Approach.** Pure manual test, but worth documenting in `documentation/testing.md` after the first pass:
```
mkdir /tmp/loom-trial && cd /tmp/loom-trial
npm init -y
npx loom-spec init
npx loom-spec view
```
Then: edit something in the browser, edit the JSON file directly with `vim`, verify both directions sync, quit cleanly with Ctrl-C, restart.

**Estimate.** 30 minutes.

---

## 4. SSE reconnect on the client

**Goal.** When the server restarts or the network blips, the UI reconnects and visibly indicates the connection state.

**Approach.**
- `EventSource` reconnects automatically by default. The hook needs to expose the connection state.
- Track `connectionStatus: "connecting" | "open" | "closed"` in the diagram state hook (`src/view/state.ts`):
  - `es.onopen` → `open`
  - `es.onerror` → `closed`, EventSource will retry on its own
- Surface in the top bar — small dot next to the save indicator. Click to manually reconnect (`es.close(); new EventSource(...)`).
- Optionally bump from default 3s retry to a custom retry using `Last-Event-ID` headers and exponential backoff.

**Files touched.** `src/view/state.ts`, `src/view/components/TopBar.tsx`, `src/view/styles.css`.

**Estimate.** 1–2 hours.

---

## 5. Render groups

**Goal.** Groups in the diagram show as colored rectangles encompassing their children, with the group label in the top-left.

**Approach.**
- xyflow v12 has native support: a Node with `type: 'group'` (or a parent-extending custom node) and child nodes with `parentId` + `extent: 'parent'`.
- Map loom groups → xyflow group nodes:
  - Compute the bounding box of all `children` node positions + padding.
  - Emit a group flow-node at that box's top-left with width/height; class `'group'` for styling.
  - Children become normal nodes (loom's data model doesn't nest; the visual nesting is purely render-time).
- Nested groups (subgroups) → recursive: a sub-group's bounding box is its own children plus its subgroup boxes.
- Color from `group.color`. Label rendered as an absolutely-positioned chip in the top-left of the group node.

**Files touched.** `src/view/components/DiagramCanvas.tsx` (group node emission), new `src/view/components/GroupNode.tsx`, `src/view/styles.css`.

**Estimate.** 3–4 hours, plus tuning for nested groups.

---

## 6. Drill-down navigation

**Goal.** Clicking a node or group with `drill_down: "<id>"` navigates to that diagram.

**Approach.**
- Add a visual cue: small chevron icon in the node card / group corner if `drill_down` is set.
- Double-click handler on nodes/groups: if `drill_down` is set, change the active diagram id.
- Diagram id needs to be reactive. Lift it from a hardcoded `"overview"` into URL state (e.g. `location.hash = "#blog-module"`).
- The state hook re-loads when id changes (already keyed on `id`).
- Top bar shows a breadcrumb back to `overview` (or wherever the user came from). Track via `history.pushState`.

**Files touched.** `src/view/App.tsx` (URL state), `src/view/state.ts` (already supports id changes via `useEffect [id]`), `src/view/components/NodeCard.tsx` (chevron + dblclick), `src/view/components/TopBar.tsx` (breadcrumb).

**Estimate.** 2–3 hours.

---

## 7. Diagram switcher

**Goal.** The user can see all diagrams in `.loom/diagrams/` and switch between them.

**Approach.**
- `GET /api/diagrams` already returns the summary list.
- In the top bar, replace the static title with a dropdown that shows `title` and `nodeCount/edgeCount`. Default is the current id.
- Selecting one updates the URL hash (same mechanism as drill-down).
- A "+ New diagram" entry at the bottom of the dropdown that prompts for an id, creates an empty diagram via PUT (or POST — need to add a route), and switches to it.

**Files touched.** `src/view/components/TopBar.tsx` or a new `DiagramSwitcher.tsx`, `src/server/app.ts` (add `POST /api/diagrams` if we want a real create endpoint, or just use PUT to a new id).

**Estimate.** 2 hours.

---

## 8. Reposition Add Node menu

**Goal.** The dropdown shouldn't visually collide with the Inspector.

**Approach.**
- Currently `position: absolute; right: 16px; top: 52px;` — at desktop widths the inspector starts at `right: 320px`, so the menu overlaps it.
- Options:
  - Position it under the "+ Add" button precisely (using `getBoundingClientRect()` of the button), so it's never further right than the button itself.
  - Or make it a centered modal.
  - Or anchor it to the canvas instead of the top bar.
- Recommended: position under the button. Keeps the lightweight feel.

**Files touched.** `src/view/components/AddNodeMenu.tsx` (compute position from a passed ref), `src/view/components/TopBar.tsx` (pass the button ref down), `src/view/styles.css`.

**Estimate.** 1 hour.

---

## 9. Parallel-edge label collision

**Goal.** Two edges between the same node pair are drawn with distinguishable curves and non-overlapping labels.

**Approach.**
- xyflow v12 supports per-edge `type: 'default' | 'straight' | 'step' | 'smoothstep'` and a custom `pathOptions` for offsets.
- Detect parallel edges at convert time in `DiagramCanvas`: group `flowEdges` by `${source}->${target}`. For groups of size > 1, assign each an offset index (-1, 0, 1, …).
- Pass the offset to a custom edge component that draws a bezier with a vertical offset in the middle, proportional to the index.
- Apply the same offset to the label position.

**Files touched.** `src/view/components/DiagramCanvas.tsx`, new `src/view/components/OffsetEdge.tsx`.

**Estimate.** 2–3 hours.

---

## 10. Code-refs editing

**Goal.** Add, edit, and remove `code_refs` entries from the Inspector.

**Approach.**
- New section in `NodeInspector` below current read-only render.
- Each ref is a row with three inputs: `path`, `symbol`, `lines`. Plus a delete button.
- "+ Add ref" button appends a fresh entry.
- Validation: at least `path` must be non-empty for a ref to be valid; warn inline if not.
- Save flow is the same — any change calls `updateNode` and the debounced PUT fires.

**Files touched.** `src/view/components/Inspector.tsx`, `src/view/styles.css`.

**Estimate.** 1–2 hours.

---

## 11. Tags editing

**Goal.** Add/remove tag chips on a node.

**Approach.**
- Tag input pattern: text input + "Enter to add" + chips above with X buttons.
- Tags are deduplicated and lowercased on add.

**Files touched.** `src/view/components/Inspector.tsx`, new tiny `TagInput.tsx`.

**Estimate.** 1 hour.

---

## 12. Ports in the UI

**Goal.** Render named in/out ports as separate handles on nodes that declare them in `node-types.json`; let edges target specific ports.

**Approach.**
- In `NodeCard`, instead of one generic Handle on left and right, render one Handle per port declared in `typeDef.ports.in` (left side, stacked vertically) and `typeDef.ports.out` (right side). Each Handle has a unique `id` matching the port name.
- xyflow's `onConnect` already provides `sourceHandle` and `targetHandle`; use these to build the `from`/`to` strings with `:port` suffixes.
- Optional: color-code port dots by `signal` type.

**Files touched.** `src/view/components/NodeCard.tsx`, `src/view/components/DiagramCanvas.tsx` (onConnect logic), `src/view/styles.css`.

**Estimate.** 2–3 hours.

---

## 13. Inline validation feedback

**Goal.** Show field-level validation errors as the user types (e.g. "id must match `^[a-z0-9-]+$`"), not just when the save round-trips.

**Approach.**
- The diagram schema is already in the browser bundle as a JSON file (or could be fetched from `/api/schema` — add the route).
- Run `validateDiagram` on the client side after each mutation (debounced). Map errors back to specific node/edge/field paths.
- Render error markers next to the offending inputs in the Inspector and a red border on the corresponding node in the canvas.

**Files touched.** `src/view/state.ts` (client validation), `src/view/components/Inspector.tsx`, `src/view/components/NodeCard.tsx`, possibly a new `src/view/validation.ts`.

**Estimate.** 3–4 hours, more if we want pretty error paths.

---

## 14. Watcher resilience

**Goal.** The server doesn't crash if `.loom/` is moved or deleted while running.

**Approach.**
- Wrap `chokidar.watch` setup in a try/catch and log a warning instead of crashing on startup.
- Subscribe to `error` events on the watcher and re-initialize after a backoff.
- If the watched dir disappears, emit a synthetic "loom-root-gone" event so the UI can show an error state.

**Files touched.** `src/server/watch.ts`, possibly `src/server/app.ts` (handle the synthetic event in the SSE stream).

**Estimate.** 1–2 hours.

---

## 15. Timeline view (Phase 2)

**Goal.** A second view mode that renders the same node universe along a horizontal time axis, à la DAW edit view. Useful for sequencing events, request/response timing, and signal flow.

**Approach.** Larger; sketch only:
- New file kind `.loom/timelines/*.timeline.json` referencing node IDs from existing diagrams.
- Schema additions: `tracks` (one per relevant node or group), `events` (each has a `node_id`, `start_tick`, `duration_ticks`, optional `kind` matching loom edge kinds, optional `description`).
- Renderer: SVG-based timeline with horizontal ticks, vertical tracks, clip rectangles per event. Hover shows details, click selects.
- Same Hono routes pattern: `GET/PUT /api/timelines/:id`, validated, SSE-broadcast.
- Inspector reuses the structure but with time-specific fields.

**Estimate.** 1–2 weeks of focused work. Largest single Phase 2 item.

---

## 16. MCP server (Phase 2)

**Goal.** Expose loom-spec operations as MCP tools so any MCP-capable agent can call them with semantics richer than "edit JSON file."

**Approach.**
- New package or subdir: `packages/loom-spec/src/mcp/`.
- Stdio MCP server exposing tools:
  - `loom_list_diagrams()`
  - `loom_read_diagram(id)`
  - `loom_add_node({ diagram, type, label, description?, code_refs?, properties? })`
  - `loom_update_node({ diagram, id, ...patch })`
  - `loom_mark_stale({ diagram, id })`
  - `loom_add_edge({ diagram, from, to, kind, label? })`
  - `loom_validate(diagram?)`
  - `loom_find_orphans()` — nodes whose code_refs point at nonexistent files
- Each tool wraps the same `fileOps` + `validate` code used by the HTTP API.
- Add a `loom-spec mcp` CLI subcommand to start it.

**Estimate.** 1 week.

---

## 17. Automated drift detection (Phase 2)

**Goal.** Detect when a node's `code_refs` no longer match the codebase.

**Approach.**
- New function in `src/server/drift.ts`: walk all diagrams, for each node check each `code_ref.path` exists, and if `symbol` is set, grep the file for it (or use tree-sitter for accuracy).
- Expose as:
  - CLI: `loom-spec validate` flags stale code_refs
  - Web: a "Drift" tab in the inspector that highlights affected nodes
  - Pre-commit hook (optional): block commits with drift
- Symbol-finding could use tree-sitter for several languages or just `grep -n` as a v1.

**Files touched.** `src/server/drift.ts` (new), `src/cli/validate.ts` (new subcommand), `src/view/` (drift UI).

**Estimate.** 3–4 days.

---

## Notes on sequencing

- Items 1–4 are the v1.0 blockers and should be done in order.
- Items 5–9 are independent of each other and of 1–4; pick whichever is most painful.
- Items 10–14 are quality-of-life; defer until a real user is hitting them.
- Phase 2 items are independent. Timeline view (15) is the highest-leverage differentiator; MCP server (16) is the highest-leverage agent integration; drift detection (17) is the highest-leverage maintenance feature. Pick by what kind of feedback the project most needs.
