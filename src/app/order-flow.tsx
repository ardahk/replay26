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
import type { OrderWithFulfillment } from '../lib/domain/types';

type FlowNodeStatus = 'done' | 'active' | 'warn' | 'waiting';

interface OrderFlowNodeData extends Record<string, unknown> {
	title: string;
	detail: string;
	status: FlowNodeStatus;
}

function OrderFlowNode({ data }: NodeProps<Node<OrderFlowNodeData>>) {
	return (
		<div className={`process-node ${data.status}`}>
			<Handle type="target" position={Position.Left} />
			<strong>{data.title}</strong>
			<span>{data.detail}</span>
			<Handle type="source" position={Position.Right} />
		</div>
	);
}

const nodeTypes = { orderFlow: OrderFlowNode };

type StepId = 'received' | 'stock_check' | 'buffer' | 'complete';

function orderIsReady(order: OrderWithFulfillment): boolean {
	return order.status === 'ready' || order.fulfillment?.phase === 'fulfilled';
}

function computeStepStatuses(order: OrderWithFulfillment): Record<StepId, FlowNodeStatus> {
	const phase = order.fulfillment?.phase;
	const { status } = order;
	const ready = orderIsReady(order);

	const received: FlowNodeStatus = 'done';

	let stock_check: FlowNodeStatus = 'waiting';
	if (phase === 'allocating') stock_check = 'active';
	else if (ready || phase === 'awaiting_inventory' || status === 'pending_batch') {
		stock_check = 'done';
	}
	if (status === 'created' && phase == null) {
		stock_check = 'active';
	}

	let buffer: FlowNodeStatus = 'waiting';
	if (phase === 'awaiting_inventory' || status === 'pending_batch') buffer = 'active';
	else if (ready) buffer = 'done';

	let complete: FlowNodeStatus = 'waiting';
	if (ready) complete = 'done';

	return { received, stock_check, buffer, complete };
}

const PX = 210;
const Y = 70;

export function OrderFulfillmentFlow({ order }: { order: OrderWithFulfillment }) {
	const { nodes, edges } = useMemo(() => {
		const phase = order.fulfillment?.phase;
		const ready = orderIsReady(order);
		const s = computeStepStatuses(order);

		const stockDetail =
			phase === 'allocating'
				? 'Checking packaged counts…'
				: s.stock_check === 'done'
					? 'Counts checked'
					: 'Waiting…';

		const waitingOnStock =
			phase === 'awaiting_inventory' || order.status === 'pending_batch';

		const bufferTitle = waitingOnStock ? 'Waiting on beer' : 'Hold / queue';
		const bufferDetail = waitingOnStock
			? 'Keeps checking until enough packaged beer is available'
			: ready
				? 'Nothing held up'
				: '—';

		const completeDetail = ready
			? 'Beer assigned — ready for pickup or delivery'
			: 'Not yet';

		const nodeList: Node<OrderFlowNodeData>[] = [
			{
				id: 'received',
				type: 'orderFlow',
				position: { x: 0, y: Y },
				data: {
					title: 'Order received',
					detail: `${order.quantity}× ${order.product}`,
					status: s.received,
				},
			},
			{
				id: 'stock_check',
				type: 'orderFlow',
				position: { x: PX, y: Y },
				data: {
					title: 'Packaged stock check',
					detail: stockDetail,
					status: s.stock_check,
				},
			},
			{
				id: 'buffer',
				type: 'orderFlow',
				position: { x: PX * 2, y: Y },
				data: {
					title: bufferTitle,
					detail: bufferDetail,
					status: s.buffer,
				},
			},
			{
				id: 'complete',
				type: 'orderFlow',
				position: { x: PX * 3, y: Y },
				data: {
					title: 'Ready',
					detail: completeDetail,
					status: s.complete,
				},
			},
		];

		const animFirst = phase === 'allocating';
		const animSecond =
			phase === 'awaiting_inventory' || order.status === 'pending_batch';

		const edgeList: Edge[] = [
			{
				id: 'received-stock_check',
				source: 'received',
				target: 'stock_check',
				markerEnd: { type: MarkerType.ArrowClosed },
				className: animFirst ? 'flow-edge active' : 'flow-edge',
				animated: animFirst,
			},
			{
				id: 'stock_check-buffer',
				source: 'stock_check',
				target: 'buffer',
				markerEnd: { type: MarkerType.ArrowClosed },
				className: animSecond ? 'flow-edge active' : 'flow-edge',
				animated: animSecond,
			},
			{
				id: 'buffer-complete',
				source: 'buffer',
				target: 'complete',
				markerEnd: { type: MarkerType.ArrowClosed },
				className: ready ? 'flow-edge active' : 'flow-edge',
				animated: ready,
			},
		];

		return { nodes: nodeList, edges: edgeList };
	}, [order]);

	return (
		<div className="flow-root order-flow-root">
			<ReactFlow
				style={{ width: '100%', height: '100%' }}
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.22 }}
				minZoom={0.45}
				maxZoom={1.25}
				nodesDraggable={false}
				nodesConnectable={false}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={20} />
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}
