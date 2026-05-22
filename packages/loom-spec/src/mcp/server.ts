import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
  listTimelines,
  readTimeline,
  writeTimeline,
} from "../server/fileOps.js";
import { validateDiagram, validateTimeline } from "../validate.js";
import { runDriftCheck } from "../server/drift.js";
import type { LoomRoot } from "../server/findLoomRoot.js";
import type {
  LoomDiagram,
  Node as LoomNode,
  Edge as LoomEdge,
} from "../types/diagram.js";
import type {
  LoomTimeline,
  TimelineEvent,
} from "../types/timeline.js";

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
const EVENT_KINDS = ["compute", "io", "wait", "error"] as const;

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

function uniqueEventId(tl: LoomTimeline): string {
  const ids = new Set(tl.events.map((e) => e.id));
  let i = tl.events.length + 1;
  while (ids.has(`ev${i}`)) i++;
  return `ev${i}`;
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

async function readTimelineOrError(loomPath: string, id: string) {
  try {
    return { ok: true as const, timeline: await readTimeline(loomPath, id) };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false as const, error: errorText(`timeline '${id}' not found`) };
    }
    return { ok: false as const, error: errorText(`read failed: ${(e as Error).message}`) };
  }
}

async function persistTimeline(loomPath: string, id: string, tl: LoomTimeline) {
  const result = await validateTimeline(tl);
  if (!result.ok) {
    return errorText("Validation failed:", result.errors);
  }
  await writeTimeline(loomPath, id, tl);
  return null;
}

export function createMcpServer(loomRoot: LoomRoot) {
  const server = new McpServer(
    { name: "loom-spec", version: "0.0.1" },
    { instructions: `Use these tools to maintain the architecture spec in ${loomRoot.loomPath}. Diagram tools (loom_*_node, loom_*_edge) edit .loom/diagrams/*.flow.json; timeline tools (loom_*_event) edit .loom/timelines/*.timeline.json. Prefer them over editing the JSON files directly — they validate against the schema before writing.` }
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

  // ─── Timelines ───────────────────────────────────────────────────────

  server.registerTool(
    "loom_list_timelines",
    {
      title: "List timelines",
      description:
        "List all timelines in the spec with title, referenced diagram, event count, and total duration in ms.",
      inputSchema: {},
    },
    async () => {
      const summaries = await listTimelines(loomRoot.loomPath);
      return jsonText(summaries);
    }
  );

  server.registerTool(
    "loom_read_timeline",
    {
      title: "Read timeline",
      description: "Read a specific timeline's full JSON by id.",
      inputSchema: { id: z.string().describe("Timeline id (e.g. 'todo-completion')") },
    },
    async ({ id }) => {
      const r = await readTimelineOrError(loomRoot.loomPath, id);
      if (!r.ok) return r.error;
      return jsonText(r.timeline);
    }
  );

  server.registerTool(
    "loom_add_event",
    {
      title: "Add timeline event",
      description:
        "Append a new event (clip) to a timeline. The referenced node must exist in the timeline's diagram. Returns the auto-generated event id.",
      inputSchema: {
        timeline: z.string().describe("Timeline id"),
        node: z
          .string()
          .describe(
            "Node id from the timeline's diagram. The event lights up this node when the playhead enters its interval."
          ),
        start_ms: z.number().min(0).describe("Start time in ms from t=0"),
        duration_ms: z
          .number()
          .min(0)
          .describe("Duration in ms (may be 0 for instantaneous events)"),
        track: z
          .string()
          .optional()
          .describe(
            "Track to render this event on. Omit to auto-assign one track per node."
          ),
        label: z.string().max(60).optional().describe("Short text shown inside the clip"),
        description: z.string().optional(),
        kind: z.enum(EVENT_KINDS).optional().describe("compute | io | wait | error"),
        code_refs: z.array(codeRefSchema).optional(),
        triggered_by: z
          .string()
          .optional()
          .describe("Id of another event in this timeline that caused this one"),
        tags: z.array(z.string()).optional(),
        id: z
          .string()
          .optional()
          .describe("Optional explicit id (lowercase kebab). Defaults to ev<n>."),
      },
    },
    async ({
      timeline,
      node,
      start_ms,
      duration_ms,
      track,
      label,
      description,
      kind,
      code_refs,
      triggered_by,
      tags,
      id,
    }) => {
      const tlRes = await readTimelineOrError(loomRoot.loomPath, timeline);
      if (!tlRes.ok) return tlRes.error;
      const tl = tlRes.timeline;

      // Verify the referenced node exists in the underlying diagram.
      const dRes = await readDiagramOrError(loomRoot.loomPath, tl.diagram);
      if (!dRes.ok) {
        return errorText(
          `timeline '${timeline}' references diagram '${tl.diagram}', which could not be read`
        );
      }
      if (!dRes.diagram.nodes.some((n) => n.id === node)) {
        return errorText(
          `node '${node}' does not exist in diagram '${tl.diagram}'. Available: ${dRes.diagram.nodes
            .map((n) => n.id)
            .join(", ")}`
        );
      }

      // Verify triggered_by, if set, references an existing event.
      if (triggered_by && !tl.events.some((e) => e.id === triggered_by)) {
        return errorText(`triggered_by event '${triggered_by}' not found in timeline`);
      }

      const newId = id ?? uniqueEventId(tl);
      if (tl.events.some((e) => e.id === newId)) {
        return errorText(`event with id '${newId}' already exists`);
      }
      const event: TimelineEvent = {
        id: newId,
        node,
        start_ms,
        duration_ms,
        track,
        label,
        description,
        kind,
        code_refs,
        triggered_by,
        tags,
      };
      tl.events.push(event);
      const err = await persistTimeline(loomRoot.loomPath, timeline, tl);
      if (err) return err;
      return jsonText({ ok: true, id: newId });
    }
  );

  server.registerTool(
    "loom_update_event",
    {
      title: "Update timeline event",
      description:
        "Patch fields on an existing event. Only the fields you pass are changed. If you change 'node', the new node must exist in the timeline's diagram.",
      inputSchema: {
        timeline: z.string(),
        id: z.string().describe("Event id"),
        patch: z
          .object({
            node: z.string().optional(),
            start_ms: z.number().min(0).optional(),
            duration_ms: z.number().min(0).optional(),
            track: z.string().nullable().optional(),
            label: z.string().max(60).nullable().optional(),
            description: z.string().nullable().optional(),
            kind: z.enum(EVENT_KINDS).nullable().optional(),
            code_refs: z.array(codeRefSchema).optional(),
            triggered_by: z.string().nullable().optional(),
            tags: z.array(z.string()).optional(),
          })
          .describe("Fields to merge. Pass null to clear an optional field."),
      },
    },
    async ({ timeline, id, patch }) => {
      const tlRes = await readTimelineOrError(loomRoot.loomPath, timeline);
      if (!tlRes.ok) return tlRes.error;
      const tl = tlRes.timeline;
      const idx = tl.events.findIndex((e) => e.id === id);
      if (idx < 0) return errorText(`event '${id}' not found in timeline '${timeline}'`);

      // If node is being changed, verify the new node exists in the diagram.
      if (patch.node !== undefined && patch.node !== tl.events[idx]!.node) {
        const dRes = await readDiagramOrError(loomRoot.loomPath, tl.diagram);
        if (!dRes.ok) return dRes.error;
        if (!dRes.diagram.nodes.some((n) => n.id === patch.node)) {
          return errorText(
            `node '${patch.node}' does not exist in diagram '${tl.diagram}'`
          );
        }
      }
      // If triggered_by is being set (non-null), verify the target exists.
      if (patch.triggered_by && !tl.events.some((e) => e.id === patch.triggered_by)) {
        return errorText(`triggered_by event '${patch.triggered_by}' not found`);
      }

      const merged = { ...tl.events[idx]! } as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === null) {
          // Clear the optional field.
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      tl.events[idx] = merged as unknown as TimelineEvent;
      const err = await persistTimeline(loomRoot.loomPath, timeline, tl);
      if (err) return err;
      return jsonText({ ok: true });
    }
  );

  server.registerTool(
    "loom_delete_event",
    {
      title: "Delete timeline event",
      description:
        "Remove an event by id. Also drops any triggered_by references pointing at it so the timeline stays internally consistent.",
      inputSchema: {
        timeline: z.string(),
        id: z.string(),
      },
    },
    async ({ timeline, id }) => {
      const tlRes = await readTimelineOrError(loomRoot.loomPath, timeline);
      if (!tlRes.ok) return tlRes.error;
      const tl = tlRes.timeline;
      const before = tl.events.length;
      tl.events = tl.events.filter((e) => e.id !== id);
      if (tl.events.length === before) {
        return errorText(`event '${id}' not found in timeline '${timeline}'`);
      }
      // Scrub dangling triggered_by refs.
      tl.events = tl.events.map((e) =>
        e.triggered_by === id ? { ...e, triggered_by: undefined } : e
      );
      const err = await persistTimeline(loomRoot.loomPath, timeline, tl);
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
