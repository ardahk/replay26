import type { AlarmEvent, ManualTask } from "../domain/types";

/**
 * Optional integration hook: POST JSON when alarms fire or manual QA tasks are created.
 * Set ALARM_WEBHOOK_URL in the Temporal worker environment (same machine as `pnpm temporal:worker`).
 */
export async function postAlarmWebhook(alarm: AlarmEvent): Promise<void> {
  const url = process.env.ALARM_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "alarm",
        severity: alarm.severity,
        batchId: alarm.batchId,
        type: alarm.type,
        message: alarm.message,
        readingId: alarm.readingId,
        timestamp: alarm.timestamp,
        id: alarm.id
      })
    });
    if (!res.ok) {
      console.error("[notifications] webhook alarm HTTP", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("[notifications] webhook alarm failed", error);
  }
}

export async function postManualTaskWebhook(task: ManualTask): Promise<void> {
  const url = process.env.ALARM_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "manual_task",
        batchId: task.batchId,
        id: task.id,
        kind: task.kind,
        reason: task.reason,
        status: task.status,
        createdAt: task.createdAt
      })
    });
    if (!res.ok) {
      console.error("[notifications] webhook task HTTP", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("[notifications] webhook task failed", error);
  }
}
