# Phase 10 — JUCE / audio: RT-safety, C++ signatures, signal flow (v0.9.0)

Driven by a real sidequest: the author (an audio engineer) started
building JUCE audio plugins with AI-written C++ and wanted loom-spec to
(a) catch real-time-safety violations the AI might introduce in
`processBlock`, (b) represent audio signal flow well, and (c) catch
wiring errors — in that priority order.

The design was settled by reading a real plugin (`channelstrip`)
before writing any feature code. Three findings from that recon shaped
everything:

1. **`processBlock` and DSP `process()` methods are clean, well-named
   audio entry points** — easy to target via `code_refs` symbols.
2. **The decisive case: a `juce::SpinLock::ScopedLockType` at
   `EQProcessor.cpp:297` lives in `getBand()` (a GUI getter), not in
   `process()`.** A whole-file RT scanner would false-positive on it.
   A function-body-scoped scanner ignores it correctly.
3. **False-positive sources confirm scoping is mandatory**: `new` in
   `createEditor`, dozens of `juce::String` in APVTS layout. Whole-file
   = useless; function-body = precise.

## What shipped

### C++ extractor (`signatures/cpp.ts`)

`extractCppFunction(source, symbol)` returns the canonical signature
**and the function body** (brace-matched, string/char/comment aware).
Handles qualified names (`EQProcessor::process`), templates
(`AudioBuffer<float>&`), trailing returns (`auto f() -> T`),
constructor init lists, and the qualifier soup. Wired into the
signature-drift path too, so signature drift now works on `.cpp/.cc/
.cxx/.c/.h/.hpp/.hh/.hxx`.

### RT-safety lint (`rtSafety.ts`)

For each `code_ref` marked `realtime: true` (new optional field on
CodeRef), validate extracts the function body and scans for
audio-thread hazards: heap allocation, blocking locks, `juce::String`,
logging, file I/O, `throw`/`dynamic_cast`. Comments and string/char
literals are masked before scanning (no false-positive on a `// new`
comment or a `"delete"` string).

Whitelist by design, not exclude-list: atomics aren't a pattern,
`\bScopedLock\b` doesn't match `ScopedNoDenormals` or
`ScopedTryLockType`, `.lock()` doesn't match `.try_lock()`.

Findings are `rt-unsafe` issues on the code_ref, counted in
`totalRtUnsafe`, and they fail the exit code — these are real bugs.

### Signal-typed edge coloring

`DiagramCanvas` derives an edge's color from the signal types of its
connected ports (audio = pink, midi = purple, cv = green) when both
endpoints are typed ports with the same signal; falls back to the
kind color otherwise. Makes an audio graph readable at a glance.

### Wiring validation (`portValidate.ts`)

Per edge, validate now checks: endpoint nodes exist (error), `node:port`
references a declared port (error), and signal types match across the
connection (warning — some cross-type connections are intentional).
Untyped edges skip the port checks (backwards compatible).

### channelstrip bootstrap

Created `.loom/` for the real channelstrip plugin: a `node-types.json`
with audio types + typed ports, and an `overview.flow.json` modeling
host → EQ → Compressor → Saturation → Clipper → output with each DSP
stage's `process()` marked `realtime`. Running `loom-spec validate`:

- **RT-safety: clean** on all 5 process methods — the real code is
  RT-safe, and the scanner confirms it (zero false positives,
  including the whitelisted try-lock in `EQ::process`).
- **Wiring: clean** — all ports resolve, all audio→audio.
- `--capture` snapshotted the real C++ signatures
  (`void EQProcessor::process (juce::AudioBuffer<float>& buffer)` etc.)
  so future refactors are caught.

This is the honest outcome: the value isn't "found bugs today," it's
"will catch the bug the day the AI moves an allocation into the audio
thread during a refactor."

## What's deliberately out of scope

- **Cross-call analysis.** The scan checks the function you point at,
  not helpers it calls. Documented; mark helpers `realtime` too if needed.
- **More languages for RT-safety.** C/C++ only (the user's stack). The
  pattern set is JUCE-flavored.
- **Latency/PDC accounting, channel-count (mono/stereo) compatibility.**
  Still backlog — niche until the pain shows up.
- **Tree-sitter.** Same call as Phase 7: regex + state-machine, no
  10 MB grammar dependency. The body-scoping + masking keeps precision
  high enough.

## Test coverage delta

Two new smoke suites:
- `smoke-rt-safety.ts` (20 assertions): C++ extractor units (qualified
  names, trailing return, body boundaries) + scanRtSafety (clean
  whitelist pass, every dirty pattern, comment/string masking) + e2e
  via runDriftCheck (clean vs dirty process, getBand-not-scanned).
- `smoke-port-wiring.ts` (8 assertions): unknown node/port, signal
  mismatch warning, clean audio chain, e2e counters.

Total smoke coverage now: **146 assertions across 7 suites**
(export-html 35, mcp-journeys 29, mcp-diagrams 13, signatures 30,
edge-vocab 11, rt-safety 20, port-wiring 8). All clean up byte-for-byte.

`check-dist.ts` extended to require `signatures/cpp.js` and
`rtSafety.js` in the published tarball (Phase 9 lesson applied).

## Effort

~10 h as scoped (4 slices + bootstrap + docs). The recon-first
approach (read channelstrip before designing) paid off — the
function-body-scoping decision, validated against the getBand SpinLock,
avoided a whole class of false positives that a naive build would have
shipped.

## Files touched (summary)

**New:**
- `packages/loom-spec/src/server/signatures/cpp.ts`
- `packages/loom-spec/src/server/rtSafety.ts`
- `packages/loom-spec/src/server/portValidate.ts`
- `packages/loom-spec/scripts/smoke-rt-safety.ts`
- `packages/loom-spec/scripts/smoke-port-wiring.ts`
- `documentation/audio-dsp.md`
- `documentation/done/phase-10-juce-rt-safety.md`
- `channelstrip/.loom/` (in the separate channelstrip repo)

**Modified:**
- `schema/{diagram,journey}.schema.json` — `realtime?` on CodeRef
- `src/types/{diagram,journey}.ts` — regenerated
- `src/server/signatures/index.ts` — C++ extensions + `isCppPath`
- `src/server/drift.ts` — rt-unsafe + wiring integration, new counters
- `src/cli/validate.ts` — rt-unsafe + wiring output, failCount
- `src/view/components/DiagramCanvas.tsx` — signal-typed edge coloring
- `scripts/check-dist.ts` — new modules
- `packages/loom-spec/templates/.claude/skills/loom-spec/SKILL.md`
  AND fixture mirror — audio/RT-safety section
- `package.json` — 0.8.1 → 0.9.0
- `documentation/{project-status,next-steps,handover,done/README}.md`
