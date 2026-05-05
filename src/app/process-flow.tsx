'use client';

import {
	Background,
	Controls,
	Handle,
	MarkerType,
	Position,
	ReactFlow,
	type Edge,
	type Node,
	type NodeProps,
} from '@xyflow/react';
import { useMemo } from 'react';
import type { BrewStage, BatchStatus } from '../lib/domain/types';

export type FlowStepId =
	| 'start'
	| 'mash'
	| 'boil'
	| 'chill'
	| 'fermentation'
	| 'sensor'
	| 'alarms'
	| 'qa'
	| 'brewmaster'
	| 'support';

interface ProcessFlowProps {
	stage?: BrewStage;
	health?: BatchStatus;
	readingCount: number;
	alarmCount: number;
	pendingTaskCount: number;
	selectedStepId: FlowStepId | null;
	onStepSelect: (id: FlowStepId | null) => void;
}

type ProcessNodeVariant =
	| 'pipeline'
	| 'hub'
	| 'sensor'
	| 'agent-up'
	| 'agent-down';

interface ProcessNodeData extends Record<string, unknown> {
	title: string;
	detail: string;
	status: 'done' | 'active' | 'warn' | 'waiting';
	selected?: boolean;
	variant?: ProcessNodeVariant;
}

const stageOrder: BrewStage[] = [
	'queued',
	'mash',
	'boil',
	'chill',
	'fermentation',
];

function stageStatus(
	stage: BrewStage | undefined,
	nodeStage: BrewStage,
): ProcessNodeData['status'] {
	if (!stage) return nodeStage === 'queued' ? 'active' : 'waiting';
	if (stage === nodeStage) return 'active';
	if (stageOrder.indexOf(stage) > stageOrder.indexOf(nodeStage)) return 'done';
	return 'waiting';
}

function ProcessNode({ data }: NodeProps<Node<ProcessNodeData>>) {
	const v = data.variant ?? 'pipeline';
	return (
		<div
			className={`process-node ${data.status}${data.selected ? ' node-selected' : ''}`}
		>
			{v === 'pipeline' && (
				<>
					<Handle type="target" position={Position.Left} />
					<strong>{data.title}</strong>
					<span>{data.detail}</span>
					<Handle type="source" position={Position.Right} />
				</>
			)}
			{v === 'hub' && (
				<>
					<Handle type="target" position={Position.Left} id="brew-in" />
					<Handle type="target" position={Position.Bottom} id="sensor-in" />
					<strong>{data.title}</strong>
					<span>{data.detail}</span>
					<Handle
						type="source"
						position={Position.Right}
						id="to-alarms"
						style={{ top: '38%' }}
					/>
					<Handle
						type="source"
						position={Position.Right}
						id="support-out"
						style={{ top: '72%' }}
					/>
					<Handle type="source" position={Position.Top} id="brewmaster-out" />
				</>
			)}
			{v === 'sensor' && (
				<>
					<strong>{data.title}</strong>
					<span>{data.detail}</span>
					<Handle type="source" position={Position.Top} id="to-ferm" />
				</>
			)}
			{v === 'agent-up' && (
				<>
					<Handle type="target" position={Position.Bottom} id="from-ferm" />
					<strong>{data.title}</strong>
					<span>{data.detail}</span>
				</>
			)}
			{v === 'agent-down' && (
				<>
					<Handle type="target" position={Position.Top} id="from-ferm" />
					<strong>{data.title}</strong>
					<span>{data.detail}</span>
				</>
			)}
		</div>
	);
}

const nodeTypes = {
	process: ProcessNode,
};

function sel(id: string, selectedStepId: FlowStepId | null): boolean {
	return selectedStepId === id;
}

/** Fixed grid so the brew path, sensor stack, and side panels stay aligned. */
const PX = 212;
const Y_MAIN = 96;
const Y_SENSOR = Y_MAIN + 168;

export function ProcessFlow({
	stage,
	health,
	readingCount,
	alarmCount,
	pendingTaskCount,
	selectedStepId,
	onStepSelect,
}: ProcessFlowProps) {
	const nodes = useMemo<Node<ProcessNodeData>[]>(
		() => [
			{
				id: 'start',
				type: 'process',
				position: { x: 0, y: Y_MAIN },
				data: {
					title: 'Start Batch',
					detail: 'Queued on the system',
					status: stageStatus(stage, 'queued'),
					selected: sel('start', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'mash',
				type: 'process',
				position: { x: PX, y: Y_MAIN },
				data: {
					title: 'Mash',
					detail: 'Rest profile',
					status: stageStatus(stage, 'mash'),
					selected: sel('mash', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'boil',
				type: 'process',
				position: { x: PX * 2, y: Y_MAIN },
				data: {
					title: 'Boil',
					detail: 'Kettle phase',
					status: stageStatus(stage, 'boil'),
					selected: sel('boil', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'chill',
				type: 'process',
				position: { x: PX * 3, y: Y_MAIN },
				data: {
					title: 'Chill',
					detail: 'Heat exchange',
					status: stageStatus(stage, 'chill'),
					selected: sel('chill', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'fermentation',
				type: 'process',
				position: { x: PX * 4, y: Y_MAIN },
				data: {
					title: 'Fermentation',
					detail: `${readingCount} readings`,
					status:
						health === 'needs_attention'
							? 'warn'
							: stageStatus(stage, 'fermentation'),
					selected: sel('fermentation', selectedStepId),
					variant: 'hub',
				},
			},
			{
				id: 'alarms',
				type: 'process',
				position: { x: PX * 5, y: Y_MAIN },
				data: {
					title: 'Alarms',
					detail: `${alarmCount} alarms`,
					status: alarmCount > 0 ? 'warn' : 'waiting',
					selected: sel('alarms', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'qa',
				type: 'process',
				position: { x: PX * 6, y: Y_MAIN },
				data: {
					title: 'Quality checks',
					detail: `${pendingTaskCount} pending`,
					status: pendingTaskCount > 0 ? 'warn' : 'waiting',
					selected: sel('qa', selectedStepId),
					variant: 'pipeline',
				},
			},
			{
				id: 'sensor',
				type: 'process',
				position: { x: PX * 4, y: Y_SENSOR },
				data: {
					title: 'Tank sensors',
					detail: 'Live readings',
					status: readingCount > 0 ? 'active' : 'waiting',
					selected: sel('sensor', selectedStepId),
					variant: 'sensor',
				},
			},
			{
				id: 'brewmaster',
				type: 'process',
				position: { x: PX * 5 + 24, y: Y_MAIN - 132 },
				data: {
					title: 'Brewmaster assistant',
					detail: 'Help for operators',
					status: health === 'needs_attention' ? 'active' : 'waiting',
					selected: sel('brewmaster', selectedStepId),
					variant: 'agent-up',
				},
			},
			{
				id: 'support',
				type: 'process',
				position: { x: PX * 5 + 84, y: Y_SENSOR + 96 },
				data: {
					title: 'Customer orders',
					detail: 'When beer ships',
					status: stage === 'fermentation' ? 'active' : 'waiting',
					selected: sel('support', selectedStepId),
					variant: 'agent-down',
				},
			},
		],
		[alarmCount, health, pendingTaskCount, readingCount, selectedStepId, stage],
	);

	const edges = useMemo<Edge[]>(
		() =>
			[
				{ id: 'start-mash', source: 'start', target: 'mash' },
				{ id: 'mash-boil', source: 'mash', target: 'boil' },
				{ id: 'boil-chill', source: 'boil', target: 'chill' },
				{
					id: 'chill-fermentation',
					source: 'chill',
					target: 'fermentation',
					targetHandle: 'brew-in',
				},
				{
					id: 'sensor-fermentation',
					source: 'sensor',
					target: 'fermentation',
					sourceHandle: 'to-ferm',
					targetHandle: 'sensor-in',
					animated: readingCount > 0,
				},
				{
					id: 'fermentation-alarms',
					source: 'fermentation',
					target: 'alarms',
					sourceHandle: 'to-alarms',
					animated: alarmCount > 0,
				},
				{
					id: 'alarms-qa',
					source: 'alarms',
					target: 'qa',
					animated: pendingTaskCount > 0,
				},
				{
					id: 'fermentation-brewmaster',
					source: 'fermentation',
					target: 'brewmaster',
					sourceHandle: 'brewmaster-out',
					targetHandle: 'from-ferm',
				},
				{
					id: 'fermentation-support',
					source: 'fermentation',
					target: 'support',
					sourceHandle: 'support-out',
					targetHandle: 'from-ferm',
				},
			].map((edge) => ({
				...edge,
				markerEnd: { type: MarkerType.ArrowClosed },
				className: edge.animated ? 'flow-edge active' : 'flow-edge',
			})),
		[alarmCount, pendingTaskCount, readingCount],
	);

	return (
		<div className="flow-root" style={{ width: '100%', height: '100%' }}>
			<ReactFlow
				style={{ width: '100%', height: '100%' }}
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
				onNodeClick={(_, node) => {
					onStepSelect(node.id as FlowStepId);
				}}
				onPaneClick={() => {
					onStepSelect(null);
				}}
			>
				<Background gap={20} />
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}
