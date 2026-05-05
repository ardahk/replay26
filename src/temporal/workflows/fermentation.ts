import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler
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

export const sensorReadingSignal = defineSignal<[SensorReading]>("sensorReading");
export const manualOverrideSignal = defineSignal<[ManualOverrideInput]>("manualOverride");
export const approveQaSignal = defineSignal<[ApproveQaInput]>("approveQa");
export const getFermentationStatus = defineQuery<FermentationStatus>("getFermentationStatus");

export async function fermentationMonitorWorkflow(input: StartBatchInput): Promise<void> {
  const readings: SensorReading[] = [];
  const alarms: AlarmEvent[] = [];
  const tasks: ManualTask[] = [];
  let alarmCounter = 0;
  let taskCounter = 0;
  let updatedAt = input.startedAt;

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
    for (const draft of drafts) {
      const alarm = makeAlarm(draft, reading.timestamp);
      alarms.push(alarm);
      await activity.recordAlarm(alarm);
      await activity.sendAlarmNotification(alarm);
    }

    const tempExcursions = alarms.filter((alarm) => alarm.type === "temp_excursion").length;
    if (tempExcursions >= 2 && !hasPendingTask(tasks, "repeated_temp_excursion")) {
      const task = makeTask("repeated_temp_excursion", reading.timestamp);
      tasks.push(task);
      await activity.createManualTask(task);
    }

    if (drafts.some((draft) => draft.type === "gravity_plateau") && !hasPendingTask(tasks, "gravity_plateau")) {
      const task = makeTask("gravity_plateau", reading.timestamp);
      tasks.push(task);
      await activity.createManualTask(task);
    }
  });

  setHandler(manualOverrideSignal, async (override) => {
    updatedAt = new Date(Date.now()).toISOString();
    await activity.recordBatchEvent({
      batchId: input.batchId,
      type: "manual_override",
      message: override.note,
      timestamp: updatedAt
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
      timestamp: updatedAt
    });
  });

  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "fermentation_started",
    message: `${input.beerName} entered fermentation monitoring`,
    timestamp: input.startedAt
  });

  await condition(() => false);
}
