import { readDiagram } from "./fileOps.js";
import type { LoomJourney } from "../types/journey.js";

/**
 * Referential integrity check for a journey beyond what the schema can express:
 * the referenced diagram must exist, every step.node must resolve to a node in
 * that diagram, and step ids must be unique within the journey.
 *
 * Returns an array of human-readable error messages (with JSON-pointer-ish
 * paths). An empty array means the journey is consistent. The schema check
 * lives elsewhere — call validateJourney() first for shape errors.
 */
export async function crossCheckJourney(
  loomPath: string,
  journey: LoomJourney
): Promise<string[]> {
  const errors: string[] = [];
  let diagram;
  try {
    diagram = await readDiagram(loomPath, journey.diagram);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return [`/diagram: references unknown diagram "${journey.diagram}"`];
    }
    throw e;
  }
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const seenStepIds = new Set<string>();
  journey.steps.forEach((step, i) => {
    if (seenStepIds.has(step.id)) {
      errors.push(`/steps/${i}/id: duplicate step id "${step.id}"`);
    }
    seenStepIds.add(step.id);
    if (!nodeIds.has(step.node)) {
      errors.push(
        `/steps/${i}/node: node "${step.node}" does not exist in diagram "${journey.diagram}"`
      );
    }
  });
  return errors;
}
