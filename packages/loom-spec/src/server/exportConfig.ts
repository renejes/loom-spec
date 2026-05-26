/**
 * Optional `.loom/exports.json` config — defines named export bundles so
 * teams can keep export settings versioned in the repo instead of in shell
 * commands. A new contributor runs `loom-spec export-html user-manual`
 * and gets the same output as everyone else without having to remember
 * which flags to pass.
 *
 * Shape:
 *
 *   {
 *     "exports": {
 *       "user-manual": {
 *         "include-tags": ["public"],
 *         "exclude-tags": ["wip"],
 *         "diagram": "overview",       // optional, single-diagram mode
 *         "out": "docs/architecture.html"  // optional, default loom.html
 *       },
 *       "ops-runbook": {
 *         "include-tags": ["ops"]
 *       }
 *     }
 *   }
 *
 * All fields are optional. Unknown keys are tolerated (forward-compat).
 * CLI flags override config values when both are present.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface NamedExport {
  includeTags?: string[];
  excludeTags?: string[];
  diagram?: string;
  fromJourney?: string;
  out?: string;
}

export interface ExportsFile {
  exports: Record<string, NamedExport>;
}

interface RawNamedExport {
  "include-tags"?: unknown;
  "exclude-tags"?: unknown;
  diagram?: unknown;
  "from-journey"?: unknown;
  out?: unknown;
}

interface RawExportsFile {
  exports?: Record<string, RawNamedExport>;
}

function asStringArray(v: unknown, where: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) {
    throw new Error(`exports.json: ${where} must be an array of strings`);
  }
  return v as string[];
}

function asString(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    throw new Error(`exports.json: ${where} must be a string`);
  }
  return v;
}

function normalize(raw: RawExportsFile): ExportsFile {
  const out: ExportsFile = { exports: {} };
  const entries = Object.entries(raw.exports ?? {});
  for (const [name, e] of entries) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `exports.json: bundle name '${name}' must match ^[a-z0-9-]+$`
      );
    }
    out.exports[name] = {
      includeTags: asStringArray(e["include-tags"], `${name}.include-tags`),
      excludeTags: asStringArray(e["exclude-tags"], `${name}.exclude-tags`),
      diagram: asString(e.diagram, `${name}.diagram`),
      fromJourney: asString(e["from-journey"], `${name}.from-journey`),
      out: asString(e.out, `${name}.out`),
    };
  }
  return out;
}

/**
 * Try to read `.loom/exports.json`. Returns null when the file is missing
 * (that's a normal, non-error state — exports config is opt-in).
 */
export async function loadExportsConfig(
  loomPath: string
): Promise<ExportsFile | null> {
  try {
    const raw = await readFile(resolve(loomPath, "exports.json"), "utf8");
    const parsed = JSON.parse(raw) as RawExportsFile;
    return normalize(parsed);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw e;
  }
}
