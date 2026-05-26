import { canonicalize } from "./index.js";

/**
 * Extract the canonical signature for a Rust function.
 *
 * Handles:
 *   - `fn name(args) -> Ret { ... }`
 *   - `pub fn name(args) -> Ret`
 *   - `pub(crate) fn name(args) -> Ret`
 *   - `pub async fn name(args) -> Ret`
 *   - `unsafe fn name(args) -> Ret`
 *   - `extern "C" fn name(args) -> Ret`
 *   - `const fn name(args) -> Ret`
 *   - Generic params: `fn name<T: Trait>(args) -> Ret where T: Send`
 *   - Trait method declarations: `fn name(args) -> Ret;` (no body)
 *
 * Captures up to the `{` (function body) or `;` (trait method). Respects
 * the modifier soup that Rust allows in any order.
 */
export function extractRustSignature(
  source: string,
  symbol: string
): string | null {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Modifier soup: any of pub, pub(restrict), async, unsafe, const,
  // extern "ABI" — in any order. Then `fn name`.
  const re = new RegExp(
    `^[ \\t]*(?:(?:pub(?:\\([^)]*\\))?|async|unsafe|const|extern\\s+"[^"]*")\\s+)*fn\\s+${escaped}\\b`,
    "m"
  );
  const match = re.exec(source);
  if (!match) return null;

  const startIdx = match.index;
  let i = startIdx;
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let blockCommentDepth = 0;

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "/" && next === "*") {
        blockCommentDepth++;
        i += 2;
        continue;
      }
      if (ch === "*" && next === "/") {
        blockCommentDepth--;
        if (blockCommentDepth === 0) inBlockComment = false;
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
      blockCommentDepth = 1;
      i += 2;
      continue;
    }
    // `->` is the return-type arrow. The `>` here is NOT a bracket close;
    // mishandling it makes depth go negative and we never find the `{`.
    if (ch === "-" && next === ">") {
      i += 2;
      continue;
    }

    if (ch === '"') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === "'") {
      // Rust uses `'` for both char literals and lifetimes. Disambiguate:
      // a char literal looks like 'x' or '\n'; a lifetime is 'a followed
      // by non-' chars. Cheap check: if the next 2 chars are <ch>', treat
      // as char; otherwise lifetime.
      if (next && source[i + 2] === "'") {
        i += 3;
        continue;
      }
      if (ch === "'" && next === "\\") {
        // Escaped char literal — find the closing '
        let j = i + 2;
        while (j < source.length && source[j] !== "'") j++;
        i = j + 1;
        continue;
      }
      // Lifetime — skip the apostrophe only
      i++;
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "<") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === ">") {
      depth--;
      i++;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        return canonicalize(source.slice(startIdx, i));
      }
      depth++;
      i++;
      continue;
    }
    if (ch === "}") {
      depth--;
      i++;
      continue;
    }
    if (ch === ";" && depth === 0) {
      return canonicalize(source.slice(startIdx, i + 1));
    }
    i++;
  }
  return null;
}
