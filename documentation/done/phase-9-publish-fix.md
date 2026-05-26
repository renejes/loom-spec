# Phase 9 — Publish hygiene fix (v0.8.1)

A bug-fix release that came from a real-world report: v0.8.0 shipped
to npm with a **stale `dist/` directory**, so the Phase 7
(signature-drift) and Phase 8 (edge vocabulary) features that the
release notes promised were effectively dead code on user machines.
Phase 6's `src/layout.ts` and Phase 5's `src/server/journeyCheck.ts`
were also missing from the published tarball — those weren't
user-visible bugs only because the affected code paths happened not
to be exercised by the test reporter.

The features themselves were correct (smoke-suite at 118 assertions
green against source). The bug was entirely in the publish step.

## What happened

`dist/` is in `.gitignore` (correctly — built artifacts don't belong
in version control). But `package.json` had no `prepublishOnly`
hook. So `npm publish` packaged whatever `dist/` happened to be on
the publisher's local disk — which, in v0.8.0, was a build from
sometime before Phase 7 was committed.

The bug-reporter's symptoms made the root cause obvious in
hindsight:

- `validate --capture` ran, exited 0, but didn't write back hints
- Manually-injected wrong `signature_hint` triggered no drift
  detection
- Edge `properties` with unknown keys raised no warnings

All consistent with "the new validation modules don't exist in the
installed package". A grep of the published tarball confirmed it:

```
$ npm pack loom-spec@0.8.0 && tar -xzf loom-spec-0.8.0.tgz
$ ls package/dist/server/
app.js  drift.js  exportConfig.js  exportFilter.js
fileOps.js  findLoomRoot.js  watch.js
# Missing: signatures/, edgeValidate.js, journeyCheck.js
$ head -5 package/dist/server/drift.js
# Pre-Phase-7 source — no signature_hint, no edge-vocab logic.
```

The reporter's hypothesis was also exactly right: smoke tests run
against `src/` via `tsx` (running TypeScript directly). They never
exercised the compiled `dist/` output. So the test suite was happy
with broken-when-shipped code.

## What shipped in v0.8.1

### `prepublishOnly` hook

```json
"scripts": {
  "clean": "rm -rf dist",
  "build": "pnpm clean && tsc -p tsconfig.json && vite build ...",
  "prepublishOnly": "pnpm run build && pnpm run check-dist",
  "check-dist": "tsx scripts/check-dist.ts"
}
```

`build` now starts with a `clean` step — no chance of stale
artifacts surviving across renamed/deleted source files.
`prepublishOnly` runs automatically before `npm publish`, so a
publish without a fresh build is no longer possible.

### `scripts/check-dist.ts`

A defense-in-depth check: even if `pnpm build` runs, this script
verifies that the resulting `dist/` contains the files we expect
to ship for each shipped phase. Per-file marker greps catch the
"build produced files but they're stale" scenario.

The check enumerates every module added since Phase 5 with the
release version it landed in, so it doubles as a publish-time
manifest. When a future phase adds a new module that must ship,
append it here too.

Demonstrated against the actual v0.8.0 failure mode — simulating
the broken publish (deleting `dist/server/signatures/` +
`edgeValidate.js`) makes the script exit non-zero with a clear
explanation:

```
✗ Pre-publish check failed — would have shipped a broken release.

  - MISSING: dist/server/signatures/index.js (added in Phase 7 (v0.8.0))
  - MISSING: dist/server/edgeValidate.js (added in Phase 8 (v0.8.0))
  - ...
```

### Version bump

`0.8.0` → `0.8.1`. Same code as v0.8.0 was supposed to ship —
just actually delivered now.

## Why the smokes didn't catch this

The smoke suites (`smoke-signatures.ts`, `smoke-edge-vocab.ts`,
`smoke-mcp-*.ts`) import directly from `src/` or spawn
`tsx src/cli/index.ts`. They never go through the build → publish
→ install cycle. They prove the **source** is correct, not the
**shipped artifact**.

`check-dist` closes the gap for missing/stale files. It doesn't
close the gap for CLI flag wiring breaking somewhere in the build
pipeline — that's a hypothetical I'd want a real
"smoke-published-cli.ts" for, but check-dist handles the actual
v0.8.0 failure mode and the cost-benefit on a fuller integration
smoke isn't there yet.

## Lessons

1. **`prepublishOnly` is not optional for any non-trivial package.**
   The cost (one line in package.json) is dwarfed by the cost of
   a broken release.
2. **Smokes against source ≠ smokes against shipped artifacts.**
   The reporter's exact words: "smoke-mcp-tests sollten den
   End-to-End-CLI-Pfad mit-checken, nicht nur die internen
   Module." Right on the money. check-dist is the minimum
   compromise; a fuller integration smoke remains backlog #27.
3. **Real-world users find bugs in days, not the test suite in
   weeks.** The fact that v0.6.0 and v0.7.0 *also* shipped stale
   dist (just for code paths the reporter didn't exercise) means
   the bug was latent for months. Now closed.

## Files touched

**New:**
- `packages/loom-spec/scripts/check-dist.ts`
- `documentation/done/phase-9-publish-fix.md`

**Modified:**
- `packages/loom-spec/package.json` — `clean` + `prepublishOnly` +
  `check-dist` scripts, version 0.8.0 → 0.8.1
- `documentation/{done/README,next-steps,project-status,handover}.md`
