import { appendJsonl } from "../../runtime/jsonl";
import { distributeOrderInventory } from "../../runtime/order-distribution";
import { getInventory } from "../../runtime/read-model";
import type {
  AlarmEvent,
  BatchEvent,
  InventoryItem,
  ManualTask,
  Order,
  PackagedStockAdjustment,
  SensorReading
} from "../../lib/domain/types";
import { postAlarmWebhook, postManualTaskWebhook } from "../../lib/notifications/outbound";

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
  await postAlarmWebhook(alarm);
}

export async function sendManualTaskNotification(task: ManualTask): Promise<void> {
  console.log(`[QA TASK] ${task.batchId} ${task.reason} (${task.id})`);
  await postManualTaskWebhook(task);
}

/** One allocation attempt; persists merged order row for the read model. */
export async function processOrderFulfillmentAttempt(order: Order): Promise<Order> {
  const next = await distributeOrderInventory(order);
  const updatedAt = new Date().toISOString();
  await appendJsonl("orders", { ...next, updatedAt });
  return { ...next, updatedAt };
}

/** Add or subtract packaged units; creates a catalog line if this beer name is new. */
export async function adjustPackagedInventory(
  input: PackagedStockAdjustment
): Promise<{ sku: string; quantity: number }> {
  const inventory = await getInventory();
  const nameLower = input.productName.trim().toLowerCase();
  const skuFilter = input.sku?.trim().toLowerCase();
  const match = inventory.find((item) => {
    if (skuFilter && item.sku.toLowerCase() === skuFilter) return true;
    return item.productName.toLowerCase() === nameLower;
  });

  const now = new Date().toISOString();
  const unit: InventoryItem["unit"] = input.unit ?? match?.unit ?? "case";

  if (!match) {
    const sku =
      input.sku?.trim() ||
      `${input.productName.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${unit.toUpperCase()}`;
    const quantity = Math.max(0, input.quantityDelta);
    const row: InventoryItem = {
      sku,
      productName: input.productName.trim(),
      quantity,
      unit,
      batchId: input.sourceBatchId,
      updatedAt: now
    };
    await appendJsonl("inventory", row);
    return { sku, quantity };
  }

  const nextQty = Math.max(0, match.quantity + input.quantityDelta);
  await appendJsonl("inventory", {
    ...match,
    quantity: nextQty,
    updatedAt: now,
    batchId: input.sourceBatchId ?? match.batchId
  });
  return { sku: match.sku, quantity: nextQty };
}
