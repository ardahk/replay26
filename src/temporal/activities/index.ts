import { appendJsonl } from "../../runtime/jsonl";
import type { AlarmEvent, ManualTask, SensorReading } from "../../lib/domain/types";

export interface BatchEvent {
  batchId: string;
  type: string;
  message: string;
  timestamp: string;
}

export async function recordBatchEvent(event: BatchEvent): Promise<void> {
  await appendJsonl("events", event);
}

export async function recordSensorReading(reading: SensorReading): Promise<void> {
  await appendJsonl("readings", reading);
}

export async function recordAlarm(alarm: AlarmEvent): Promise<void> {
  await appendJsonl("alarms", alarm);
}

export async function createManualTask(task: ManualTask): Promise<void> {
  await appendJsonl("manual_tasks", task);
}

export async function sendAlarmNotification(alarm: AlarmEvent): Promise<void> {
  console.log(`[ALARM:${alarm.severity}] ${alarm.batchId} ${alarm.type}: ${alarm.message}`);
}
