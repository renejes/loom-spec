import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import diagramSchema from "../../schema/diagram.schema.json";
import type { LoomDiagram } from "../types/diagram";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(diagramSchema);

export type ValidationScope = "node" | "edge" | "group" | "root";

export interface ValidationError {
  /** AJV instancePath, e.g. "/nodes/3/label" */
  path: string;
  scope: ValidationScope;
  /** Resolved node/edge/group id (when scope is not "root") */
  itemId?: string;
  /** Field name within the item, e.g. "label" or "code_refs/0/path" */
  field?: string;
  message: string;
}

const SCOPE_BY_KEY: Record<string, ValidationScope> = {
  nodes: "node",
  edges: "edge",
  groups: "group",
};

export function validateDiagramClient(diagram: LoomDiagram): ValidationError[] {
  const ok = validateFn(diagram);
  if (ok) return [];

  return (validateFn.errors ?? []).map((err) => {
    const path = err.instancePath ?? "";
    const m = path.match(/^\/(nodes|edges|groups)\/(\d+)(?:\/(.+))?$/);
    if (m) {
      const key = m[1]!;
      const scope = SCOPE_BY_KEY[key]!;
      const index = Number(m[2]);
      const field = m[3];
      const arr = (diagram as unknown as Record<string, Array<{ id?: string }>>)[
        key
      ];
      const itemId = arr?.[index]?.id;
      return {
        path,
        scope,
        itemId,
        field,
        message: err.message ?? "invalid",
      };
    }
    return {
      path,
      scope: "root",
      message: err.message ?? "invalid",
    };
  });
}

/**
 * Returns errors for a single node, keyed by top-level field name.
 * E.g. { label: "must NOT be shorter than 1 characters" }
 */
export function errorsForNode(
  errors: ValidationError[],
  nodeId: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    if (e.scope !== "node" || e.itemId !== nodeId) continue;
    const key = e.field ? e.field.split("/")[0] ?? "*" : "*";
    if (!out[key]) out[key] = e.message;
  }
  return out;
}

export function errorsForEdge(
  errors: ValidationError[],
  edgeId: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    if (e.scope !== "edge" || e.itemId !== edgeId) continue;
    const key = e.field ? e.field.split("/")[0] ?? "*" : "*";
    if (!out[key]) out[key] = e.message;
  }
  return out;
}
