/**
 * Smoke-test for the C++ extractor + RT-safety lint (Phase 10).
 *
 * Two layers:
 *  1. Unit: extractCppFunction signature + body extraction on tricky C++.
 *  2. Unit: scanRtSafety flags the unsafe patterns, whitelists the safe
 *     ones (atomics, SmoothedValue, ScopedNoDenormals, try-locks).
 *  3. End-to-end: runDriftCheck against a tmp .loom + C++ source with a
 *     clean process() (0 findings) and a dirty one (findings), proving
 *     function-body scoping (a lock in a sibling GUI method is NOT
 *     flagged when that method isn't realtime-marked).
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-rt-safety.ts
 */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCppFunction } from "../src/server/signatures/cpp.js";
import { scanRtSafety } from "../src/server/rtSafety.js";
import { runDriftCheck } from "../src/server/drift.js";

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

// ─── 1. C++ extractor units ────────────────────────────────────────

const CPP = `#include <vector>

namespace dsp {

// A clean real-time-safe process method.
void EQProcessor::process (juce::AudioBuffer<float>& buffer)
{
    juce::ScopedNoDenormals noDenormals;
    const juce::SpinLock::ScopedTryLockType lock (guiBandLock); // non-blocking, OK
    float g = gain.getNextValue();           // SmoothedValue, OK
    int n = buffer.getNumSamples();
    bypassed.store (false);                   // atomic, OK
    for (int i = 0; i < n; ++i)
        buffer.setSample (0, i, buffer.getSample (0, i) * g);
}

// A GUI getter that blocks — NOT realtime, must not be scanned.
EQBand EQProcessor::getBand (int index) const
{
    const juce::SpinLock::ScopedLockType lock (guiBandLock);
    return guiBands[index];
}

// A dirty process method with multiple RT violations.
void BadProcessor::process (juce::AudioBuffer<float>& buffer)
{
    auto* scratch = new float[512];           // heap alloc
    std::vector<float> temp;                  // heap container
    temp.resize (buffer.getNumSamples());     // realloc
    const juce::ScopedLock sl (mutex);        // blocking lock
    juce::String msg ("processing");          // juce::String alloc
    DBG ("hello from audio thread");          // logging
    delete[] scratch;                         // delete
}

auto TrailingReturn::compute (int x) const noexcept -> float
{
    return (float) x;
}

}
`;

const proc = extractCppFunction(CPP, "EQProcessor::process");
expect(
  "extracts qualified process signature",
  proc?.signature === "void EQProcessor::process (juce::AudioBuffer<float>& buffer)"
);
expect("process body contains the try-lock", !!proc?.body.includes("ScopedTryLockType"));
expect("process body does NOT bleed into getBand", !proc?.body.includes("guiBands["));

const getBand = extractCppFunction(CPP, "EQProcessor::getBand");
expect(
  "extracts const getter signature",
  getBand?.signature === "EQBand EQProcessor::getBand (int index) const"
);

const trailing = extractCppFunction(CPP, "TrailingReturn::compute");
expect(
  "handles trailing return type",
  trailing?.signature === "auto TrailingReturn::compute (int x) const noexcept -> float"
);

const missing = extractCppFunction(CPP, "DoesNotExist::nope");
expect("unknown symbol returns null", missing === null);

// ─── 2. scanRtSafety units ─────────────────────────────────────────

const cleanFindings = scanRtSafety(proc!.body, proc!.bodyStartOffset, CPP);
expect(
  "clean process() yields ZERO findings (try-lock/atomic/SmoothedValue/ScopedNoDenormals whitelisted)",
  cleanFindings.length === 0,
  cleanFindings.map((f) => f.label).join(", ")
);

const bad = extractCppFunction(CPP, "BadProcessor::process")!;
const badFindings = scanRtSafety(bad.body, bad.bodyStartOffset, CPP);
const ids = new Set(badFindings.map((f) => f.patternId));
expect("dirty: flags heap new/delete", ids.has("heap-new"));
expect("dirty: flags std container", ids.has("std-container"));
expect("dirty: flags container realloc (resize)", ids.has("container-grow"));
expect("dirty: flags blocking lock", ids.has("blocking-lock"));
expect("dirty: flags juce::String", ids.has("juce-string"));
expect("dirty: flags logging (DBG)", ids.has("logging"));
expect(
  "dirty findings carry real line numbers",
  badFindings.every((f) => f.line > 0 && typeof f.snippet === "string")
);

// Comment/string masking: a comment with 'new' and a string "delete" must not trip.
const masked = `void P::process (X& b)
{
    // we will new and delete here later
    const char* s = "please delete this";
    b.clear();
}
`;
const mp = extractCppFunction(masked, "P::process")!;
expect(
  "comments/strings are masked (no false positive on 'new'/'delete' in comment/string)",
  scanRtSafety(mp.body, mp.bodyStartOffset, masked).length === 0
);

// ─── 3. End-to-end via runDriftCheck ───────────────────────────────

async function endToEnd() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-rt-"));
  try {
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src/dsp.cpp"), CPP);

    const loomPath = join(tmp, ".loom");
    await mkdir(join(loomPath, "diagrams"), { recursive: true });
    await writeFile(
      join(loomPath, "node-types.json"),
      JSON.stringify(
        { version: "1", types: { dsp: { label: "DSP", color: "#34d399" } } },
        null,
        2
      )
    );
    await writeFile(
      join(loomPath, "diagrams/overview.flow.json"),
      JSON.stringify(
        {
          version: "1",
          id: "overview",
          title: "RT fixture",
          nodes: [
            {
              id: "eq",
              type: "dsp",
              label: "EQ",
              position: { x: 80, y: 80 },
              status: "implemented",
              code_refs: [
                { path: "src/dsp.cpp", symbol: "EQProcessor::process", realtime: true },
                // getBand referenced but NOT realtime → its blocking lock must be ignored
                { path: "src/dsp.cpp", symbol: "EQProcessor::getBand" },
              ],
            },
            {
              id: "bad",
              type: "dsp",
              label: "Bad",
              position: { x: 380, y: 80 },
              status: "implemented",
              code_refs: [
                { path: "src/dsp.cpp", symbol: "BadProcessor::process", realtime: true },
              ],
            },
          ],
          edges: [],
        },
        null,
        2
      ) + "\n"
    );

    const report = await runDriftCheck(tmp, loomPath);
    const eqReport = report.perDiagram[0]!;
    const rtFindings = eqReport.drift.filter((f) => f.issue === "rt-unsafe");
    expect(
      "e2e: clean EQ::process produces no rt-unsafe findings",
      !rtFindings.some((f) => f.nodeId === "eq")
    );
    expect(
      "e2e: getBand's blocking lock is NOT flagged (not realtime-marked)",
      !rtFindings.some((f) => f.detail?.includes("guiBandLock") && f.nodeId === "eq")
    );
    expect(
      "e2e: BadProcessor::process produces multiple rt-unsafe findings",
      rtFindings.filter((f) => f.nodeId === "bad").length >= 5
    );
    expect("e2e: totalRtUnsafe is counted", report.totalRtUnsafe >= 5);
    expect(
      "e2e: rt-unsafe is separate from totalDrift",
      report.totalDrift === 0
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await endToEnd();
