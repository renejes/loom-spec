/**
 * Smoke-test for the signature-fingerprint drift check.
 *
 * Two phases:
 *   1. Unit-style: each language extractor is called with inline source
 *      and the canonical output is asserted.
 *   2. End-to-end: a tmp `.loom/` is created next to tmp source files in
 *      4 languages; `runDriftCheck` is run in capture mode, hints land
 *      in the JSON, source is then mutated, second pass reports drift.
 *
 * Both phases clean up. Run with:
 *   pnpm --filter loom-spec exec tsx scripts/smoke-signatures.ts
 */
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { extractPythonSignature } from "../src/server/signatures/python.js";
import { extractTypeScriptSignature } from "../src/server/signatures/typescript.js";
import { extractRustSignature } from "../src/server/signatures/rust.js";
import { extractSvelteSignature } from "../src/server/signatures/svelte.js";
import { runDriftCheck } from "../src/server/drift.js";

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

// ─── Phase 1: extractor unit-checks ────────────────────────────────

const PYTHON_SRC = `import os

@decorator
def parse_pdf(file_path: str, options: dict = None) -> dict:
    """Read a PDF and return parsed data."""
    with open(file_path) as f:
        return _parse(f.read())

async def fetch_remote(
    url: str,
    timeout: float = 5.0,
) -> bytes:
    return await client.get(url)

class PdfParser(BaseParser):
    pass
`;

expect(
  "python: simple def with type hints",
  extractPythonSignature(PYTHON_SRC, "parse_pdf") ===
    "def parse_pdf(file_path: str, options: dict = None) -> dict:"
);
expect(
  "python: multi-line async def collapses to one line",
  extractPythonSignature(PYTHON_SRC, "fetch_remote") ===
    "async def fetch_remote( url: str, timeout: float = 5.0, ) -> bytes:"
);
expect(
  "python: class declaration",
  extractPythonSignature(PYTHON_SRC, "PdfParser") === "class PdfParser(BaseParser):"
);
expect(
  "python: unknown symbol returns null",
  extractPythonSignature(PYTHON_SRC, "nope") === null
);

const TS_SRC = `import { x } from "y";

export function handlePay(req: Request, res: Response): void {
  res.send("ok");
}

export const compute = async (input: number): Promise<number> => {
  return input * 2;
};

class Service {
  async fetch<T extends Item>(id: string): Promise<T | null> {
    return null;
  }

  public render(): JSX.Element {
    return <div />;
  }
}

interface Api {
  ping(timeout: number): boolean;
}
`;

expect(
  "ts: function declaration",
  extractTypeScriptSignature(TS_SRC, "handlePay") ===
    "export function handlePay(req: Request, res: Response): void"
);
expect(
  "ts: arrow function captured with =>",
  extractTypeScriptSignature(TS_SRC, "compute") ===
    "export const compute = async (input: number): Promise<number> =>"
);
expect(
  "ts: generic method",
  extractTypeScriptSignature(TS_SRC, "fetch") ===
    "async fetch<T extends Item>(id: string): Promise<T | null>"
);
expect(
  "ts: method with modifier",
  extractTypeScriptSignature(TS_SRC, "render") === "public render(): JSX.Element"
);
expect(
  "ts: interface signature ends with semicolon",
  extractTypeScriptSignature(TS_SRC, "ping") === "ping(timeout: number): boolean;"
);

const RUST_SRC = `pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub async fn fetch_user(id: UserId) -> Result<User, Error> {
    db.get(id).await
}

pub fn complex<'a, T: Clone + Send>(input: &'a T, ctx: &mut Context) -> Result<Output<T>, MyError>
where
    T: 'static,
{
    todo!()
}

pub(crate) fn restricted() {}

trait Service {
    fn ping(&self, timeout: u64) -> bool;
}
`;

expect(
  "rust: simple pub fn",
  extractRustSignature(RUST_SRC, "add") === "pub fn add(a: i32, b: i32) -> i32"
);
expect(
  "rust: async fn",
  extractRustSignature(RUST_SRC, "fetch_user") ===
    "pub async fn fetch_user(id: UserId) -> Result<User, Error>"
);
expect(
  "rust: generics + lifetimes + where clause",
  extractRustSignature(RUST_SRC, "complex") ===
    "pub fn complex<'a, T: Clone + Send>(input: &'a T, ctx: &mut Context) -> Result<Output<T>, MyError> where T: 'static,"
);
expect(
  "rust: pub(crate)",
  extractRustSignature(RUST_SRC, "restricted") === "pub(crate) fn restricted()"
);
expect(
  "rust: trait method ends with semicolon",
  extractRustSignature(RUST_SRC, "ping") === "fn ping(&self, timeout: u64) -> bool;"
);

const SVELTE_SRC = `<script lang="ts">
  export let count: number = 0;

  function increment(by: number): void {
    count += by;
  }

  const formatted = (n: number): string => n.toFixed(2);
</script>

<button on:click={() => increment(1)}>{formatted(count)}</button>
`;

expect(
  "svelte: function inside <script>",
  extractSvelteSignature(SVELTE_SRC, "increment") ===
    "function increment(by: number): void"
);
expect(
  "svelte: arrow inside <script>",
  extractSvelteSignature(SVELTE_SRC, "formatted") ===
    "const formatted = (n: number): string =>"
);

// ─── Phase 2: end-to-end with runDriftCheck ────────────────────────

async function endToEnd() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-sig-e2e-"));
  try {
    // Set up source files
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src/parser.py"), PYTHON_SRC);
    await writeFile(join(tmp, "src/api.ts"), TS_SRC);
    await writeFile(join(tmp, "src/lib.rs"), RUST_SRC);
    await writeFile(join(tmp, "src/Counter.svelte"), SVELTE_SRC);

    // Set up minimal .loom/ with one diagram + one node-types
    const loomPath = join(tmp, ".loom");
    await mkdir(join(loomPath, "diagrams"), { recursive: true });
    await writeFile(
      join(loomPath, "node-types.json"),
      JSON.stringify(
        {
          version: "1",
          types: {
            service: { label: "Service", color: "#6366f1", icon: "server", fields: [] },
          },
        },
        null,
        2
      )
    );
    await writeFile(
      join(loomPath, "diagrams/test.flow.json"),
      JSON.stringify(
        {
          version: "1",
          id: "test",
          title: "Multi-language drift fixture",
          nodes: [
            {
              id: "py",
              type: "service",
              label: "PDF Parser",
              position: { x: 80, y: 80 },
              status: "implemented",
              code_refs: [{ path: "src/parser.py", symbol: "parse_pdf" }],
            },
            {
              id: "ts",
              type: "service",
              label: "Payments API",
              position: { x: 380, y: 80 },
              status: "implemented",
              code_refs: [{ path: "src/api.ts", symbol: "handlePay" }],
            },
            {
              id: "rs",
              type: "service",
              label: "Rust Adder",
              position: { x: 80, y: 240 },
              status: "implemented",
              code_refs: [{ path: "src/lib.rs", symbol: "add" }],
            },
            {
              id: "sv",
              type: "service",
              label: "Counter Component",
              position: { x: 380, y: 240 },
              status: "implemented",
              code_refs: [{ path: "src/Counter.svelte", symbol: "increment" }],
            },
          ],
          edges: [],
        },
        null,
        2
      ) + "\n"
    );

    // Pass 1: capture mode fills signature_hints
    const r1 = await runDriftCheck(tmp, loomPath, { capture: "capture" });
    expect("e2e: capture mode reports 0 drift", r1.totalDrift === 0);
    expect("e2e: capture mode captured 4 hints", r1.capturedCount === 4);
    expect(
      "e2e: capture mode no signature-missing after capture (counted before write)",
      r1.totalSignatureMissing === 4
    );

    // Re-read JSON to confirm hints persisted
    const written = JSON.parse(
      await readFile(join(loomPath, "diagrams/test.flow.json"), "utf8")
    );
    const refs = written.nodes.map((n: { code_refs: { signature_hint?: string }[] }) =>
      n.code_refs[0]?.signature_hint
    );
    expect("e2e: python hint written", refs[0]?.startsWith("def parse_pdf("));
    expect("e2e: ts hint written", refs[1]?.startsWith("export function handlePay("));
    expect("e2e: rust hint written", refs[2] === "pub fn add(a: i32, b: i32) -> i32");
    expect(
      "e2e: svelte hint written",
      refs[3] === "function increment(by: number): void"
    );

    // Pass 2: no changes → no drift, no missing
    const r2 = await runDriftCheck(tmp, loomPath);
    expect("e2e: pass 2 zero drift", r2.totalDrift === 0);
    expect("e2e: pass 2 zero signature-missing", r2.totalSignatureMissing === 0);

    // Mutate a function signature — change parse_pdf's first param type
    const mutated = PYTHON_SRC.replace(
      "def parse_pdf(file_path: str",
      "def parse_pdf(input_data: dict"
    );
    await writeFile(join(tmp, "src/parser.py"), mutated);

    // Pass 3: should detect signature drift on the Python node
    const r3 = await runDriftCheck(tmp, loomPath);
    expect("e2e: drift detected after mutation", r3.totalDrift === 1);
    const drift = r3.perDiagram[0]!.drift[0];
    expect(
      "e2e: drift finding is signature-drift on parse_pdf",
      drift?.issue === "signature-drift" && drift.nodeId === "py"
    );

    // Pass 4: recapture mode acknowledges the new state
    const r4 = await runDriftCheck(tmp, loomPath, { capture: "recapture" });
    expect("e2e: recapture clears drift", r4.totalDrift === 0);
    expect("e2e: recapture wrote 1 updated hint", r4.capturedCount === 1);

    const reWritten = JSON.parse(
      await readFile(join(loomPath, "diagrams/test.flow.json"), "utf8")
    );
    expect(
      "e2e: parse_pdf hint reflects new signature",
      (reWritten.nodes[0].code_refs[0].signature_hint as string).includes(
        "input_data: dict"
      )
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await endToEnd();
