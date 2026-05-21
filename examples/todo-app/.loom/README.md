# .loom — Architecture Spec

This directory contains the node-based architecture spec for the project. It is **the source of truth** for how the app is structured, kept in sync with code by humans and AI agents together.

## Files

- `node-types.json` — defines the available node types for this project (UI components, services, data stores, etc.). Customize freely.
- `diagrams/*.flow.json` — one file per subsystem. Each is a self-contained graph.
- `timelines/*.timeline.json` — (future) time-axis views for sequenced behavior.

## Viewing and editing

```bash
npm run loom
```

Opens a browser-based editor on `localhost:7777`. Changes are written back to the JSON files.

## For AI agents

See `.claude/skills/loom-spec/SKILL.md`. The skill explains when to read and update these files.

## Format

See the JSON Schema files shipped with the `loom-spec` package (`schema/diagram.schema.json`, `schema/node-types.schema.json`).
