import { serve } from "@hono/node-server";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findLoomRoot } from "../server/findLoomRoot.js";
import { createApp } from "../server/app.js";
import { LoomWatcher } from "../server/watch.js";

export interface ViewArgs {
  root: string;
  port: number;
  dev: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));

export async function runView(args: ViewArgs): Promise<void> {
  let loomRoot;
  try {
    loomRoot = await findLoomRoot(args.root);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  }

  const watcher = new LoomWatcher(loomRoot.loomPath);

  const app = createApp({
    loomRoot,
    watcher,
    // In dev, Vite serves the SPA. Otherwise we serve the built bundle.
    serveSpaFrom: args.dev ? undefined : resolve(here, "../view"),
  });

  const server = serve({ fetch: app.fetch, port: args.port }, (info) => {
    console.log(`loom-spec: http://localhost:${info.port}`);
    console.log(`  root:  ${loomRoot.rootPath}`);
    console.log(`  .loom: ${loomRoot.loomPath}`);
  });

  const shutdown = async () => {
    await watcher.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
