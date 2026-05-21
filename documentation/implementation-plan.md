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

## 15. Timeline view (Phase 2, in progress)

**Headline goal.** A second view that renders the same node universe along a horizontal time axis, à la DAW edit view, **plus** a play mode with a moving playhead that highlights active nodes and pulses signal edges in a side-by-side mini graph view. The static + animated combination is the differentiator.

Broken into 7 incremental steps. Each one lands something usable on its own; they can be paused between if scope changes.

### 15a. Schema, types, example, validator (0.5d)

**Goal.** `.timeline.json` format is defined, machine-validated, with a working example in the todo-app fixture.

**Approach.**
- New `packages/loom-spec/schema/timeline.schema.json`. Top-level: `{ version, id, title, diagram, events, tracks? }`.
  - `diagram` references a diagram id; the timeline overlays that graph's nodes.
  - `events`: array of `{ id, node, track?, start_ms, duration_ms, label?, description?, kind? }`. `kind` for color-coding (compute / io / wait / error) — separate from edge kind in the graph.
  - `tracks` optional; if omitted, the renderer infers tracks from distinct event.track values.
- Add to `scripts/generate-types.ts` so a `LoomTimeline` TS type is emitted next to `LoomDiagram`.
- Extend `src/validate.ts` with a `validateTimeline` function using the same ajv 2020 instance.
- Add an example `examples/todo-app/.loom/timelines/todo-completion.timeline.json` showing the full mark-as-done flow with realistic latencies and one overlap (concurrent client + server work).
- Update `scripts/validate-examples.ts` to also walk `.loom/timelines/`.

**Files touched.** schema (new), `scripts/generate-types.ts`, `src/validate.ts`, `scripts/validate-examples.ts`, `examples/todo-app/.loom/timelines/*.timeline.json` (new).

### 15b. Read-only timeline view (1.5d)

**Goal.** Browser editor can render a timeline file as horizontal tracks with clips.

**Approach.**
- New view route or URL hash variant: `#timeline:todo-completion` (alongside `#celebration-detail` for diagrams).
- New `src/view/components/TimelineCanvas.tsx`. SVG-based, NOT xyflow — different layout problem (1D time axis instead of 2D graph). Pure React + SVG keeps it simple.
- Layout: horizontal time axis with tick marks; vertical tracks (auto-distributed from `event.track`); clips rendered as rounded rectangles colored by node type. Hover shows a tooltip with label + start/duration. Click selects.
- `loadTimeline` helper alongside `loadDiagram`; same fetch pattern.
- New Hono routes: `GET /api/timelines`, `GET /api/timelines/:id`, `PUT /api/timelines/:id`. Reuse the same chokidar watcher with self-write suppression for `.timeline.json` paths.
- SSE: extend `LoomChangeEvent` with `timeline-changed`.

**Files touched.** `src/view/components/TimelineCanvas.tsx` (new), `src/view/state.ts` (parallel timeline state), `src/view/loadDiagram.ts` (add timeline loaders), `src/server/app.ts` (routes), `src/server/fileOps.ts` (timeline file ops), `src/server/watch.ts` (extend event kinds), `src/view/components/TopBar.tsx` (switcher should also list timelines).

### 15c. Edit mode (1d)

**Goal.** Add, drag, resize, delete clips with the mouse.

**Approach.**
- Drag clip horizontally → updates `start_ms`. Snap to a configurable grid (default 10ms).
- Drag clip's right edge → updates `duration_ms`.
- Drag clip vertically across tracks → updates `track`.
- "+ Add event" button or click on empty track area → opens a small inline form: pick node (from referenced diagram), label, start, duration. Save = PUT to `/api/timelines/:id`.
- Delete key on selected clip → remove.
- Reuse the existing debounced auto-save pattern.

**Files touched.** `src/view/components/TimelineCanvas.tsx` (interaction handlers), `src/view/state.ts` (timeline mutators), `src/view/components/Inspector.tsx` (clip-specific fields).

### 15d. Playhead + play/pause/scrub + node glow (1d)

**Goal.** Press play; a vertical line moves left→right over the timeline at real speed. Active clips highlight.

**Approach.**
- Global playback state: `{ playing: bool, position_ms: number, speed: 1 | 0.25 | 0.5 | 2 | 4 }`.
- `requestAnimationFrame` loop while `playing === true`: advance `position_ms` by `delta * speed`.
- For each event whose interval contains the current `position_ms`: add `active` class to its clip.
- Top-bar controls: play / pause / stop, scrubbable timeline, speed dropdown.
- Keyboard: Space = play/pause, arrows = scrub, Home = reset.

**Files touched.** `src/view/components/TimelineCanvas.tsx` (playhead rendering + active class), `src/view/state.ts` (playback state, no need for a separate hook — fits in there), `src/view/components/TopBar.tsx` (transport controls when a timeline is active).

### 15e. Side-by-side mini graph + edge pulse (1d)

**Goal.** Next to the timeline, a smaller live-updating graph view. Nodes glow when their clip is currently active. Edges whose `from` node is active visually pulse along their path.

**Approach.**
- Layout: timeline on the left ~60%, mini graph on the right ~40%. Resizable splitter optional.
- Mini graph reuses the existing DiagramCanvas in read-only mode (no drag, no delete).
- Pass `activeNodeIds: Set<string>` from playback state. NodeCard gets a `data.active` prop → CSS class triggers a `box-shadow` glow in the node-type color.
- Custom xyflow edge variant `PulseEdge`: when `data.pulsing === true`, renders a small bright marker that animates along the path via SVG `<animateMotion>` or CSS `stroke-dashoffset` trick. Use the existing `ParallelEdge` as a starting point.
- Pulsing decision: for each active event, find edges where `e.from === event.node`. Mark those as pulsing for the duration of the event.

**Files touched.** `src/view/components/TimelineCanvas.tsx` (split layout), `src/view/components/DiagramCanvas.tsx` (read-only mode), `src/view/components/NodeCard.tsx` (active glow), new `src/view/components/PulseEdge.tsx`, `src/view/styles.css`.

### 15f. MCP tools (0.5d)

**Goal.** Agents can list, read, and mutate timelines the same way they handle diagrams.

**Approach.**
- New tools in `src/mcp/server.ts`:
  - `loom_list_timelines()`
  - `loom_read_timeline(id)`
  - `loom_add_event({ timeline, node, track?, start_ms, duration_ms, label?, kind? })`
  - `loom_update_event({ timeline, id, patch })`
  - `loom_delete_event({ timeline, id })`
- Validate referenced node exists in the underlying diagram before writing — extends drift checks naturally.
- Update SKILL.md template with a 6th example: "When the user wants to document a sequence", showing the agent generating a timeline from architectural reasoning or from log data.

**Files touched.** `src/mcp/server.ts`, `templates/.claude/skills/loom-spec/SKILL.md`, `examples/todo-app/.claude/skills/loom-spec/SKILL.md`, `src/server/fileOps.ts` (timeline write with self-write tracking).

### 15g. OpenTelemetry / log import (1d, optional)

**Goal.** `loom-spec import-trace trace.json --as user-login --diagram overview` reads an OTel trace file and generates a timeline that mirrors the actual spans.

**Approach.**
- New `src/cli/importTrace.ts` subcommand.
- Parse OTel JSON (start with the simple `traces.json` shape; W3C Trace Context is a follow-on).
- For each span, find the closest matching node in the named diagram (heuristic: span attributes like `service.name` matched against node labels / code_refs paths). Suggest mappings interactively or via a `--map` JSON file.
- Emit a `.timeline.json`. Optionally append to an existing timeline with `--append`.
- Stretch: a "diff mode" in the UI that shows planned (hand-authored) vs. actual (imported) side by side on the same axis. This is where this whole feature becomes a perf-regression tool.

**Files touched.** `src/cli/importTrace.ts` (new), `src/cli/index.ts` (subcommand dispatch), `documentation/import-trace.md` (new — explains the OTel shape we accept).

**Total estimate.** 6–7 days of focused work for 15a → 15f. 15g is another day if pursued.

**Dependencies / risks.**
- **Bundle size.** Adding a timeline view risks pushing the JS bundle past 700kB. Mitigation: code-split the timeline view route so it only loads when the user opens a timeline.
- **`@xyflow/react` as read-only mini graph.** Reusing the existing canvas in non-interactive mode should work; if it's a fight, fall back to a hand-rolled SVG mini-renderer for the play-mode view.
- **Track auto-inference.** If users don't specify `track` on events, we need a deterministic default. Plan: track = node id (one track per node), and the auto-layout algorithm orders tracks top-down by first appearance.

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

- Items 1–14 are all shipped in v0.1.0 / v0.1.1 on npm; left in place as a record of the build order.
- Item 15 (timeline view) is the current active line of work and is broken into 7 substeps above. 15a → 15e are the core; 15f adds agent integration; 15g is the optional perf-regression differentiator.
- Items 16–19 (custom-type fields, cross-tool skill discovery, init --upgrade, share mode) remain on the Phase 2 backlog. Independent of each other; pick by what real-world use surfaces as the next pain.
