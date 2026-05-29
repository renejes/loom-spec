/**
 * Real-time-safety lint for C++ / JUCE audio code.
 *
 * Scans the body of a function marked `realtime: true` for patterns
 * that are unsafe to run on the audio thread: heap allocation, blocking
 * locks, string construction, logging, file I/O, exceptions. These are
 * the #1 source of audio dropouts and glitches in plugin development.
 *
 * Key design point (validated against real channelstrip code): scan
 * only the *body* of the realtime function, not the whole file. That
 * way a blocking lock in a sibling GUI method (e.g. EQProcessor::getBand)
 * doesn't false-positive — only the audio-thread method is checked.
 *
 * Whitelisting is by careful pattern design, not an exclude-list:
 *   - `std::atomic` load/store → not a pattern (atomics are the SOLUTION)
 *   - `SmoothedValue` → not a pattern
 *   - `ScopedNoDenormals` → `\bScopedLock\b` won't match it
 *   - `ScopedTryLockType` / `try_lock()` → Try variants excluded (non-blocking)
 *
 * Comments and string/char literals are masked before scanning so a
 * `// allocate later` comment or a `"new"` string literal doesn't trip.
 */

export interface RtFinding {
  patternId: string;
  label: string;
  /** 1-based line number in the original source file. */
  line: number;
  /** The offending line, trimmed. */
  snippet: string;
}

interface RtPattern {
  id: string;
  label: string;
  re: RegExp;
}

// Order matters only for reporting; all patterns are checked.
const RT_PATTERNS: RtPattern[] = [
  { id: "heap-new", label: "heap allocation (new/delete)", re: /\b(new|delete)\b/g },
  { id: "heap-c", label: "C heap allocation", re: /\b(malloc|calloc|realloc|free)\s*\(/g },
  {
    id: "container-grow",
    label: "container allocation/realloc",
    re: /\.(resize|push_back|emplace_back|emplace|insert|reserve|assign)\s*\(/g,
  },
  { id: "smart-ptr", label: "smart-pointer allocation", re: /\b(make_shared|make_unique)\s*\(/g },
  {
    id: "std-container",
    label: "heap container/string construction",
    re: /\bstd::(vector|map|unordered_map|set|unordered_set|list|deque|string)\b/g,
  },
  // Blocking locks only. ScopedTryLockType / try_lock() are non-blocking → excluded.
  {
    id: "blocking-lock",
    label: "blocking lock on audio thread",
    re: /\b(ScopedLock|ScopedLockType|lock_guard|unique_lock|scoped_lock)\b/g,
  },
  { id: "mutex-lock", label: "mutex.lock()", re: /\.lock\s*\(\s*\)/g },
  { id: "juce-string", label: "juce::String (heap-allocates)", re: /\bjuce::String\b/g },
  { id: "logging", label: "logging on audio thread", re: /\b(DBG|printf|puts)\s*\(|\bstd::cout\b|\bjuce::Logger\b/g },
  {
    id: "file-io",
    label: "file I/O on audio thread",
    re: /\bjuce::File\b|\bstd::(ofstream|ifstream|fstream)\b|\bfopen\s*\(/g,
  },
  { id: "exceptions", label: "throw / dynamic_cast", re: /\bthrow\b|\bdynamic_cast\s*</g },
];

/**
 * Replace comment and string/char-literal content with spaces, preserving
 * length and newlines so match offsets still map to original lines.
 */
function maskCommentsAndStrings(code: string): string {
  const out = new Array<string>(code.length);
  let i = 0;
  let mode: "code" | "line" | "block" | "str" | "char" = "code";
  while (i < code.length) {
    const ch = code[i]!;
    const next = code[i + 1];
    if (mode === "code") {
      if (ch === "/" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        mode = "line";
        continue;
      }
      if (ch === "/" && next === "*") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        mode = "block";
        continue;
      }
      if (ch === '"') {
        out[i] = " ";
        i++;
        mode = "str";
        continue;
      }
      if (ch === "'") {
        out[i] = " ";
        i++;
        mode = "char";
        continue;
      }
      out[i] = ch;
      i++;
      continue;
    }
    if (mode === "line") {
      if (ch === "\n") {
        out[i] = "\n";
        mode = "code";
      } else {
        out[i] = " ";
      }
      i++;
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        mode = "code";
        continue;
      }
      out[i] = ch === "\n" ? "\n" : " ";
      i++;
      continue;
    }
    // str or char
    if (ch === "\\") {
      out[i] = " ";
      out[i + 1] = next === "\n" ? "\n" : " ";
      i += 2;
      continue;
    }
    if ((mode === "str" && ch === '"') || (mode === "char" && ch === "'")) {
      out[i] = " ";
      i++;
      mode = "code";
      continue;
    }
    out[i] = ch === "\n" ? "\n" : " ";
    i++;
  }
  return out.join("");
}

function countNewlines(s: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to && i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

function lineSnippet(body: string, matchIdx: number): string {
  let start = matchIdx;
  while (start > 0 && body[start - 1] !== "\n") start--;
  let end = matchIdx;
  while (end < body.length && body[end] !== "\n") end++;
  return body.slice(start, end).trim();
}

/**
 * Scan a function body for RT-unsafe patterns. `bodyStartOffset` is the
 * index of the body's first char in `fullSource` (used to compute file
 * line numbers).
 */
export function scanRtSafety(
  body: string,
  bodyStartOffset: number,
  fullSource: string
): RtFinding[] {
  const masked = maskCommentsAndStrings(body);
  const baseLine = countNewlines(fullSource, 0, bodyStartOffset) + 1;
  const findings: RtFinding[] = [];
  const seen = new Set<string>(); // dedupe identical (pattern,line)
  for (const pat of RT_PATTERNS) {
    pat.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.re.exec(masked)) !== null) {
      const line = baseLine + countNewlines(body, 0, m.index);
      const key = `${pat.id}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        patternId: pat.id,
        label: pat.label,
        line,
        snippet: lineSnippet(body, m.index),
      });
      // Guard against zero-width matches (none here, but safe)
      if (m.index === pat.re.lastIndex) pat.re.lastIndex++;
    }
  }
  findings.sort((a, b) => a.line - b.line);
  return findings;
}
