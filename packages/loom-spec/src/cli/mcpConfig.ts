import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [k: string]: unknown;
}

const SERVER_NAME = "loom-spec";

function loomSpecEntry(): McpServerEntry {
  return {
    command: "npx",
    args: ["-y", "loom-spec", "mcp"],
  };
}

/**
 * Idempotently register the loom-spec MCP server in <projectPath>/.mcp.json.
 *
 * - If the file doesn't exist, creates it with just our entry.
 * - If it exists and parses, merges our entry into mcpServers. Other servers
 *   and top-level keys are preserved.
 * - If the existing entry is identical, reports "unchanged" and exits clean.
 * - If the file exists but doesn't parse, errors out without writing.
 *
 * Returns a small report describing what happened.
 */
export async function installMcpEntry(projectPath: string): Promise<{
  path: string;
  action: "created" | "updated" | "unchanged";
}> {
  const configPath = resolve(projectPath, ".mcp.json");

  let existing: McpConfig | null = null;
  try {
    await stat(configPath);
    const raw = await readFile(configPath, "utf8");
    try {
      existing = JSON.parse(raw) as McpConfig;
    } catch (e) {
      throw new Error(
        `${relative(process.cwd(), configPath)} exists but is not valid JSON: ${(e as Error).message}`
      );
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") throw e;
    // fall through: existing remains null
  }

  const desired = loomSpecEntry();
  const config: McpConfig = existing ?? {};
  const servers = config.mcpServers ?? {};
  const current = servers[SERVER_NAME];

  // Compare normalized JSON to detect identical entries
  if (current && JSON.stringify(current) === JSON.stringify(desired)) {
    return { path: configPath, action: "unchanged" };
  }

  servers[SERVER_NAME] = desired;
  config.mcpServers = servers;

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return {
    path: configPath,
    action: existing ? "updated" : "created",
  };
}
