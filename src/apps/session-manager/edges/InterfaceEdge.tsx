// src/apps/session-manager/edges/InterfaceEdge.tsx
//
// Custom edge that shows interface labels on both ends of a source→session connection.

import { type EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from "@xyflow/react";

export interface InterfaceEdgeData {
  /** Interface ID on the source side (e.g., "can0") */
  sourceInterface: string;
  /** Interface ID on the session side (e.g., "can0") */
  targetInterface: string;
}

export default function InterfaceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const edgeData = data as InterfaceEdgeData | undefined;
  const sourceInterface = edgeData?.sourceInterface;
  const targetInterface = edgeData?.targetInterface;

  // Label positions: near the source and near the target handles
  const labelOffsetX = 12;
  const sourceLabelX = sourceX + labelOffsetX;
  const sourceLabelY = sourceY;
  const targetLabelX = targetX - labelOffsetX;
  const targetLabelY = targetY;

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        {sourceInterface && (
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: "absolute",
              transform: `translate(${sourceLabelX}px, ${sourceLabelY}px) translate(0, -50%)`,
              fontSize: 10,
              fontFamily: "monospace",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-surface)",
              padding: "1px 4px",
              borderRadius: 3,
              border: "1px solid var(--border-default)",
              whiteSpace: "nowrap",
            }}
          >
            {sourceInterface}
          </div>
        )}
        {targetInterface && (
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: "absolute",
              transform: `translate(${targetLabelX}px, ${targetLabelY}px) translate(-100%, -50%)`,
              fontSize: 10,
              fontFamily: "monospace",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-surface)",
              padding: "1px 4px",
              borderRadius: 3,
              border: "1px solid var(--border-default)",
              whiteSpace: "nowrap",
            }}
          >
            {targetInterface}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
