import { useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { NodeCard, type NodeCardData } from "./NodeCard";
import type { LoomDiagram, Node as LoomNode, Edge as LoomEdge } from "../../types/diagram";
import type { LoomNodeTypes } from "../../types/node-types";

const EDGE_COLOR: Record<LoomEdge["kind"], string> = {
  request: "var(--edge-request)",
  event: "var(--edge-event)",
  "data-read": "var(--edge-data-read)",
  "data-write": "var(--edge-data-write)",
  signal: "var(--edge-signal)",
  dependency: "var(--edge-dependency)",
  control: "var(--edge-control)",
};

const nodeTypes = { loom: NodeCard };

interface Props {
  diagram: LoomDiagram;
  nodeTypesConfig: LoomNodeTypes;
  onSelectNode: (node: LoomNode | null) => void;
}

function stripPort(handle: string): string {
  const i = handle.indexOf(":");
  return i === -1 ? handle : handle.slice(0, i);
}

export function DiagramCanvas({ diagram, nodeTypesConfig, onSelectNode }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flowNodes: FlowNode<NodeCardData>[] = useMemo(
    () =>
      diagram.nodes.map((n) => ({
        id: n.id,
        type: "loom",
        position: n.position,
        selected: n.id === selectedId,
        data: {
          node: n,
          typeDef: nodeTypesConfig.types[n.type],
        },
      })),
    [diagram, nodeTypesConfig, selectedId]
  );

  const flowEdges: FlowEdge[] = useMemo(
    () =>
      diagram.edges.map((e) => ({
        id: e.id,
        source: stripPort(e.from),
        target: stripPort(e.to),
        label: e.label,
        style: { stroke: EDGE_COLOR[e.kind], strokeWidth: 1.5 },
        labelStyle: { fill: "var(--text-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--bg-elevated)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        animated: e.kind === "event" || e.kind === "signal",
      })),
    [diagram]
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes }) => {
      const first = nodes[0];
      if (first) {
        setSelectedId(first.id);
        const loomNode = diagram.nodes.find((n) => n.id === first.id) ?? null;
        onSelectNode(loomNode);
      } else {
        setSelectedId(null);
        onSelectNode(null);
      }
    },
    [diagram, onSelectNode]
  );

  return (
    <div className="canvas-wrap">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onSelectionChange={onSelectionChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="var(--grid-dot)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
