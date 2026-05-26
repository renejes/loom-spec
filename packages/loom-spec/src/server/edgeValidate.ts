/**
 * Validates an edge's `properties` object against the project's
 * declared `edge_types` vocabulary in `node-types.json`. When no
 * vocabulary is declared, edges are unconstrained (the v0.7.0
 * behaviour, fully backwards-compatible).
 *
 * Pure functions — return findings; the caller (drift.ts) decides
 * how to report them.
 */
import type { LoomNodeTypes } from "../types/node-types.js";
import type { Edge as LoomEdge } from "../types/diagram.js";

export type EdgePropertyIssue =
  | { kind: "unknown-property"; name: string; allowed: string[] }
  | { kind: "missing-required"; name: string }
  | { kind: "wrong-type"; name: string; expected: string; got: string }
  | { kind: "enum-value-not-allowed"; name: string; value: string; allowed: string[] }
  | { kind: "out-of-range"; name: string; detail: string };

export interface EdgePropertyFinding {
  edgeId: string;
  issue: EdgePropertyIssue;
}

/**
 * Returns an array of findings. Empty array = edge complies with its
 * kind's vocabulary (or no vocabulary is declared).
 */
export function validateEdgeProperties(
  edge: LoomEdge,
  nodeTypes: LoomNodeTypes
): EdgePropertyFinding[] {
  const vocabulary = nodeTypes.edge_types?.[edge.kind];
  if (!vocabulary) return [];
  const declared = vocabulary.properties ?? [];
  if (declared.length === 0) return [];

  const findings: EdgePropertyFinding[] = [];
  const props = edge.properties ?? {};
  const declaredByName = new Map(declared.map((f) => [f.name, f] as const));

  // Unknown keys
  for (const key of Object.keys(props)) {
    if (!declaredByName.has(key)) {
      findings.push({
        edgeId: edge.id,
        issue: {
          kind: "unknown-property",
          name: key,
          allowed: declared.map((f) => f.name),
        },
      });
    }
  }

  // Required-missing + type/value checks
  for (const field of declared) {
    const value = props[field.name];
    if (value === undefined || value === null) {
      if (field.required) {
        findings.push({
          edgeId: edge.id,
          issue: { kind: "missing-required", name: field.name },
        });
      }
      continue;
    }
    const issue = checkValue(field, value);
    if (issue) findings.push({ edgeId: edge.id, issue });
  }

  return findings;
}

function checkValue(
  field: { name: string; type: string; values?: unknown[]; items?: string; min?: number; max?: number; pattern?: string; max_length?: number },
  value: unknown
): EdgePropertyIssue | null {
  const got = describeType(value);
  switch (field.type) {
    case "string":
    case "markdown":
    case "code-ref": {
      if (typeof value !== "string") {
        return { kind: "wrong-type", name: field.name, expected: field.type, got };
      }
      if (field.max_length !== undefined && value.length > field.max_length) {
        return {
          kind: "out-of-range",
          name: field.name,
          detail: `length ${value.length} exceeds max_length ${field.max_length}`,
        };
      }
      if (field.pattern !== undefined) {
        try {
          if (!new RegExp(field.pattern).test(value)) {
            return {
              kind: "out-of-range",
              name: field.name,
              detail: `does not match pattern ${field.pattern}`,
            };
          }
        } catch {
          // Bad pattern in schema; skip silently
        }
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number") {
        return { kind: "wrong-type", name: field.name, expected: "number", got };
      }
      if (field.min !== undefined && value < field.min) {
        return {
          kind: "out-of-range",
          name: field.name,
          detail: `${value} < min ${field.min}`,
        };
      }
      if (field.max !== undefined && value > field.max) {
        return {
          kind: "out-of-range",
          name: field.name,
          detail: `${value} > max ${field.max}`,
        };
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return { kind: "wrong-type", name: field.name, expected: "boolean", got };
      }
      return null;
    }
    case "enum": {
      const allowed = (field.values ?? []).map(String);
      if (typeof value !== "string" || !allowed.includes(value)) {
        return {
          kind: "enum-value-not-allowed",
          name: field.name,
          value: String(value),
          allowed,
        };
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) {
        return { kind: "wrong-type", name: field.name, expected: "array", got };
      }
      if (field.items === "string" && !value.every((v) => typeof v === "string")) {
        return {
          kind: "wrong-type",
          name: field.name,
          expected: "array<string>",
          got: "array with non-string element",
        };
      }
      if (field.items === "number" && !value.every((v) => typeof v === "number")) {
        return {
          kind: "wrong-type",
          name: field.name,
          expected: "array<number>",
          got: "array with non-number element",
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Format an issue as a human-readable single-line string. Used by the
 * CLI / MCP output. Stable wording — agents may pattern-match on it.
 */
export function formatEdgePropertyIssue(issue: EdgePropertyIssue): string {
  switch (issue.kind) {
    case "unknown-property":
      return `unknown property '${issue.name}' (declared: ${issue.allowed.join(", ") || "none"})`;
    case "missing-required":
      return `missing required property '${issue.name}'`;
    case "wrong-type":
      return `property '${issue.name}': expected ${issue.expected}, got ${issue.got}`;
    case "enum-value-not-allowed":
      return `property '${issue.name}': '${issue.value}' is not one of [${issue.allowed.join(", ")}]`;
    case "out-of-range":
      return `property '${issue.name}': ${issue.detail}`;
  }
}
