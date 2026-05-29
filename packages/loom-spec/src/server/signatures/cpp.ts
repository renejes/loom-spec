import { canonicalize } from "./index.js";

/**
 * C / C++ extraction for signature drift AND real-time-safety scanning.
 *
 * C++ is the hardest of the supported languages (scope resolution `::`,
 * template brackets `<>`, trailing return `-> T`, constructor init lists,
 * qualifier soup `const noexcept override`). We don't aim for a perfect
 * parser — a regex + brace-matching state-machine that handles the
 * common JUCE patterns, with a bias toward false-positives over silent
 * misses, same trade-off as the other extractors.
 *
 * Unlike the other languages, C++ exposes the *function body* too —
 * the RT-safety lint scans only the body of an audio-thread method, so
 * locks/allocations in sibling GUI methods (e.g. EQProcessor::getBand)
 * don't false-positive.
 */

export interface CppFunction {
  /** Canonical single-line declaration (return type + qualified name + params + qualifiers). */
  signature: string;
  /** Source text between the body braces, exclusive. */
  body: string;
  /** Index in the original source of the first char after the opening brace. */
  bodyStartOffset: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a balanced delimiter pair starting at `openIdx` (which must point
 * at `open`). String, char-literal, and comment aware. Returns the index
 * of the matching close, or -1.
 */
function matchDelimiter(
  source: string,
  openIdx: number,
  open: string,
  close: string
): number {
  let depth = 0;
  let i = openIdx;
  let inLine = false;
  let inBlock = false;
  let inStr: '"' | "'" | null = null;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (inLine) {
      if (ch === "\n") inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === open) {
      depth++;
      i++;
      continue;
    }
    if (ch === close) {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

function skipWsAndComments(source: string, pos: number): number {
  let i = pos;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

/**
 * From just after a function's `)`, find the opening brace of its body.
 * Skips qualifiers, trailing return types, and constructor init lists
 * (balanced parens). Returns -1 if a `;` is hit first (declaration, not
 * definition) or no brace is found.
 */
function findBodyBrace(source: string, from: number): number {
  let i = from;
  let inLine = false;
  let inBlock = false;
  let inStr: '"' | "'" | null = null;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (inLine) {
      if (ch === "\n") inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === "(") {
      const close = matchDelimiter(source, i, "(", ")");
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (ch === ";") return -1;
    if (ch === "{") return i;
    i++;
  }
  return -1;
}

/**
 * Walk back from the symbol name to the start of its declaration (the
 * return type). Stops at the previous statement/block delimiter, then
 * skips forward over whitespace and comments to the first real token.
 */
function findDeclStart(source: string, nameStart: number): number {
  let i = nameStart - 1;
  while (i >= 0) {
    const ch = source[i]!;
    if (ch === ";" || ch === "}" || ch === "{") break;
    i--;
  }
  return skipWsAndComments(source, i + 1);
}

/**
 * Find and extract a C++ function definition by (optionally qualified)
 * symbol name, e.g. "EQProcessor::process" or "process". Returns the
 * first definition (declaration with a body), skipping pure declarations
 * and call sites. null if not found.
 */
export function extractCppFunction(
  source: string,
  symbol: string
): CppFunction | null {
  const re = new RegExp(escapeRegex(symbol) + "\\s*\\(", "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const parenOpen = m.index + m[0].length - 1;
    const parenClose = matchDelimiter(source, parenOpen, "(", ")");
    if (parenClose === -1) continue;
    const braceOpen = findBodyBrace(source, parenClose + 1);
    if (braceOpen === -1) continue; // declaration or call site, not a definition
    const braceClose = matchDelimiter(source, braceOpen, "{", "}");
    if (braceClose === -1) return null;
    const declStart = findDeclStart(source, m.index);
    return {
      signature: canonicalize(source.slice(declStart, braceOpen)),
      body: source.slice(braceOpen + 1, braceClose),
      bodyStartOffset: braceOpen + 1,
    };
  }
  return null;
}

export function extractCppSignature(
  source: string,
  symbol: string
): string | null {
  const fn = extractCppFunction(source, symbol);
  return fn ? fn.signature : null;
}
