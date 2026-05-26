# Next Steps

Forward-looking only. For what has shipped (and what was deliberately
removed), see [`done/`](./done/). For the per-item planning sketches,
see [`implementation-plan.md`](./implementation-plan.md). For where the
codebase stands right now, see [`project-status.md`](./project-status.md).

## Active line of work

_Nothing in flight._ v0.8.1 is a bug-fix release
([Phase 9](./done/phase-9-publish-fix.md)) that actually delivers
the Phase 7+8 features which v0.8.0 fumbled at publish time. v0.7.0
shipped quality-of-life fixes ([Phase 6](./done/phase-6-quality-of-life.md));
v0.6.0 shipped Journeys ([Phase 5](./done/phase-5-journeys.md)). Pick
the next item from the backlog when a real pain point shows up.

## Backlog (pick by next pain)

| # | Item | Effort | Why it matters |
|---|---|---|---|
| #23 | `loom-spec print <diagram-id>` ASCII renderer | ~3–4 h | Stdout-friendly visualization for environments without a browser. Quick `cat`/`pipe` consumption. **Low priority** — agents parse JSON fine, humans use `loom-spec view`. Only build if a specific use case surfaces. |
| #27 | Integration smoke against built CLI | ~2 h | Phase 9 added `check-dist` (file existence + markers); a full integration smoke that runs `node dist/cli/index.js validate --capture` against a fixture would close the remaining "CLI wiring works after build" gap. Defer until a CLI-wiring bug actually slips through `check-dist`. |
| #24 | `loom-spec init-from-code` AST-based scaffolder | ~1–2 weeks | Walks an existing codebase and generates a starter `overview.flow.json` based on directory structure + imports. Reduces the onboarding-cost for bringing loom-spec to a large existing project. **Honest take**: a 4-hour version that emits 1-node-per-file with no edges is too crude to be useful; the useful version needs language-aware import/call detection. **Maybe defer indefinitely** — the alternative is a SKILL.md workflow where an agent walks the codebase with the user and authors the initial diagram interactively. That's often a better result than any auto-generator and roughly the same time investment. |
| #25 | Add more languages to signature-drift | varies per language | v0.8.0 ships Python, TS (incl. JSX, JS), Rust, Svelte. Other languages (Go, Java, Kotlin, C#, Ruby) silently skip the check. Each new language is a small regex+state-machine module — copy `python.ts` or `rust.ts` and adapt. PRs welcome. |
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
