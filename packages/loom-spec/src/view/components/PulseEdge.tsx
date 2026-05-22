import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

export interface PulseEdgeData extends Record<string, unknown> {
  parallelOffset?: number;
  pulsing?: boolean;
}

const OFFSET_SPACING = 32; // px between parallel curves — must match ParallelEdge
const PULSE_PX_PER_SEC = 320; // marker speed; duration derives from path length

export function PulseEdge(props: EdgeProps) {
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

  const d = (data as PulseEdgeData | undefined) ?? {};
  const offsetIndex = d.parallelOffset ?? 0;
  const pulsing = d.pulsing ?? false;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const perpX = -dy / length;
  const perpY = dx / length;
  const offsetAmount = offsetIndex * OFFSET_SPACING;

  const ctrlX = (sourceX + targetX) / 2 + perpX * offsetAmount;
  const ctrlY = (sourceY + targetY) / 2 + perpY * offsetAmount;

  // Quadratic-bezier arc length is awkward to compute exactly; for our pulse
  // duration the chord length is a good-enough proxy (off by < ~15% even with
  // moderate offsets).
  const path = `M ${sourceX},${sourceY} Q ${ctrlX},${ctrlY} ${targetX},${targetY}`;
  const pathId = `pulse-path-${id}`;
  const durationSec = Math.max(0.4, length / PULSE_PX_PER_SEC);

  const labelX = (sourceX + targetX) / 2 + perpX * (offsetAmount / 2);
  const labelY = (sourceY + targetY) / 2 + perpY * (offsetAmount / 2);

  const padX = Array.isArray(labelBgPadding) ? labelBgPadding[0] : 6;
  const padY = Array.isArray(labelBgPadding) ? labelBgPadding[1] : 3;

  const strokeColor =
    (style as CSSProperties | undefined)?.stroke ?? "var(--accent)";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {/* Hidden path used as <mpath> reference for animateMotion */}
      <path id={pathId} d={path} fill="none" stroke="none" />
      {pulsing && (
        <circle r={5} className="pulse-marker" fill={strokeColor} stroke="white" strokeWidth={1}>
          <animateMotion dur={`${durationSec}s`} repeatCount="indefinite">
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="parallel-edge-label nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              padding: `${padY}px ${padX}px`,
              borderRadius: (labelBgBorderRadius ?? 3) + "px",
              background:
                (labelBgStyle as CSSProperties | undefined)?.fill ??
                "var(--bg-elevated)",
              color:
                (labelStyle as CSSProperties | undefined)?.fill ??
                "var(--text-muted)",
              fontSize:
                (labelStyle as CSSProperties | undefined)?.fontSize ?? 11,
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
