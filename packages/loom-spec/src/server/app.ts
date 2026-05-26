import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  listDiagrams,
  readDiagram,
  writeDiagram,
  readNodeTypes,
  listJourneys,
  readJourney,
  writeJourney,
} from "./fileOps.js";
import {
  validateDiagram,
  validateNodeTypes,
  validateJourney,
} from "../validate.js";
import type { LoomJourney } from "../types/journey.js";
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

  app.get("/api/journeys", async (c) => {
    try {
      const summaries = await listJourneys(loomRoot.loomPath);
      return c.json(summaries);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get("/api/journeys/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const data = await readJourney(loomRoot.loomPath, id);
      return c.json(data);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "not found" }, 404);
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.put("/api/journeys/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const schemaResult = await validateJourney(body);
    if (!schemaResult.ok) {
      return c.json(
        { error: "validation failed", details: schemaResult.errors },
        422
      );
    }

    const journey = body as LoomJourney;
    if (journey.id !== id) {
      return c.json(
        { error: `body id "${journey.id}" does not match URL id "${id}"` },
        400
      );
    }

    // Referential integrity: the journey's diagram must exist, and every
    // step.node must resolve to a node in that diagram.
    let diagram;
    try {
      diagram = await readDiagram(loomRoot.loomPath, journey.diagram);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return c.json(
          {
            error: "validation failed",
            details: [`/diagram: references unknown diagram "${journey.diagram}"`],
          },
          422
        );
      }
      return c.json({ error: (e as Error).message }, 500);
    }
    const nodeIds = new Set(diagram.nodes.map((n) => n.id));
    const stepErrors: string[] = [];
    const seenStepIds = new Set<string>();
    journey.steps.forEach((step, i) => {
      if (seenStepIds.has(step.id)) {
        stepErrors.push(`/steps/${i}/id: duplicate step id "${step.id}"`);
      }
      seenStepIds.add(step.id);
      if (!nodeIds.has(step.node)) {
        stepErrors.push(
          `/steps/${i}/node: node "${step.node}" does not exist in diagram "${journey.diagram}"`
        );
      }
    });
    if (stepErrors.length > 0) {
      return c.json({ error: "validation failed", details: stepErrors }, 422);
    }

    try {
      await writeJourney(
        loomRoot.loomPath,
        id,
        journey,
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
