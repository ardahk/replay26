"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { useMemo } from "react";
import type { BrewStage, BatchStatus } from "../lib/domain/types";

interface ProcessFlowProps {
  stage?: BrewStage;
  health?: BatchStatus;
  readingCount: number;
  alarmCount: number;
  pendingTaskCount: number;
}

interface ProcessNodeData extends Record<string, unknown> {
  title: string;
  detail: string;
  status: "done" | "active" | "warn" | "waiting";
}

const stageOrder: BrewStage[] = ["queued", "mash", "boil", "chill", "fermentation"];

function stageStatus(stage: BrewStage | undefined, nodeStage: BrewStage): ProcessNodeData["status"] {
  if (!stage) return nodeStage === "queued" ? "active" : "waiting";
  if (stage === nodeStage) return "active";
  if (stageOrder.indexOf(stage) > stageOrder.indexOf(nodeStage)) return "done";
  return "waiting";
}

function ProcessNode({ data }: NodeProps<Node<ProcessNodeData>>) {
  return (
    <div className={`process-node ${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <strong>{data.title}</strong>
      <span>{data.detail}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  process: ProcessNode
};

export function ProcessFlow({ stage, health, readingCount, alarmCount, pendingTaskCount }: ProcessFlowProps) {
  const nodes = useMemo<Node<ProcessNodeData>[]>(
    () => [
      {
        id: "start",
        type: "process",
        position: { x: 0, y: 90 },
        data: { title: "Start Batch", detail: "Temporal workflow", status: stageStatus(stage, "queued") }
      },
      {
        id: "mash",
        type: "process",
        position: { x: 210, y: 0 },
        data: { title: "Mash", detail: "10s timer", status: stageStatus(stage, "mash") }
      },
      {
        id: "boil",
        type: "process",
        position: { x: 420, y: 0 },
        data: { title: "Boil", detail: "10s timer", status: stageStatus(stage, "boil") }
      },
      {
        id: "chill",
        type: "process",
        position: { x: 630, y: 0 },
        data: { title: "Chill", detail: "5s timer", status: stageStatus(stage, "chill") }
      },
      {
        id: "fermentation",
        type: "process",
        position: { x: 840, y: 0 },
        data: {
          title: "Fermentation",
          detail: `${readingCount} readings`,
          status: health === "needs_attention" ? "warn" : stageStatus(stage, "fermentation")
        }
      },
      {
        id: "sensor",
        type: "process",
        position: { x: 620, y: 170 },
        data: {
          title: "Sensor Simulator",
          detail: "Signals readings",
          status: readingCount > 0 ? "active" : "waiting"
        }
      },
      {
        id: "alarms",
        type: "process",
        position: { x: 840, y: 170 },
        data: {
          title: "Alarm Rules",
          detail: `${alarmCount} alarms`,
          status: alarmCount > 0 ? "warn" : "waiting"
        }
      },
      {
        id: "qa",
        type: "process",
        position: { x: 1060, y: 170 },
        data: {
          title: "Human QA",
          detail: `${pendingTaskCount} pending`,
          status: pendingTaskCount > 0 ? "warn" : "waiting"
        }
      },
      {
        id: "brewmaster",
        type: "process",
        position: { x: 1060, y: -70 },
        data: {
          title: "Brewmaster Agent",
          detail: "Operator tools",
          status: health === "needs_attention" ? "active" : "waiting"
        }
      },
      {
        id: "support",
        type: "process",
        position: { x: 1060, y: 300 },
        data: {
          title: "Support Agent",
          detail: "ETA + orders",
          status: stage === "fermentation" ? "active" : "waiting"
        }
      }
    ],
    [alarmCount, health, pendingTaskCount, readingCount, stage]
  );

  const edges = useMemo<Edge[]>(
    () => [
      { id: "start-mash", source: "start", target: "mash" },
      { id: "mash-boil", source: "mash", target: "boil" },
      { id: "boil-chill", source: "boil", target: "chill" },
      { id: "chill-fermentation", source: "chill", target: "fermentation" },
      { id: "sensor-fermentation", source: "sensor", target: "fermentation", animated: readingCount > 0 },
      { id: "fermentation-alarms", source: "fermentation", target: "alarms", animated: alarmCount > 0 },
      { id: "alarms-qa", source: "alarms", target: "qa", animated: pendingTaskCount > 0 },
      { id: "fermentation-brewmaster", source: "fermentation", target: "brewmaster" },
      { id: "fermentation-support", source: "fermentation", target: "support" }
    ].map((edge) => ({
      ...edge,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: edge.animated ? "flow-edge active" : "flow-edge"
    })),
    [alarmCount, pendingTaskCount, readingCount]
  );

  return (
    <div className="flow-root" style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        style={{ width: "100%", height: "100%" }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable={false} zoomable={false} />
      </ReactFlow>
    </div>
  );
}
