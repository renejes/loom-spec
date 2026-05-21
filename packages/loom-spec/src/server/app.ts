import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { resolve } from "node:path";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
} from "./fileOps.js";
import { validateDiagram, validateNodeTypes } from "../validate.js";
import type { LoomRoot } from "./findLoomRoot.js";

export interface AppOptions {
  loomRoot: LoomRoot;
  serveSpaFrom?: string; // path to built SPA (omit in dev)
}

export function createApp({ loomRoot, serveSpaFrom }: AppOptions) {
  const app = new Hono();

  // CORS so the Vite dev server (on a different port) can call /api
  app.use("/api/*", cors());

  app.get("/api/root", (c) =>
    c.json({ rootPath: loomRoot.rootPath, loomPath: loomRoot.loomPath })
  );

  app.get("/api/node-types", async (c) => {
    try {
      const data = await readNodeTypes(loomRoot.loomPath);
      return c.json(data);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get("/api/diagrams", async (c) => {
    try {
      const summaries = await listDiagrams(loomRoot.loomPath);
      return c.json(summaries);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get("/api/diagrams/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const data = await readDiagram(loomRoot.loomPath, id);
      return c.json(data);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "not found" }, 404);
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.put("/api/diagrams/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const result = await validateDiagram(body);
    if (!result.ok) {
      return c.json({ error: "validation failed", details: result.errors }, 422);
    }

    // Sanity: URL :id should match body id
    const diagram = body as { id?: string };
    if (diagram.id !== id) {
      return c.json(
        { error: `body id "${diagram.id}" does not match URL id "${id}"` },
        400
      );
    }

    try {
      await writeDiagram(loomRoot.loomPath, id, body as never);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // (validateNodeTypes is also exposed for symmetry/future use)
  app.put("/api/node-types", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    const result = await validateNodeTypes(body);
    if (!result.ok) {
      return c.json({ error: "validation failed", details: result.errors }, 422);
    }
    // not implemented as a writer yet — node-types edits go through init/upgrade flows
    return c.json({ error: "node-types editing is not enabled yet" }, 501);
  });

  // Serve the prebuilt SPA in production. In dev, Vite handles this.
  if (serveSpaFrom) {
    app.use(
      "/*",
      serveStatic({
        root: serveSpaFrom,
        rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
      })
    );
  }

  return app;
}
