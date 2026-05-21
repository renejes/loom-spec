import type { NodeProps } from "@xyflow/react";
import type { Group as LoomGroup } from "../../types/diagram";

export interface GroupNodeData extends Record<string, unknown> {
  group: LoomGroup;
}

export function GroupNode({ data, width, height }: NodeProps) {
  const { group } = data as GroupNodeData;
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
      <div className="group-label">{group.label}</div>
    </div>
  );
}
