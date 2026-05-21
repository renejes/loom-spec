import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
} from "../server/fileOps.js";
import { validateDiagram } from "../validate.js";
import { runDriftCheck } from "../server/drift.js";
import type { LoomRoot } from "../server/findLoomRoot.js";
import type {
  LoomDiagram,
  Node as LoomNode,
  Edge as LoomEdge,
} from "../types/diagram.js";

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

export function createMcpServer(loomRoot: LoomRoot) {
  const server = new McpServer(
    { name: "loom-spec", version: "0.0.1" },
    { instructions: `Use these tools to maintain the architecture spec in ${loomRoot.loomPath}. Prefer them over editing the JSON files directly — they validate against the schema before writing.` }
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
        "Append a new node to a diagram. Returns the auto-generated id. The new node defaults to status='planned'. Position defaults to {200, 200}; the user can re-arrange in the UI.",
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
        position: position ?? { x: 200, y: 200 },
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
      description: "Connect two nodes. Use 'node-id:port-name' syntax for typed ports.",
      inputSchema: {
        diagram: z.string(),
        from: z.string().describe("Source node id (or 'node-id:port-name')"),
        to: z.string().describe("Target node id (or 'node-id:port-name')"),
        kind: z.enum(EDGE_KINDS),
        label: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ diagram, from, to, kind, label, description }) => {
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
      };
      d.edges.push(edge);
      const err = await persist(loomRoot.loomPath, diagram, d);
      if (err) return err;
      return jsonText({ ok: true, id: edge.id });
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
