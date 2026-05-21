import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
  listTimelines,
  readTimeline,
  writeTimeline,
} from "./fileOps.js";
import { validateDiagram, validateNodeTypes, validateTimeline } from "../validate.js";
import type { LoomRoot } from "./findLoomRoot.js";
import type { LoomWatcher, LoomChangeEvent } from "./watch.js";

export interface AppOptions {
  loomRoot: LoomRoot;
  watcher: LoomWatcher;
  serveSpaFrom?: string;
}

export function createApp({ loomRoot, watcher, serveSpaFrom }: AppOptions) {
  const app = new Hono();

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

    const diagram = body as { id?: string };
    if (diagram.id !== id) {
      return c.json(
        { error: `body id "${diagram.id}" does not match URL id "${id}"` },
        400
      );
    }

    try {
      await writeDiagram(
        loomRoot.loomPath,
        id,
        body as never,
        (path) => watcher.markSelfWrite(path)
      );
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // ─── Timelines ──────────────────────────────────────────────────

  app.get("/api/timelines", async (c) => {
    try {
      const summaries = await listTimelines(loomRoot.loomPath);
      return c.json(summaries);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get("/api/timelines/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const data = await readTimeline(loomRoot.loomPath, id);
      return c.json(data);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "not found" }, 404);
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.put("/api/timelines/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const result = await validateTimeline(body);
    if (!result.ok) {
      return c.json({ error: "validation failed", details: result.errors }, 422);
    }

    const tl = body as { id?: string };
    if (tl.id !== id) {
      return c.json(
        { error: `body id "${tl.id}" does not match URL id "${id}"` },
        400
      );
    }

    try {
      await writeTimeline(
        loomRoot.loomPath,
        id,
        body as never,
        (path) => watcher.markSelfWrite(path)
      );
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

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
    return c.json({ error: "node-types editing is not enabled yet" }, 501);
  });

  // Server-Sent Events: live updates when files change externally
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let notify: (() => void) | null = null;
      const queue: LoomChangeEvent[] = [];
      const onChange = (event: LoomChangeEvent) => {
        queue.push(event);
        notify?.();
      };
      watcher.on("change", onChange);

      // Initial "hello" so the client knows the stream is alive
      await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });

      // Heartbeat so proxies don't close the stream
      const heartbeat = setInterval(() => {
        stream
          .writeSSE({ data: JSON.stringify({ type: "ping" }) })
          .catch(() => {});
      }, 25000);

      stream.onAbort(() => {
        watcher.off("change", onChange);
        clearInterval(heartbeat);
        notify?.();
      });

      try {
        while (!stream.aborted) {
          if (queue.length > 0) {
            const event = queue.shift()!;
            await stream.writeSSE({
              event: "change",
              data: JSON.stringify(event),
            });
          } else {
            await new Promise<void>((resolve) => {
              notify = () => {
                notify = null;
                resolve();
              };
            });
          }
        }
      } finally {
        watcher.off("change", onChange);
        clearInterval(heartbeat);
      }
    })
  );

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
