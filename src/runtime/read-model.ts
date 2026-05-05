import type {
  AlarmEvent,
  BatchEvent,
  BatchSummary,
  BrewStage,
  InventoryItem,
  ManualTask,
  Order,
  SensorReading
} from "../lib/domain/types";
import { readJsonl } from "./jsonl";

function stageFromEvent(type: string): BrewStage | undefined {
  if (type === "stage_mash") return "mash";
  if (type === "stage_boil") return "boil";
  if (type === "stage_chill") return "chill";
  if (type === "fermentation_handoff" || type === "fermentation_started") return "fermentation";
  if (type === "batch_started") return "queued";
  return undefined;
}

export async function getBatchEvents(batchId?: string): Promise<BatchEvent[]> {
  const events = await readJsonl<BatchEvent>("events");
  return batchId ? events.filter((event) => event.batchId === batchId) : events;
}

export async function getSensorHistory(batchId: string): Promise<SensorReading[]> {
  const readings = await readJsonl<SensorReading>("readings");
  return readings.filter((reading) => reading.batchId === batchId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getAlarms(batchId?: string): Promise<AlarmEvent[]> {
  const alarms = await readJsonl<AlarmEvent>("alarms");
  const filtered = batchId ? alarms.filter((alarm) => alarm.batchId === batchId) : alarms;
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getManualTasks(batchId?: string): Promise<ManualTask[]> {
  const [tasks, events] = await Promise.all([readJsonl<ManualTask>("manual_tasks"), getBatchEvents(batchId)]);
  const approvals = new Map(
    events
      .filter((event) => event.type === "qa_approved")
      .map((event) => {
        const [taskId] = event.message.split(" ");
        return [taskId, event] as const;
      })
  );

  return tasks
    .filter((task) => !batchId || task.batchId === batchId)
    .map((task) => {
      const approval = approvals.get(task.id);
      return approval
        ? {
            ...task,
            status: "approved" as const,
            approvedAt: approval.timestamp,
            note: approval.message.includes(": ") ? approval.message.split(": ").slice(1).join(": ") : task.note
          }
        : task;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBatchSummaries(): Promise<BatchSummary[]> {
  const [events, readings, alarms, tasks] = await Promise.all([
    getBatchEvents(),
    readJsonl<SensorReading>("readings"),
    readJsonl<AlarmEvent>("alarms"),
    getManualTasks()
  ]);
  const byBatch = new Map<string, BatchSummary>();

  for (const event of events) {
    const existing = byBatch.get(event.batchId);
    const eventStage = stageFromEvent(event.type);
    byBatch.set(event.batchId, {
      batchId: event.batchId,
      beerName: event.beerName ?? existing?.beerName ?? event.message.replace(" brew day started", "") ?? "Unnamed recipe",
      status: existing?.status ?? "running",
      stage: eventStage ?? existing?.stage ?? "queued",
      startedAt: existing?.startedAt ?? event.timestamp,
      updatedAt: event.timestamp,
      latestReading: existing?.latestReading,
      alarmCount: existing?.alarmCount ?? 0,
      pendingTaskCount: existing?.pendingTaskCount ?? 0
    });
  }

  for (const reading of readings) {
    const existing = byBatch.get(reading.batchId);
    if (!existing || reading.timestamp >= (existing.latestReading?.timestamp ?? "")) {
      byBatch.set(reading.batchId, {
        batchId: reading.batchId,
        beerName: existing?.beerName ?? "Unnamed recipe",
        status: existing?.status ?? "running",
        stage: existing?.stage ?? "fermentation",
        startedAt: existing?.startedAt ?? reading.timestamp,
        updatedAt: reading.timestamp,
        latestReading: reading,
        alarmCount: existing?.alarmCount ?? 0,
        pendingTaskCount: existing?.pendingTaskCount ?? 0
      });
    }
  }

  for (const summary of byBatch.values()) {
    const batchAlarms = alarms.filter((alarm) => alarm.batchId === summary.batchId);
    const pendingTasks = tasks.filter((task) => task.batchId === summary.batchId && task.status === "pending");
    summary.alarmCount = batchAlarms.length;
    summary.pendingTaskCount = pendingTasks.length;
    summary.status = pendingTasks.length > 0 || batchAlarms.some((alarm) => alarm.severity === "critical") ? "needs_attention" : "running";
  }

  return [...byBatch.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getInventory(): Promise<InventoryItem[]> {
  const items = await readJsonl<InventoryItem>("inventory");
  if (items.length > 0) return items;
  return [
    { sku: "HAZY-IPA-CASE", productName: "Hazy IPA", quantity: 18, unit: "case", updatedAt: new Date().toISOString() },
    { sku: "PILSNER-KEG", productName: "Pilsner", quantity: 6, unit: "keg", updatedAt: new Date().toISOString() }
  ];
}

export async function getOrders(): Promise<Order[]> {
  return readJsonl<Order>("orders");
}
