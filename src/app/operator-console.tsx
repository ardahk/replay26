"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  LineChart as LineChartIcon,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  ThermometerSun,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { FlowStepId } from "./process-flow";
import type {
  AlarmEvent,
  BatchSummary,
  BrewWorkflowStatus,
  FermentationStatus,
  InventoryItem,
  ManualTask,
  Order,
  SensorReading,
} from "../lib/domain/types";

const SensorChart    = dynamic(() => import("./sensor-chart").then((m) => m.SensorChart),     { ssr: false });
const SensorPanel    = dynamic(() => import("./sensor-panel").then((m) => m.SensorPanel),     { ssr: false });
const ProcessFlow    = dynamic(() => import("./process-flow").then((m) => m.ProcessFlow),     { ssr: false });
const BreweryMap     = dynamic(() => import("./brewery-map").then((m) => m.BreweryMap),       { ssr: false });
const BrewmasterChat = dynamic(() => import("./brewmaster-chat").then((m) => m.BrewmasterChat), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface BatchStatusPayload {
  batchId: string;
  brew?: BrewWorkflowStatus;
  fermentation?: FermentationStatus | null;
  error?: string;
}

interface AgentResponse {
  role: "brewmaster" | "support";
  batchId?: string;
  message: string;
  toolsUsed?: string[];
  pendingAction?: { type: "approve_qa" | "send_signal"; payload: unknown };
  order?: Order;
}

type Tab = "operations" | "map" | "sensors" | "alarms" | "support";
type AttentionPopover = "qa" | "alarms" | null;
type ChatRole = "user" | "agent";
type SensorKey = "temperatureC" | "gravity" | "pH" | "co2Ppm";

interface ChatMessage { role: ChatRole; text: string }

interface StepSensorField {
  key: SensorKey;
  label: string;
  format: (r: SensorReading) => string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const FLOW_STEP_TITLES: Record<FlowStepId, string> = {
  start:        "Start batch",
  mash:         "Mash",
  boil:         "Boil",
  chill:        "Chill",
  fermentation: "Fermentation",
  sensor:       "Telemetry ingest",
  alarms:       "Alarm rules",
  qa:           "Human QA",
  brewmaster:   "Brewmaster agent",
  support:      "Support agent",
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "operations", label: "Operations",  icon: <Gauge size={16} /> },
  { id: "map",        label: "Brewery Map", icon: <MapPin size={16} /> },
  { id: "sensors",    label: "Sensors",     icon: <LineChartIcon size={16} /> },
  { id: "alarms",     label: "Alarms & QA", icon: <AlertTriangle size={16} /> },
  { id: "support",    label: "Support",     icon: <ShoppingCart size={16} /> },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

function fmtTime(value?: string): string {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function fmtStamp(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(s?: string): string {
  return s ? s.replaceAll("_", " ") : "waiting";
}

function shortBatchId(id: string): string {
  return id.length <= 14 ? id : `…${id.slice(-8)}`;
}

function stepSensorFields(stepId: FlowStepId): StepSensorField[] | null {
  const fmt = {
    temp: (r: SensorReading) => `${r.temperatureC}°C`,
    grav: (r: SensorReading) => String(r.gravity),
    ph:   (r: SensorReading) => String(r.pH),
    co2:  (r: SensorReading) => `${r.co2Ppm} ppm`,
  };
  switch (stepId) {
    case "mash":  return [{ key: "temperatureC", label: "Mash tun temperature",    format: fmt.temp }];
    case "boil":  return [{ key: "temperatureC", label: "Boil kettle temperature", format: fmt.temp }];
    case "chill": return [{ key: "temperatureC", label: "Chill temperature",       format: fmt.temp }];
    case "fermentation":
    case "sensor": return [
      { key: "temperatureC", label: "Fermenter temperature", format: fmt.temp },
      { key: "gravity",      label: "Gravity",               format: fmt.grav },
      { key: "pH",           label: "pH",                    format: fmt.ph   },
      { key: "co2Ppm",       label: "CO₂",                  format: fmt.co2  },
    ];
    default: return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function OperatorConsole() {
  const [tab, setTab]                         = useState<Tab>("operations");
  const [beerName, setBeerName]               = useState("Hazy IPA");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batches, setBatches]                 = useState<BatchSummary[]>([]);
  const [status, setStatus]                   = useState<BatchStatusPayload | null>(null);
  const [readings, setReadings]               = useState<SensorReading[]>([]);
  const [alarms, setAlarms]                   = useState<AlarmEvent[]>([]);
  const [tasks, setTasks]                     = useState<ManualTask[]>([]);
  const [inventory, setInventory]             = useState<InventoryItem[]>([]);
  const [busy, setBusy]                       = useState(false);
  const [notice, setNotice]                   = useState("Ready.");
  const [supportChat, setSupportChat]         = useState<ChatMessage[]>([
    { role: "agent", text: "Ask when an order will be ready, or ask what is available." }
  ]);
  const [supportInput, setSupportInput]       = useState("When will Hazy IPA be ready?");
  const [selectedFlowStepId, setSelectedFlowStepId] = useState<FlowStepId | null>(null);
  const [attentionPopover, setAttentionPopover]     = useState<AttentionPopover>(null);

  const brewDialogRef       = useRef<HTMLDialogElement>(null);
  const attentionPopoverRef = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedBatch = useMemo(
    () => batches.find((b) => b.batchId === selectedBatchId),
    [batches, selectedBatchId]
  );
  const batchesSorted = useMemo(
    () => [...batches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [batches]
  );
  const currentReading = status?.fermentation?.latestReading ?? readings.at(-1);
  const pendingTasks   = tasks.filter(
    (t) => t.status === "pending" && (!selectedBatchId || t.batchId === selectedBatchId)
  );
  const chartSeriesKeys = useMemo<SensorKey[] | null>(() => {
    if (!selectedFlowStepId) return null;
    const fields = stepSensorFields(selectedFlowStepId);
    return fields ? fields.map((f) => f.key) : null;
  }, [selectedFlowStepId]);

  const stage  = status?.brew?.stage ?? selectedBatch?.stage;
  const health = status?.fermentation?.health ?? selectedBatch?.status;

  // ── Data refresh ─────────────────────────────────────────────────────────

  const refresh = useCallback(async (selectOverride?: string | null) => {
    const explicit = selectOverride !== undefined;

    const [{ batches: bl }, { tasks: mt }, { inventory: inv }] = await Promise.all([
      fetchJson<{ batches: BatchSummary[] }>("/api/batches"),
      fetchJson<{ tasks: ManualTask[] }>("/api/manual-tasks"),
      fetchJson<{ inventory: InventoryItem[] }>("/api/inventory"),
    ]);
    setBatches(bl);
    setTasks(mt);
    setInventory(inv);

    if (bl.length === 0) {
      setSelectedBatchId(""); setStatus(null); setReadings([]); setAlarms([]); return;
    }

    if (explicit) setSelectedBatchId(selectOverride ?? "");

    let detailId = explicit ? (selectOverride ?? "") : selectedBatchId;

    if (explicit && !detailId) { setStatus(null); setReadings([]); setAlarms([]); return; }

    const known = new Set(bl.map((b) => b.batchId));
    if (!explicit && detailId && !known.has(detailId)) {
      detailId = bl[0]!.batchId;
      setSelectedBatchId(detailId);
    }
    if (!detailId && !explicit) { detailId = bl[0]!.batchId; setSelectedBatchId(detailId); }
    if (!detailId) { setStatus(null); setReadings([]); setAlarms([]); return; }

    const [sp, hp, ap] = await Promise.all([
      fetchJson<BatchStatusPayload>(`/api/batches/${detailId}/status`).catch((e) => ({
        batchId: detailId,
        error: e instanceof Error ? e.message : String(e),
      })),
      fetchJson<{ readings: SensorReading[] }>(`/api/batches/${detailId}/sensor-history`),
      fetchJson<{ alarms: AlarmEvent[] }>(`/api/batches/${detailId}/alarms`),
    ]);
    setStatus(sp); setReadings(hp.readings); setAlarms(ap.alarms);
  }, [selectedBatchId]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const t0 = window.setTimeout(() => void refresh(), 0);
    const ti = window.setInterval(() => void refresh(), 3500);
    return () => { window.clearTimeout(t0); window.clearInterval(ti); };
  }, [refresh]);

  useEffect(() => { setSelectedFlowStepId(null); }, [selectedBatchId]);

  useEffect(() => {
    if (!attentionPopover) return;
    function handler(e: PointerEvent) {
      if (attentionPopoverRef.current && !attentionPopoverRef.current.contains(e.target as Node)) {
        setAttentionPopover(null);
      }
    }
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [attentionPopover]);

  useEffect(() => {
    if (!attentionPopover) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") setAttentionPopover(null); }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [attentionPopover]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(true);
    try { await action(); setNotice(label); await refresh(); }
    catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function startBatch() {
    setBusy(true);
    try {
      const r = await fetchJson<{ batchId: string }>("/api/batches", {
        method: "POST", body: JSON.stringify({ beerName }),
      });
      setNotice("Batch started.");
      brewDialogRef.current?.close();
      await refresh(r.batchId);
    } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function sim(path: string, body: unknown, label: string) {
    if (!selectedBatchId) return;
    await runAction(label, () => fetchJson(path, { method: "POST", body: JSON.stringify(body) }));
  }

  async function approveTask(task: ManualTask) {
    await runAction(`Approved ${task.id}.`, () =>
      fetchJson(`/api/batches/${task.batchId}/qa/${task.id}/approve`, {
        method: "POST", body: JSON.stringify({ note: "Approved from dashboard" }),
      })
    );
  }

  async function sendSupportChat() {
    if (!supportInput.trim()) return;
    const text = supportInput;
    setSupportInput("");
    setSupportChat((m) => [...m, { role: "user", text }]);
    const res = await fetchJson<AgentResponse>("/api/agents/support/chat", {
      method: "POST", body: JSON.stringify({ batchId: selectedBatchId || undefined, message: text }),
    });
    setSupportChat((m) => [...m, { role: "agent", text: res.message }]);
    await refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <header className="topbar">
        <div className="topbar-copy">
          <h1>Brewery Process Console</h1>
          <p>Temporal-orchestrated batch monitoring — start brews, stream telemetry, inspect live workflow state.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => brewDialogRef.current?.showModal()}>
            <Plus size={17} /> Brew new
          </button>
          <a className="topbar-link" href="http://localhost:8233" target="_blank" rel="noreferrer">
            Temporal UI →
          </a>
        </div>
      </header>

      <section className="dashboard">
        {/* ── Tabs ── */}
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "selected" : ""} onClick={() => setTab(t.id)}>
              {t.icon}{t.label}
              {t.id === "alarms" && alarms.length > 0 && (
                <span className="tab-badge">{alarms.length}</span>
              )}
              {t.id === "alarms" && pendingTasks.length > 0 && (
                <span className="tab-badge warn">{pendingTasks.length}</span>
              )}
            </button>
          ))}
          <button type="button" disabled={busy} className="tab-refresh" onClick={() => void refresh()} title="Refresh data">
            <RefreshCw size={15} />
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════
            OPERATIONS TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === "operations" && (
          <>
            <div className={`ops-grid${selectedFlowStepId ? "" : " ops-grid--no-chart"}`}>

              {/* Batch history table */}
              <section className="panel stack ops-area-batches" aria-label="Beers in production">
                <div className="section-head">
                  <div>
                    <h2>Beers in Production</h2>
                    <p>All running batches — click a row to load telemetry and workflow detail.</p>
                  </div>
                </div>
                {batchesSorted.length === 0 ? (
                  <p className="brew-batch-empty">No batches yet. Use <strong>Brew new</strong> to start one.</p>
                ) : (
                  <div className="brew-batch-table-wrap">
                    <table className="brew-batch-table">
                      <thead>
                        <tr>
                          <th>Beer</th>
                          <th>Stage</th>
                          <th>Status</th>
                          <th>Started</th>
                          <th>Updated</th>
                          <th>Alarms</th>
                          <th>QA</th>
                          <th>Batch ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchesSorted.map((batch) => (
                          <tr
                            key={batch.batchId}
                            role="button"
                            tabIndex={busy ? -1 : 0}
                            aria-selected={batch.batchId === selectedBatchId}
                            className={batch.batchId === selectedBatchId ? "brew-batch-row selected" : "brew-batch-row"}
                            onClick={() => { if (!busy) void refresh(batch.batchId); }}
                            onKeyDown={(e) => {
                              if (busy) return;
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void refresh(batch.batchId); }
                            }}
                          >
                            <td><strong>{batch.beerName}</strong></td>
                            <td>{statusLabel(batch.stage)}</td>
                            <td>{statusLabel(batch.status)}</td>
                            <td>{fmtStamp(batch.startedAt)}</td>
                            <td>{fmtStamp(batch.updatedAt)}</td>
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

              {/* Batch control + simulator */}
              <section className="panel stack ops-area-control">
                <div className="section-head">
                  <div>
                    <h2>Batch Control</h2>
                    <p>{notice}</p>
                  </div>
                  <div className="section-head-actions">
                    <button type="button" disabled={busy} onClick={() => void refresh()}>
                      <RefreshCw size={16} />
                    </button>
                    {/* QA & Alarm icon popovers */}
                    <div className="ops-attention-icons" ref={attentionPopoverRef} role="group" aria-label="QA and alarms">
                      <div className="ops-icon-popover-anchor">
                        <button
                          type="button"
                          className={attentionPopover === "qa" ? "ops-icon-trigger ops-icon-trigger-active" : "ops-icon-trigger"}
                          disabled={busy}
                          aria-expanded={attentionPopover === "qa"}
                          title="Manual QA tasks"
                          onClick={() => setAttentionPopover((c) => c === "qa" ? null : "qa")}
                        >
                          <User size={18} aria-hidden />
                          {pendingTasks.length > 0 && <span className="ops-icon-badge">{pendingTasks.length}</span>}
                        </button>
                        {attentionPopover === "qa" && (
                          <div className="ops-attention-popover" role="dialog" aria-label="Manual QA">
                            <div className="ops-attention-popover-head">
                              <strong>Manual QA</strong>
                              <span className="ops-attention-popover-meta">{pendingTasks.length} pending</span>
                            </div>
                            <div className="feed ops-attention-popover-feed">
                              {pendingTasks.length === 0 ? <p className="note">No pending QA tasks.</p> : null}
                              {pendingTasks.map((task) => (
                                <article className="task-item" key={task.id}>
                                  <div>
                                    <strong>{statusLabel(task.reason)}</strong>
                                    <span>{task.id}</span>
                                  </div>
                                  <button disabled={busy} onClick={() => approveTask(task)}>
                                    <CheckCircle2 size={16} /> Approve
                                  </button>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ops-icon-popover-anchor">
                        <button
                          type="button"
                          className={attentionPopover === "alarms" ? "ops-icon-trigger ops-icon-trigger-active" : "ops-icon-trigger"}
                          disabled={busy}
                          aria-expanded={attentionPopover === "alarms"}
                          title="Alarms"
                          onClick={() => setAttentionPopover((c) => c === "alarms" ? null : "alarms")}
                        >
                          <Bell size={18} aria-hidden />
                          {alarms.length > 0 && <span className="ops-icon-badge">{alarms.length}</span>}
                        </button>
                        {attentionPopover === "alarms" && (
                          <div className="ops-attention-popover" role="dialog" aria-label="Alarms">
                            <div className="ops-attention-popover-head">
                              <strong>Alarms</strong>
                              <span className="ops-attention-popover-meta">{alarms.length} total</span>
                            </div>
                            <div className="feed ops-attention-popover-feed">
                              {alarms.length === 0 ? <p className="note">No alarms yet.</p> : null}
                              {alarms.map((a) => (
                                <article className={`feed-item ${a.severity}`} key={a.id}>
                                  <strong>{statusLabel(a.type)}</strong>
                                  <span>{a.message}</span>
                                  <small>{fmtTime(a.timestamp)}</small>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sim-grid">
                  <button disabled={busy || !selectedBatchId}
                    onClick={() => sim(`/api/simulator/${selectedBatchId}/tick`, { scenario: "normal" }, "Normal tick sent.")}>
                    <Activity size={16} /> Normal
                  </button>
                  <button className="warn" disabled={busy || !selectedBatchId}
                    onClick={() => sim(`/api/simulator/${selectedBatchId}/inject`, { kind: "temp_spike" }, "Temp spike injected.")}>
                    <ThermometerSun size={16} /> Temp Spike
                  </button>
                  <button disabled={busy || !selectedBatchId}
                    onClick={() => sim(`/api/simulator/${selectedBatchId}/tick`, { scenario: "stuck_fermentation", tick: 5 }, "Stuck fermentation sent.")}>
                    Stuck
                  </button>
                  <button disabled={busy || !selectedBatchId}
                    onClick={() => sim(`/api/simulator/${selectedBatchId}/inject`, { kind: "crash_recovery" }, "Crash recovery sent.")}>
                    Recovery
                  </button>
                </div>
              </section>

              {/* Status strip */}
              <section className="panel ops-area-status" aria-label="Batch status">
                <div className="status-strip">
                  <div className="status-cell">
                    <span>Stage</span>
                    <strong>{statusLabel(stage)}</strong>
                  </div>
                  <div className="status-cell">
                    <span>Health</span>
                    <strong>{statusLabel(health)}</strong>
                  </div>
                  <div className="status-cell">
                    <span>Updated</span>
                    <strong>{fmtTime(status?.fermentation?.updatedAt ?? status?.brew?.updatedAt ?? selectedBatch?.updatedAt)}</strong>
                  </div>
                  <div className="status-cell">
                    <span>Readings</span>
                    <strong>{status?.fermentation?.readingCount ?? readings.length}</strong>
                  </div>
                </div>
              </section>

              {/* Process flow */}
              <section className="panel flow-panel ops-area-flow">
                <div className="section-head">
                  <div>
                    <h2>Temporal Process Map</h2>
                    <p>
                      Click a step to inspect live sensor readings for that workflow stage.
                      Each node is a Temporal activity, signal, or child workflow. Click the canvas to clear.
                    </p>
                  </div>
                </div>
                <div className="flow-wrap">
                  <ProcessFlow
                    stage={stage}
                    health={health}
                    readingCount={status?.fermentation?.readingCount ?? readings.length}
                    alarmCount={alarms.length}
                    pendingTaskCount={pendingTasks.length}
                    selectedStepId={selectedFlowStepId}
                    onStepSelect={setSelectedFlowStepId}
                  />
                </div>
                <div className="step-readings">
                  {!selectedFlowStepId && (
                    <p className="note step-readings-hint">
                      Select Mash, Boil, Chill, Fermentation, or Telemetry ingest to inspect readings tied to that workflow step.
                    </p>
                  )}
                  {selectedFlowStepId && !stepSensorFields(selectedFlowStepId) && (
                    <p className="note">
                      &ldquo;{FLOW_STEP_TITLES[selectedFlowStepId]}&rdquo; has no instrument mapping. Try Mash, Boil, Chill, Fermentation, or Telemetry ingest.
                    </p>
                  )}
                  {selectedFlowStepId && stepSensorFields(selectedFlowStepId) && !currentReading && (
                    <p className="note">No readings yet. Start a batch and push telemetry from Batch Control.</p>
                  )}
                  {selectedFlowStepId && stepSensorFields(selectedFlowStepId) && currentReading && (
                    <>
                      <p className="step-readings-caption">
                        Live values for <strong>{FLOW_STEP_TITLES[selectedFlowStepId]}</strong>
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
                  )}
                </div>
              </section>

              {/* Sensor chart — only shown when a step is selected */}
              {selectedFlowStepId && (
                <section className="panel chart-panel ops-area-chart">
                  <div className="section-head">
                    <div>
                      <h2>Sensor History</h2>
                      <p>
                        {chartSeriesKeys === null
                          ? `${FLOW_STEP_TITLES[selectedFlowStepId]} has no plotted sensors — pick Mash, Boil, Chill, Fermentation, or Telemetry ingest.`
                          : `${readings.length} readings · ${FLOW_STEP_TITLES[selectedFlowStepId]}`}
                      </p>
                    </div>
                  </div>
                  <div className="chart-wrap">
                    <SensorChart readings={readings} seriesKeys={chartSeriesKeys} />
                  </div>
                </section>
              )}
            </div>

            {/* Brew new modal */}
            <dialog
              ref={brewDialogRef}
              className="brew-modal"
              onClick={(e) => { if (e.target === e.currentTarget) brewDialogRef.current?.close(); }}
            >
              <form
                className="modal-panel"
                onSubmit={(e) => { e.preventDefault(); void startBatch(); }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Start new batch</h3>
                <p>Creates a Temporal WorkflowRun and selects it for monitoring.</p>
                <label className="field-label" htmlFor="brew-modal-name">Beer name</label>
                <input
                  id="brew-modal-name"
                  value={beerName}
                  onChange={(e) => setBeerName(e.target.value)}
                  autoComplete="off"
                />
                <div className="modal-actions">
                  <button type="button" onClick={() => brewDialogRef.current?.close()}>Cancel</button>
                  <button type="submit" className="primary" disabled={busy}>
                    <FlaskConical size={16} /> Start batch
                  </button>
                </div>
              </form>
            </dialog>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            BREWERY MAP TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === "map" && (
          <div className="map-grid">
            <div className="status-strip map-strip">
              <div className="status-cell"><span>Beer</span><strong>{selectedBatch?.beerName ?? "—"}</strong></div>
              <div className="status-cell"><span>Stage</span><strong>{statusLabel(stage)}</strong></div>
              <div className="status-cell">
                <span>Health</span>
                <strong className={health === "needs_attention" ? "warn-text" : ""}>{statusLabel(health)}</strong>
              </div>
              <div className="status-cell"><span>Temp</span><strong>{currentReading ? `${currentReading.temperatureC}°C` : "n/a"}</strong></div>
              <div className="status-cell"><span>Gravity</span><strong>{currentReading?.gravity ?? "n/a"}</strong></div>
              <div className="status-cell"><span>pH</span><strong>{currentReading?.pH ?? "n/a"}</strong></div>
              <div className="status-cell"><span>CO₂</span><strong>{currentReading ? `${currentReading.co2Ppm}ppm` : "n/a"}</strong></div>
              <div className="status-cell">
                <span>Alarms</span>
                <strong className={alarms.length > 0 ? "warn-text" : ""}>{alarms.length}</strong>
              </div>
            </div>

            <section className="panel map-panel">
              <div className="section-head">
                <div>
                  <h2>Brewery Warehouse</h2>
                  <p>Live sensor positions and equipment status — colour reflects current Temporal workflow stage</p>
                </div>
                <MapPin size={18} />
              </div>
              <BreweryMap stage={stage} health={health} currentReading={currentReading} alarms={alarms} />
            </section>

            <section className="panel stack">
              <div className="section-head">
                <div><h2>Active Batch</h2><p>Select a batch to highlight on the map</p></div>
              </div>
              <select value={selectedBatchId} onChange={(e) => { setSelectedBatchId(e.target.value); void refresh(e.target.value); }}>
                <option value="">No batch selected</option>
                {batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>{b.beerName} / {b.batchId}</option>
                ))}
              </select>
              {selectedBatch && (
                <div className="feed">
                  <article className="feed-item"><strong>Started</strong><span>{fmtStamp(selectedBatch.startedAt)}</span></article>
                  <article className={`feed-item ${(selectedBatch.alarmCount ?? 0) > 0 ? "warning" : ""}`}>
                    <strong>Alarms</strong><span>{selectedBatch.alarmCount ?? 0}</span>
                  </article>
                  <article className={`feed-item ${(selectedBatch.pendingTaskCount ?? 0) > 0 ? "warning" : ""}`}>
                    <strong>Pending QA</strong><span>{selectedBatch.pendingTaskCount ?? 0}</span>
                  </article>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SENSORS TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === "sensors" && (
          <div className="sensors-grid">
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Sensor Data — {selectedBatch?.beerName ?? "No batch selected"}</h2>
                  <p>Click sensor cards to show/hide chart lines · Adjust the time window with the range buttons</p>
                </div>
              </div>
              <SensorPanel readings={readings} />
            </section>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            ALARMS & QA TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === "alarms" && (
          <div className="alarms-grid">
            <section className="panel stack">
              <div className="section-head">
                <div><h2>Alarms</h2><p>{alarms.length} total</p></div>
                <AlertTriangle size={20} />
              </div>
              <div className="feed">
                {alarms.length === 0 ? <p className="note">No alarms yet.</p> : null}
                {alarms.map((a) => (
                  <article className={`feed-item ${a.severity}`} key={a.id}>
                    <strong>{statusLabel(a.type)}</strong>
                    <span>{a.message}</span>
                    <small>{fmtTime(a.timestamp)}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel stack">
              <div className="section-head">
                <div><h2>Manual QA</h2><p>{pendingTasks.length} pending</p></div>
                <ClipboardCheck size={20} />
              </div>
              <div className="feed">
                {pendingTasks.length === 0 ? <p className="note">No pending QA tasks.</p> : null}
                {pendingTasks.map((task) => (
                  <article className="task-item" key={task.id}>
                    <div>
                      <strong>{statusLabel(task.reason)}</strong>
                      <span>{task.id}</span>
                    </div>
                    <button disabled={busy} onClick={() => approveTask(task)}>
                      <CheckCircle2 size={16} /> Approve
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SUPPORT TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === "support" && (
          <div className="support-grid">
            <section className="panel stack">
              <div className="section-head">
                <div><h2>Inventory</h2><p>Customer-safe availability</p></div>
                <ShoppingCart size={20} />
              </div>
              <div className="feed">
                {inventory.map((item) => (
                  <article className="inventory-item" key={item.sku}>
                    <strong>{item.productName}</strong>
                    <span>{item.quantity} {item.unit}{item.quantity === 1 ? "" : "s"} available</span>
                    <small>{item.sku}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel chat-panel support-chat">
              <div className="section-head">
                <div><h2>Support Agent</h2><p>Customer-facing ETA and order help</p></div>
                <MessageSquare size={20} />
              </div>
              <div className="chat-log">
                {supportChat.map((m, i) => (
                  <p className={m.role} key={`${m.role}-${i}`}>{m.text}</p>
                ))}
              </div>
              <div className="inline">
                <input
                  value={supportInput}
                  onChange={(e) => setSupportInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void sendSupportChat(); }}
                />
                <button disabled={busy} onClick={() => void sendSupportChat()}>
                  <Send size={16} />
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ── Floating Brewmaster Chat (always present) ── */}
        <BrewmasterChat batchId={selectedBatchId} />
      </section>
    </>
  );
}
