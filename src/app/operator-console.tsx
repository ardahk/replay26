'use client';

import {
	Activity,
	Bell,
	Bot,
	CheckCircle2,
	FlaskConical,
	Gauge,
	MessageSquare,
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
	toolsUsed?: string[];
	pendingAction?: {
		type: 'approve_qa' | 'send_signal';
		payload: unknown;
	};
	order?: Order;
}

type Tab = 'operations' | 'support';
type ChatRole = 'user' | 'agent';
type AttentionPopover = 'qa' | 'alarms' | null;

interface ChatMessage {
	role: ChatRole;
	text: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(init?.headers ?? {}),
		},
	});
	const json = (await response.json()) as T & { error?: string };
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
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState('Ready.');
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
	const attentionPopoverRef = useRef<HTMLDivElement>(null);
	const [attentionPopover, setAttentionPopover] =
		useState<AttentionPopover>(null);

	const selectedBatch = useMemo(
		() => batches.find((batch) => batch.batchId === selectedBatchId),
		[batches, selectedBatchId],
	);
	const batchesSorted = useMemo(
		() => [...batches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
		[batches],
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

	const refresh = useCallback(
		async (selectOverride?: string | null) => {
			const explicitSelection = selectOverride !== undefined;

			const [
				{ batches: batchList },
				{ tasks: manualTasks },
				{ inventory: inventoryItems },
			] = await Promise.all([
				fetchJson<{ batches: BatchSummary[] }>('/api/batches'),
				fetchJson<{ tasks: ManualTask[] }>('/api/manual-tasks'),
				fetchJson<{ inventory: InventoryItem[] }>('/api/inventory'),
			]);
			setBatches(batchList);
			setTasks(manualTasks);
			setInventory(inventoryItems);

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
		[selectedBatchId],
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
		setSelectedFlowStepId(null);
	}, [selectedBatchId]);

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

	async function approveTask(task: ManualTask) {
		await runAction(`Approved ${task.id}.`, async () => {
			await fetchJson(`/api/batches/${task.batchId}/qa/${task.id}/approve`, {
				method: 'POST',
				body: JSON.stringify({ note: 'Approved from dashboard' }),
			});
		});
	}

	async function sendBrewChat(confirm = false) {
		if (!brewInput.trim() && !confirm) return;
		const text = confirm ? 'Confirm action' : brewInput;
		if (!confirm) setBrewChat((items) => [...items, { role: 'user', text }]);
		setBrewInput('');
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
			{ role: 'agent', text: response.message },
		]);
		if (confirm) {
			setPendingBrewAction(undefined);
			await refresh();
		}
	}

	async function sendSupportChat() {
		if (!supportInput.trim()) return;
		const text = supportInput;
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

	return (
		<>
			<header className="topbar">
				<div className="topbar-copy">
					<h1>Brewery Process Console</h1>
					<p>
						Start batches, stream telemetry, and inspect live workflow state in one
						place.
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
					<a
						className="topbar-link"
						href="http://localhost:8233"
						target="_blank"
						rel="noreferrer"
					>
						Temporal UI
					</a>
				</div>
			</header>

			<section className="dashboard">
			<div className="tabs-wrap">
				<div className="tabs" aria-label="Dashboard sections">
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
									Active brews on the floor. Select a row to load telemetry and
									workflow detail.
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
												aria-selected={batch.batchId === selectedBatchId}
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
									the latest kettle-side telemetry; fermentation uses the full sensor
									set. Click empty canvas to clear.
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
									Select Mash, Boil, Chill, Fermentation, or Telemetry ingest to
									inspect readings tied to that part of the flow.
								</p>
							) : null}
							{selectedFlowStepId && !stepSensorFields(selectedFlowStepId) ? (
								<p className="note">
									{`"${FLOW_STEP_TITLES[selectedFlowStepId]}" has no instrument mapping on this map. Try Mash, Boil, Chill, Fermentation, or Telemetry ingest.`}
								</p>
							) : null}
							{selectedFlowStepId &&
							stepSensorFields(selectedFlowStepId) &&
							!currentReading ? (
								<p className="note">
									No readings for this batch yet. Start fermentation monitoring and
									publish telemetry from Batch Control.
								</p>
							) : null}
							{selectedFlowStepId &&
							stepSensorFields(selectedFlowStepId) &&
							currentReading ? (
								<>
									<p className="step-readings-caption">
										Live values for{' '}
										<strong>{FLOW_STEP_TITLES[selectedFlowStepId]}</strong> (from
										latest fermentation reading)
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
											? `${FLOW_STEP_TITLES[selectedFlowStepId]} has no plotted sensors—pick Mash, Boil, Chill, Fermentation, or Telemetry ingest.`
											: `${readings.length} readings · ${FLOW_STEP_TITLES[selectedFlowStepId]}`}
									</p>
								</div>
							</div>
							<div className="chart-wrap">
								<SensorChart readings={readings} seriesKeys={chartSeriesKeys} />
							</div>
						</section>
					) : null}
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
						<p>Creates a brew workflow and selects it for monitoring.</p>
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
			) : (
				<div className="support-grid">
					<section className="panel stack">
						<div className="section-head">
							<div>
								<h2>Inventory</h2>
								<p>Customer-safe availability</p>
							</div>
							<ShoppingCart size={20} />
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
								<p>Customer-facing ETA and order help</p>
							</div>
							<MessageSquare size={20} />
						</div>
						<div className="chat-log">
							{supportChat.map((message, index) => (
								<p className={message.role} key={`${message.role}-${index}`}>
									{message.text}
								</p>
							))}
						</div>
						<div className="inline">
							<input
								value={supportInput}
								onChange={(event) => setSupportInput(event.target.value)}
							/>
							<button disabled={busy} onClick={() => void sendSupportChat()}>
								<Send size={18} />
							</button>
						</div>
					</section>
				</div>
			)}
			</section>
		</>
	);
}
