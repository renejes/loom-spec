# loom-spec

> A node-based architecture spec that lives in your repo. AI-readable, AI-writable, git-diffable.

`loom-spec` is a lightweight tool for keeping a structured visual spec of your application's architecture **alongside its code**. It is designed to be edited by both humans — in a browser-based node editor — and AI coding agents, directly via JSON files.

The idea: instead of describing app structure in prose, in stale Mermaid diagrams, or only inside the model weights of a coding agent, keep it as a **structured, machine-readable, git-diffable** set of nodes and edges. Humans see and edit it visually; agents read it before implementing and update it as code changes.

It's a spec layer, not an execution layer. The nodes don't run — they describe.

## Quickstart

```bash
# In your project root
npx loom-spec init
npx loom-spec view
```

`init` scaffolds:

- `.loom/` — your architecture spec (node types + diagrams)
- `.claude/skills/loom-spec/SKILL.md` — instructions for Claude Code (and any other agent that adopts the Agent Skills convention)

`view` opens a browser editor on `localhost:7777`. Edits in the UI write to the JSON files. Edits to the JSON files (e.g. by an agent) propagate to the UI live via Server-Sent Events.

## What's in `.loom/`

```
.loom/
├── README.md
├── node-types.json        # the type vocabulary for this project
└── diagrams/
    └── overview.flow.json # one diagram per subsystem
```

A diagram is `{ nodes, edges, groups }`. Nodes carry an id, type, label, position, status (`planned` / `implemented` / `stale` / `deprecated`), `code_refs` (path + symbol), and type-specific properties. Edges have a kind (`request`, `event`, `data-read`, `data-write`, `signal`, `dependency`, `control`). Groups visually bundle nodes and can `drill_down` into nested diagrams.

The format is JSON Schema-validated; the package ships TypeScript types generated from the same schema.

## Repo layout

```
packages/loom-spec/         The tool itself (the npm package)
examples/todo-app/          A demo project that uses loom-spec
documentation/              Project status, next steps, implementation plan
```

For details on architecture and how it works internally, see [documentation/project-status.md](documentation/project-status.md).

## Status

Phase 1 complete. The full editor (viewer, edit-mode, live-sync, init CLI) is implemented and self-hostable. v1.0 release is pending npm publishing and a couple of remaining UX polish items tracked in [documentation/next-steps.md](documentation/next-steps.md).

## License

MIT — see [LICENSE](LICENSE).
