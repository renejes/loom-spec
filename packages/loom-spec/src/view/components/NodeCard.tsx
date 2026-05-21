import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Monitor, Server, Database, Zap, Globe,
  Box, Music, Sliders, CornerDownRight,
  type LucideIcon,
} from "lucide-react";
import type { Node as LoomNode } from "../../types/diagram";
import type { NodeType } from "../../types/node-types";

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

export interface NodeCardData extends Record<string, unknown> {
  node: LoomNode;
  typeDef: NodeType | undefined;
  onDrillDown?: (id: string) => void;
}

export function NodeCard({ data }: NodeProps) {
  const { node, typeDef, onDrillDown } = data as NodeCardData;
  const color = typeDef?.color ?? "#71717a";
  const Icon = typeDef?.icon ? (ICONS[typeDef.icon] ?? Box) : Box;
  const typeLabel = typeDef?.label ?? node.type;

  return (
    <div
      className={`node-card status-${node.status}`}
      style={{
        ["--node-color" as string]: color,
        ["--status-color" as string]: STATUS_COLOR[node.status],
      }}
    >
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
