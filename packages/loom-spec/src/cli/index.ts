#!/usr/bin/env node
import { runInit } from "./init.js";
import { runView } from "./view.js";
import { runValidate } from "./validate.js";
import { runMcp } from "./mcp.js";

const HELP = `loom-spec — node-based architecture spec for your repo

Usage:
  loom-spec init [--path <dir>] [--force]
      Scaffold .loom/ and .claude/skills/loom-spec/ in the target directory.
      Defaults to current working directory.

  loom-spec view [--root <dir>] [--port <n>] [--dev]
      Start the local browser editor. Walks up from --root (default: cwd)
      to find the nearest .loom/ directory.

  loom-spec validate [--root <dir>] [--json]
      Check every diagram for schema validity and code-ref drift
      (missing files, missing symbols, out-of-range line refs).
      Exits non-zero if any issue is found. Use as a CI step or
      pre-commit hook.

  loom-spec mcp [--root <dir>]
      Start a Model Context Protocol server on stdio. Exposes
      loom_list_diagrams, loom_read_diagram, loom_add_node,
      loom_update_node, loom_mark_stale, loom_delete_node,
      loom_add_edge, loom_delete_edge, loom_validate as MCP tools.
      Wire it into Claude Code's mcp.json (or any MCP-capable client).

  loom-spec --help
      Print this help.
`;

function parseFlags(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const [, , subcommand, ...rest] = process.argv;
  const flags = parseFlags(rest);

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(HELP);
    return;
  }

  if (subcommand === "init") {
    await runInit({
      path: (flags.path as string) ?? process.cwd(),
      force: Boolean(flags.force),
    });
    return;
  }

  if (subcommand === "view") {
    await runView({
      root: (flags.root as string) ?? process.cwd(),
      port: flags.port ? Number(flags.port) : 7777,
      dev: Boolean(flags.dev),
    });
    return;
  }

  if (subcommand === "validate") {
    await runValidate({
      root: (flags.root as string) ?? process.cwd(),
      json: Boolean(flags.json),
    });
    return;
  }

  if (subcommand === "mcp") {
    await runMcp({
      root: (flags.root as string) ?? process.cwd(),
    });
    return;
  }

  console.error(`unknown subcommand: ${subcommand}\n`);
  console.log(HELP);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
