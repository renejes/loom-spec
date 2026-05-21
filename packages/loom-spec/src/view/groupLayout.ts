import type { LoomDiagram, Group as LoomGroup, Node as LoomNode } from "../types/diagram";

/**
 * Approximate node size used when laying out group frames. Real nodes are
 * variable width, but xyflow doesn't surface measurements until after first
 * render. These constants are good enough for a v1 group frame that snugly
 * encompasses the standard NodeCard.
 */
export const ASSUMED_NODE_WIDTH = 200;
export const ASSUMED_NODE_HEIGHT = 90;

const HORIZONTAL_PADDING = 24;
const TOP_PADDING_FOR_LABEL = 32;
const BOTTOM_PADDING = 18;

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute bounding boxes for every group, recursively including subgroups.
 * Returns a Map keyed by group id. Empty groups (no children, no subgroups)
 * are given a small placeholder box.
 */
export function computeGroupBboxes(diagram: LoomDiagram): Map<string, Bbox> {
  const groupsById = new Map<string, LoomGroup>(
    (diagram.groups ?? []).map((g) => [g.id, g])
  );
  const nodesById = new Map<string, LoomNode>(
    diagram.nodes.map((n) => [n.id, n])
  );
  const cache = new Map<string, Bbox>();
  const inProgress = new Set<string>(); // cycle guard

  function bboxFor(groupId: string): Bbox | null {
    const cached = cache.get(groupId);
    if (cached) return cached;
    if (inProgress.has(groupId)) return null; // cyclic subgroup, bail
    inProgress.add(groupId);

    const group = groupsById.get(groupId);
    if (!group) {
      inProgress.delete(groupId);
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const childId of group.children ?? []) {
      const node = nodesById.get(childId);
      if (!node) continue;
      const { x, y } = node.position;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + ASSUMED_NODE_WIDTH);
      maxY = Math.max(maxY, y + ASSUMED_NODE_HEIGHT);
    }

    for (const subId of group.subgroups ?? []) {
      const sub = bboxFor(subId);
      if (!sub) continue;
      minX = Math.min(minX, sub.x);
      minY = Math.min(minY, sub.y);
      maxX = Math.max(maxX, sub.x + sub.width);
      maxY = Math.max(maxY, sub.y + sub.height);
    }

    let result: Bbox;
    if (!isFinite(minX)) {
      // empty group: small placeholder
      result = { x: 50, y: 50, width: 220, height: 80 };
    } else {
      result = {
        x: minX - HORIZONTAL_PADDING,
        y: minY - TOP_PADDING_FOR_LABEL,
        width: maxX - minX + HORIZONTAL_PADDING * 2,
        height: maxY - minY + TOP_PADDING_FOR_LABEL + BOTTOM_PADDING,
      };
    }
    cache.set(groupId, result);
    inProgress.delete(groupId);
    return result;
  }

  for (const group of diagram.groups ?? []) {
    bboxFor(group.id);
  }

  return cache;
}

/**
 * Sort groups so that nested ones render on top of their parents.
 * A group that contains another in `subgroups` must render BEFORE
 * the contained one (so xyflow stacks them correctly).
 */
export function sortGroupsByDepth(groups: LoomGroup[]): LoomGroup[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const depth = new Map<string, number>();

  function depthOf(id: string, seen = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle
    seen.add(id);
    const group = groupsById.get(id);
    if (!group || !group.subgroups || group.subgroups.length === 0) {
      depth.set(id, 0);
      return 0;
    }
    let max = 0;
    for (const sub of group.subgroups) {
      max = Math.max(max, depthOf(sub, seen) + 1);
    }
    depth.set(id, max);
    return max;
  }

  for (const g of groups) depthOf(g.id);
  // Outer groups (high depth) first, inner groups (low depth) later → inner
  // groups are drawn on top of outer groups.
  return [...groups].sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0));
}
