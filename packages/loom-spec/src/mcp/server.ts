import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
  listJourneys,
  readJourney,
  writeJourney,
  deleteJourney,
} from "../server/fileOps.js";
import { validateDiagram, validateJourney } from "../validate.js";
import { crossCheckJourney } from "../server/journeyCheck.js";
import { runDriftCheck } from "../server/drift.js";
import { computeNewNodePosition } from "../layout.js";
import type { LoomRoot } from "../server/findLoomRoot.js";
import type {
  LoomDiagram,
  Node as LoomNode,
  Edge as LoomEdge,
} from "../types/diagram.js";
import type { LoomJourney, JourneyStep } from "../types/journey.js";

const STATUSES = ["planned", "implemented", "stale", "deprecated"] as const;
const EDGE_KINDS = [
  "request",
  "event",
  "data-read",
  "data-write",
  "signal",
  "dependency",
  "control",
] as const;

const codeRefSchema = z.object({
  path: z.string(),
  symbol: z.string().optional(),
  lines: z.string().optional(),
});

function uniqueNodeId(d: LoomDiagram, prefix: string): string {
  const ids = new Set(d.nodes.map((n) => n.id));
  let i = 1;
  while (ids.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

function uniqueEdgeId(d: LoomDiagram): string {
  const ids = new Set(d.edges.map((e) => e.id));
  let i = d.edges.length + 1;
  while (ids.has(`e${i}`)) i++;
  return `e${i}`;
}

function jsonText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

function errorText(msg: string, details?: string[]) {
  const text = details && details.length ? `${msg}\n  - ${details.join("\n  - ")}` : msg;
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function readDiagramOrError(loomPath: string, id: string) {
  try {
    return { ok: true as const, diagram: await readDiagram(loomPath, id) };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false as const, error: errorText(`diagram '${id}' not found`) };
    }
    return { ok: false as const, error: errorText(`read failed: ${(e as Error).message}`) };
  }
}

async function persist(loomPath: string, id: string, d: LoomDiagram) {
  const result = await validateDiagram(d);
  if (!result.ok) {
    return errorText("Validation failed:", result.errors);
  }
  await writeDiagram(loomPath, id, d);
  return null;
}

async function readJourneyOrError(loomPath: string, id: string) {
  try {
    return { ok: true as const, journey: await readJourney(loomPath, id) };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false as const, error: errorText(`journey '${id}' not found`) };
    }
    return { ok: false as const, error: errorText(`read failed: ${(e as Error).message}`) };
  }
}

async function persistJourney(loomPath: string, j: LoomJourney) {
  const schemaResult = await validateJourney(j);
  if (!schemaResult.ok) {
    return errorText("Validation failed:", schemaResult.errors);
  }
  const refErrors = await crossCheckJourney(loomPath, j);
  if (refErrors.length > 0) {
    return errorText("Validation failed:", refErrors);
  }
  await writeJourney(loomPath, j.id, j);
  return null;
}

function uniqueStepId(j: LoomJourney): string {
  const ids = new Set(j.steps.map((s) => s.id));
  let i = j.steps.length + 1;
  while (ids.has(`step-${i}`)) i++;
  return `step-${i}`;
}

const journeyStepPatchSchema = z.object({
  node: z.string().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  code_refs: z.array(codeRefSchema).optional(),
});

export function createMcpServer(loomRoot: LoomRoot) {
  const server = new McpServer(
    { name: "loom-spec", version: "0.0.1" },
    { instructions: `Use these tools to maintain the architecture spec in ${loomRoot.loomPath}. They edit .loom/diagrams/*.flow.json and .loom/journeys/*.journey.json — prefer them over editing the JSON files directly because they validate against the schema (and, for journeys, cross-check that referenced nodes exist) before writing.` }
  );

  server.registerTool(
    "loom_list_diagrams",
    {
      title: "List diagrams",
      description: "List all diagrams in the spec with title and node/edge counts.",
      inputSchema: {},
    },
    async () => {
      const summaries = await listDiagrams(loomRoot.loomPath);
      return jsonText(summaries);
    }
  );

  server.registerTool(
    "loom_read_diagram",
    {
      title: "Read diagram",
      description: "Read a specific diagram's full JSON by id.",
      inputSchema: { id: z.string().describe("Diagram id (e.g. 'overview')") },
    },
    async ({ id }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, id);
      if (!r.ok) return r.error;
      return jsonText(r.diagram);
    }
  );

  server.registerTool(
    "loom_read_node_types",
    {
      title: "Read node types",
      description: "Read the project's node-types.json (available node-type vocabulary).",
      inputSchema: {},
    },
    async () => {
      const nt = await readNodeTypes(loomRoot.loomPath);
      return jsonText(nt);
    }
  );

  server.registerTool(
    "loom_add_node",
    {
      title: "Add node",
      description:
        "Append a new node to a diagram. Returns the auto-generated id. The new node defaults to status='planned'. If position is omitted, a non-overlapping spot is chosen automatically (to the right of the existing nodes at the median y); pass an explicit position only when you have a specific layout in mind.",
      inputSchema: {
        diagram: z.string().describe("Diagram id to add the node to"),
        type: z.string().describe("Node type key (must exist in node-types.json)"),
        label: z.string().describe("Display label"),
        description: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        status: z.enum(STATUSES).default("planned"),
        code_refs: z.array(codeRefSchema).optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
        id: z
          .string()
          .optional()
          .describe(
            "Optional explicit id (lowercase kebab). If omitted, generated as <type>-<n>."
          ),
      },
    },
    async ({ diagram, type, label, description, position, status, code_refs, properties, tags, id }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const newId = id ?? uniqueNodeId(d, type);
      if (d.nodes.some((n) => n.id === newId)) {
        return errorText(`node with id '${newId}' already exists`);
      }
      const node: LoomNode = {
        id: newId,
        type,
        label,
        description,
        position: position ?? computeNewNodePosition(d),
        status,
        code_refs: code_refs ?? [],
        properties: properties ?? {},
        tags,
      };
      d.nodes.push(node);
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true, id: newId });
    }
  );

  server.registerTool(
    "loom_update_node",
    {
      title: "Update node",
      description:
        "Patch fields on an existing node. Only the fields you pass are changed. Use 'loom_mark_stale' as a shortcut for setting status='stale'.",
      inputSchema: {
        diagram: z.string(),
        id: z.string().describe("Node id"),
        patch: z
          .object({
            label: z.string().optional(),
            description: z.string().nullable().optional(),
            status: z.enum(STATUSES).optional(),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
            code_refs: z.array(codeRefSchema).optional(),
            properties: z.record(z.string(), z.unknown()).optional(),
            tags: z.array(z.string()).optional(),
            drill_down: z.string().nullable().optional(),
          })
          .describe("Fields to merge"),
      },
    },
    async ({ diagram, id, patch }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const idx = d.nodes.findIndex((n) => n.id === id);
      if (idx < 0) return errorText(`node '${id}' not found`);
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) continue; // explicit null = clear; handled below
        if (v !== undefined) cleaned[k] = v;
      }
      // Honor explicit nulls as field clears
      if (patch.description === null) cleaned["description"] = undefined;
      if (patch.drill_down === null) cleaned["drill_down"] = undefined;
      d.nodes[idx] = { ...d.nodes[idx]!, ...cleaned } as LoomNode;
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_mark_stale",
    {
      title: "Mark node stale",
      description:
        "Shortcut for setting a node's status to 'stale' (use when the underlying code no longer exists or has been replaced; humans review staleness rather than auto-delete).",
      inputSchema: {
        diagram: z.string(),
        id: z.string(),
      },
    },
    async ({ diagram, id }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const idx = d.nodes.findIndex((n) => n.id === id);
      if (idx < 0) return errorText(`node '${id}' not found`);
      d.nodes[idx] = { ...d.nodes[idx]!, status: "stale" };
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_delete_node",
    {
      title: "Delete node",
      description:
        "Hard-delete a node and all edges that touch it. Prefer 'loom_mark_stale' for nodes whose code went away — deletion loses architectural history.",
      inputSchema: {
        diagram: z.string(),
        id: z.string(),
      },
    },
    async ({ diagram, id }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const before = d.nodes.length;
      d.nodes = d.nodes.filter((n) => n.id !== id);
      if (d.nodes.length === before) return errorText(`node '${id}' not found`);
      d.edges = d.edges.filter((e) => {
        const f = e.from.split(":")[0];
        const t = e.to.split(":")[0];
        return f !== id && t !== id;
      });
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_add_edge",
    {
      title: "Add edge",
      description: "Connect two nodes. Use 'node-id:port-name' syntax for typed ports. The optional 'properties' field is free-form — use project conventions for things like { sync: false, retry: 'exponential', timeout_ms: 5000 }.",
      inputSchema: {
        diagram: z.string(),
        from: z.string().describe("Source node id (or 'node-id:port-name')"),
        to: z.string().describe("Target node id (or 'node-id:port-name')"),
        kind: z.enum(EDGE_KINDS),
        label: z.string().optional(),
        description: z.string().optional(),
        direction: z.enum(["forward", "bidirectional"]).optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ diagram, from, to, kind, label, description, direction, properties }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const edge: LoomEdge = {
        id: uniqueEdgeId(d),
        from,
        to,
        kind,
        label,
        description,
        direction,
        properties,
      };
      d.edges.push(edge);
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true, id: edge.id });
    }
  );

  server.registerTool(
    "loom_update_edge",
    {
      title: "Update edge",
      description:
        "Patch fields on an existing edge. Only the fields you pass are changed. Pass null on a nullable field to clear it.",
      inputSchema: {
        diagram: z.string(),
        id: z.string().describe("Edge id"),
        patch: z
          .object({
            kind: z.enum(EDGE_KINDS).optional(),
            label: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            direction: z.enum(["forward", "bidirectional"]).optional(),
            properties: z.record(z.string(), z.unknown()).optional(),
          })
          .describe("Fields to merge"),
      },
    },
    async ({ diagram, id, patch }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const idx = d.edges.findIndex((e) => e.id === id);
      if (idx < 0) return errorText(`edge '${id}' not found`);
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) continue;
        if (v !== undefined) cleaned[k] = v;
      }
      if (patch.label === null) cleaned["label"] = undefined;
      if (patch.description === null) cleaned["description"] = undefined;
      d.edges[idx] = { ...d.edges[idx]!, ...cleaned } as LoomEdge;
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_delete_edge",
    {
      title: "Delete edge",
      description: "Remove an edge by id.",
      inputSchema: {
        diagram: z.string(),
        id: z.string(),
      },
    },
    async ({ diagram, id }) => {
      const r = await readDiagramOrError(loomRoot.loomPath, diagram);
      if (!r.ok) return r.error;
      const d = r.diagram;
      const before = d.edges.length;
      d.edges = d.edges.filter((e) => e.id !== id);
      if (d.edges.length === before) return errorText(`edge '${id}' not found`);
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_list_journeys",
    {
      title: "List journeys",
      description:
        "List all journeys in the spec with title, target diagram, and step count.",
      inputSchema: {},
    },
    async () => {
      const summaries = await listJourneys(loomRoot.loomPath);
      return jsonText(summaries);
    }
  );

  server.registerTool(
    "loom_read_journey",
    {
      title: "Read journey",
      description: "Read a specific journey's full JSON by id.",
      inputSchema: { id: z.string().describe("Journey id (e.g. 'checkout')") },
    },
    async ({ id }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, id);
      if (!r.ok) return r.error;
      return jsonText(r.journey);
    }
  );

  server.registerTool(
    "loom_create_journey",
    {
      title: "Create journey",
      description:
        "Create a new journey file. Fails if a journey with this id already exists, or if the referenced diagram doesn't exist.",
      inputSchema: {
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe("Journey id (lowercase kebab). Becomes the filename."),
        title: z.string().max(80),
        diagram: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe("Id of the diagram this journey walks through."),
        description: z.string().optional(),
        steps: z
          .array(
            z.object({
              id: z.string().regex(/^[a-z0-9-]+$/),
              node: z.string().regex(/^[a-z0-9-]+$/),
              title: z.string().max(80).optional(),
              description: z.string().optional(),
              code_refs: z.array(codeRefSchema).optional(),
            })
          )
          .optional()
          .describe("Optional initial steps. Each step.node must exist in the diagram."),
      },
    },
    async ({ id, title, diagram, description, steps }) => {
      // Refuse to overwrite. Use update tools to modify an existing journey.
      const existing = await readJourneyOrError(loomRoot.loomPath, id);
      if (existing.ok) {
        return errorText(`journey '${id}' already exists`);
      }
      const journey: LoomJourney = {
        version: "1",
        id,
        title,
        description,
        diagram,
        steps: steps ?? [],
      };
      const err = await persistJourney(loomRoot.loomPath, journey);
      if (err) return err;
      return jsonText({ ok: true, id });
    }
  );

  server.registerTool(
    "loom_add_step",
    {
      title: "Add journey step",
      description:
        "Append (or insert) a step into a journey. The node must exist in the journey's diagram. If 'after' is omitted, the step is appended at the end.",
      inputSchema: {
        journey: z.string().describe("Journey id"),
        node: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe("Id of a node in the journey's diagram"),
        title: z.string().max(80).optional(),
        description: z.string().optional(),
        code_refs: z.array(codeRefSchema).optional(),
        after: z
          .string()
          .optional()
          .describe("Step id to insert after. Omit to append at the end."),
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .optional()
          .describe("Optional explicit step id. If omitted, generated as step-<n>."),
      },
    },
    async ({ journey, node, title, description, code_refs, after, id }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, journey);
      if (!r.ok) return r.error;
      const j = r.journey;
      const stepId = id ?? uniqueStepId(j);
      if (j.steps.some((s) => s.id === stepId)) {
        return errorText(`step with id '${stepId}' already exists in journey '${journey}'`);
      }
      const step: JourneyStep = {
        id: stepId,
        node,
        title,
        description,
        code_refs,
      };
      if (after !== undefined) {
        const idx = j.steps.findIndex((s) => s.id === after);
        if (idx < 0) return errorText(`step '${after}' not found in journey '${journey}'`);
        j.steps.splice(idx + 1, 0, step);
      } else {
        j.steps.push(step);
      }
      const err = await persistJourney(loomRoot.loomPath, j);
      if (err) return err;
      return jsonText({ ok: true, id: stepId });
    }
  );

  server.registerTool(
    "loom_update_step",
    {
      title: "Update journey step",
      description:
        "Patch fields on an existing step. Only the fields you pass are changed. Pass null on a nullable field to clear it. If you change 'node', it must still exist in the journey's diagram.",
      inputSchema: {
        journey: z.string(),
        id: z.string().describe("Step id"),
        patch: journeyStepPatchSchema.describe("Fields to merge"),
      },
    },
    async ({ journey, id, patch }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, journey);
      if (!r.ok) return r.error;
      const j = r.journey;
      const idx = j.steps.findIndex((s) => s.id === id);
      if (idx < 0) return errorText(`step '${id}' not found in journey '${journey}'`);
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) continue;
        if (v !== undefined) cleaned[k] = v;
      }
      if (patch.title === null) cleaned["title"] = undefined;
      if (patch.description === null) cleaned["description"] = undefined;
      j.steps[idx] = { ...j.steps[idx]!, ...cleaned } as JourneyStep;
      const err = await persistJourney(loomRoot.loomPath, j);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_delete_step",
    {
      title: "Delete journey step",
      description: "Remove a step from a journey by id. Subsequent steps keep their ids; only the array order changes.",
      inputSchema: {
        journey: z.string(),
        id: z.string(),
      },
    },
    async ({ journey, id }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, journey);
      if (!r.ok) return r.error;
      const j = r.journey;
      const before = j.steps.length;
      j.steps = j.steps.filter((s) => s.id !== id);
      if (j.steps.length === before) {
        return errorText(`step '${id}' not found in journey '${journey}'`);
      }
      const err = await persistJourney(loomRoot.loomPath, j);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_reorder_steps",
    {
      title: "Reorder journey steps",
      description:
        "Replace the step order with the given permutation. The 'order' array must contain exactly the existing step ids, each once.",
      inputSchema: {
        journey: z.string(),
        order: z.array(z.string()).describe("Permutation of existing step ids"),
      },
    },
    async ({ journey, order }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, journey);
      if (!r.ok) return r.error;
      const j = r.journey;
      const existing = new Set(j.steps.map((s) => s.id));
      if (order.length !== j.steps.length) {
        return errorText(
          `order length ${order.length} does not match step count ${j.steps.length}`
        );
      }
      const seen = new Set<string>();
      for (const id of order) {
        if (!existing.has(id)) return errorText(`unknown step id '${id}'`);
        if (seen.has(id)) return errorText(`duplicate step id '${id}' in order`);
        seen.add(id);
      }
      const byId = new Map(j.steps.map((s) => [s.id, s] as const));
      j.steps = order.map((id) => byId.get(id)!);
      const err = await persistJourney(loomRoot.loomPath, j);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_delete_journey",
    {
      title: "Delete journey",
      description:
        "Hard-delete a journey file. Prefer renaming or editing in-place over deletion — journeys are documentation artefacts that often have value as history.",
      inputSchema: {
        id: z.string(),
      },
    },
    async ({ id }) => {
      const r = await readJourneyOrError(loomRoot.loomPath, id);
      if (!r.ok) return r.error;
      try {
        await deleteJourney(loomRoot.loomPath, id);
      } catch (e) {
        return errorText(`delete failed: ${(e as Error).message}`);
      }
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_validate",
    {
      title: "Validate spec",
      description:
        "Run the full drift + schema check on every diagram. Reports schema errors, missing code-ref files, and missing symbols.",
      inputSchema: {},
    },
    async () => {
      const report = await runDriftCheck(loomRoot.rootPath, loomRoot.loomPath);
      return jsonText(report);
    }
  );

  return server;
}

export async function startMcpServer(loomRoot: LoomRoot): Promise<void> {
  const server = createMcpServer(loomRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
