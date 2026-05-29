/**
 * Language-aware signature extraction for `code_refs[].signature_hint`.
 *
 * The goal: catch semantic drift that the existence check misses. If a
 * function still exists by name but its signature changed materially
 * (parameter types, return type, async-ness), the canonical signature
 * we captured at `--capture` time will no longer match the source, and
 * `loom-spec validate` warns.
 *
 * Each extractor returns a canonical single-line representation of the
 * symbol's declaration — whitespace collapsed, comparable as a plain
 * string. Returns null if the symbol isn't found.
 *
 * Approach is intentionally regex + state-machine (no tree-sitter dep)
 * — fast, dependency-free, ~80% accurate. False positives produce
 * warnings, not errors; agents read them and decide.
 */
import { extractPythonSignature } from "./python.js";
import { extractTypeScriptSignature } from "./typescript.js";
import { extractRustSignature } from "./rust.js";
import { extractSvelteSignature } from "./svelte.js";
import { extractCppSignature } from "./cpp.js";

export type SignatureExtractor = (
  source: string,
  symbol: string
) => string | null;

const EXTENSIONS: Record<string, SignatureExtractor> = {
  ".py": extractPythonSignature,
  ".ts": extractTypeScriptSignature,
  ".tsx": extractTypeScriptSignature,
  ".js": extractTypeScriptSignature,
  ".jsx": extractTypeScriptSignature,
  ".mjs": extractTypeScriptSignature,
  ".cjs": extractTypeScriptSignature,
  ".rs": extractRustSignature,
  ".svelte": extractSvelteSignature,
  ".cpp": extractCppSignature,
  ".cc": extractCppSignature,
  ".cxx": extractCppSignature,
  ".c": extractCppSignature,
  ".h": extractCppSignature,
  ".hpp": extractCppSignature,
  ".hh": extractCppSignature,
  ".hxx": extractCppSignature,
};

const CPP_EXTENSIONS = new Set([
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".hh",
  ".hxx",
]);

/** True if the file extension is a C/C++ source/header we can body-scan. */
export function isCppPath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return CPP_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

/**
 * Returns the canonical signature for `symbol` in `source`, or null if
 * the symbol can't be found or the file extension isn't supported.
 *
 * `filePath` is used only for the extension dispatch. The actual
 * extraction operates on `source` so callers can avoid re-reading.
 */
export function extractSignature(
  filePath: string,
  source: string,
  symbol: string
): string | null {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filePath.slice(dot).toLowerCase();
  const extractor = EXTENSIONS[ext];
  if (!extractor) return null;
  return extractor(source, symbol);
}

/**
 * Canonicalize a captured signature snippet: collapse all whitespace
 * runs (incl newlines) to single spaces, trim. Robust against
 * autoformatter line-break differences.
 */
export function canonicalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * True if the file extension is one we know how to parse. Use to decide
 * whether to attempt signature capture vs. silently skip.
 */
export function isSupportedExtension(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return EXTENSIONS[filePath.slice(dot).toLowerCase()] !== undefined;
}
