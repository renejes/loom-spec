import { canonicalize } from "./index.js";

/**
 * Extract the canonical signature for a Python function or class.
 *
 * Handles:
 *   - `def name(args) -> ret:`
 *   - `async def name(args) -> ret:`
 *   - `class Name(Base):`
 *   - multi-line signatures (params wrapped across lines)
 *
 * Skips:
 *   - decorators (we don't capture them; the def line is the contract)
 *   - method definitions inside classes are returned with their `def`
 *     line; the caller can't easily distinguish "method of class X" vs
 *     "top-level function" without parsing — pragmatic compromise:
 *     the first matching symbol wins.
 *
 * Returns null if the symbol can't be located.
 */
export function extractPythonSignature(
  source: string,
  symbol: string
): string | null {
  // Match `def`, `async def`, or `class` followed by the symbol name.
  // Use word boundary on the name to avoid `parse_foo` matching `parse`.
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^([ \\t]*)(async\\s+def|def|class)\\s+${escaped}\\b`,
    "m"
  );
  const match = re.exec(source);
  if (!match) return null;

  // Walk forward from the match start, capturing until the colon that
  // ends the signature (i.e. the `:` outside any parens/brackets/quotes).
  const startIdx = match.index;
  let i = startIdx;
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let stringTriple = false;

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    const next2 = source[i + 2];

    if (inString) {
      if (stringTriple && ch === inString && next === inString && next2 === inString) {
        inString = null;
        stringTriple = false;
        i += 3;
        continue;
      }
      if (!stringTriple && (ch === inString || ch === "\n")) {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (next === ch && next2 === ch) {
        inString = ch;
        stringTriple = true;
        i += 3;
        continue;
      }
      inString = ch;
      i++;
      continue;
    }

    if (ch === "#") {
      // Comment to end of line
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      i++;
      continue;
    }

    if (ch === ":" && depth === 0) {
      // Found end of signature
      return canonicalize(source.slice(startIdx, i + 1));
    }
    i++;
  }
  // Reached EOF without finding the terminating colon — malformed source.
  return null;
}
