import type { NodeProps } from "@xyflow/react";
import { CornerDownRight } from "lucide-react";
import type { Group as LoomGroup } from "../../types/diagram";

export interface GroupNodeData extends Record<string, unknown> {
  group: LoomGroup;
  onDrillDown?: (id: string) => void;
}

export function GroupNode({ data, width, height }: NodeProps) {
  const { group, onDrillDown } = data as GroupNodeData;
  const color = group.color ?? "#94a3b8";
  return (
    <div
      className="group-frame"
      style={{
        width: width ?? "100%",
        height: height ?? "100%",
        ["--group-color" as string]: color,
      }}
    >
      <div className="group-label">
        <span>{group.label}</span>
        {group.drill_down && onDrillDown && (
          <button
            className="drill-down-btn inline"
            title={`Drill into ${group.drill_down}`}
            aria-label={`Drill into ${group.drill_down}`}
            onClick={(e) => {
              e.stopPropagation();
              onDrillDown(group.drill_down!);
            }}
          >
            <CornerDownRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
