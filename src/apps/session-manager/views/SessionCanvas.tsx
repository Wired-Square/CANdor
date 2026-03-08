// src/apps/session-manager/views/SessionCanvas.tsx

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import SourceNode from "../nodes/SourceNode";
import SessionNode from "../nodes/SessionNode";
import ListenerNode from "../nodes/ListenerNode";
import InterfaceEdge from "../edges/InterfaceEdge";
import { buildSessionGraph, calculateFitViewPadding } from "../utils/layoutUtils";
import { useSessionManagerStore } from "../stores/sessionManagerStore";
import type { ActiveSessionInfo } from "../../../api/io";
import type { IOProfile } from "../../../hooks/useSettings";

// Register custom node and edge types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = {
  source: SourceNode as any,
  session: SessionNode as any,
  listener: ListenerNode as any,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: EdgeTypes = {
  interface: InterfaceEdge as any,
};

interface SessionCanvasProps {
  sessions: ActiveSessionInfo[];
  profiles: IOProfile[];
  onEnableBusMapping?: (sessionId: string, profileId: string, deviceBus: number, outputBus: number) => void;
}

export default function SessionCanvas({ sessions, profiles, onEnableBusMapping }: SessionCanvasProps) {
  const { fitView } = useReactFlow();
  const setSelectedNode = useSessionManagerStore((s) => s.setSelectedNode);

  const graphData = useMemo(
    () => buildSessionGraph(sessions, profiles),
    [sessions, profiles]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges);

  // Only replace nodes/edges when the topology changes (sessions added/removed).
  // Returning the same reference on auto-refresh prevents ReactFlow from
  // re-measuring nodes and resetting the viewport. Live session data is still
  // available in the detail panel which reads directly from the sessions prop.
  useEffect(() => {
    setNodes((prev) => {
      const newIds = new Set(graphData.nodes.map((n) => n.id));
      if (prev.length === graphData.nodes.length && prev.every((n) => newIds.has(n.id))) {
        return prev;
      }
      return graphData.nodes as Node[];
    });
    setEdges((prev) => {
      const newEdgeIds = new Set(graphData.edges.map((e) => e.id));
      if (prev.length === graphData.edges.length && prev.every((e) => newEdgeIds.has(e.id))) {
        return prev;
      }
      return graphData.edges;
    });
  }, [graphData, setNodes, setEdges]);

  // Fit view once on mount. Delayed because the conditionally-rendered
  // container needs a frame to get its dimensions.
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;
  useEffect(() => {
    const id = setTimeout(() => {
      fitViewRef.current({ padding: calculateFitViewPadding(nodes.length), duration: 200 });
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode({ id: node.id, type: node.type as "source" | "session" | "listener" });
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Handle drag-to-connect: re-enable a disabled bus mapping
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!onEnableBusMapping) return;
      const { source, sourceHandle, target, targetHandle } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) return;

      // Extract IDs: source="source-{profileId}", target="session-{sessionId}"
      const profileId = source.replace(/^source-/, "");
      const sessionId = target.replace(/^session-/, "");
      // sourceHandle="out-bus{N}", targetHandle="in-bus{N}"
      const deviceBusMatch = sourceHandle.match(/^out-bus(\d+)$/);
      const outputBusMatch = targetHandle.match(/^in-bus(\d+)$/);
      if (!deviceBusMatch || !outputBusMatch) return;

      const deviceBus = parseInt(deviceBusMatch[1], 10);
      const outputBus = parseInt(outputBusMatch[1], 10);
      onEnableBusMapping(sessionId, profileId, deviceBus, outputBus);
    },
    [onEnableBusMapping]
  );

  // Only allow connecting source→session nodes for disabled mappings
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source?.startsWith("source-") || !target?.startsWith("session-")) return false;
      if (!sourceHandle?.startsWith("out-bus") || !targetHandle?.startsWith("in-bus")) return false;

      // Check this mapping exists but is disabled
      const profileId = source.replace(/^source-/, "");
      const sessionId = target.replace(/^session-/, "");
      const deviceBusMatch = sourceHandle.match(/^out-bus(\d+)$/);
      const outputBusMatch = targetHandle.match(/^in-bus(\d+)$/);
      if (!deviceBusMatch || !outputBusMatch) return false;

      const deviceBus = parseInt(deviceBusMatch[1], 10);
      const outputBus = parseInt(outputBusMatch[1], 10);

      const session = sessions.find((s) => s.sessionId === sessionId);
      const config = session?.multiSourceConfigs?.find((c) => c.profileId === profileId);
      if (!config) return false;

      // Allow only if there's a disabled mapping matching these buses
      return config.busMappings.some(
        (m) => m.deviceBus === deviceBus && m.outputBus === outputBus && !m.enabled
      );
    },
    [sessions]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--text-muted)"
          style={{ opacity: 0.3 }}
        />
        <Controls
          showInteractive={false}
          className="!bg-[var(--bg-surface)] !border-[color:var(--border-default)] !shadow-lg"
        />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case "source": return "#a855f7";
              case "session": return "#06b6d4";
              case "listener": return "#22c55e";
              default: return "#6b7280";
            }
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="!bg-[var(--bg-surface)] !border-[color:var(--border-default)]"
        />
      </ReactFlow>
    </div>
  );
}
