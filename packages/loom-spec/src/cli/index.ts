#!/usr/bin/env node
import { runInit } from "./init.js";
import { runView } from "./view.js";

const HELP = `loom-spec — node-based architecture spec for your repo

Usage:
  loom-spec init [--path <dir>] [--force]
      Scaffold .loom/ and .claude/skills/loom-spec/ in the target directory.
      Defaults to current working directory.

  loom-spec view [--root <dir>] [--port <n>] [--dev]
      Start the local browser editor. Walks up from --root (default: cwd)
      to find the nearest .loom/ directory.

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

  console.error(`unknown subcommand: ${subcommand}\n`);
  console.log(HELP);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
