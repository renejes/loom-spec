import { canonicalize } from "./index.js";

/**
 * Extract the canonical signature for a TypeScript / JavaScript symbol.
 *
 * Handles the common declaration shapes:
 *   - `function name(args): Ret { ... }`
 *   - `async function name(args): Ret { ... }`
 *   - `export function name<T>(args): Ret { ... }`
 *   - `const name = (args): Ret => { ... }` (arrow assigned to const/let)
 *   - `class C { name(args): Ret { ... } }` (method)
 *   - `interface I { name(args): Ret; }` (signature)
 *
 * Captures up to the opening `{` (function body), `;` (overload / interface
 * member), or `=>` for arrow functions (we keep the `=>` so the captured
 * string clearly identifies the shape).
 *
 * Returns null if no matching declaration is found.
 */
export function extractTypeScriptSignature(
  source: string,
  symbol: string
): string | null {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Three patterns, tried in order. The first match wins.
  // 1. function declaration / async function / generator
  // 2. const/let/var arrow or function expression
  // 3. method-like: name followed by `(` or `<` at line start (with optional modifiers)
  const patterns: RegExp[] = [
    new RegExp(
      `^[ \\t]*(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s+${escaped}\\b`,
      "m"
    ),
    new RegExp(
      `^[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*(?::\\s*[^=]+)?\\s*=\\s*(?:async\\s+)?`,
      "m"
    ),
    new RegExp(
      `^[ \\t]*(?:(?:public|private|protected|static|readonly|abstract|async|override)\\s+)*${escaped}\\s*[<(]`,
      "m"
    ),
  ];

  let match: RegExpExecArray | null = null;
  for (const re of patterns) {
    const m = re.exec(source);
    if (m) {
      // Pick the earliest match across patterns to be deterministic.
      if (!match || m.index < match.index) match = m;
    }
  }
  if (!match) return null;

  // Walk forward until we hit `{` (body), `;` (overload), or `=>` (arrow
  // body marker). For arrow functions we capture through and including
  // the `=>`. Respect parens/brackets/strings/template literals so we
  // don't terminate on punctuation inside type params.
  const startIdx = match.index;
  let i = startIdx;
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") {
      // `<` here can be either a generic param OR a comparison. In
      // declaration contexts comparisons are rare; we accept the FP rate.
      // BUT: only count `<` when at depth-0 right after the symbol name
      // or after `)`/`>`. Simpler: only count `<` if depth-0 — generic
      // openings can themselves contain `<` (nested) which we track.
      if (ch === "{" && depth === 0) {
        // Function body — done.
        return canonicalize(source.slice(startIdx, i));
      }
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}" || ch === ">") {
      depth--;
      i++;
      continue;
    }
    if (ch === ";" && depth === 0) {
      // Overload / interface member / abstract method signature.
      return canonicalize(source.slice(startIdx, i + 1));
    }
    if (ch === "=" && next === ">" && depth === 0) {
      // Arrow function: include `=>` and stop.
      return canonicalize(source.slice(startIdx, i + 2));
    }
    i++;
  }
  return null;
}
