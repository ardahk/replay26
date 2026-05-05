'use client';

import {
	Activity,
	Ban,
	Beer,
	Bell,
	Bot,
	CheckCircle2,
	FlaskConical,
	Gauge,
	MessageSquare,
	Package,
	PackagePlus,
	Plus,
	RefreshCw,
	Send,
	ShoppingCart,
	ThermometerSun,
	User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowStepId } from './process-flow';
import dynamic from 'next/dynamic';
import type {
	AlarmEvent,
	BatchSummary,
	BrewWorkflowStatus,
	FermentationStatus,
	InventoryItem,
	ManualTask,
	Order,
	OrderWithFulfillment,
	SensorReading,
} from '../lib/domain/types';

const SensorChart = dynamic(
	() => import('./sensor-chart').then((module) => module.SensorChart),
	{
		ssr: false,
	},
);

const ProcessFlow = dynamic(
	() => import('./process-flow').then((module) => module.ProcessFlow),
	{
		ssr: false,
	},
);

const OrderFulfillmentFlow = dynamic(
	() => import('./order-flow').then((module) => module.OrderFulfillmentFlow),
	{
		ssr: false,
	},
);

interface BatchStatusPayload {
	batchId: string;
	brew?: BrewWorkflowStatus;
	fermentation?: FermentationStatus | null;
	error?: string;
}

interface AgentResponse {
	role: 'brewmaster' | 'support';
	batchId?: string;
	message: string;
	plan?: string[];
	observations?: string[];
	toolsUsed?: string[];
	provider?: 'deepseek' | 'deterministic';
	model?: string;
	providerError?: string;
	pendingAction?: {
		type: 'approve_qa' | 'send_signal';
		payload: unknown;
	};
	order?: Order;
}

type Tab = 'operations' | 'support' | 'customer';
type ChatRole = 'user' | 'agent';
type AttentionPopover = 'qa' | 'alarms' | null;

interface ChatMessage {
	role: ChatRole;
	text: string;
	plan?: string[];
	observations?: string[];
	toolsUsed?: string[];
	provider?: 'deepseek' | 'deterministic';
	model?: string;
	providerError?: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(init?.headers ?? {}),
		},
	});
	const text = await response.text();
	const trimmed = text.trim();
	if (!trimmed) {
		if (!response.ok) {
			throw new Error(response.statusText || `Something went wrong (${response.status}).`);
		}
		throw new Error('No data came back from the server. Check your connection and try again.');
	}
	let json: T & { error?: string };
	try {
		json = JSON.parse(trimmed) as T & { error?: string };
	} catch {
		throw new Error(
			"The server returned something we couldn't read. Refresh the page or try again later.",
		);
	}
	if (!response.ok) throw new Error(json.error ?? response.statusText);
	return json;
}

function formatTime(value?: string): string {
	if (!value) return 'n/a';
	return new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).format(new Date(value));
}

function formatShortStamp(value?: string): string {
	if (!value) return '—';
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}

function statusLabel(status?: string): string {
	return status ? status.replaceAll('_', ' ') : 'waiting';
}

function formatOrderDisplay(order: OrderWithFulfillment): string {
	const live = order.fulfillment?.phase;
	if (live === 'allocating') return 'Checking packaged stock…';
	if (live === 'awaiting_inventory') return 'Waiting on packaged beer';
	if (live === 'fulfilled') return 'Ready to go out';
	if (order.status === 'ready') return 'Ready to go out';
	if (order.status === 'pending_batch') return 'Waiting on more beer from the cellar';
	return statusLabel(order.status);
}

function OrderStatusFeed({
	orders,
	selectedOrderId,
	onSelectOrder,
}: {
	orders: OrderWithFulfillment[];
	selectedOrderId?: string | null;
	onSelectOrder?: (order: OrderWithFulfillment) => void;
}) {
	if (orders.length === 0) {
		return <p className="note">No orders yet.</p>;
	}
	return (
		<>
			{orders.map((order) => (
				<article
					className={`inventory-item${onSelectOrder ? ' order-feed-row-clickable' : ''}${selectedOrderId === order.id ? ' order-feed-row-selected' : ''}`}
					key={order.id}
					role={onSelectOrder ? 'button' : undefined}
					tabIndex={onSelectOrder ? 0 : undefined}
					onClick={
						onSelectOrder ? () => onSelectOrder(order) : undefined
					}
					onKeyDown={
						onSelectOrder
							? (event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onSelectOrder(order);
									}
								}
							: undefined
					}
				>
					<strong>{order.product}</strong>
					<span>
						{order.quantity} units · {formatOrderDisplay(order)}
					</span>
					<small>
						{order.id} · {order.customer.name}
						{onSelectOrder ? ' · Open progress map' : ''}
					</small>
				</article>
			))}
		</>
	);
}

function shortBatchId(batchId: string): string {
	if (batchId.length <= 14) return batchId;
	return `…${batchId.slice(-8)}`;
}

const FLOW_STEP_TITLES: Record<FlowStepId, string> = {
	start: 'Start batch',
	mash: 'Mash',
	boil: 'Boil',
	chill: 'Chill',
	fermentation: 'Fermentation',
	sensor: 'Telemetry ingest',
	alarms: 'Alarm rules',
	qa: 'Human QA',
	brewmaster: 'Brewmaster agent',
	support: 'Support agent',
};

const BREWMASTER_PROMPTS = [
	'Review this batch and tell me the next operator move.',
	'Check alarms and QA, then propose the safest action.',
	'If temperature looks risky, prepare a confirmed override.',
];

const SUPPORT_PROMPTS = [
	'What is available right now?',
	'Give a customer-safe ETA for Hazy IPA.',
	'Create an order for one Hazy IPA case.',
];

type SensorKey = 'temperatureC' | 'gravity' | 'pH' | 'co2Ppm';

interface StepSensorField {
	key: SensorKey;
	label: string;
	format: (r: SensorReading) => string;
}

function stepSensorFields(stepId: FlowStepId): StepSensorField[] | null {
	const fmt = {
		temp: (r: SensorReading) => `${r.temperatureC}°C`,
		grav: (r: SensorReading) => String(r.gravity),
		ph: (r: SensorReading) => String(r.pH),
		co2: (r: SensorReading) => `${r.co2Ppm} ppm`,
	};
	switch (stepId) {
		case 'mash':
			return [{ key: 'temperatureC', label: 'Mash tun temperature', format: fmt.temp }];
		case 'boil':
			return [{ key: 'temperatureC', label: 'Boil kettle temperature', format: fmt.temp }];
		case 'chill':
			return [{ key: 'temperatureC', label: 'Chill temperature', format: fmt.temp }];
		case 'fermentation':
		case 'sensor':
			return [
				{ key: 'temperatureC', label: 'Fermenter temperature', format: fmt.temp },
				{ key: 'gravity', label: 'Gravity', format: fmt.grav },
				{ key: 'pH', label: 'pH', format: fmt.ph },
				{ key: 'co2Ppm', label: 'CO₂', format: fmt.co2 },
			];
		default:
			return null;
	}
}

function AgentTrace({ message }: { message: ChatMessage }) {
	const plan = message.plan ?? [];
	const observations = message.observations ?? [];
	const toolsUsed = message.toolsUsed ?? [];
	const provider = message.provider;
	if (
		message.role !== 'agent' ||
		(plan.length === 0 &&
			observations.length === 0 &&
			toolsUsed.length === 0 &&
			!provider)
	) {
		return null;
	}
	return (
		<div className="agent-trace" aria-label="Agent activity">
			{provider ? (
				<div>
					<strong>Provider</strong>
					<div className="tool-chips">
						<span>
							{provider === 'deepseek'
								? `DeepSeek${message.model ? ` · ${message.model}` : ''}`
								: 'Deterministic fallback'}
						</span>
					</div>
				</div>
			) : null}
			{plan.length > 0 ? (
				<div>
					<strong>Plan</strong>
					<ul>
						{plan.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			) : null}
			{toolsUsed.length > 0 ? (
				<div>
					<strong>Tools</strong>
					<div className="tool-chips">
						{toolsUsed.map((tool) => (
							<span key={tool}>{statusLabel(tool)}</span>
						))}
					</div>
				</div>
			) : null}
			{observations.length > 0 ? (
				<div>
					<strong>Observations</strong>
					<ul>
						{observations.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

export function OperatorConsole() {
	const [tab, setTab] = useState<Tab>('operations');
	const [beerName, setBeerName] = useState('Hazy IPA');
	const [selectedBatchId, setSelectedBatchId] = useState('');
	const [batches, setBatches] = useState<BatchSummary[]>([]);
	const [status, setStatus] = useState<BatchStatusPayload | null>(null);
	const [readings, setReadings] = useState<SensorReading[]>([]);
	const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
	const [tasks, setTasks] = useState<ManualTask[]>([]);
	const [inventory, setInventory] = useState<InventoryItem[]>([]);
	const [orders, setOrders] = useState<OrderWithFulfillment[]>([]);
	const [stockSimMessage, setStockSimMessage] = useState<string | null>(null);
	const [portalCustomerName, setPortalCustomerName] = useState('');
	const [portalCustomerEmail, setPortalCustomerEmail] = useState('');
	const [portalQtyBySku, setPortalQtyBySku] = useState<Record<string, number>>(
		{},
	);
	const [portalNotice, setPortalNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [brewChatBusy, setBrewChatBusy] = useState(false);
	const [supportChatBusy, setSupportChatBusy] = useState(false);
	const [notice, setNotice] = useState('Ready.');
	const [notificationPermission, setNotificationPermission] = useState<
		NotificationPermission | 'unsupported' | null
	>(null);
	const [brewChat, setBrewChat] = useState<ChatMessage[]>([
		{ role: 'agent', text: 'Ask me what is happening with the current batch.' },
	]);
	const [brewInput, setBrewInput] = useState('Should I be worried?');
	const [pendingBrewAction, setPendingBrewAction] =
		useState<AgentResponse['pendingAction']>();
	const [supportChat, setSupportChat] = useState<ChatMessage[]>([
		{
			role: 'agent',
			text: 'Ask when an order will be ready, or ask what is available.',
		},
	]);
	const [supportInput, setSupportInput] = useState(
		'When will Hazy IPA be ready?',
	);
	const [selectedFlowStepId, setSelectedFlowStepId] =
		useState<FlowStepId | null>(null);
	const brewDialogRef = useRef<HTMLDialogElement>(null);
	const brewChatLogRef = useRef<HTMLDivElement>(null);
	const supportChatLogRef = useRef<HTMLDivElement>(null);
	const packageDialogRef = useRef<HTMLDialogElement>(null);
	const orderFlowDialogRef = useRef<HTMLDialogElement>(null);
	const [packageBeerName, setPackageBeerName] = useState('');
	const [packageQuantityDelta, setPackageQuantityDelta] = useState('12');
	const [packageUnit, setPackageUnit] = useState<'case' | 'keg' | 'can'>(
		'case',
	);
	const [selectedOrderIdForFlow, setSelectedOrderIdForFlow] = useState<
		string | null
	>(null);
	const attentionPopoverRef = useRef<HTMLDivElement>(null);
	const [attentionPopover, setAttentionPopover] =
		useState<AttentionPopover>(null);
	const sessionStartMsRef = useRef(Date.now());
	const notifiedAlarmIdsRef = useRef<Set<string>>(new Set());
	const notifiedTaskIdsRef = useRef<Set<string>>(new Set());

	const selectedBatch = useMemo(
		() => batches.find((batch) => batch.batchId === selectedBatchId),
		[batches, selectedBatchId],
	);
	const batchesSorted = useMemo(
		() => [...batches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
		[batches],
	);
	const ordersRecent = useMemo(
		() => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		[orders],
	);
	const selectedOrderForFlow = useMemo(
		() =>
			selectedOrderIdForFlow
				? orders.find((o) => o.id === selectedOrderIdForFlow) ?? null
				: null,
		[orders, selectedOrderIdForFlow],
	);
	const currentReading = status?.fermentation?.latestReading ?? readings.at(-1);
	const chartSeriesKeys = useMemo(() => {
		if (!selectedFlowStepId) return null;
		const fields = stepSensorFields(selectedFlowStepId);
		if (!fields) return null;
		return fields.map((field) => field.key);
	}, [selectedFlowStepId]);
	const pendingTasks = tasks.filter(
		(task) =>
			task.status === 'pending' &&
			(!selectedBatchId || task.batchId === selectedBatchId),
	);

	const selectOrderForFlow = useCallback((order: OrderWithFulfillment) => {
		setSelectedOrderIdForFlow(order.id);
	}, []);

	const refresh = useCallback(
		async (
			selectOverride?: string | null,
			options?: { includeOrders?: boolean },
		) => {
			const explicitSelection = selectOverride !== undefined;
			const loadOrders =
				tab !== 'operations' || options?.includeOrders === true;

			const [batchPayload, taskPayload, inventoryPayload, orderPayload] =
				await Promise.all([
					fetchJson<{ batches: BatchSummary[] }>('/api/batches'),
					fetchJson<{ tasks: ManualTask[] }>('/api/manual-tasks'),
					fetchJson<{ inventory: InventoryItem[] }>('/api/inventory'),
					loadOrders
						? fetchJson<{ orders: OrderWithFulfillment[] }>('/api/orders')
						: Promise.resolve(null),
				]);
			const batchList = batchPayload.batches;
			const manualTasks = taskPayload.tasks;
			const inventoryItems = inventoryPayload.inventory;
			setBatches(batchList);
			setTasks(manualTasks);
			setInventory(inventoryItems);
			if (orderPayload) setOrders(orderPayload.orders);

			if (batchList.length === 0) {
				setSelectedBatchId('');
				setStatus(null);
				setReadings([]);
				setAlarms([]);
				return;
			}

			if (explicitSelection) {
				setSelectedBatchId(selectOverride ?? '');
			}

			let detailBatchId = explicitSelection ? (selectOverride ?? '') : selectedBatchId;

			if (explicitSelection && !detailBatchId) {
				setStatus(null);
				setReadings([]);
				setAlarms([]);
				return;
			}

			const knownIds = new Set(batchList.map((b) => b.batchId));
			if (!explicitSelection && detailBatchId && !knownIds.has(detailBatchId)) {
				detailBatchId = batchList[0]!.batchId;
				setSelectedBatchId(detailBatchId);
			}

			if (!detailBatchId && !explicitSelection) {
				detailBatchId = batchList[0]!.batchId;
				setSelectedBatchId(detailBatchId);
			}

			if (!detailBatchId) {
				setStatus(null);
				setReadings([]);
				setAlarms([]);
				return;
			}

			const [statusPayload, historyPayload, alarmPayload] = await Promise.all([
				fetchJson<BatchStatusPayload>(
					`/api/batches/${detailBatchId}/status`,
				).catch((error) => ({
					batchId: detailBatchId,
					error: error instanceof Error ? error.message : String(error),
				})),
				fetchJson<{ readings: SensorReading[] }>(
					`/api/batches/${detailBatchId}/sensor-history`,
				),
				fetchJson<{ alarms: AlarmEvent[] }>(
					`/api/batches/${detailBatchId}/alarms`,
				),
			]);
			setStatus(statusPayload);
			setReadings(historyPayload.readings);
			setAlarms(alarmPayload.alarms);
		},
		[selectedBatchId, tab],
	);

	useEffect(() => {
		const initial = window.setTimeout(() => void refresh(), 0);
		const timer = window.setInterval(() => void refresh(), 3500);
		return () => {
			window.clearTimeout(initial);
			window.clearInterval(timer);
		};
	}, [refresh]);

	useEffect(() => {
		if (tab === 'support' || tab === 'customer') {
			void refresh();
		}
	}, [tab, refresh]);

	useEffect(() => {
		if (!selectedOrderIdForFlow || !selectedOrderForFlow) return;
		const el = orderFlowDialogRef.current;
		if (el && !el.open) {
			el.showModal();
		}
	}, [selectedOrderIdForFlow, selectedOrderForFlow]);

	useEffect(() => {
		setSelectedFlowStepId(null);
	}, [selectedBatchId]);

	useEffect(() => {
		if (tab !== 'operations') return;
		if (typeof Notification === 'undefined') return;
		if (Notification.permission !== 'granted') return;

		const sinceMs = sessionStartMsRef.current - 4000;

		for (const alarm of alarms) {
			if (new Date(alarm.timestamp).getTime() < sinceMs) continue;
			if (notifiedAlarmIdsRef.current.has(alarm.id)) continue;
			notifiedAlarmIdsRef.current.add(alarm.id);
			try {
				new Notification(`Alarm (${alarm.severity})`, {
					body: `${statusLabel(alarm.type)} — ${alarm.message}`,
					tag: alarm.id,
				});
			} catch {
				/* ignore */
			}
		}

		for (const task of pendingTasks) {
			if (new Date(task.createdAt).getTime() < sinceMs) continue;
			if (notifiedTaskIdsRef.current.has(task.id)) continue;
			notifiedTaskIdsRef.current.add(task.id);
			try {
				new Notification('Manual QA required', {
					body: `${statusLabel(task.reason)} · batch ${shortBatchId(task.batchId)}`,
					tag: task.id,
				});
			} catch {
				/* ignore */
			}
		}
	}, [alarms, pendingTasks, tab]);

	useEffect(() => {
		const node = brewChatLogRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
	}, [brewChat]);

	useEffect(() => {
		const node = supportChatLogRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
	}, [supportChat]);

	useEffect(() => {
		if (!attentionPopover) return;
		function handlePointerDown(event: PointerEvent) {
			const root = attentionPopoverRef.current;
			if (root && !root.contains(event.target as Node)) {
				setAttentionPopover(null);
			}
		}
		document.addEventListener('pointerdown', handlePointerDown, true);
		return () =>
			document.removeEventListener('pointerdown', handlePointerDown, true);
	}, [attentionPopover]);

	useEffect(() => {
		if (!attentionPopover) return;
		function handleKey(event: KeyboardEvent) {
			if (event.key === 'Escape') setAttentionPopover(null);
		}
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [attentionPopover]);

	async function runAction(label: string, action: () => Promise<void>) {
		setBusy(true);
		try {
			await action();
			setNotice(label);
			await refresh();
		} catch (error) {
			setNotice(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function startBatch() {
		setBusy(true);
		try {
			const result = await fetchJson<{ batchId: string }>('/api/batches', {
				method: 'POST',
				body: JSON.stringify({ beerName }),
			});
			setNotice('Batch started.');
			brewDialogRef.current?.close();
			await refresh(result.batchId);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function simulator(path: string, body: unknown, label: string) {
		if (!selectedBatchId) return;
		await runAction(label, async () => {
			await fetchJson(path, { method: 'POST', body: JSON.stringify(body) });
		});
	}

	async function cancelBatch() {
		if (!selectedBatchId) return;
		if (
			!window.confirm(
				`Cancel batch ${shortBatchId(selectedBatchId)}? This stops the brew and fermentation schedule for this batch.`,
			)
		) {
			return;
		}
		await runAction('Batch cancelled.', async () => {
			await fetchJson(`/api/batches/${selectedBatchId}/cancel`, {
				method: 'POST',
			});
		});
	}

	async function completeFermentationMonitoring() {
		if (!selectedBatchId) return;
		await runAction('Tank monitoring ended.', async () => {
			await fetchJson(`/api/batches/${selectedBatchId}/complete-fermentation`, {
				method: 'POST',
			});
		});
	}

	function openPackagingDialog() {
		setPackageBeerName(selectedBatch?.beerName ?? beerName);
		setPackageQuantityDelta('12');
		setPackageUnit('case');
		packageDialogRef.current?.showModal();
	}

	async function submitPackagingDemo() {
		const name = packageBeerName.trim();
		const delta = Number.parseInt(packageQuantityDelta, 10);
		if (!name || !Number.isFinite(delta)) {
			setNotice('Enter the beer name and how many units to add (whole number).');
			return;
		}
		setBusy(true);
		try {
			await fetchJson<{ ok: boolean; workflowId: string }>(
				'/api/simulator/packaged-stock',
				{
					method: 'POST',
					body: JSON.stringify({
						productName: name,
						quantityDelta: delta,
						unit: packageUnit,
						sourceBatchId: selectedBatchId || undefined,
					}),
				},
			);
			const unitLabel = `${packageUnit}${delta === 1 || delta === -1 ? '' : 's'}`;
			setNotice(
				`Packaged inventory updated: ${delta >= 0 ? '+' : ''}${delta} ${unitLabel} of ${name}. Open orders refresh on their next stock check.`,
			);
			packageDialogRef.current?.close();
			await refresh(null, { includeOrders: true });
		} catch (error) {
			setNotice(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function runStockSimulation() {
		setBusy(true);
		try {
			const r = await fetchJson<{
				ok: boolean;
				replenished: Array<{
					sku: string;
					productName: string;
					before: number;
					after: number;
				}>;
				batchesStarted: Array<{
					batchId: string;
					beerName: string;
					workflowId: string;
				}>;
				skipped: Array<{
					sku: string;
					productName: string;
					reason: string;
				}>;
			}>('/api/simulator/stock', {
				method: 'POST',
				body: JSON.stringify({}),
			});
			const parts: string[] = [];
			if (r.replenished.length > 0) {
				parts.push(
					`Added packaged stock: ${r.replenished.map((x) => `${x.productName} (${x.before}→${x.after})`).join(', ')}`,
				);
			}
			if (r.batchesStarted.length > 0) {
				parts.push(
					`Started brew ${r.batchesStarted.map((b) => shortBatchId(b.batchId)).join(', ')}`,
				);
			}
			if (r.skipped.length > 0) {
				parts.push(
					`No new brew started — beer already in progress for: ${r.skipped.map((s) => s.productName).join(', ')}`,
				);
			}
			if (parts.length === 0) {
				parts.push(
					'Everything on hand is above the restock level. Lower packaged counts first if you want to test restocking.',
				);
			}
			const msg = parts.join(' · ');
			setNotice(msg);
			setStockSimMessage(msg);
			await refresh(r.batchesStarted[0]?.batchId ?? null, {
				includeOrders: true,
			});
		} catch (error) {
			const err = error instanceof Error ? error.message : String(error);
			setNotice(err);
			setStockSimMessage(err);
		} finally {
			setBusy(false);
		}
	}

	async function placeCustomerOrder(item: InventoryItem) {
		const quantity = Math.max(1, portalQtyBySku[item.sku] ?? 1);
		if (!portalCustomerName.trim()) {
			setPortalNotice('Enter your name to place an order.');
			return;
		}
		if (item.quantity < 1) {
			setPortalNotice(`Out of stock: ${item.productName}.`);
			return;
		}
		if (quantity > item.quantity) {
			setPortalNotice(
				`Only ${item.quantity} in stock for ${item.productName}.`,
			);
			return;
		}
		setBusy(true);
		setPortalNotice(null);
		try {
			const { order } = await fetchJson<{ order: Order; workflowId: string }>(
				'/api/orders',
				{
					method: 'POST',
					body: JSON.stringify({
						customer: {
							name: portalCustomerName.trim(),
							email: portalCustomerEmail.trim() || undefined,
						},
						product: item.productName,
						quantity,
					}),
				},
			);
			setPortalNotice(
				`Order placed for ${order.quantity}× ${order.product}. Watch the list below — it updates as we pull from packaged inventory.`,
			);
			await refresh();
		} catch (error) {
			setPortalNotice(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setBusy(false);
		}
	}

	async function approveTask(task: ManualTask) {
		await runAction(`Approved ${task.id}.`, async () => {
			await fetchJson(`/api/batches/${task.batchId}/qa/${task.id}/approve`, {
				method: 'POST',
				body: JSON.stringify({ note: 'Approved from dashboard' }),
			});
		});
	}

	async function sendBrewChat(confirm = false, overrideText?: string) {
		if (brewChatBusy) return;
		const text = confirm ? 'Confirm action' : (overrideText ?? brewInput).trim();
		if (!text && !confirm) return;
		setBrewChatBusy(true);
		if (!confirm) setBrewChat((items) => [...items, { role: 'user', text }]);
		setBrewInput('');
		try {
			const response = await fetchJson<AgentResponse>(
				'/api/agents/brewmaster/chat',
				{
					method: 'POST',
					body: JSON.stringify({
						batchId: selectedBatchId || undefined,
						message: text,
						pendingAction: pendingBrewAction,
						confirm,
					}),
				},
			);
			setPendingBrewAction(response.pendingAction);
			setBrewChat((items) => [
				...items,
				{
					role: 'agent',
					text: response.message,
					plan: response.plan,
					observations: response.observations,
					toolsUsed: response.toolsUsed,
					provider: response.provider,
					model: response.model,
					providerError: response.providerError,
				},
			]);
			if (confirm) {
				setPendingBrewAction(undefined);
				await refresh();
			}
		} catch (error) {
			setBrewChat((items) => [
				...items,
				{
					role: 'agent',
					text: error instanceof Error ? error.message : String(error),
				},
			]);
		} finally {
			setBrewChatBusy(false);
		}
	}

	async function sendSupportChat(overrideText?: string) {
		if (supportChatBusy) return;
		const text = (overrideText ?? supportInput).trim();
		if (!text) return;
		setSupportChatBusy(true);
		setSupportInput('');
		setSupportChat((items) => [...items, { role: 'user', text }]);
		const response = await fetchJson<AgentResponse>(
			'/api/agents/support/chat',
			{
				method: 'POST',
				body: JSON.stringify({
					batchId: selectedBatchId || undefined,
					message: text,
				}),
			},
		);
		setSupportChat((items) => [
			...items,
			{ role: 'agent', text: response.message },
		]);
		await refresh();
	}

	async function requestDesktopAlerts() {
		if (typeof Notification === 'undefined') {
			setNotice('Desktop notifications are not supported in this browser.');
			setNotificationPermission('unsupported');
			return;
		}
		const permission = await Notification.requestPermission();
		setNotificationPermission(permission);
		if (permission === 'granted') {
			setNotice('Desktop alerts enabled for new alarms and QA tasks.');
		} else if (permission === 'denied') {
			setNotice('Desktop alerts blocked — enable them in browser settings if needed.');
		}
	}

	useEffect(() => {
		if (typeof Notification === 'undefined') {
			setNotificationPermission('unsupported');
			return;
		}
		setNotificationPermission(Notification.permission);
	}, []);

	return (
		<>
			<header className="topbar">
				<div className="topbar-copy">
					<h1>Brewery floor dashboard</h1>
					<p>
						Start brews, watch tank readings, handle quality checks, and keep an eye on
						packaged orders — all in one place.
					</p>
				</div>
				<div className="topbar-actions">
					<button
						type="button"
						className="primary"
						disabled={busy}
						onClick={() => brewDialogRef.current?.showModal()}
					>
						<Plus size={18} />
						Brew new
					</button>
					{notificationPermission &&
					notificationPermission !== 'unsupported' &&
					notificationPermission !== 'granted' ? (
						<button
							type="button"
							className="topbar-link topbar-link-button"
							onClick={() => void requestDesktopAlerts()}
						>
							Enable desktop alerts
						</button>
					) : null}
					<a
						className="topbar-link"
						href="http://localhost:8233"
						target="_blank"
						rel="noreferrer"
						title="For staff who maintain the scheduling system"
					>
						Scheduling (IT)
					</a>
				</div>
			</header>

			<section className="dashboard">
			<div className="tabs-wrap">
				<div className="tabs" aria-label="Main sections">
					<button
						type="button"
						className={tab === 'operations' ? 'selected' : ''}
						onClick={() => setTab('operations')}
					>
						<Gauge size={18} />
						Operations
					</button>
					<button
						type="button"
						className={tab === 'support' ? 'selected' : ''}
						onClick={() => setTab('support')}
					>
						<ShoppingCart size={18} />
						Support
					</button>
					<button
						type="button"
						className={tab === 'customer' ? 'selected' : ''}
						onClick={() => setTab('customer')}
					>
						<Beer size={18} />
						Customer
					</button>
				</div>
			</div>

			{tab === 'operations' ? (
				<>
				<div
					className={`ops-grid${selectedFlowStepId ? '' : ' ops-grid--no-chart'}`}
				>
					<section
						className="panel stack ops-area-batches"
						aria-label="Beers in production"
					>
						<div className="section-head">
							<div>
								<h2>Beers in production</h2>
								<p>
									Active brews on the floor. Select a row to load live readings and
									status for that batch.
								</p>
							</div>
						</div>
						{batchesSorted.length === 0 ? (
							<p className="brew-batch-empty">
								No batches yet. Use <strong>Brew new</strong> to start one.
							</p>
						) : (
							<div className="brew-batch-table-wrap">
								<table className="brew-batch-table">
									<thead>
										<tr>
											<th scope="col">Beer</th>
											<th scope="col">Stage</th>
											<th scope="col">Status</th>
											<th scope="col">Started</th>
											<th scope="col">Updated</th>
											<th scope="col">Alarms</th>
											<th scope="col">QA pending</th>
											<th scope="col">Batch</th>
										</tr>
									</thead>
									<tbody>
										{batchesSorted.map((batch) => (
											<tr
												key={batch.batchId}
												role="button"
												tabIndex={busy ? -1 : 0}
												aria-pressed={batch.batchId === selectedBatchId}
												aria-label={`Select batch ${batch.beerName}`}
												className={
													batch.batchId === selectedBatchId
														? 'brew-batch-row selected'
														: 'brew-batch-row'
												}
												onClick={() => {
													if (!busy) void refresh(batch.batchId);
												}}
												onKeyDown={(event) => {
													if (busy) return;
													if (event.key === 'Enter' || event.key === ' ') {
														event.preventDefault();
														void refresh(batch.batchId);
													}
												}}
											>
												<td>
													<strong>{batch.beerName}</strong>
												</td>
												<td>{statusLabel(batch.stage)}</td>
												<td>{statusLabel(batch.status)}</td>
												<td>{formatShortStamp(batch.startedAt)}</td>
												<td>{formatShortStamp(batch.updatedAt)}</td>
												<td>{batch.alarmCount}</td>
												<td>{batch.pendingTaskCount}</td>
												<td className="mono">{shortBatchId(batch.batchId)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
					<section className="panel stack ops-area-control">
						<div className="section-head">
							<div>
								<h2>Batch Control</h2>
								<p>{notice}</p>
							</div>
							<div className="section-head-actions">
								<button type="button" disabled={busy} onClick={() => refresh()}>
									<RefreshCw size={18} />
								</button>
								<button
									type="button"
									disabled={busy || !selectedBatchId}
									title="Marks tank monitoring done so this batch can close out cleanly"
									onClick={() => void completeFermentationMonitoring()}
								>
									<CheckCircle2 size={18} />
									Finish tank monitoring
								</button>
								<button
									type="button"
									className="danger"
									disabled={busy || !selectedBatchId}
									title="Stop this brew and its fermentation schedule"
									onClick={() => void cancelBatch()}
								>
									<Ban size={18} />
									Cancel batch
								</button>
								<div
									className="ops-attention-icons"
									ref={attentionPopoverRef}
									role="group"
									aria-label="QA and alarms"
								>
									<div className="ops-icon-popover-anchor">
										<button
											type="button"
											className={
												attentionPopover === 'qa'
													? 'ops-icon-trigger ops-icon-trigger-active'
													: 'ops-icon-trigger'
											}
											disabled={busy}
											aria-expanded={attentionPopover === 'qa'}
											aria-haspopup="dialog"
											aria-controls="ops-popover-qa"
											title="Manual QA tasks"
											onClick={() =>
												setAttentionPopover((current) =>
													current === 'qa' ? null : 'qa',
												)
											}
										>
											<User size={20} strokeWidth={2} aria-hidden />
											{pendingTasks.length > 0 ? (
												<span className="ops-icon-badge">{pendingTasks.length}</span>
											) : null}
										</button>
										{attentionPopover === 'qa' ? (
											<div
												className="ops-attention-popover"
												id="ops-popover-qa"
												role="dialog"
												aria-label="Manual QA"
											>
												<div className="ops-attention-popover-head">
													<strong>Manual QA</strong>
													<span className="ops-attention-popover-meta">
														{pendingTasks.length} pending
													</span>
												</div>
												<div className="feed ops-attention-popover-feed">
													{pendingTasks.length === 0 ? (
														<p className="note">No pending QA tasks.</p>
													) : null}
													{pendingTasks.map((task) => (
														<article className="task-item" key={task.id}>
															<div>
																<strong>{statusLabel(task.reason)}</strong>
																<span>{task.id}</span>
															</div>
															<button
																disabled={busy}
																onClick={() => approveTask(task)}
															>
																<CheckCircle2 size={18} />
																Approve
															</button>
														</article>
													))}
												</div>
											</div>
										) : null}
									</div>
									<div className="ops-icon-popover-anchor">
										<button
											type="button"
											className={
												attentionPopover === 'alarms'
													? 'ops-icon-trigger ops-icon-trigger-active'
													: 'ops-icon-trigger'
											}
											disabled={busy}
											aria-expanded={attentionPopover === 'alarms'}
											aria-haspopup="dialog"
											aria-controls="ops-popover-alarms"
											title="Alarms"
											onClick={() =>
												setAttentionPopover((current) =>
													current === 'alarms' ? null : 'alarms',
												)
											}
										>
											<Bell size={20} strokeWidth={2} aria-hidden />
											{alarms.length > 0 ? (
												<span className="ops-icon-badge">{alarms.length}</span>
											) : null}
										</button>
										{attentionPopover === 'alarms' ? (
											<div
												className="ops-attention-popover"
												id="ops-popover-alarms"
												role="dialog"
												aria-label="Alarms"
											>
												<div className="ops-attention-popover-head">
													<strong>Alarms</strong>
													<span className="ops-attention-popover-meta">
														{alarms.length} total
													</span>
												</div>
												<div className="feed ops-attention-popover-feed">
													{alarms.length === 0 ? (
														<p className="note">No alarms yet.</p>
													) : null}
													{alarms.map((alarm) => (
														<article
															className={`feed-item ${alarm.severity}`}
															key={alarm.id}
														>
															<strong>{statusLabel(alarm.type)}</strong>
															<span>{alarm.message}</span>
															<small>{formatTime(alarm.timestamp)}</small>
														</article>
													))}
												</div>
											</div>
										) : null}
									</div>
								</div>
							</div>
						</div>

						<div className="sim-grid">
							<button
								disabled={busy || !selectedBatchId}
								onClick={() =>
									simulator(
										`/api/simulator/${selectedBatchId}/tick`,
										{ scenario: 'normal' },
										'Normal tick sent.',
									)
								}
							>
								<Activity size={18} />
								Normal
							</button>
							<button
								className="warn"
								disabled={busy || !selectedBatchId}
								onClick={() =>
									simulator(
										`/api/simulator/${selectedBatchId}/inject`,
										{ kind: 'temp_spike' },
										'Temperature spike injected.',
									)
								}
							>
								<ThermometerSun size={18} />
								Temp Spike
							</button>
							<button
								disabled={busy || !selectedBatchId}
								onClick={() =>
									simulator(
										`/api/simulator/${selectedBatchId}/tick`,
										{ scenario: 'stuck_fermentation', tick: 5 },
										'Stuck fermentation reading sent.',
									)
								}
							>
								Stuck
							</button>
							<button
								disabled={busy || !selectedBatchId}
								onClick={() =>
									simulator(
										`/api/simulator/${selectedBatchId}/inject`,
										{ kind: 'crash_recovery' },
										'Crash recovery reading sent.',
									)
								}
							>
								Recovery
							</button>
							<button
								type="button"
								disabled={busy}
								title="Demo: add packaged stock when counts are low and start a brew if nothing is already running for that beer"
								onClick={() => void runStockSimulation()}
							>
								<PackagePlus size={18} />
								Restock helper
							</button>
							<button
								type="button"
								disabled={busy}
								title="Demo: add packaged beer through a short scheduling job (shows as a completed run)"
								onClick={() => openPackagingDialog()}
							>
								<Package size={18} />
								Record packaging
							</button>
						</div>
					</section>
					<section className="panel ops-area-status" aria-label="Batch status">
						<div className="status-strip">
							<div className="status-cell">
								<span>Stage</span>
								<strong>
									{statusLabel(status?.brew?.stage ?? selectedBatch?.stage)}
								</strong>
							</div>
							<div className="status-cell">
								<span>Health</span>
								<strong>
									{statusLabel(
										status?.fermentation?.health ?? selectedBatch?.status,
									)}
								</strong>
							</div>
							<div className="status-cell">
								<span>Updated</span>
								<strong>
									{formatTime(
										status?.fermentation?.updatedAt ??
											status?.brew?.updatedAt ??
											selectedBatch?.updatedAt,
									)}
								</strong>
							</div>
							<div className="status-cell">
								<span>Readings</span>
								<strong>
									{status?.fermentation?.readingCount ?? readings.length}
								</strong>
							</div>
						</div>
					</section>

					<section className="panel flow-panel ops-area-flow">
						<div className="section-head">
							<div>
								<h2>Process Map</h2>
								<p>
									Click a step to see related live readings. Mash, boil, and chill use
									the latest brewhouse readings; fermentation uses the full tank
									sensor set. Click empty space on the map to clear your selection.
								</p>
							</div>
						</div>
						<div className="flow-wrap">
							<ProcessFlow
								stage={status?.brew?.stage ?? selectedBatch?.stage}
								health={status?.fermentation?.health ?? selectedBatch?.status}
								readingCount={
									status?.fermentation?.readingCount ?? readings.length
								}
								alarmCount={alarms.length}
								pendingTaskCount={pendingTasks.length}
								selectedStepId={selectedFlowStepId}
								onStepSelect={setSelectedFlowStepId}
							/>
						</div>
						<div className="step-readings">
							{!selectedFlowStepId ? (
								<p className="note step-readings-hint">
									Select Mash, Boil, Chill, Fermentation, or Tank sensors to see
									readings for that part of the brew.
								</p>
							) : null}
							{selectedFlowStepId && !stepSensorFields(selectedFlowStepId) ? (
								<p className="note">
									{`"${FLOW_STEP_TITLES[selectedFlowStepId]}" doesn't have tank readings on this map. Try Mash, Boil, Chill, Fermentation, or Tank sensors.`}
								</p>
							) : null}
							{selectedFlowStepId &&
							stepSensorFields(selectedFlowStepId) &&
							!currentReading ? (
								<p className="note">
									No readings for this batch yet. Once fermentation is running and
									sensors are sending data, numbers will show here.
								</p>
							) : null}
							{selectedFlowStepId &&
							stepSensorFields(selectedFlowStepId) &&
							currentReading ? (
								<>
									<p className="step-readings-caption">
										Live values for{' '}
										<strong>{FLOW_STEP_TITLES[selectedFlowStepId]}</strong> (latest
										tank reading)
									</p>
									<div className="step-sensor-grid">
										{stepSensorFields(selectedFlowStepId)!.map((field) => (
											<div className="step-sensor-cell" key={field.key}>
												<span>{field.label}</span>
												<strong>{field.format(currentReading)}</strong>
											</div>
										))}
									</div>
								</>
							) : null}
						</div>
					</section>

					{selectedFlowStepId ? (
						<section className="panel chart-panel ops-area-chart">
							<div className="section-head">
								<div>
									<h2>Sensor History</h2>
									<p>
										{chartSeriesKeys === null
											? `${FLOW_STEP_TITLES[selectedFlowStepId]} has no chart here — pick Mash, Boil, Chill, Fermentation, or Tank sensors.`
											: `${readings.length} readings · ${FLOW_STEP_TITLES[selectedFlowStepId]}`}
									</p>
								</div>
							</div>
							<div className="chart-wrap">
								<SensorChart readings={readings} seriesKeys={chartSeriesKeys} />
							</div>
						</section>
					) : null}

					<section className="panel chat-panel ops-area-agent">
						<div className="section-head">
							<div>
								<h2>Brewmaster Copilot</h2>
								<p>Operator-facing workflow help with confirmed actions</p>
							</div>
							<Bot size={20} />
						</div>
						<div className="prompt-row" aria-label="Brewmaster prompt shortcuts">
							{BREWMASTER_PROMPTS.map((prompt) => (
								<button
									type="button"
									className="prompt-chip"
									disabled={busy || brewChatBusy}
									key={prompt}
									onClick={() => void sendBrewChat(false, prompt)}
								>
									{prompt}
								</button>
							))}
						</div>
						<div className="chat-log" ref={brewChatLogRef}>
							{brewChat.map((message, index) => (
								<div
									className={`chat-message ${message.role}`}
									key={`${message.role}-${index}`}
								>
									<p>{message.text}</p>
									<AgentTrace message={message} />
								</div>
							))}
						</div>
						{pendingBrewAction ? (
							<div className="pending-action">
								<div>
									<strong>Action ready</strong>
									<span>
										{pendingBrewAction.type === 'approve_qa'
											? 'Approve QA task'
											: 'Send manual override'}
									</span>
								</div>
								<button
									type="button"
									className="primary"
									disabled={busy || brewChatBusy}
									onClick={() => void sendBrewChat(true)}
								>
									<CheckCircle2 size={18} />
									Confirm
								</button>
							</div>
						) : null}
						<div className="inline">
							<input
								value={brewInput}
								onChange={(event) => setBrewInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' && !event.shiftKey) {
										event.preventDefault();
										void sendBrewChat();
									}
								}}
							/>
							<button
								disabled={busy || brewChatBusy}
								onClick={() => void sendBrewChat()}
							>
								<Send size={18} />
							</button>
						</div>
					</section>
				</div>

				<dialog
					ref={brewDialogRef}
					className="brew-modal"
					onClick={(event) => {
						if (event.target === event.currentTarget) {
							brewDialogRef.current?.close();
						}
					}}
				>
					<form
						className="modal-panel"
						onSubmit={(event) => {
							event.preventDefault();
							void startBatch();
						}}
						onClick={(event) => event.stopPropagation()}
					>
						<h3>Start new batch</h3>
						<p>Adds this beer to the schedule and opens it on your dashboard.</p>
						<label className="field-label" htmlFor="brew-modal-beer-name">
							Beer name
						</label>
						<input
							id="brew-modal-beer-name"
							value={beerName}
							onChange={(event) => setBeerName(event.target.value)}
							autoComplete="off"
						/>
						<div className="modal-actions">
							<button
								type="button"
								onClick={() => brewDialogRef.current?.close()}
							>
								Cancel
							</button>
							<button type="submit" className="primary" disabled={busy}>
								<FlaskConical size={18} />
								Start batch
							</button>
						</div>
					</form>
				</dialog>
				</>
			) : tab === 'support' ? (
				<>
				<div className="support-grid">
					<section className="panel stack">
						<div className="section-head">
							<div>
								<h2>Inventory</h2>
								<p>Packaged beer you list as available to sell</p>
								{stockSimMessage ? (
									<p className="note">{stockSimMessage}</p>
								) : null}
							</div>
							<div className="section-head-actions">
								<button
									type="button"
									disabled={busy}
									title="When packaged counts are low, add stock and start a brew if that beer is not already running"
									onClick={() => void runStockSimulation()}
								>
									<PackagePlus size={18} />
									Restock helper
								</button>
								<ShoppingCart size={20} aria-hidden />
							</div>
						</div>
						<div className="feed">
							{inventory.map((item) => (
								<article className="inventory-item" key={item.sku}>
									<strong>{item.productName}</strong>
									<span>
										{item.quantity} {item.unit}
										{item.quantity === 1 ? '' : 's'} available
									</span>
									<small>{item.sku}</small>
								</article>
							))}
						</div>
					</section>

					<section className="panel chat-panel support-chat">
						<div className="section-head">
							<div>
								<h2>Support Agent</h2>
								<p>Answers for customers about timing and what is on hand</p>
							</div>
							<MessageSquare size={20} />
						</div>
						<div className="prompt-row" aria-label="Support prompt shortcuts">
							{SUPPORT_PROMPTS.map((prompt) => (
								<button
									type="button"
									className="prompt-chip"
									disabled={busy || supportChatBusy}
									key={prompt}
									onClick={() => void sendSupportChat(prompt)}
								>
									{prompt}
								</button>
							))}
						</div>
						<div className="chat-log" ref={supportChatLogRef}>
							{supportChat.map((message, index) => (
								<div
									className={`chat-message ${message.role}`}
									key={`${message.role}-${index}`}
								>
									<p>{message.text}</p>
									<AgentTrace message={message} />
								</div>
							))}
						</div>
						<div className="inline">
							<input
								value={supportInput}
								onChange={(event) => setSupportInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' && !event.shiftKey) {
										event.preventDefault();
										void sendSupportChat();
									}
								}}
							/>
							<button
								disabled={busy || supportChatBusy}
								onClick={() => void sendSupportChat()}
							>
								<Send size={18} />
							</button>
						</div>
					</section>
				</div>
				<section className="panel stack support-ops-orders">
						<div className="section-head">
							<div>
								<h2>Orders — brewery view</h2>
								<p>
									Same live status your customers see. The list refreshes on its
									own. Click an order to open its progress map.
								</p>
							</div>
							<ShoppingCart size={20} aria-hidden />
						</div>
						<div className="feed portal-orders-feed">
							<OrderStatusFeed
								orders={ordersRecent}
								selectedOrderId={selectedOrderIdForFlow}
								onSelectOrder={selectOrderForFlow}
							/>
						</div>
				</section>
				</>
			) : (
				<div className="support-grid portal-customer-grid">
					<section className="panel stack">
						<div className="section-head">
							<div>
								<h2>Customer portal</h2>
								<p>
									When packaged beer is on hand, we reserve it for the order. If
									we are short, the order waits and keeps checking until stock comes
									in or a new brew is packaged.
								</p>
								{portalNotice ? (
									<p className="note">{portalNotice}</p>
								) : null}
							</div>
							<Beer size={22} aria-hidden />
						</div>
						<div className="portal-customer-fields">
							<div>
								<label className="field-label" htmlFor="portal-customer-name">
									Your name
								</label>
								<input
									id="portal-customer-name"
									value={portalCustomerName}
									onChange={(event) =>
										setPortalCustomerName(event.target.value)
									}
									autoComplete="name"
								/>
							</div>
							<div>
								<label className="field-label" htmlFor="portal-customer-email">
									Email (optional)
								</label>
								<input
									id="portal-customer-email"
									type="email"
									value={portalCustomerEmail}
									onChange={(event) =>
										setPortalCustomerEmail(event.target.value)
									}
									autoComplete="email"
								/>
							</div>
						</div>
						<div className="feed portal-customer-products">
							{inventory.length === 0 ? (
								<p className="note">No catalog items yet.</p>
							) : null}
							{inventory.map((item) => (
								<article
									className="inventory-item portal-product-row"
									key={item.sku}
								>
									<div className="portal-product-meta">
										<strong>{item.productName}</strong>
										<span>
											{item.quantity} {item.unit}
											{item.quantity === 1 ? '' : 's'} in stock
										</span>
										<small>{item.sku}</small>
									</div>
									<label className="portal-qty-label">
										Qty
										<input
											type="number"
											min={1}
											max={Math.max(1, item.quantity)}
											value={String(portalQtyBySku[item.sku] ?? 1)}
											onChange={(event) => {
												const v = Number.parseInt(event.target.value, 10);
												setPortalQtyBySku((prev) => ({
													...prev,
													[item.sku]: Number.isFinite(v)
														? Math.max(1, v)
														: 1,
												}));
											}}
										/>
									</label>
									<button
										type="button"
										className="primary"
										disabled={busy || item.quantity < 1}
										onClick={() => void placeCustomerOrder(item)}
									>
										<ShoppingCart size={18} />
										Order
									</button>
								</article>
							))}
						</div>
					</section>
					<section className="panel stack">
						<div className="section-head">
							<div>
								<h2>Recent orders</h2>
								<p>
									Shows whether beer was pulled from packaged inventory or is still
									waiting. Click an order to see its progress map.
								</p>
							</div>
							<ShoppingCart size={20} aria-hidden />
						</div>
						<div className="feed portal-orders-feed">
							<OrderStatusFeed
								orders={ordersRecent}
								selectedOrderId={selectedOrderIdForFlow}
								onSelectOrder={selectOrderForFlow}
							/>
						</div>
					</section>
				</div>
			)}
			</section>

			<dialog
				ref={packageDialogRef}
				className="brew-modal"
				onClick={(event) => {
					if (event.target === event.currentTarget) {
						packageDialogRef.current?.close();
					}
				}}
			>
				<form
					className="modal-panel"
					onSubmit={(event) => {
						event.preventDefault();
						void submitPackagingDemo();
					}}
					onClick={(event) => event.stopPropagation()}
				>
					<h3>Record packaged beer</h3>
					<p>
						Adds to packaged inventory so orders and the inventory list stay in sync.
						Use a negative number to subtract (for example correcting a mistake). The
						selected batch is noted when one is chosen.
					</p>
					<label className="field-label" htmlFor="package-beer-name">
						Beer name
					</label>
					<input
						id="package-beer-name"
						value={packageBeerName}
						onChange={(event) => setPackageBeerName(event.target.value)}
						autoComplete="off"
					/>
					<label className="field-label" htmlFor="package-unit-kind">
						Package type
					</label>
					<select
						id="package-unit-kind"
						value={packageUnit}
						onChange={(event) =>
							setPackageUnit(event.target.value as 'case' | 'keg' | 'can')
						}
					>
						<option value="case">Case</option>
						<option value="keg">Keg</option>
						<option value="can">Can</option>
					</select>
					<label className="field-label" htmlFor="package-delta">
						How many to add (use minus to remove)
					</label>
					<input
						id="package-delta"
						type="number"
						value={packageQuantityDelta}
						onChange={(event) => setPackageQuantityDelta(event.target.value)}
					/>
					<div className="modal-actions">
						<button
							type="button"
							onClick={() => packageDialogRef.current?.close()}
						>
							Cancel
						</button>
						<button type="submit" className="primary" disabled={busy}>
							<Package size={18} />
							Apply
						</button>
					</div>
				</form>
			</dialog>

			<dialog
				ref={orderFlowDialogRef}
				className="brew-modal order-flow-modal"
				onClose={() => {
					setSelectedOrderIdForFlow(null);
				}}
				onClick={(event) => {
					if (event.target === event.currentTarget) {
						orderFlowDialogRef.current?.close();
					}
				}}
			>
				<div
					className="modal-panel order-flow-modal-panel"
					onClick={(event) => event.stopPropagation()}
				>
					<h3>Order progress</h3>
					{selectedOrderForFlow ? (
						<>
							<p className="order-flow-summary">
								<strong>{selectedOrderForFlow.product}</strong>
								{' · '}
								{selectedOrderForFlow.quantity} units ·{' '}
								{formatOrderDisplay(selectedOrderForFlow)}
								<br />
								<small>
									{selectedOrderForFlow.id} ·{' '}
									{selectedOrderForFlow.customer.name}
								</small>
							</p>
							<p className="note">
								Highlights show where this order sits from receipt through packaged
								stock and ready-to-go. The map updates on its own while this window
								is open.
							</p>
							<div className="order-flow-diagram-wrap">
								<OrderFulfillmentFlow
									key={selectedOrderForFlow.id}
									order={selectedOrderForFlow}
								/>
							</div>
						</>
					) : null}
					<div className="modal-actions">
						<button
							type="button"
							onClick={() => orderFlowDialogRef.current?.close()}
						>
							Close
						</button>
					</div>
				</div>
			</dialog>
		</>
	);
}
