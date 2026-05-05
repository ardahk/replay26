import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  sleep
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { detectAlarmDrafts, hasPendingTask } from "../../lib/domain/alarms";
import type {
  AlarmEvent,
  ApproveQaInput,
  BatchStatus,
  FermentationStatus,
  ManualOverrideInput,
  ManualTask,
  SensorReading,
  StartBatchInput
} from "../../lib/domain/types";

const activity = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 3 }
});

/** Wall-clock waits between fermentation milestones (demo pacing). Skip early with the complete-fermentation signal. */
const FERMENTATION_PHASES = [
  { duration: "12 minutes" as const, type: "fermentation_primary", detail: "primary fermentation" },
  { duration: "10 minutes" as const, type: "fermentation_diacetyl_rest", detail: "diacetyl rest" },
  { duration: "8 minutes" as const, type: "fermentation_cold_crash", detail: "cold crash" }
] as const;

const AUTO_PACKAGE_CASES = 12;

export const sensorReadingSignal = defineSignal<[SensorReading]>("sensorReading");
export const manualOverrideSignal = defineSignal<[ManualOverrideInput]>("manualOverride");
export const approveQaSignal = defineSignal<[ApproveQaInput]>("approveQa");
export const completeFermentationSignal = defineSignal("completeFermentation");
export const getFermentationStatus = defineQuery<FermentationStatus>("getFermentationStatus");

export async function fermentationMonitorWorkflow(input: StartBatchInput): Promise<void> {
  const readings: SensorReading[] = [];
  const alarms: AlarmEvent[] = [];
  const tasks: ManualTask[] = [];
  let alarmCounter = 0;
  let taskCounter = 0;
  let tempExcursionCount = 0;
  let updatedAt = input.startedAt;
  let monitoringComplete = false;

  const health = (): BatchStatus => {
    if (tasks.some((task) => task.status === "pending")) return "needs_attention";
    if (alarms.some((alarm) => alarm.severity === "critical")) return "needs_attention";
    return "running";
  };

  const makeAlarm = (draft: Omit<AlarmEvent, "id" | "timestamp">, timestamp: string): AlarmEvent => ({
    ...draft,
    id: `alarm-${input.batchId}-${++alarmCounter}`,
    timestamp
  });

  const makeTask = (reason: string, timestamp: string): ManualTask => ({
    id: `task-${input.batchId}-${++taskCounter}`,
    batchId: input.batchId,
    kind: "qa_checkpoint",
    reason,
    status: "pending",
    createdAt: timestamp
  });

  setHandler(getFermentationStatus, () => ({
    batchId: input.batchId,
    beerName: input.beerName,
    health: health(),
    latestReading: readings.at(-1),
    readingCount: readings.length,
    alarms,
    pendingTasks: tasks.filter((task) => task.status === "pending"),
    updatedAt
  }));

  setHandler(sensorReadingSignal, async (reading) => {
    readings.push(reading);
    updatedAt = reading.timestamp;
    await activity.recordSensorReading(reading);

    const drafts = detectAlarmDrafts(reading, readings.slice(0, -1));
    if (drafts.some((draft) => draft.type === "temp_excursion")) {
      tempExcursionCount += 1;
    }

    for (const draft of drafts) {
      if (alarms.some((alarm) => alarm.type === draft.type)) continue;
      const alarm = makeAlarm(draft, reading.timestamp);
      alarms.push(alarm);
      await activity.recordAlarm(alarm);
      await activity.sendAlarmNotification(alarm);
    }

    if (tempExcursionCount >= 2 && !hasPendingTask(tasks, "repeated_temp_excursion")) {
      const task = makeTask("repeated_temp_excursion", reading.timestamp);
      tasks.push(task);
      await activity.createManualTask(task);
      await activity.sendManualTaskNotification(task);
    }

    if (drafts.some((draft) => draft.type === "gravity_plateau") && !hasPendingTask(tasks, "gravity_plateau")) {
      const task = makeTask("gravity_plateau", reading.timestamp);
      tasks.push(task);
      await activity.createManualTask(task);
      await activity.sendManualTaskNotification(task);
    }
  });

  setHandler(manualOverrideSignal, async (override) => {
    updatedAt = new Date(Date.now()).toISOString();
    await activity.recordBatchEvent({
      batchId: input.batchId,
      type: "manual_override",
      message: override.note,
      timestamp: updatedAt,
      beerName: input.beerName
    });
  });

  setHandler(approveQaSignal, async (approval) => {
    updatedAt = new Date(Date.now()).toISOString();
    const task = tasks.find((item) => item.id === approval.taskId);
    if (!task) return;
    task.status = "approved";
    task.approvedAt = updatedAt;
    task.note = approval.note;
    await activity.recordBatchEvent({
      batchId: input.batchId,
      type: "qa_approved",
      message: `${approval.taskId} approved${approval.note ? `: ${approval.note}` : ""}`,
      timestamp: updatedAt,
      beerName: input.beerName
    });
  });

  setHandler(completeFermentationSignal, () => {
    monitoringComplete = true;
  });

  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "fermentation_started",
    message: `${input.beerName} entered fermentation monitoring`,
    timestamp: input.startedAt,
    beerName: input.beerName
  });

  for (const phase of FERMENTATION_PHASES) {
    if (monitoringComplete) break;
    await Promise.race([sleep(phase.duration), condition(() => monitoringComplete)]);
    if (monitoringComplete) break;
    updatedAt = new Date().toISOString();
    await activity.recordBatchEvent({
      batchId: input.batchId,
      type: phase.type,
      message: `${input.beerName} · ${phase.detail}`,
      timestamp: updatedAt,
      beerName: input.beerName
    });
  }

  updatedAt = new Date().toISOString();
  await activity.adjustPackagedInventory({
    productName: input.beerName,
    quantityDelta: AUTO_PACKAGE_CASES,
    unit: "case",
    sourceBatchId: input.batchId
  });
  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "packaging_recorded",
    message: `${input.beerName} packaged (+${AUTO_PACKAGE_CASES} cases from this batch)`,
    timestamp: updatedAt,
    beerName: input.beerName
  });
  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "fermentation_monitoring_complete",
    message: `${input.beerName} fermentation monitoring finished`,
    timestamp: updatedAt,
    beerName: input.beerName
  });
}
