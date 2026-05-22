import { useMemo, useCallback, useEffect, useRef } from "react";
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
  type ReactFlowInstance,
} from "@xyflow/react";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { GroupNode, type GroupNodeData } from "./GroupNode";
import { ParallelEdge } from "./ParallelEdge";
import { PulseEdge } from "./PulseEdge";
import type { LoomDiagram, Edge as LoomEdge } from "../../types/diagram";
import type { LoomNodeTypes } from "../../types/node-types";
import type { Selection } from "../App";
import { uniqueEdgeId } from "../state";
import { computeGroupBboxes, sortGroupsByDepth } from "../groupLayout";

const EDGE_COLOR: Record<LoomEdge["kind"], string> = {
  request: "var(--edge-request)",
  event: "var(--edge-event)",
  "data-read": "var(--edge-data-read)",
  "data-write": "var(--edge-data-write)",
  signal: "var(--edge-signal)",
  dependency: "var(--edge-dependency)",
  control: "var(--edge-control)",
};

const nodeTypes = { loom: NodeCard, loomGroup: GroupNode };
const edgeTypes = { parallel: ParallelEdge, pulse: PulseEdge };

interface Props {
  diagram: LoomDiagram;
  nodeTypesConfig: LoomNodeTypes;
  selection?: Selection;
  onSelect?: (selection: Selection) => void;
  onMoveNode?: (id: string, position: { x: number; y: number }) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
  onAddEdge?: (edge: LoomEdge) => void;
  onDrillDown?: (id: string) => void;
  /** When false: no drag, no connect, no selection, no delete-key. Default true. */
  interactive?: boolean;
  /** Ids of nodes that should render with an "active" glow (e.g. driven by
   *  the timeline playhead). */
  activeNodeIds?: ReadonlySet<string>;
  /** Ids of edges that should render with a traveling pulse marker. */
  pulsingEdgeIds?: ReadonlySet<string>;
}

function stripPort(handle: string): string {
  const i = handle.indexOf(":");
  return i === -1 ? handle : handle.slice(0, i);
}

function splitHandle(handle: string): { node: string; port: string | null } {
  const i = handle.indexOf(":");
  if (i === -1) return { node: handle, port: null };
  return { node: handle.slice(0, i), port: handle.slice(i + 1) };
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
  onDrillDown,
  interactive = true,
  activeNodeIds,
  pulsingEdgeIds,
}: Props) {
  const flowNodes: FlowNode<NodeCardData | GroupNodeData>[] = useMemo(() => {
    // Group frames render first (lower z-index) so children sit on top.
    // Outer groups before inner groups so nesting stacks correctly.
    const bboxes = computeGroupBboxes(diagram);
    const sortedGroups = sortGroupsByDepth(diagram.groups ?? []);
    const groupNodes: FlowNode<GroupNodeData>[] = sortedGroups.flatMap((g) => {
      const bbox = bboxes.get(g.id);
      if (!bbox) return [];
      return [
        {
          id: `__group__${g.id}`,
          type: "loomGroup",
          position: { x: bbox.x, y: bbox.y },
          width: bbox.width,
          height: bbox.height,
          draggable: false,
          selectable: false,
          focusable: false,
          deletable: false,
          data: { group: g, onDrillDown },
        },
      ];
    });

    const itemNodes: FlowNode<NodeCardData>[] = diagram.nodes.map((n) => ({
      id: n.id,
      type: "loom",
      position: n.position,
      selected: selection?.kind === "node" && selection.id === n.id,
      draggable: interactive,
      selectable: interactive,
      data: {
        node: n,
        typeDef: nodeTypesConfig.types[n.type],
        onDrillDown,
        active: activeNodeIds?.has(n.id) ?? false,
      },
    }));

    return [...groupNodes, ...itemNodes];
  }, [diagram, nodeTypesConfig, selection, onDrillDown, interactive, activeNodeIds]);

  const flowEdges: FlowEdge[] = useMemo(() => {
    // Group edges by source→target so parallels share an offset axis.
    const groups = new Map<string, LoomEdge[]>();
    for (const e of diagram.edges) {
      const key = `${stripPort(e.from)}::${stripPort(e.to)}`;
      const arr = groups.get(key);
      if (arr) arr.push(e);
      else groups.set(key, [e]);
    }

    return diagram.edges.map((e) => {
      const key = `${stripPort(e.from)}::${stripPort(e.to)}`;
      const siblings = groups.get(key)!;
      const indexInGroup = siblings.findIndex((s) => s.id === e.id);
      const count = siblings.length;
      // Centered offset: for 2 → [-1, +1]; for 3 → [-1, 0, +1]; for 4 → [-1.5, -0.5, 0.5, 1.5]
      const offsetIndex = count === 1 ? 0 : indexInGroup - (count - 1) / 2;
      const isParallel = count > 1;
      const from = splitHandle(e.from);
      const to = splitHandle(e.to);

      const pulsing = pulsingEdgeIds?.has(e.id) ?? false;
      // Pulse edges share the bezier-with-offset path math with parallel edges,
      // so a pulsing parallel still renders along its correct curve.
      const type = pulsing ? "pulse" : isParallel ? "parallel" : undefined;
      return {
        id: e.id,
        source: from.node,
        target: to.node,
        sourceHandle: from.port,
        targetHandle: to.port,
        type,
        label: e.label,
        selected: selection?.kind === "edge" && selection.id === e.id,
        selectable: interactive,
        style: { stroke: EDGE_COLOR[e.kind], strokeWidth: 1.5 },
        labelStyle: { fill: "var(--text-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--bg-elevated)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        // While pulsing we let the marker carry the motion; the dashed-stroke
        // "animated" style would visually compete with it.
        animated: !pulsing && (e.kind === "event" || e.kind === "signal"),
        data: { parallelOffset: isParallel ? offsetIndex : 0, pulsing },
      };
    });
  }, [diagram, selection, interactive, pulsingEdgeIds]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        // Group frames are synthetic; ignore any changes that target them.
        if ("id" in change && change.id.startsWith("__group__")) continue;
        if (change.type === "position" && change.position && !change.dragging) {
          // Only commit on drag-end (dragging === false)
          onMoveNode?.(change.id, change.position);
        } else if (change.type === "remove") {
          onDeleteNode?.(change.id);
        }
      }
    },
    [onMoveNode, onDeleteNode]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "remove") {
          onDeleteEdge?.(change.id);
        }
      }
    },
    [onDeleteEdge]
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (!conn.source || !conn.target) return;
      const from = conn.sourceHandle ? `${conn.source}:${conn.sourceHandle}` : conn.source;
      const to = conn.targetHandle ? `${conn.target}:${conn.targetHandle}` : conn.target;
      onAddEdge?.({
        id: uniqueEdgeId(diagram),
        from,
        to,
        kind: "request",
      });
    },
    [diagram, onAddEdge]
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes, edges }) => {
      if (!onSelect) return;
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

  // Read-only view: refit when the container resizes (e.g. mini-graph inside
  // a split). Interactive mode leaves the user's pan/zoom alone.
  const wrapRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<
    FlowNode<NodeCardData | GroupNodeData>,
    FlowEdge
  > | null>(null);
  useEffect(() => {
    if (interactive) return;
    const el = wrapRef.current;
    if (!el) return;
    // Wait one frame past the resize so xyflow has re-measured the nodes,
    // otherwise fitView reads stale dimensions and over-zooms.
    let t: ReturnType<typeof setTimeout> | null = null;
    const refit = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        flowRef.current?.fitView({ padding: 0.2, duration: 200, minZoom: 0.05, maxZoom: 1.5 });
      }, 60);
    };
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => {
      if (t) clearTimeout(t);
      ro.disconnect();
    };
  }, [interactive, diagram]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={interactive ? onNodesChange : undefined}
        onEdgesChange={interactive ? onEdgesChange : undefined}
        onConnect={interactive ? onConnect : undefined}
        onSelectionChange={interactive ? onSelectionChange : undefined}
        onNodeDoubleClick={
          interactive
            ? (_, node) => {
                // Power-user shortcut: dbl-click a node with drill_down to navigate.
                const data = node.data as NodeCardData & {
                  onDrillDown?: (id: string) => void;
                };
                if (data.node?.drill_down) onDrillDown?.(data.node.drill_down);
              }
            : undefined
        }
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable={interactive}
        minZoom={interactive ? 0.2 : 0.05}
        fitView
        fitViewOptions={
          interactive
            ? { padding: 0.2 }
            : { padding: 0.2, minZoom: 0.05, maxZoom: 1.5 }
        }
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={interactive ? ["Backspace", "Delete"] : null}
        onInit={(instance) => {
          flowRef.current = instance;
          if (!interactive) {
            // First fit happens after xyflow's own auto-fit, but with a small
            // delay so node dimensions are measured by then.
            setTimeout(() => instance.fitView({ padding: 0.2, duration: 0, minZoom: 0.05, maxZoom: 1.5 }), 80);
          }
        }}
      >
        <Background gap={16} size={1} color="var(--grid-dot)" />
        {interactive && <Controls />}
      </ReactFlow>
    </div>
  );
}
