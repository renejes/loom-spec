# Next Steps

Forward-looking only. For what has shipped (and what was deliberately
removed), see [`done/`](./done/). For the per-item planning sketches,
see [`implementation-plan.md`](./implementation-plan.md). For where the
codebase stands right now, see [`project-status.md`](./project-status.md).

## Active line of work

_Nothing in flight._ Journeys shipped as v0.6.0
([Phase 5](./done/phase-5-journeys.md)). Pick the next item from the
backlog when a real pain point shows up.

## Backlog (pick by next pain)

| # | Item | Effort | Why it matters |
|---|---|---|---|
| #20 | In-browser Journey editor | ~1–2 d | Currently journeys are authored via MCP only. If `loom_add_step` / `loom_reorder_steps` from an agent stops being enough, ship StepBar `+ Step` + sidebar edit/delete affordances. **Deferred until a real workflow needs it** — see Phase 5 archive for the deliberate read-only-first decision. |
| #26 | Pure-SVG mini-renderer | ~1 d | Drops ~150 kB from the export bundle by removing xyflow from the read-only path. Particularly valuable for the Journey view, which is read-only by nature. |
| #16 | Custom-type fields beyond primitives | — | Schema extension for nested objects / multi-value refs in node `properties`. |
| #17 | Cross-tool skill discovery | — | `--agent=codex` style flags on `init` for non-Claude hosts. |
| #18 | `loom-spec init --upgrade` | — | Schema migration path for existing repos when fields change. |
| #19 | Read-only "share" mode | — | Largely obsoleted by Phase 3's export. Keep only if a hosted variant materialises. |

## Important non-feature

**Real-world use is now the highest-leverage signal.** v0.6.0 ships
the diagram editor, MCP tools (18 of them), drift detection, standalone
HTML export, and Journeys. The author uses it on a separate project.
The next roadmap items should be driven by friction observed in
actual use, not speculation. The Phase 4 timeline removal remains the
template: if a feature doesn't earn its keep, take it back out. The
same scrutiny applies to anything new — including Journeys themselves.

Document pain points in the repo's issue tracker; they should out-rank
everything above.
