import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LoomDiagram } from "./types/diagram.js";
import type { LoomNodeTypes } from "./types/node-types.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, "../schema");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let diagramValidator: ReturnType<typeof ajv.compile> | null = null;
let nodeTypesValidator: ReturnType<typeof ajv.compile> | null = null;

async function loadDiagramValidator() {
  if (diagramValidator) return diagramValidator;
  const schema = JSON.parse(
    await readFile(resolve(schemaDir, "diagram.schema.json"), "utf8")
  );
  diagramValidator = ajv.compile(schema);
  return diagramValidator;
}

async function loadNodeTypesValidator() {
  if (nodeTypesValidator) return nodeTypesValidator;
  const schema = JSON.parse(
    await readFile(resolve(schemaDir, "node-types.schema.json"), "utf8")
  );
  nodeTypesValidator = ajv.compile(schema);
  return nodeTypesValidator;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function formatErrors(errors: unknown[]): string[] {
  return errors.map((e) => {
    const err = e as { instancePath?: string; message?: string; params?: unknown };
    const path = err.instancePath || "(root)";
    return `${path}: ${err.message ?? "invalid"}`;
  });
}

export async function validateDiagram(data: unknown): Promise<ValidationResult> {
  const validator = await loadDiagramValidator();
  const ok = validator(data);
  if (ok) return { ok: true };
  return { ok: false, errors: formatErrors(validator.errors ?? []) };
}

export async function validateNodeTypes(data: unknown): Promise<ValidationResult> {
  const validator = await loadNodeTypesValidator();
  const ok = validator(data);
  if (ok) return { ok: true };
  return { ok: false, errors: formatErrors(validator.errors ?? []) };
}

export type { LoomDiagram, LoomNodeTypes };
