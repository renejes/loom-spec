#!/usr/bin/env node
import { runInit } from "./init.js";
import { runView } from "./view.js";
import { runValidate } from "./validate.js";
import { runMcp } from "./mcp.js";
import { runInstallMcp } from "./installMcp.js";
import { runImportTrace } from "./importTrace.js";
import { runExportHtml, DEFAULT_OUT as EXPORT_DEFAULT_OUT } from "./exportHtml.js";

const HELP = `loom-spec — node-based architecture spec for your repo

Usage:
  loom-spec init [--path <dir>] [--force] [--mcp]
      Scaffold .loom/ and .claude/skills/loom-spec/ in the target directory.
      With --mcp, also register the MCP server in .mcp.json (merging
      with any existing entries). Defaults to current working directory.

  loom-spec install-mcp [--path <dir>]
      Register the loom-spec MCP server in .mcp.json without touching
      anything else. Idempotent — safe to run multiple times.

  loom-spec view [--root <dir>] [--port <n>] [--dev]
      Start the local browser editor. Walks up from --root (default: cwd)
      to find the nearest .loom/ directory.

  loom-spec validate [--root <dir>] [--json]
      Check every diagram for schema validity and code-ref drift
      (missing files, missing symbols, out-of-range line refs).
      Exits non-zero if any issue is found. Use as a CI step or
      pre-commit hook.

  loom-spec mcp [--root <dir>]
      Start a Model Context Protocol server on stdio. Exposes 15 tools
      for diagrams (loom_list_diagrams, loom_add_node, loom_add_edge, …)
      and timelines (loom_list_timelines, loom_add_event, …) — wire it
      into Claude Code's mcp.json (or any MCP-capable client).

  loom-spec export-html [<bundle-name>] [--out <path>] [--diagram <id>]
                        [--no-timelines]
                        [--include-tag <comma-list>] [--exclude-tag <comma-list>]
                        [--root <dir>]
      Build a standalone interactive HTML file from the spec — pan/zoom,
      drill-down, switch diagrams, play timelines. Single self-contained
      file, no server needed. Drop it into a manual, wiki, GitHub Pages
      site, anywhere. Output defaults to ./loom.html. With --diagram, only
      that diagram (and timelines referencing it) ship. With
      --include-tag / --exclude-tag, only nodes whose 'tags' match
      survive — edges, groups, drill-down chevrons, timeline events that
      point at dropped nodes are cleaned up automatically.

      Pass a <bundle-name> as the first positional arg to read settings
      from a named bundle in .loom/exports.json. Explicit flags override
      the bundle's values.

  loom-spec import-trace <trace.json> --as <timeline-id> --diagram <diagram-id>
                        [--map <mapping.json>] [--append] [--root <dir>]
      Read an OpenTelemetry OTLP-JSON trace and generate a timeline that
      mirrors the actual spans on the named diagram. Each span becomes
      an event; parent/child relationships preserve as triggered_by;
      service.name becomes the track. Spans whose service or name can't
      be matched to a node are skipped — pass --map to override.

  loom-spec --help
      Print this help.
`;

function parseFlags(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
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
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  const [, , subcommand, ...rest] = process.argv;
  const { flags, positional } = parseFlags(rest);

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(HELP);
    return;
  }

  if (subcommand === "init") {
    await runInit({
      path: (flags.path as string) ?? process.cwd(),
      force: Boolean(flags.force),
      mcp: Boolean(flags.mcp),
    });
    return;
  }

  if (subcommand === "install-mcp") {
    await runInstallMcp({
      path: (flags.path as string) ?? process.cwd(),
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

  if (subcommand === "export-html") {
    const splitTags = (v: unknown): string[] | undefined => {
      if (typeof v !== "string" || !v.trim()) return undefined;
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    };
    // First positional arg, if any, is a named-bundle key from
    // .loom/exports.json (e.g. `loom-spec export-html user-manual`).
    const bundle = positional[0];
    await runExportHtml({
      out: (flags.out as string) ?? EXPORT_DEFAULT_OUT,
      root: (flags.root as string) ?? process.cwd(),
      diagram: typeof flags.diagram === "string" ? flags.diagram : undefined,
      noTimelines: Boolean(flags["no-timelines"]),
      includeTags: splitTags(flags["include-tag"]),
      excludeTags: splitTags(flags["exclude-tag"]),
      bundle,
    });
    return;
  }

  if (subcommand === "import-trace") {
    // Positional arg: the trace file path.
    const trace = positional[0];
    if (!trace) {
      console.error("import-trace: missing trace file path");
      console.log(HELP);
      process.exit(1);
    }
    const asId = flags.as as string | undefined;
    const diagramId = flags.diagram as string | undefined;
    if (!asId || !diagramId) {
      console.error("import-trace: --as <timeline-id> and --diagram <diagram-id> are required");
      process.exit(1);
    }
    await runImportTrace({
      trace,
      asId,
      diagramId,
      map: typeof flags.map === "string" ? flags.map : undefined,
      append: Boolean(flags.append),
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
