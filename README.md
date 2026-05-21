# loom-spec

A node-based architecture spec that lives in your repo. AI-readable, AI-writable, git-diffable.

## What it is

`loom-spec` is a lightweight tool for keeping a structured visual spec of your application's architecture alongside its code. It's designed to be edited by both humans (in a browser-based node editor) and AI coding agents (directly via JSON files).

The idea: instead of describing app structure in prose or letting it drift in stale Mermaid diagrams, keep it as machine-readable nodes and edges. The AI agent updates it as the codebase evolves; you see and edit it visually.

## Status

Early development. See `packages/loom-spec/` for the implementation.

## Repo layout

```
packages/loom-spec/    The tool itself
examples/              Example projects using loom-spec
```

## License

MIT
