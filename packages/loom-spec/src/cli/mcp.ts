import { findLoomRoot } from "../server/findLoomRoot.js";
import { startMcpServer } from "../mcp/server.js";

export interface McpArgs {
  root: string;
}

export async function runMcp(args: McpArgs): Promise<void> {
  let loomRoot;
  try {
    loomRoot = await findLoomRoot(args.root);
  } catch (e) {
    // MCP servers communicate over stdio — print errors to stderr only.
    console.error(`loom-spec mcp: ${(e as Error).message}`);
    process.exit(1);
  }

  // Hint goes to stderr (stdout is the MCP transport)
  console.error(`loom-spec mcp: serving ${loomRoot.loomPath}`);
  await startMcpServer(loomRoot);
}
