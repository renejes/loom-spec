/**
 * Smoke-test for the 8 journey MCP tools. Spawns `loom-spec mcp` against
 * a temporary copy of the todo-app fixture, exercises each tool over
 * stdio, and asserts shape + referential invariants. The tmp dir is
 * deleted at the end so the original fixture is untouched.
 *
 * Run: pnpm --filter loom-spec exec tsx scripts/smoke-mcp-journeys.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, cp, rm, stat } from "node:fs/promises";
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

function textOf(result: ToolResult): string {
  return result.content?.[0]?.text ?? "";
}

function parseJson<T = unknown>(result: ToolResult): T | null {
  try {
    return JSON.parse(textOf(result)) as T;
  } catch {
    return null;
  }
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "loom-mcp-journeys-"));
  const fixture = join(tmp, "todo-app");
  await cp(fixtureSrc, fixture, { recursive: true });

  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "loom-spec", "exec", "tsx", cliEntry, "mcp", "--root", fixture],
    cwd: repoRoot,
  });
  const client = new Client(
    { name: "smoke-mcp-journeys", version: "0.0.1" },
    { capabilities: {} }
  );
  await client.connect(transport);

  try {
    // ─── Tool registration ───────────────────────────────────────────
    const { tools } = await client.listTools();
    const toolNames = new Set(tools.map((t) => t.name));
    const expected = [
      "loom_list_journeys",
      "loom_read_journey",
      "loom_create_journey",
      "loom_add_step",
      "loom_update_step",
      "loom_delete_step",
      "loom_reorder_steps",
      "loom_delete_journey",
    ];
    for (const name of expected) {
      expect(`tool registered: ${name}`, toolNames.has(name));
    }

    // ─── list_journeys returns the fixture's journey ─────────────────
    const list1 = (await client.callTool({
      name: "loom_list_journeys",
      arguments: {},
    })) as ToolResult;
    const list1Data = parseJson<Array<{ id: string; stepCount: number }>>(list1);
    expect(
      "list_journeys returns the fixture journey",
      Array.isArray(list1Data) &&
        list1Data.length === 1 &&
        list1Data[0]!.id === "complete-a-todo" &&
        list1Data[0]!.stepCount === 3
    );

    // ─── read_journey returns full JSON ──────────────────────────────
    const read1 = (await client.callTool({
      name: "loom_read_journey",
      arguments: { id: "complete-a-todo" },
    })) as ToolResult;
    const read1Data = parseJson<{ id: string; steps: { id: string }[] }>(read1);
    expect(
      "read_journey returns the journey",
      read1Data?.id === "complete-a-todo" && read1Data.steps.length === 3
    );

    // read_journey on unknown id → error
    const read2 = (await client.callTool({
      name: "loom_read_journey",
      arguments: { id: "does-not-exist" },
    })) as ToolResult;
    expect("read_journey on unknown id returns error", read2.isError === true);

    // ─── create_journey happy path ───────────────────────────────────
    const create1 = (await client.callTool({
      name: "loom_create_journey",
      arguments: {
        id: "celebrate-completion",
        title: "Celebrate Completion",
        diagram: "overview",
        description: "Toggle a todo and watch the confetti.",
      },
    })) as ToolResult;
    expect("create_journey succeeds", create1.isError !== true);

    // duplicate create → error
    const create2 = (await client.callTool({
      name: "loom_create_journey",
      arguments: {
        id: "celebrate-completion",
        title: "Duplicate",
        diagram: "overview",
      },
    })) as ToolResult;
    expect("create_journey on existing id returns error", create2.isError === true);

    // unknown diagram → error (referential cross-check)
    const create3 = (await client.callTool({
      name: "loom_create_journey",
      arguments: {
        id: "bogus-journey",
        title: "Bogus",
        diagram: "no-such-diagram",
      },
    })) as ToolResult;
    expect(
      "create_journey with unknown diagram returns error",
      create3.isError === true
    );

    // ─── add_step happy + negatives ──────────────────────────────────
    const addOk = (await client.callTool({
      name: "loom_add_step",
      arguments: {
        journey: "celebrate-completion",
        node: "todo-list-view",
        title: "User toggles todo",
      },
    })) as ToolResult;
    const addOkData = parseJson<{ id: string }>(addOk);
    expect(
      "add_step with valid node succeeds",
      addOk.isError !== true && typeof addOkData?.id === "string"
    );

    const addBadNode = (await client.callTool({
      name: "loom_add_step",
      arguments: {
        journey: "celebrate-completion",
        node: "no-such-node",
      },
    })) as ToolResult;
    expect(
      "add_step with invalid node returns error (cross-check)",
      addBadNode.isError === true
    );

    // add second step + a third one to give reorder something to chew on
    await client.callTool({
      name: "loom_add_step",
      arguments: {
        journey: "celebrate-completion",
        node: "todo-completed-event",
        title: "Event emitted",
      },
    });
    const addAfter = (await client.callTool({
      name: "loom_add_step",
      arguments: {
        journey: "celebrate-completion",
        node: "confetti",
        title: "Confetti",
        after: addOkData!.id,
      },
    })) as ToolResult;
    expect("add_step with 'after' succeeds", addAfter.isError !== true);

    const readAfter = parseJson<{ steps: { id: string; node: string }[] }>(
      (await client.callTool({
        name: "loom_read_journey",
        arguments: { id: "celebrate-completion" },
      })) as ToolResult
    );
    // Order should be: step-1 (todo-list-view), confetti-step (inserted after), then todo-completed-event
    expect(
      "'after' inserted in the right position",
      readAfter?.steps[1]?.node === "confetti" &&
        readAfter.steps[2]?.node === "todo-completed-event"
    );

    // ─── update_step ─────────────────────────────────────────────────
    const updateOk = (await client.callTool({
      name: "loom_update_step",
      arguments: {
        journey: "celebrate-completion",
        id: readAfter!.steps[0]!.id,
        patch: { title: "User clicks the toggle (updated)" },
      },
    })) as ToolResult;
    expect("update_step succeeds", updateOk.isError !== true);

    const updateBadNode = (await client.callTool({
      name: "loom_update_step",
      arguments: {
        journey: "celebrate-completion",
        id: readAfter!.steps[0]!.id,
        patch: { node: "no-such-node" },
      },
    })) as ToolResult;
    expect(
      "update_step with invalid node returns error",
      updateBadNode.isError === true
    );

    // ─── reorder_steps ───────────────────────────────────────────────
    const stepIds = readAfter!.steps.map((s) => s.id);
    const reversed = [...stepIds].reverse();
    const reorderOk = (await client.callTool({
      name: "loom_reorder_steps",
      arguments: { journey: "celebrate-completion", order: reversed },
    })) as ToolResult;
    expect("reorder_steps with permutation succeeds", reorderOk.isError !== true);

    const reorderBadLength = (await client.callTool({
      name: "loom_reorder_steps",
      arguments: {
        journey: "celebrate-completion",
        order: stepIds.slice(0, -1),
      },
    })) as ToolResult;
    expect(
      "reorder_steps with wrong length returns error",
      reorderBadLength.isError === true
    );

    const reorderBadIds = (await client.callTool({
      name: "loom_reorder_steps",
      arguments: {
        journey: "celebrate-completion",
        order: [stepIds[0]!, stepIds[1]!, "not-a-step"],
      },
    })) as ToolResult;
    expect(
      "reorder_steps with unknown id returns error",
      reorderBadIds.isError === true
    );

    // ─── delete_step ─────────────────────────────────────────────────
    const delStepOk = (await client.callTool({
      name: "loom_delete_step",
      arguments: { journey: "celebrate-completion", id: stepIds[0]! },
    })) as ToolResult;
    expect("delete_step removes the step", delStepOk.isError !== true);

    const delStepBad = (await client.callTool({
      name: "loom_delete_step",
      arguments: { journey: "celebrate-completion", id: stepIds[0]! },
    })) as ToolResult;
    expect("delete_step on missing id returns error", delStepBad.isError === true);

    // ─── delete_journey ──────────────────────────────────────────────
    const delJourneyOk = (await client.callTool({
      name: "loom_delete_journey",
      arguments: { id: "celebrate-completion" },
    })) as ToolResult;
    expect("delete_journey removes the file", delJourneyOk.isError !== true);

    const journeyPath = join(fixture, ".loom/journeys/celebrate-completion.journey.json");
    let stillExists = false;
    try {
      await stat(journeyPath);
      stillExists = true;
    } catch {
      // expected
    }
    expect("journey file is gone after delete_journey", !stillExists);

    const delJourneyBad = (await client.callTool({
      name: "loom_delete_journey",
      arguments: { id: "celebrate-completion" },
    })) as ToolResult;
    expect(
      "delete_journey on missing id returns error",
      delJourneyBad.isError === true
    );

    // ─── original fixture journey untouched ──────────────────────────
    const finalList = parseJson<Array<{ id: string }>>(
      (await client.callTool({
        name: "loom_list_journeys",
        arguments: {},
      })) as ToolResult
    );
    expect(
      "original fixture journey still present",
      Array.isArray(finalList) &&
        finalList.length === 1 &&
        finalList[0]!.id === "complete-a-todo"
    );
  } finally {
    await client.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
