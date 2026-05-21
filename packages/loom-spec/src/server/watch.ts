import { FSWatcher, watch as chokidarWatch } from "chokidar";
import { EventEmitter } from "node:events";
import { basename, resolve } from "node:path";

export interface LoomChangeEvent {
  type: "diagram-changed" | "node-types-changed";
  id?: string;
}

/**
 * Watches `.loom/` for changes from external editors (humans, AI agents).
 * Self-writes (from our own PUT endpoint) are suppressed within a short
 * grace window so the UI doesn't react to its own edits.
 */
export class LoomWatcher extends EventEmitter {
  private watcher: FSWatcher;
  private recentSelfWrites = new Map<string, number>();
  private static SUPPRESS_MS = 1500;

  constructor(loomPath: string) {
    super();
    this.watcher = chokidarWatch(
      [
        resolve(loomPath, "diagrams"),
        resolve(loomPath, "node-types.json"),
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
      } else if (path.endsWith(".flow.json")) {
        const id = basename(path, ".flow.json");
        this.emit("change", { type: "diagram-changed", id });
      }
    });
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
    await this.watcher.close();
  }
}
