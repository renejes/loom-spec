import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Monitor, Server, Database, Zap, Globe,
  Box, Music, Sliders, CornerDownRight,
  type LucideIcon,
} from "lucide-react";
import type { Node as LoomNode } from "../../types/diagram";
import type { NodeType, Port } from "../../types/node-types";

const ICONS: Record<string, LucideIcon> = {
  monitor: Monitor,
  server: Server,
  database: Database,
  zap: Zap,
  globe: Globe,
  music: Music,
  sliders: Sliders,
};

const STATUS_COLOR: Record<LoomNode["status"], string> = {
  planned: "var(--status-planned)",
  implemented: "var(--status-implemented)",
  stale: "var(--status-stale)",
  deprecated: "var(--status-deprecated)",
};

// A loose map of signal types to colors for port indicators.
const SIGNAL_COLOR: Record<string, string> = {
  audio: "#f472b6",
  midi: "#a78bfa",
  control: "#34d399",
  http: "#60a5fa",
  data: "#fbbf24",
};

export interface NodeCardData extends Record<string, unknown> {
  node: LoomNode;
  typeDef: NodeType | undefined;
  onDrillDown?: (id: string) => void;
}

/**
 * Distribute N handles vertically along a node's edge. Top/bottom paddings
 * of 18% keep them clear of the node corners.
 */
function handleTopPercent(index: number, total: number): string {
  if (total <= 1) return "50%";
  const padding = 18;
  const span = 100 - padding * 2;
  const t = index / (total - 1);
  return `${padding + t * span}%`;
}

export function NodeCard({ data }: NodeProps) {
  const { node, typeDef, onDrillDown } = data as NodeCardData;
  const color = typeDef?.color ?? "#71717a";
  const Icon = typeDef?.icon ? (ICONS[typeDef.icon] ?? Box) : Box;
  const typeLabel = typeDef?.label ?? node.type;

  const inPorts: Port[] = typeDef?.ports?.in ?? [];
  const outPorts: Port[] = typeDef?.ports?.out ?? [];
  const hasInPorts = inPorts.length > 0;
  const hasOutPorts = outPorts.length > 0;

  return (
    <div
      className={`node-card status-${node.status}${hasInPorts || hasOutPorts ? " has-ports" : ""}`}
      style={{
        ["--node-color" as string]: color,
        ["--status-color" as string]: STATUS_COLOR[node.status],
      }}
    >
      {/* Inputs (left side) */}
      {hasInPorts ? (
        inPorts.map((p, i) => (
          <div
            key={`in-${p.name}`}
            className="port-row port-in"
            style={{ top: handleTopPercent(i, inPorts.length) }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={p.name}
              style={{
                background: p.signal ? SIGNAL_COLOR[p.signal] ?? color : color,
              }}
            />
            <span className="port-label">{p.name}</span>
          </div>
        ))
      ) : (
        <Handle type="target" position={Position.Left} />
      )}

      <div className="node-header">
        <Icon className="node-icon" />
        <span className="node-type">{typeLabel}</span>
      </div>
      <div className="node-label">{node.label}</div>
      <span className="status-dot" title={node.status} />

      {node.drill_down && onDrillDown && (
        <button
          className="drill-down-btn"
          title={`Drill into ${node.drill_down}`}
          aria-label={`Drill into ${node.drill_down}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDrillDown(node.drill_down!);
          }}
        >
          <CornerDownRight size={12} />
        </button>
      )}

      {/* Outputs (right side) */}
      {hasOutPorts ? (
        outPorts.map((p, i) => (
          <div
            key={`out-${p.name}`}
            className="port-row port-out"
            style={{ top: handleTopPercent(i, outPorts.length) }}
          >
            <span className="port-label">{p.name}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={p.name}
              style={{
                background: p.signal ? SIGNAL_COLOR[p.signal] ?? color : color,
              }}
            />
          </div>
        ))
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
