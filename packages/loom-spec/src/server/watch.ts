import { FSWatcher, watch as chokidarWatch } from "chokidar";
import { EventEmitter } from "node:events";
import { basename, resolve } from "node:path";

export interface LoomChangeEvent {
  type: "diagram-changed" | "node-types-changed" | "timeline-changed";
  id?: string;
}

/**
 * Watches `.loom/` for changes from external editors (humans, AI agents).
 * Self-writes (from our own PUT endpoint) are suppressed within a short
 * grace window so the UI doesn't react to its own edits.
 *
 * The watcher does not throw on startup if the target dir is missing — it
 * just logs a warning. chokidar errors are caught and logged so a transient
 * filesystem hiccup doesn't crash the server.
 */
export class LoomWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private recentSelfWrites = new Map<string, number>();
  private static SUPPRESS_MS = 1500;

  constructor(private loomPath: string) {
    super();
    this.start();
  }

  private start() {
    try {
      this.watcher = chokidarWatch(
        [
          resolve(this.loomPath, "diagrams"),
          resolve(this.loomPath, "timelines"),
          resolve(this.loomPath, "node-types.json"),
        ],
        {
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        }
      );

      this.watcher.on("all", (_eventName: string, path: string) => {
        if (this.isSelfWrite(path)) return;
        if (path.endsWith("/node-types.json")) {
          this.emit("change", { type: "node-types-changed" });
        } else if (path.endsWith(".timeline.json")) {
          const id = basename(path, ".timeline.json");
          this.emit("change", { type: "timeline-changed", id });
        } else if (path.endsWith(".flow.json")) {
          const id = basename(path, ".flow.json");
          this.emit("change", { type: "diagram-changed", id });
        }
      });

      this.watcher.on("error", (err) => {
        console.warn(
          `[loom-spec watcher] error: ${(err as Error).message}. ` +
            "Live sync may be degraded; server continues serving."
        );
      });
    } catch (err) {
      console.warn(
        `[loom-spec watcher] failed to start: ${(err as Error).message}. ` +
          "Live sync disabled; server continues serving."
      );
      this.watcher = null;
    }
  }

  /**
   * Mark a path as having been just written by us. Subsequent chokidar
   * events on this path within the grace window are suppressed.
   */
  markSelfWrite(path: string) {
    this.recentSelfWrites.set(path, Date.now());
  }

  private isSelfWrite(path: string): boolean {
    const t = this.recentSelfWrites.get(path);
    if (t === undefined) return false;
    if (Date.now() - t > LoomWatcher.SUPPRESS_MS) {
      this.recentSelfWrites.delete(path);
      return false;
    }
    return true;
  }

  async close() {
    if (this.watcher) {
      try {
        await this.watcher.close();
      } catch {
        // ignore close errors on shutdown
      }
      this.watcher = null;
    }
  }
}
