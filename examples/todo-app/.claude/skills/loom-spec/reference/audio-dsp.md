# loom-spec — Audio / DSP graphs & real-time safety (JUCE, C++)

For audio plugins and other real-time systems, loom-spec models signal flow
with **typed ports** and checks **real-time safety**.

## Contents
- Typed ports & signal flow
- Real-time-safety lint
- Why function-body-scoping matters
- Drill-down for per-function responsibilities
- Workflow when writing/refactoring audio code

---

## Typed ports & signal flow

Declare ports with a `signal` type in `node-types.json`:

```json
"dsp": {
  "label": "DSP Module", "color": "#34d399", "icon": "sliders",
  "ports": {
    "in":  [{ "name": "in", "signal": "audio" }, { "name": "cutoff", "signal": "cv" }],
    "out": [{ "name": "out", "signal": "audio" }]
  }
}
```

Wire edges with the `node:port` syntax (`from: "eq:out"`, `to: "comp:in"`).
`loom-spec validate` then checks:
- the port exists on the node's type (typo → error)
- the endpoint nodes exist (dangling edge → error)
- signal types match across the connection (audio→midi → warning)

In the viewer, edges between matching typed ports are colored by signal
(audio = pink, midi = purple, cv/control = green). Untyped edges fall back
to the kind color.

## Real-time-safety lint

The #1 audio-plugin bug class is doing something non-RT-safe in the audio
callback: heap allocation, blocking locks, string building, logging, file
I/O. loom-spec catches these statically.

Mark a code_ref that runs on the audio thread (`processBlock`, a DSP
`process()` method) with `realtime: true`:

```json
{ "id": "eq", "type": "dsp", "label": "EQ",
  "code_refs": [
    { "path": "Source/DSP/EQProcessor.cpp", "symbol": "EQProcessor::process", "realtime": true },
    { "path": "Source/DSP/EQProcessor.cpp", "symbol": "EQProcessor::getBand" }
  ] }
```

`loom-spec validate` scans the **body of the realtime symbol only** (C/C++)
and flags RT-unsafe patterns:
- heap allocation: `new`/`delete`/`malloc`/`.resize`/`.push_back`/`.emplace`/
  `.reserve`/`make_shared`/`make_unique`/`std::vector|map|string|…`
- blocking locks: `ScopedLock`/`lock_guard`/`unique_lock`/`.lock()`
- `juce::String` construction (heap-allocates)
- logging: `DBG`/`std::cout`/`printf`/`juce::Logger`
- file I/O: `juce::File`/`std::ofstream`/`fopen`
- `throw`/`dynamic_cast`

Whitelisted (NOT flagged): `std::atomic` load/store, `SmoothedValue`,
`ScopedNoDenormals`, non-blocking try-locks (`ScopedTryLockType`/`try_lock`).

`rt-unsafe` findings fail the exit code — they're real bugs.

## Why function-body-scoping matters

The scan looks only inside the realtime function's body, not the whole file.
Real example: `EQProcessor` has both

```cpp
void EQProcessor::process (juce::AudioBuffer<float>& buffer) { … }   // audio thread
EQBand EQProcessor::getBand (int index) const {                      // GUI thread
    const juce::SpinLock::ScopedLockType lock (guiBandLock);         // blocking — OK here
    return guiBands[index];
}
```

`getBand`'s blocking lock is correct (GUI reading state). Only `process` is
marked `realtime`, so only its body is scanned — and it uses a non-blocking
try-lock, which is whitelisted. A whole-file scanner would false-positive on
`getBand`; the body-scoped scan reports clean.

## Drill-down for per-function responsibilities

To document *which function inside a module does what* — and which functions
run on the audio thread — give the module node a `drill_down` to a
sub-diagram, with one node per function:

- `drill_down: "eq-internals"` on the EQ node.
- In `eq-internals.flow.json`, a node per function (label = role, code_ref =
  the function). Mark the audio-thread functions `realtime: true`; leave GUI
  functions unmarked.
- Group nodes into "Audio Thread (RT-critical)" vs "Message / GUI Thread" so
  the thread boundary is visible.

RT-safety, wiring, and signature drift all apply to sub-diagrams too, so each
audio-thread function gets individually scanned.

## Workflow when writing/refactoring audio code

- Put `realtime: true` on the code_ref for any `processBlock` / DSP
  `process()` you add to the spec.
- After writing, run `loom_validate` — if it reports `rt-unsafe`, you
  introduced a real audio-thread bug. Move the allocation/lock/logging out
  of the hot path (to `prepareToPlay` or the message thread).
- Don't suppress an rt-unsafe finding by removing `realtime: true` — fix the
  code. The marker is the whole point.
- The scan checks the function you point at, not helpers it calls. If
  `process()` calls a same-file helper that allocates, mark the helper
  `realtime` too.

Coverage: C/C++ (`.cpp/.cc/.cxx/.c/.h/.hpp/.hh/.hxx`). Other languages'
`realtime` markers are inert (harmless).
