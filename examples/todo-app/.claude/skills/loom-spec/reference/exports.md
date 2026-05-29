# loom-spec — Tag-based HTML export

`loom-spec export-html` builds a standalone interactive HTML file from the
spec. Tags decide what ships where. See examples.md §6 for an end-to-end
walkthrough.

## Contents
- Tag conventions
- Cascade rules
- Security review before publishing
- CLI usage
- Don'ts

---

## Tag conventions

`loom-spec export-html` filters by node `tags` to produce scoped bundles
(public manual, ops runbook, internal overview). Tagging is the source of
truth for what ships where:

- **`public`** — shows in user-facing docs. Default-off (untagged nodes are
  *not* in public exports).
- **`internal`** — explicitly internal; use as `--exclude-tag` for public
  exports or `--include-tag` for an internal-only bundle.
- **`ops`** — operational runbooks (deploy paths, monitoring, on-call).
- **`wip`** — work-in-progress; always exclude from any export.

## Cascade rules

When you tag a node `public`, dropped nodes cascade:

- Edges between two `public` nodes survive. An edge with one untagged
  endpoint is **dropped** in the public export. If a user-facing flow
  depends on an "internal" node visually, either tag it `public` too or
  accept the dangling visualisation.
- A group with no `public` children disappears entirely.
- A `drill_down` chevron pointing at a diagram with zero `public` nodes is
  removed (that diagram doesn't ship).

## Security review before publishing

**Tags filter nodes, not their content.** Before tagging `public`, check the
node's `code_refs[].path` and `description`. If a ref points at
`src/server/admin/secrets.ts`, or the description names an internal system,
that *text* ships in the public export. Either:
- remove the sensitive ref / rewrite the description, or
- split the node into a public surface node + an internal implementation
  node, and tag accordingly.

## CLI usage

```
loom-spec export-html                              # full export (diagrams + journeys)
loom-spec export-html <bundle-name>                # from .loom/exports.json
loom-spec export-html --include-tag public --out manual.html
loom-spec export-html --from-journey checkout --out tour.html
```

`--from-journey` produces a focused walkthrough that opens at
`#journey:<id>` by default (see reference/journeys.md). Tag filters and
`--from-journey` compose: the tag filter narrows nodes, then the journey
scope narrows further; a journey step whose node was dropped gets pruned.

Named bundles live in `.loom/exports.json`:

```json
{
  "exports": {
    "user-manual": { "include-tags": ["public"], "exclude-tags": ["wip"], "out": "docs/architecture.html" },
    "checkout-tour": { "from-journey": "checkout", "out": "docs/checkout.html" }
  }
}
```

## Don'ts

- Don't tag everything `public` "just in case" — a tag that's on every node
  scopes nothing.
- Don't manually edit the generated `.html` — re-run the export. Hand edits
  are lost on the next run and hide the source of truth.
- Don't add `loom-spec export-html` to `init` defaults or auto-run it from a
  hook. Exports are intentional, not background.
- Don't auto-commit the generated `.html`. `git add` it as part of the
  change that updates the architecture.
