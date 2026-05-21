import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { findLoomRoot } from "./findLoomRoot.js";
import { createApp } from "./app.js";

interface CliArgs {
  root: string;
  port: number;
  dev: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    root: process.cwd(),
    port: 7778,
    dev: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") {
      const next = argv[++i];
      if (next) args.root = resolve(next);
    } else if (a === "--port") {
      const next = argv[++i];
      if (next) args.port = Number(next);
    } else if (a === "--dev") {
      args.dev = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let loomRoot;
  try {
    loomRoot = await findLoomRoot(args.root);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  }

  const app = createApp({
    loomRoot,
    // In prod we'd point this to the built SPA. Dev mode skips it.
    serveSpaFrom: args.dev ? undefined : resolve(import.meta.dirname, "../view"),
  });

  serve({ fetch: app.fetch, port: args.port }, (info) => {
    console.log(`loom-spec server: http://localhost:${info.port}`);
    console.log(`  root:  ${loomRoot.rootPath}`);
    console.log(`  .loom: ${loomRoot.loomPath}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
