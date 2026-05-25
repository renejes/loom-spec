# Next Steps

Forward-looking only. For what has shipped, see [`done/`](./done/).
For the per-item planning sketches, see
[`implementation-plan.md`](./implementation-plan.md). For where the
codebase stands right now, see [`project-status.md`](./project-status.md).

## Active line of work

### Journeys — ordered untimed flows

Distinct file kind for guided walkthroughs of an architecture. An
ordered list of steps, each pointing at a node in a diagram. Renders
as a step-navigator with prev/next + a diagram pane that highlights
the current step. Exportable as a standalone HTML.

Full plan in [`journeys-plan.md`](./journeys-plan.md). Estimated
~6–7 h of focused work. Slated for v0.5.0.

## Backlog (pick by next pain)

| # | Item | Effort | Why it matters |
|---|---|---|---|
| #26 | Pure-SVG mini-renderer | ~1 d | Drops ~150 kB from the export bundle by removing xyflow from the read-only path. Highest-leverage size win. |
| #23 | Editable timeline inspector | ~3–4 h | Removes the last reason to drop into JSON when editing clip details. |
| #24 | Planned-vs-observed diff view | ~1 d | Visualises drift between hand-authored timelines and `import-trace`'d ones on the same axis. |
| #25 | Sticky track labels at high zoom | ~2–3 h | At zoom ≥ 2× the label column scrolls off the left. Annoying for long timelines. |
| #27 | More trace formats (Jaeger / Zipkin / OTLP-proto) | ~½ d each | Lets users pipe in raw exporter output without preprocessing. |
| #16 | Custom-type fields beyond primitives | — | Schema extension for nested objects / multi-value refs in node `properties`. |
| #17 | Cross-tool skill discovery | — | `--agent=codex` style flags on `init` for non-Claude hosts. |
| #18 | `loom-spec init --upgrade` | — | Schema migration path for existing repos when fields change. |
| #19 | Read-only "share" mode | — | Largely obsoleted by Phase 3's export. Keep only if a hosted variant materialises. |

## Important non-feature

**Real-world use is now the highest-leverage signal.** v0.4.0 is on
npm with the timeline view, MCP tools, OTel import, and standalone
HTML export — almost everything that's been planned. The next
roadmap items should be driven by friction observed in actual use,
not speculation. Document any pain points in the repo's issue
tracker; they should out-rank everything above.
