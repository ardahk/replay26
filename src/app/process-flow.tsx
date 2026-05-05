"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { useMemo } from "react";
import type { BrewStage, BatchStatus } from "../lib/domain/types";

export type FlowStepId =
  | "start"
  | "mash"
  | "boil"
  | "chill"
  | "fermentation"
  | "sensor"
  | "alarms"
  | "qa"
  | "brewmaster"
  | "support";

interface ProcessFlowProps {
  stage?: BrewStage;
  health?: BatchStatus;
  readingCount: number;
  alarmCount: number;
  pendingTaskCount: number;
  selectedStepId?: FlowStepId | null;
  onStepSelect?: (id: FlowStepId | null) => void;
}

interface ProcessNodeData extends Record<string, unknown> {
  title: string;
  detail: string;
  status: "done" | "active" | "warn" | "waiting";
  sel?: boolean;
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
    <div className={`process-node ${data.status}${data.sel ? " sel" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <strong>{data.title}</strong>
      <span>{data.detail}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { process: ProcessNode };

export function ProcessFlow({
  stage, health, readingCount, alarmCount, pendingTaskCount,
  selectedStepId, onStepSelect
}: ProcessFlowProps) {
  const nodes = useMemo<Node<ProcessNodeData>[]>(
    () => [
      {
        id: "start",
        type: "process",
        position: { x: 0, y: 90 },
        data: {
          title: "Brew Workflow",
          detail: "Temporal WorkflowRun",
          status: stageStatus(stage, "queued"),
          sel: selectedStepId === "start"
        }
      },
      {
        id: "mash",
        type: "process",
        position: { x: 210, y: 0 },
        data: {
          title: "Mash",
          detail: "Workflow Activity",
          status: stageStatus(stage, "mash"),
          sel: selectedStepId === "mash"
        }
      },
      {
        id: "boil",
        type: "process",
        position: { x: 420, y: 0 },
        data: {
          title: "Boil",
          detail: "Workflow Activity",
          status: stageStatus(stage, "boil"),
          sel: selectedStepId === "boil"
        }
      },
      {
        id: "chill",
        type: "process",
        position: { x: 630, y: 0 },
        data: {
          title: "Chill",
          detail: "Workflow Activity",
          status: stageStatus(stage, "chill"),
          sel: selectedStepId === "chill"
        }
      },
      {
        id: "fermentation",
        type: "process",
        position: { x: 840, y: 0 },
        data: {
          title: "Fermentation",
          detail: "Child WorkflowRun",
          status: health === "needs_attention" ? "warn" : stageStatus(stage, "fermentation"),
          sel: selectedStepId === "fermentation"
        }
      },
      {
        id: "sensor",
        type: "process",
        position: { x: 620, y: 170 },
        data: {
          title: "Telemetry Ingest",
          detail: "Workflow Signal",
          status: readingCount > 0 ? "active" : "waiting",
          sel: selectedStepId === "sensor"
        }
      },
      {
        id: "alarms",
        type: "process",
        position: { x: 840, y: 170 },
        data: {
          title: "Alarm Rules",
          detail: "Signal Handler",
          status: alarmCount > 0 ? "warn" : "waiting",
          sel: selectedStepId === "alarms"
        }
      },
      {
        id: "qa",
        type: "process",
        position: { x: 1060, y: 170 },
        data: {
          title: "Human QA Gate",
          detail: "Manual Activity",
          status: pendingTaskCount > 0 ? "warn" : "waiting",
          sel: selectedStepId === "qa"
        }
      },
      {
        id: "brewmaster",
        type: "process",
        position: { x: 1060, y: -70 },
        data: {
          title: "Brewmaster Agent",
          detail: "AI Activity (Claude)",
          status: health === "needs_attention" ? "active" : "waiting",
          sel: selectedStepId === "brewmaster"
        }
      },
      {
        id: "support",
        type: "process",
        position: { x: 1060, y: 300 },
        data: {
          title: "Support Agent",
          detail: "AI Activity (Claude)",
          status: stage === "fermentation" ? "active" : "waiting",
          sel: selectedStepId === "support"
        }
      }
    ],
    [alarmCount, health, pendingTaskCount, readingCount, stage, selectedStepId]
  );

  const edges = useMemo<Edge[]>(
    () =>
      [
        { id: "start-mash",              source: "start",        target: "mash" },
        { id: "mash-boil",               source: "mash",         target: "boil" },
        { id: "boil-chill",              source: "boil",         target: "chill" },
        { id: "chill-fermentation",      source: "chill",        target: "fermentation" },
        { id: "sensor-fermentation",     source: "sensor",       target: "fermentation", animated: readingCount > 0 },
        { id: "fermentation-alarms",     source: "fermentation", target: "alarms",       animated: alarmCount > 0 },
        { id: "alarms-qa",               source: "alarms",       target: "qa",           animated: pendingTaskCount > 0 },
        { id: "fermentation-brewmaster", source: "fermentation", target: "brewmaster" },
        { id: "fermentation-support",    source: "fermentation", target: "support" }
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
        style={{ width: "100%", height: "100%", cursor: onStepSelect ? "pointer" : "default" }}
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
        onNodeClick={(_event, node) => {
          if (!onStepSelect) return;
          const id = node.id as FlowStepId;
          onStepSelect(selectedStepId === id ? null : id);
        }}
        onPaneClick={() => onStepSelect?.(null)}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
