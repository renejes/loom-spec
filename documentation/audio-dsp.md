# Audio / DSP graphs — typed ports, signal flow, real-time safety

loom-spec models audio-plugin signal flow (JUCE, C++, or any real-time
DSP) with three audio-specific capabilities, all added in v0.9.0:

1. **Typed ports** — declare `audio` / `midi` / `cv` signals on node ports
   and wire them; the viewer colors edges by signal type.
2. **Wiring validation** — `loom-spec validate` checks port existence and
   signal-type compatibility across every edge.
3. **Real-time-safety lint** — mark a `code_ref` as `realtime` and validate
   scans the referenced C/C++ function body for audio-thread hazards.

## Modeling a plugin

Define audio node types in `node-types.json` with typed ports:

```json
{
  "types": {
    "plugin": {
      "label": "Plugin", "color": "#6366f1", "icon": "server",
      "ports": { "out": [{ "name": "out", "signal": "audio" }] }
    },
    "dsp": {
      "label": "DSP Module", "color": "#34d399", "icon": "sliders",
      "ports": {
        "in":  [{ "name": "in", "signal": "audio" }, { "name": "cutoff", "signal": "cv" }],
        "out": [{ "name": "out", "signal": "audio" }]
      }
    },
    "io": {
      "label": "Audio I/O", "color": "#f472b6", "icon": "music",
      "ports": { "in": [{ "name": "in", "signal": "audio" }] }
    }
  }
}
```

Then wire a serial chain with the `node:port` edge syntax:

```json
"edges": [
  { "id": "e1", "from": "processblock:out", "to": "eq:in",   "kind": "signal" },
  { "id": "e2", "from": "eq:out",          "to": "comp:in", "kind": "signal" },
  { "id": "e3", "from": "comp:out",        "to": "out:in",  "kind": "signal" }
]
```

Recognised signal types (drive edge + handle colors): `audio` (pink),
`midi` (purple), `cv` / `control` (green), `http` (blue), `data` (amber).
Unknown signal strings still work; they just fall back to the kind color.

## Wiring validation

`loom-spec validate` reports, per edge:

| Issue | Severity | Meaning |
|---|---|---|
| unknown node | error | edge endpoint references a node id that doesn't exist |
| unknown port | error | `node:port` uses a port the node's type doesn't declare (typo) |
| signal mismatch | warning | both ports typed but signals differ (e.g. `audio` out → `midi` in) |

Untyped edges (no `:port`) skip the port checks — backwards compatible
with non-audio diagrams. Signal mismatch is a *warning* (doesn't fail CI)
because some cross-type connections are intentional (cv modulating an
audio-rate input); node/port errors *do* fail CI.

## Real-time-safety lint

The #1 audio-plugin bug class is doing something non-RT-safe in the
audio callback: heap allocation, blocking locks, string building,
logging, file I/O. These cause dropouts and glitches. loom-spec catches
them statically.

Mark the code_ref that runs on the audio thread:

```json
{ "id": "eq", "type": "dsp", "label": "EQ",
  "code_refs": [
    { "path": "Source/DSP/EQProcessor.cpp", "symbol": "EQProcessor::process", "realtime": true },
    { "path": "Source/DSP/EQProcessor.cpp", "symbol": "EQProcessor::getBand" }
  ] }
```

On `loom-spec validate`, every `realtime` code_ref whose file is C/C++
gets its **function body** extracted and scanned. Flagged patterns:

- heap allocation: `new` / `delete` / `malloc` / `.resize()` /
  `.push_back()` / `.emplace*()` / `.reserve()` / `make_shared` /
  `make_unique` / `std::vector|map|string|…` construction
- blocking locks: `ScopedLock` / `lock_guard` / `unique_lock` /
  `scoped_lock` / `.lock()`
- `juce::String` construction (heap-allocates)
- logging: `DBG()` / `std::cout` / `printf` / `juce::Logger`
- file I/O: `juce::File` / `std::ofstream` / `fopen`
- `throw` / `dynamic_cast`

Whitelisted (never flagged):

- `std::atomic` load/store — the correct cross-thread mechanism
- `SmoothedValue`
- `ScopedNoDenormals`
- non-blocking try-locks: `ScopedTryLockType` / `try_lock()`

### Why function-body-scoping matters

The scan looks only inside the realtime function's body, not the whole
file. Real example from the channelstrip plugin: `EQProcessor` has both

```cpp
void EQProcessor::process (juce::AudioBuffer<float>& buffer) { … }      // audio thread
EQBand EQProcessor::getBand (int index) const {                         // GUI thread
    const juce::SpinLock::ScopedLockType lock (guiBandLock);            // blocking — but OK here
    return guiBands[index];
}
```

`getBand`'s blocking lock is correct (it's the GUI reading state). Only
`process` is marked `realtime`, so only its body is scanned — and
`process` uses a non-blocking `ScopedTryLockType`, which is whitelisted.
A whole-file scanner would false-positive on `getBand`; the
body-scoped scan reports clean.

### Workflow

```bash
# After adding realtime code_refs, snapshot signatures (for drift too):
loom-spec validate --capture

# Read-only check (CI-friendly; fails on rt-unsafe, wiring errors,
# signature drift, broken refs):
loom-spec validate
```

`rt-unsafe` findings fail the exit code — they're real bugs. When you
fix a flagged allocation by moving it to `prepareToPlay`, re-run
validate and it clears.

## Coverage + limits

- Languages with body-scan support: C/C++ (`.cpp/.cc/.cxx/.c/.h/.hpp/.hh/.hxx`).
  Other languages' realtime refs are inert (the marker is harmless).
- The scanner is a regex + brace-matching state-machine, not a full C++
  parser. It biases toward false-positives over silent misses; an agent
  reviews each finding. Raw-string literals and digit-separator
  apostrophes are known edge cases.
- It checks the *function you point at* — it does not follow calls into
  helpers. If `process()` calls `doExpensiveThing()` which allocates,
  mark `doExpensiveThing` realtime too (or inline the check mentally).

## A worked example

See `examples` in the wild: the channelstrip plugin's `.loom/` models
the host callback → EQ → Compressor → Saturation → Clipper → output
chain, with each DSP stage's `process()` marked `realtime`. Running
`loom-spec validate` against it reports clean — the code is RT-safe —
and `--capture` snapshots the C++ signatures so future refactors are
caught.
