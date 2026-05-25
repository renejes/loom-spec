# Next Steps

Forward-looking only. For what has shipped (and what was deliberately
removed), see [`done/`](./done/). For the per-item planning sketches,
see [`implementation-plan.md`](./implementation-plan.md). For where the
codebase stands right now, see [`project-status.md`](./project-status.md).

## Active line of work

### Journeys — ordered untimed flows

Distinct file kind for guided walkthroughs of an architecture. An
ordered list of steps, each pointing at a node in a diagram. Renders
as a step-navigator with prev/next + a diagram pane that highlights
the current step. Exportable as a standalone HTML.

Full plan in [`journeys-plan.md`](./journeys-plan.md). Estimated
~6–7 h of focused work. Slated for v0.6.0.

This is the planned replacement for the Phase 2 timeline view (which
was removed in v0.5.0) — same "show me the relevant slice of the
architecture for this workflow" need, with a much lighter mental
model (no timing, no tracks, no playback).

## Backlog (pick by next pain)

| # | Item | Effort | Why it matters |
|---|---|---|---|
| #26 | Pure-SVG mini-renderer | ~1 d | Drops ~150 kB from the export bundle by removing xyflow from the read-only path. Particularly valuable for the Journey view, which is read-only by nature. |
| #16 | Custom-type fields beyond primitives | — | Schema extension for nested objects / multi-value refs in node `properties`. |
| #17 | Cross-tool skill discovery | — | `--agent=codex` style flags on `init` for non-Claude hosts. |
| #18 | `loom-spec init --upgrade` | — | Schema migration path for existing repos when fields change. |
| #19 | Read-only "share" mode | — | Largely obsoleted by Phase 3's export. Keep only if a hosted variant materialises. |

## Important non-feature

**Real-world use is now the highest-leverage signal.** v0.5.0 is on
npm with the diagram editor, MCP tools, drift detection, and
standalone HTML export. The author uses it on a separate project.
The next roadmap items should be driven by friction observed in
actual use, not speculation. The Phase 4 timeline removal is the
template: if a feature doesn't earn its keep, take it back out.

Document any pain points in the repo's issue tracker; they should
out-rank everything above.
