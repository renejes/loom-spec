import { stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export interface LoomRoot {
  rootPath: string;
  loomPath: string;
}

/**
 * Walks up from `startDir` looking for a `.loom/` directory.
 * Throws if none is found.
 */
export async function findLoomRoot(startDir: string): Promise<LoomRoot> {
  let dir = resolve(startDir);
  while (true) {
    const candidate = resolve(dir, ".loom");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) {
        return { rootPath: dir, loomPath: candidate };
      }
    } catch {
      // not here, keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No .loom/ directory found in ${startDir} or any parent. ` +
          `Run \`loom-spec init\` first.`
      );
    }
    dir = parent;
  }
}
