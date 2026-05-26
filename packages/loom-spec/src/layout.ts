/**
 * Pure-function layout helpers shared between the MCP server and the
 * browser editor. No I/O, no DOM, no Node-specific APIs — safe to
 * import from either side.
 */
import type { LoomDiagram } from "./types/diagram.js";

// Tuned for the default NodeCard size; ~220 wide × ~100 tall plus a
// padding band that keeps neighbours visually distinct.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const PADDING = 60;
const COLLISION_X = NODE_WIDTH + PADDING / 2;
const COLLISION_Y = NODE_HEIGHT + PADDING / 2;

function collides(diagram: LoomDiagram, x: number, y: number): boolean {
  return diagram.nodes.some(
    (n) =>
      Math.abs(n.position.x - x) < COLLISION_X &&
      Math.abs(n.position.y - y) < COLLISION_Y
  );
}

/**
 * Compute a non-overlapping position for a new node. Used as the
 * default when no explicit position is passed to `loom_add_node` (MCP)
 * or the +Add button (browser editor).
 *
 * Heuristic: place to the right of the rightmost existing node at the
 * median y of the existing column. If that spot collides (rare unless
 * positions are clustered), slide down; if it runs off the canvas,
 * start a fresh column further right.
 *
 * Not a full graph layout — that would re-arrange existing nodes,
 * which users do not expect. This only places the *new* node well.
 */
export function computeNewNodePosition(
  diagram: LoomDiagram
): { x: number; y: number } {
  if (diagram.nodes.length === 0) {
    return { x: 80, y: 160 };
  }
  let maxX = -Infinity;
  const ys: number[] = [];
  for (const n of diagram.nodes) {
    if (n.position.x > maxX) maxX = n.position.x;
    ys.push(n.position.y);
  }
  ys.sort((a, b) => a - b);
  const medianY = ys[Math.floor(ys.length / 2)]!;

  let x = maxX + NODE_WIDTH + PADDING;
  let y = medianY;

  // Safety bounds: don't loop forever on pathological inputs.
  const MAX_TRIES = 200;
  for (let i = 0; i < MAX_TRIES; i++) {
    if (!collides(diagram, x, y)) return { x, y };
    y += NODE_HEIGHT + PADDING;
    if (y > medianY + 12 * (NODE_HEIGHT + PADDING)) {
      x += NODE_WIDTH + PADDING;
      y = medianY;
    }
  }
  // Fallback if everything is somehow occupied — pick a spot well past
  // the right edge. Better to overshoot than to overlap.
  return { x: maxX + (NODE_WIDTH + PADDING) * 4, y: medianY };
}
