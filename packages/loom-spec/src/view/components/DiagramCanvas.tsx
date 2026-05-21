import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type OnSelectionChangeFunc,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from "@xyflow/react";
import { NodeCard, type NodeCardData } from "./NodeCard";
import type { LoomDiagram, Edge as LoomEdge } from "../../types/diagram";
import type { LoomNodeTypes } from "../../types/node-types";
import type { Selection } from "../App";
import { uniqueEdgeId } from "../state";

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
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMoveNode: (id: string, position: { x: number; y: number }) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onAddEdge: (edge: LoomEdge) => void;
}

function stripPort(handle: string): string {
  const i = handle.indexOf(":");
  return i === -1 ? handle : handle.slice(0, i);
}

export function DiagramCanvas({
  diagram,
  nodeTypesConfig,
  selection,
  onSelect,
  onMoveNode,
  onDeleteNode,
  onDeleteEdge,
  onAddEdge,
}: Props) {
  const flowNodes: FlowNode<NodeCardData>[] = useMemo(
    () =>
      diagram.nodes.map((n) => ({
        id: n.id,
        type: "loom",
        position: n.position,
        selected: selection?.kind === "node" && selection.id === n.id,
        data: {
          node: n,
          typeDef: nodeTypesConfig.types[n.type],
        },
      })),
    [diagram, nodeTypesConfig, selection]
  );

  const flowEdges: FlowEdge[] = useMemo(
    () =>
      diagram.edges.map((e) => ({
        id: e.id,
        source: stripPort(e.from),
        target: stripPort(e.to),
        label: e.label,
        selected: selection?.kind === "edge" && selection.id === e.id,
        style: { stroke: EDGE_COLOR[e.kind], strokeWidth: 1.5 },
        labelStyle: { fill: "var(--text-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--bg-elevated)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        animated: e.kind === "event" || e.kind === "signal",
      })),
    [diagram, selection]
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          // Only commit on drag-end (dragging === false)
          onMoveNode(change.id, change.position);
        } else if (change.type === "remove") {
          onDeleteNode(change.id);
        }
      }
    },
    [onMoveNode, onDeleteNode]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "remove") {
          onDeleteEdge(change.id);
        }
      }
    },
    [onDeleteEdge]
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (!conn.source || !conn.target) return;
      onAddEdge({
        id: uniqueEdgeId(diagram),
        from: conn.source,
        to: conn.target,
        kind: "request",
      });
    },
    [diagram, onAddEdge]
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes, edges }) => {
      if (nodes[0]) {
        onSelect({ kind: "node", id: nodes[0].id });
      } else if (edges[0]) {
        onSelect({ kind: "edge", id: edges[0].id });
      } else {
        onSelect(null);
      }
    },
    [onSelect]
  );

  return (
    <div className="canvas-wrap">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} size={1} color="var(--grid-dot)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
