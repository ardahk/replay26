"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  MessageSquare,
  RefreshCw,
  Send,
  ShoppingCart,
  ThermometerSun
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  AlarmEvent,
  BatchSummary,
  BrewWorkflowStatus,
  FermentationStatus,
  InventoryItem,
  ManualTask,
  Order,
  SensorReading
} from "../lib/domain/types";

const SensorChart = dynamic(() => import("./sensor-chart").then((module) => module.SensorChart), {
  ssr: false
});

const ProcessFlow = dynamic(() => import("./process-flow").then((module) => module.ProcessFlow), {
  ssr: false
});

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
  pendingAction?: {
    type: "approve_qa" | "send_signal";
    payload: unknown;
  };
  order?: Order;
}

type Tab = "operations" | "support";
type ChatRole = "user" | "agent";

interface ChatMessage {
  role: ChatRole;
  text: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? response.statusText);
  return json;
}

function formatTime(value?: string): string {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function statusLabel(status?: string): string {
  return status ? status.replaceAll("_", " ") : "waiting";
}

export function OperatorConsole() {
  const [tab, setTab] = useState<Tab>("operations");
  const [beerName, setBeerName] = useState("Hazy IPA");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [status, setStatus] = useState<BatchStatusPayload | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [tasks, setTasks] = useState<ManualTask[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Ready.");
  const [brewChat, setBrewChat] = useState<ChatMessage[]>([
    { role: "agent", text: "Ask me what is happening with the current batch." }
  ]);
  const [brewInput, setBrewInput] = useState("Should I be worried?");
  const [pendingBrewAction, setPendingBrewAction] = useState<AgentResponse["pendingAction"]>();
  const [supportChat, setSupportChat] = useState<ChatMessage[]>([
    { role: "agent", text: "Ask when an order will be ready, or ask what is available." }
  ]);
  const [supportInput, setSupportInput] = useState("When will Hazy IPA be ready?");

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.batchId === selectedBatchId),
    [batches, selectedBatchId]
  );
  const currentReading = status?.fermentation?.latestReading ?? readings.at(-1);
  const pendingTasks = tasks.filter((task) => task.status === "pending" && (!selectedBatchId || task.batchId === selectedBatchId));

  const refresh = useCallback(
    async (batchId = selectedBatchId) => {
      const [{ batches: batchList }, { tasks: manualTasks }, { inventory: inventoryItems }] = await Promise.all([
        fetchJson<{ batches: BatchSummary[] }>("/api/batches"),
        fetchJson<{ tasks: ManualTask[] }>("/api/manual-tasks"),
        fetchJson<{ inventory: InventoryItem[] }>("/api/inventory")
      ]);
      setBatches(batchList);
      setTasks(manualTasks);
      setInventory(inventoryItems);

      const nextBatchId = batchId || batchList[0]?.batchId || "";
      if (!selectedBatchId && nextBatchId) setSelectedBatchId(nextBatchId);
      if (!nextBatchId) return;

      const [statusPayload, historyPayload, alarmPayload] = await Promise.all([
        fetchJson<BatchStatusPayload>(`/api/batches/${nextBatchId}/status`).catch((error) => ({
          batchId: nextBatchId,
          error: error instanceof Error ? error.message : String(error)
        })),
        fetchJson<{ readings: SensorReading[] }>(`/api/batches/${nextBatchId}/sensor-history`),
        fetchJson<{ alarms: AlarmEvent[] }>(`/api/batches/${nextBatchId}/alarms`)
      ]);
      setStatus(statusPayload);
      setReadings(historyPayload.readings);
      setAlarms(alarmPayload.alarms);
    },
    [selectedBatchId]
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

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
    await runAction("Batch started.", async () => {
      const result = await fetchJson<{ batchId: string }>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ beerName })
      });
      setSelectedBatchId(result.batchId);
    });
  }

  async function simulator(path: string, body: unknown, label: string) {
    if (!selectedBatchId) return;
    await runAction(label, async () => {
      await fetchJson(path, { method: "POST", body: JSON.stringify(body) });
    });
  }

  async function approveTask(task: ManualTask) {
    await runAction(`Approved ${task.id}.`, async () => {
      await fetchJson(`/api/batches/${task.batchId}/qa/${task.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: "Approved from dashboard" })
      });
    });
  }

  async function sendBrewChat(confirm = false) {
    if (!brewInput.trim() && !confirm) return;
    const text = confirm ? "Confirm action" : brewInput;
    if (!confirm) setBrewChat((items) => [...items, { role: "user", text }]);
    setBrewInput("");
    const response = await fetchJson<AgentResponse>("/api/agents/brewmaster/chat", {
      method: "POST",
      body: JSON.stringify({
        batchId: selectedBatchId || undefined,
        message: text,
        pendingAction: pendingBrewAction,
        confirm
      })
    });
    setPendingBrewAction(response.pendingAction);
    setBrewChat((items) => [...items, { role: "agent", text: response.message }]);
    if (confirm) {
      setPendingBrewAction(undefined);
      await refresh();
    }
  }

  async function sendSupportChat() {
    if (!supportInput.trim()) return;
    const text = supportInput;
    setSupportInput("");
    setSupportChat((items) => [...items, { role: "user", text }]);
    const response = await fetchJson<AgentResponse>("/api/agents/support/chat", {
      method: "POST",
      body: JSON.stringify({ batchId: selectedBatchId || undefined, message: text })
    });
    setSupportChat((items) => [...items, { role: "agent", text: response.message }]);
    await refresh();
  }

  return (
    <section className="dashboard">
      <div className="tabs" aria-label="Dashboard sections">
        <button className={tab === "operations" ? "selected" : ""} onClick={() => setTab("operations")}>
          <Gauge size={18} />
          Operations
        </button>
        <button className={tab === "support" ? "selected" : ""} onClick={() => setTab("support")}>
          <ShoppingCart size={18} />
          Support
        </button>
      </div>

      {tab === "operations" ? (
        <div className="ops-grid">
          <section className="panel stack">
            <div className="section-head">
              <div>
                <h2>Batch Control</h2>
                <p>{notice}</p>
              </div>
              <button disabled={busy} onClick={() => refresh()}>
                <RefreshCw size={18} />
              </button>
            </div>

            <label className="note" htmlFor="beer-name">
              Beer name
            </label>
            <div className="inline">
              <input id="beer-name" value={beerName} onChange={(event) => setBeerName(event.target.value)} />
              <button className="primary" disabled={busy} onClick={startBatch}>
                <FlaskConical size={18} />
                Start
              </button>
            </div>

            <label className="note" htmlFor="batch-select">
              Active batch
            </label>
            <select
              id="batch-select"
              value={selectedBatchId}
              onChange={(event) => {
                setSelectedBatchId(event.target.value);
                void refresh(event.target.value);
              }}
            >
              <option value="">No batch selected</option>
              {batches.map((batch) => (
                <option key={batch.batchId} value={batch.batchId}>
                  {batch.beerName} / {batch.batchId}
                </option>
              ))}
            </select>

            <div className="sim-grid">
              <button
                disabled={busy || !selectedBatchId}
                onClick={() => simulator(`/api/simulator/${selectedBatchId}/tick`, { scenario: "normal" }, "Normal tick sent.")}
              >
                <Activity size={18} />
                Normal
              </button>
              <button
                className="warn"
                disabled={busy || !selectedBatchId}
                onClick={() => simulator(`/api/simulator/${selectedBatchId}/inject`, { kind: "temp_spike" }, "Temperature spike injected.")}
              >
                <ThermometerSun size={18} />
                Temp Spike
              </button>
              <button
                disabled={busy || !selectedBatchId}
                onClick={() =>
                  simulator(`/api/simulator/${selectedBatchId}/tick`, { scenario: "stuck_fermentation", tick: 5 }, "Stuck fermentation reading sent.")
                }
              >
                Stuck
              </button>
              <button
                disabled={busy || !selectedBatchId}
                onClick={() => simulator(`/api/simulator/${selectedBatchId}/inject`, { kind: "crash_recovery" }, "Crash recovery reading sent.")}
              >
                Recovery
              </button>
            </div>
          </section>

          <section className="panel status-board">
            <div className="metric">
              <span>Stage</span>
              <strong>{statusLabel(status?.brew?.stage ?? selectedBatch?.stage)}</strong>
            </div>
            <div className="metric">
              <span>Health</span>
              <strong>{statusLabel(status?.fermentation?.health ?? selectedBatch?.status)}</strong>
            </div>
            <div className="metric">
              <span>Updated</span>
              <strong>{formatTime(status?.fermentation?.updatedAt ?? status?.brew?.updatedAt ?? selectedBatch?.updatedAt)}</strong>
            </div>
            <div className="metric">
              <span>Readings</span>
              <strong>{status?.fermentation?.readingCount ?? readings.length}</strong>
            </div>
            <div className="sensor-strip">
              <div>
                <span>Temp</span>
                <strong>{currentReading ? `${currentReading.temperatureC}C` : "n/a"}</strong>
              </div>
              <div>
                <span>Gravity</span>
                <strong>{currentReading?.gravity ?? "n/a"}</strong>
              </div>
              <div>
                <span>pH</span>
                <strong>{currentReading?.pH ?? "n/a"}</strong>
              </div>
              <div>
                <span>CO2</span>
                <strong>{currentReading ? `${currentReading.co2Ppm}ppm` : "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="panel flow-panel">
            <div className="section-head">
              <div>
                <h2>Process Map</h2>
                <p>Temporal workflow, signals, alarms, QA, and agents</p>
              </div>
            </div>
            <div className="flow-wrap">
              <ProcessFlow
                stage={status?.brew?.stage ?? selectedBatch?.stage}
                health={status?.fermentation?.health ?? selectedBatch?.status}
                readingCount={status?.fermentation?.readingCount ?? readings.length}
                alarmCount={alarms.length}
                pendingTaskCount={pendingTasks.length}
              />
            </div>
          </section>

          <section className="panel chart-panel">
            <div className="section-head">
              <div>
                <h2>Sensor History</h2>
                <p>{readings.length} readings</p>
              </div>
            </div>
            <div className="chart-wrap">
              <SensorChart readings={readings} />
            </div>
          </section>

          <section className="panel stack">
            <div className="section-head">
              <div>
                <h2>Alarms</h2>
                <p>{alarms.length} total</p>
              </div>
              <AlertTriangle size={20} />
            </div>
            <div className="feed">
              {alarms.length === 0 ? <p className="note">No alarms yet.</p> : null}
              {alarms.map((alarm) => (
                <article className={`feed-item ${alarm.severity}`} key={alarm.id}>
                  <strong>{statusLabel(alarm.type)}</strong>
                  <span>{alarm.message}</span>
                  <small>{formatTime(alarm.timestamp)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <div className="section-head">
              <div>
                <h2>Manual QA</h2>
                <p>{pendingTasks.length} pending</p>
              </div>
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
                    <CheckCircle2 size={18} />
                    Approve
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel chat-panel">
            <div className="section-head">
              <div>
                <h2>Brewmaster</h2>
                <p>Operator-facing workflow tools</p>
              </div>
              <Bot size={20} />
            </div>
            <div className="chat-log">
              {brewChat.map((message, index) => (
                <p className={message.role} key={`${message.role}-${index}`}>
                  {message.text}
                </p>
              ))}
            </div>
            {pendingBrewAction ? (
              <button className="primary" disabled={busy || !selectedBatchId} onClick={() => void sendBrewChat(true)}>
                Confirm Agent Action
              </button>
            ) : null}
            <div className="inline">
              <input value={brewInput} onChange={(event) => setBrewInput(event.target.value)} />
              <button disabled={busy} onClick={() => void sendBrewChat()}>
                <Send size={18} />
              </button>
            </div>
          </section>
        </div>
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
                    {item.quantity === 1 ? "" : "s"} available
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
              <input value={supportInput} onChange={(event) => setSupportInput(event.target.value)} />
              <button disabled={busy} onClick={() => void sendSupportChat()}>
                <Send size={18} />
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
