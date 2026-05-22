/**
 * Smoke-test for the timeline-related MCP tools (15f). Drives the real stdio
 * MCP server with the @modelcontextprotocol/sdk client against the todo-app
 * fixture. Asserts success/failure paths and leaves the fixture untouched.
 *
 * Run: pnpm --filter loom-spec tsx scripts/smoke-mcp-timelines.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixture = resolve(repoRoot, "examples/todo-app");
const timelineFile = resolve(
  fixture,
  ".loom/timelines/todo-completion.timeline.json"
);

function unwrap(result: { content: { type: string; text: string }[]; isError?: boolean }) {
  const text = result.content[0]?.text ?? "";
  if (result.isError) {
    return { isError: true, text };
  }
  try {
    return { isError: false, json: JSON.parse(text), text };
  } catch {
    return { isError: false, text };
  }
}

async function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

async function main() {
  const before = await readFile(timelineFile, "utf8");

  const transport = new StdioClientTransport({
    command: "pnpm",
    args: [
      "--filter",
      "loom-spec",
      "exec",
      "tsx",
      "src/cli/index.ts",
      "mcp",
      "--root",
      fixture,
    ],
    cwd: repoRoot,
  });
  const client = new Client({ name: "smoke-test", version: "0.0.1" });
  await client.connect(transport);

  try {
    // 1. List tools — confirm the 5 new timeline tools are present.
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    for (const want of [
      "loom_list_timelines",
      "loom_read_timeline",
      "loom_add_event",
      "loom_update_event",
      "loom_delete_event",
    ]) {
      await expect(`tool registered: ${want}`, names.includes(want));
    }

    // 2. list_timelines includes todo-completion
    const list = unwrap(
      (await client.callTool({ name: "loom_list_timelines", arguments: {} })) as any
    );
    await expect(
      "list_timelines returns todo-completion",
      !list.isError &&
        Array.isArray(list.json) &&
        list.json.some((s: { id: string }) => s.id === "todo-completion")
    );

    // 3. read_timeline returns the full doc
    const read = unwrap(
      (await client.callTool({
        name: "loom_read_timeline",
        arguments: { id: "todo-completion" },
      })) as any
    );
    await expect(
      "read_timeline returns 6 events",
      !read.isError && read.json?.events?.length === 6
    );

    // 4. add_event rejects an unknown node
    const bad = unwrap(
      (await client.callTool({
        name: "loom_add_event",
        arguments: {
          timeline: "todo-completion",
          node: "does-not-exist",
          start_ms: 0,
          duration_ms: 10,
        },
      })) as any
    );
    await expect(
      "add_event rejects missing node",
      bad.isError === true,
      bad.text
    );

    // 5. add_event with a valid node succeeds
    const added = unwrap(
      (await client.callTool({
        name: "loom_add_event",
        arguments: {
          timeline: "todo-completion",
          node: "confetti",
          start_ms: 2000,
          duration_ms: 50,
          label: "smoke event",
          kind: "compute",
          id: "smoke-test-ev",
        },
      })) as any
    );
    await expect(
      "add_event with valid node succeeds",
      !added.isError && added.json?.ok === true && added.json?.id === "smoke-test-ev",
      added.text
    );

    // 6. update_event mutates a field
    const updated = unwrap(
      (await client.callTool({
        name: "loom_update_event",
        arguments: {
          timeline: "todo-completion",
          id: "smoke-test-ev",
          patch: { duration_ms: 80, label: "edited" },
        },
      })) as any
    );
    await expect(
      "update_event applies patch",
      !updated.isError && updated.json?.ok === true,
      updated.text
    );
    const reread = unwrap(
      (await client.callTool({
        name: "loom_read_timeline",
        arguments: { id: "todo-completion" },
      })) as any
    );
    const found = reread.json?.events?.find((e: { id: string }) => e.id === "smoke-test-ev");
    await expect(
      "update_event persisted (duration_ms = 80, label = 'edited')",
      found?.duration_ms === 80 && found?.label === "edited"
    );

    // 7. update_event rejects unknown node when patching node
    const badNode = unwrap(
      (await client.callTool({
        name: "loom_update_event",
        arguments: {
          timeline: "todo-completion",
          id: "smoke-test-ev",
          patch: { node: "nope" },
        },
      })) as any
    );
    await expect(
      "update_event rejects unknown node in patch",
      badNode.isError === true
    );

    // 8. delete_event removes the event
    const deleted = unwrap(
      (await client.callTool({
        name: "loom_delete_event",
        arguments: { timeline: "todo-completion", id: "smoke-test-ev" },
      })) as any
    );
    await expect(
      "delete_event succeeds",
      !deleted.isError && deleted.json?.ok === true,
      deleted.text
    );

    // 9. fixture restored
    const after = await readFile(timelineFile, "utf8");
    await expect(
      "fixture file restored to original content",
      after === before,
      after === before ? undefined : "file differs from pre-test snapshot"
    );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
