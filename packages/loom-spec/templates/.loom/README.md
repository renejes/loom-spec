# .loom — Architecture Spec

This directory contains the node-based architecture spec for the project. It is **the source of truth** for how the app is structured, kept in sync with code by humans and AI agents together.

## Files

- `node-types.json` — defines the available node types for this project. Customize freely; add types specific to your domain.
- `diagrams/*.flow.json` — one file per subsystem. Each is a self-contained graph.
- `exports.json` — (optional) named export bundles for `loom-spec export-html` (e.g. a `user-manual` bundle that filters to `tags: ["public"]`).

## Viewing and editing

```bash
npx loom-spec view
```

Opens a browser-based editor on `localhost:7777`. Changes are written back to the JSON files.

## For AI agents

See `.claude/skills/loom-spec/SKILL.md`. The skill explains when to read and update these files.

## Format

See the JSON Schemas shipped with the `loom-spec` package.
