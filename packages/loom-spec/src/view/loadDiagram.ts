import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";

// Phase 4: static import from the example fixture.
// Phase 5 will replace this with a fetch from the Hono server.
import overviewDiagram from "../../../../examples/todo-app/.loom/diagrams/overview.flow.json";
import nodeTypesConfig from "../../../../examples/todo-app/.loom/node-types.json";

export interface LoadedSpec {
  diagram: LoomDiagram;
  nodeTypes: LoomNodeTypes;
}

export async function loadDiagram(_id = "overview"): Promise<LoadedSpec> {
  return {
    diagram: overviewDiagram as LoomDiagram,
    nodeTypes: nodeTypesConfig as LoomNodeTypes,
  };
}
