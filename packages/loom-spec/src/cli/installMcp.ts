import { resolve, relative } from "node:path";
import { installMcpEntry } from "./mcpConfig.js";

export interface InstallMcpArgs {
  path: string;
}

export async function runInstallMcp(args: InstallMcpArgs): Promise<void> {
  const target = resolve(args.path);
  try {
    const report = await installMcpEntry(target);
    const rel = relative(process.cwd(), report.path);
    if (report.action === "unchanged") {
      console.log(`MCP entry already up to date in ${rel}.`);
    } else if (report.action === "created") {
      console.log(`Created ${rel} with the loom-spec MCP server.`);
    } else {
      console.log(`Updated ${rel} — added loom-spec MCP server entry.`);
    }
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  }
}
