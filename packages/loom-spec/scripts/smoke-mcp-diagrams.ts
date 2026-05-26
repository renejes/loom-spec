/**
 * Smoke-test for diagram MCP tools, focused on the v0.7.0 additions:
 *   - loom_add_node with no position → auto-layout picks a non-overlapping spot
 *   - loom_add_edge with `properties` → round-trips through read
 *   - loom_update_edge (new tool) → patches fields
 *
 * Runs against a tmpfs copy of the todo-app fixture; the original
 * fixture is untouched.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-mcp-diagrams.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixtureSrc = resolve(repoRoot, "examples/todo-app");
const cliEntry = resolve(repoRoot, "packages/loom-spec/src/cli/index.ts");

function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function parseJson<T = unknown>(result: ToolResult): T | null {
  try {
    return JSON.parse(result.content?.[0]?.text ?? "") as T;
  } catch {
    return null;
  }
}

interface DiagramShape {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: string;
    label?: string;
    properties?: Record<string, unknown>;
  }>;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const PADDING = 60;

function overlaps(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return (
    Math.abs(a.x - b.x) < NODE_WIDTH + PADDING / 2 &&
    Math.abs(a.y - b.y) < NODE_HEIGHT + PADDING / 2
  );
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-mcp-diagrams-"));
  const fixture = join(tmp, "todo-app");
  await cp(fixtureSrc, fixture, { recursive: true });

  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "loom-spec", "exec", "tsx", cliEntry, "mcp", "--root", fixture],
    cwd: repoRoot,
  });
  const client = new Client(
    { name: "smoke-mcp-diagrams", version: "0.0.1" },
    { capabilities: {} }
  );
  await client.connect(transport);

  try {
    // ─── Tool registration ───────────────────────────────────────────
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect("loom_update_edge registered", names.has("loom_update_edge"));

    // ─── add_node without position auto-places ──────────────────────
    const add1 = (await client.callTool({
      name: "loom_add_node",
      arguments: {
        diagram: "overview",
        type: "service",
        label: "Auto-placed 1",
      },
    })) as ToolResult;
    expect("add_node without position succeeds", add1.isError !== true);

    const read1 = parseJson<DiagramShape>(
      (await client.callTool({
        name: "loom_read_diagram",
        arguments: { id: "overview" },
      })) as ToolResult
    );
    const placed1 = read1?.nodes.find(
      (n) => n.id === parseJson<{ id: string }>(add1)?.id
    );
    expect(
      "auto-placed node has a position",
      !!placed1?.position && typeof placed1.position.x === "number"
    );
    // The fixture's rightmost node is todo-store at x=720; new placement
    // should be to the right of that.
    expect(
      "auto-placed node is to the right of the rightmost existing node",
      (placed1?.position.x ?? 0) > 720
    );
    // No overlap with any pre-existing fixture node
    const fixtureNodes = read1!.nodes.filter((n) => n.id !== placed1!.id);
    const collides1 = fixtureNodes.some((n) => overlaps(n.position, placed1!.position));
    expect("auto-placed node does not overlap existing nodes", !collides1);

    // ─── add a second auto-placed node; should not overlap the first ─
    const add2 = (await client.callTool({
      name: "loom_add_node",
      arguments: {
        diagram: "overview",
        type: "service",
        label: "Auto-placed 2",
      },
    })) as ToolResult;
    const read2 = parseJson<DiagramShape>(
      (await client.callTool({
        name: "loom_read_diagram",
        arguments: { id: "overview" },
      })) as ToolResult
    );
    const placed2 = read2!.nodes.find(
      (n) => n.id === parseJson<{ id: string }>(add2)?.id
    );
    expect(
      "second auto-placed node does not overlap any existing",
      !read2!.nodes
        .filter((n) => n.id !== placed2!.id)
        .some((n) => overlaps(n.position, placed2!.position))
    );

    // Explicit position still wins
    const add3 = (await client.callTool({
      name: "loom_add_node",
      arguments: {
        diagram: "overview",
        type: "service",
        label: "Explicit",
        position: { x: 9999, y: 9999 },
      },
    })) as ToolResult;
    const read3 = parseJson<DiagramShape>(
      (await client.callTool({
        name: "loom_read_diagram",
        arguments: { id: "overview" },
      })) as ToolResult
    );
    const placed3 = read3!.nodes.find(
      (n) => n.id === parseJson<{ id: string }>(add3)?.id
    );
    expect(
      "explicit position is respected",
      placed3?.position.x === 9999 && placed3.position.y === 9999
    );

    // ─── add_edge with properties round-trips ───────────────────────
    const addEdge = (await client.callTool({
      name: "loom_add_edge",
      arguments: {
        diagram: "overview",
        from: placed1!.id,
        to: placed2!.id,
        kind: "request",
        label: "calls",
        properties: {
          sync: false,
          retry: "exponential",
          timeout_ms: 5000,
        },
      },
    })) as ToolResult;
    expect("add_edge with properties succeeds", addEdge.isError !== true);
    const edgeId = parseJson<{ id: string }>(addEdge)?.id;

    const read4 = parseJson<DiagramShape>(
      (await client.callTool({
        name: "loom_read_diagram",
        arguments: { id: "overview" },
      })) as ToolResult
    );
    const newEdge = read4!.edges.find((e) => e.id === edgeId);
    expect(
      "edge properties round-trip",
      newEdge?.properties?.sync === false &&
        newEdge.properties.retry === "exponential" &&
        newEdge.properties.timeout_ms === 5000
    );

    // ─── update_edge patches fields ─────────────────────────────────
    const updateEdge = (await client.callTool({
      name: "loom_update_edge",
      arguments: {
        diagram: "overview",
        id: edgeId,
        patch: {
          label: "calls (updated)",
          properties: { sync: true, retry: "none" },
        },
      },
    })) as ToolResult;
    expect("update_edge succeeds", updateEdge.isError !== true);

    const read5 = parseJson<DiagramShape>(
      (await client.callTool({
        name: "loom_read_diagram",
        arguments: { id: "overview" },
      })) as ToolResult
    );
    const updatedEdge = read5!.edges.find((e) => e.id === edgeId);
    expect(
      "update_edge reflects patched label",
      updatedEdge?.label === "calls (updated)"
    );
    expect(
      "update_edge replaces properties (not merges)",
      updatedEdge?.properties?.sync === true &&
        updatedEdge.properties.retry === "none" &&
        updatedEdge.properties.timeout_ms === undefined
    );

    // update_edge on missing id → error
    const updateMissing = (await client.callTool({
      name: "loom_update_edge",
      arguments: { diagram: "overview", id: "not-an-edge", patch: { label: "x" } },
    })) as ToolResult;
    expect("update_edge on missing id returns error", updateMissing.isError === true);
  } finally {
    await client.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
