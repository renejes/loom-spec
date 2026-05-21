import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

export interface ParallelEdgeData extends Record<string, unknown> {
  /**
   * Offset index for parallel edges (e.g. -1, 0, +1 for three parallels).
   * 0 = straight centerline, positive/negative = curved outwards.
   */
  parallelOffset?: number;
}

const OFFSET_SPACING = 32; // px between parallel curves

export function ParallelEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    label,
    labelStyle,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    data,
  } = props;

  const offsetIndex = (data as ParallelEdgeData | undefined)?.parallelOffset ?? 0;

  // Vector from source to target
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  // Perpendicular unit vector (rotated 90°)
  const perpX = -dy / length;
  const perpY = dx / length;
  const offsetAmount = offsetIndex * OFFSET_SPACING;

  // Quadratic bezier control point: offset perpendicular from the midpoint
  const ctrlX = (sourceX + targetX) / 2 + perpX * offsetAmount;
  const ctrlY = (sourceY + targetY) / 2 + perpY * offsetAmount;

  // Curve midpoint (t=0.5) for label placement
  const labelX = (sourceX + targetX) / 2 + perpX * (offsetAmount / 2);
  const labelY = (sourceY + targetY) / 2 + perpY * (offsetAmount / 2);

  const path = `M ${sourceX},${sourceY} Q ${ctrlX},${ctrlY} ${targetX},${targetY}`;

  const padX = Array.isArray(labelBgPadding) ? labelBgPadding[0] : 6;
  const padY = Array.isArray(labelBgPadding) ? labelBgPadding[1] : 3;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="parallel-edge-label nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              padding: `${padY}px ${padX}px`,
              borderRadius: (labelBgBorderRadius ?? 3) + "px",
              background: (labelBgStyle as CSSProperties | undefined)?.fill ?? "var(--bg-elevated)",
              color: (labelStyle as CSSProperties | undefined)?.fill ?? "var(--text-muted)",
              fontSize: (labelStyle as CSSProperties | undefined)?.fontSize ?? 11,
              fontFamily: "inherit",
              lineHeight: 1.2,
              pointerEvents: "all",
              userSelect: "none",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
