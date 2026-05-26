# Done — shipped work archive

Historical record of what's been built. One file per phase, each
describing the substeps, files touched, and which npm release it landed
in. The active `documentation/*.md` files only carry forward-looking
material; everything that's complete lives here.

| Phase | What | Released as |
|---|---|---|
| [Phase 1](./phase-1-foundation.md) | Foundation — schemas, diagram editor, MCP server, drift detection, init / install-mcp, GitHub releases | v0.1.0 → v0.1.1 |
| [Phase 2](./phase-2-timeline.md) | Timeline view — schema, renderer, edit mode, playback, mini-graph + edge pulse, MCP tools, OTel import, +Event button, zoom, code-split. **Removed in v0.5.0** (see Phase 4); page preserved as historical record. | v0.2.0 → v0.3.0 |
| [Phase 3](./phase-3-export.md) | Standalone interactive HTML export, tag-based filter with cascade rules, named bundles via `.loom/exports.json`, skill updates | v0.4.0 |
| [Phase 4](./phase-4-timeline-removal.md) | **Deliberate scope-down**: timeline view, OTel trace importer, and 5 timeline MCP tools removed because the only confirmed user didn't use them. PulseEdge + mini-graph plumbing kept for Journey repurposing. | v0.5.0 |
| [Phase 5](./phase-5-journeys.md) | Journeys — new file kind for ordered, untimed walkthroughs. Schema + 8 MCP tools + read-only viewer (current step glows, prior steps highlighted, non-journey nodes dimmed) + `--from-journey` HTML export with `defaultView` hint. Editor UI deferred until concrete pain shows up. | v0.6.0 |
| [Phase 6](./phase-6-quality-of-life.md) | Quality-of-life round driven by real-world feedback: auto-layout for new nodes (no more guessing coordinates), free-form `properties` on edges, new `loom_update_edge` MCP tool, Granularity patterns in SKILL.md, rewritten `.loom/README.md` template. Signature-fingerprint drift check punted to backlog #21. | v0.7.0 |
| [Phase 7](./phase-7-signature-drift.md) | Signature-drift detection. `code_refs[].signature_hint` captures the canonical declaration line; `loom-spec validate` flags drift. Language coverage: Python, TypeScript (incl. JSX/JS), Rust, Svelte. `--capture` / `--recapture` workflow for managing the baseline. Validate also now walks journey step refs (which the docs claimed but didn't actually do). | v0.8.0 |
| [Phase 8](./phase-8-edge-vocabulary.md) | Optional `edge_types` in `node-types.json` — projects declare typed property vocabularies per edge kind, `validate` warns on unknown keys / wrong types / bad enums. Solves the "I forgot if I used sync or synchronous or is_sync" drift across edge `properties`. Shipped alongside Phase 7. | v0.8.0 |

For the open backlog see [`../next-steps.md`](../next-steps.md). For
the current state of the codebase see
[`../project-status.md`](../project-status.md).
