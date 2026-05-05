import { randomUUID } from "node:crypto";
import { Client, Connection } from "@temporalio/client";
import type {
  BrewWorkflowStatus,
  FermentationStatus,
  Order,
  PackagedStockAdjustment,
  SensorReading,
  StartBatchInput
} from "../lib/domain/types";
import { brewWorkflowId, fermentationWorkflowId, orderFulfillmentWorkflowId, TASK_QUEUE } from "../lib/temporal/ids";
import {
  APPROVE_QA_SIGNAL,
  BREW_STATUS_QUERY,
  COMPLETE_FERMENTATION_SIGNAL,
  FERMENTATION_STATUS_QUERY,
  MANUAL_OVERRIDE_SIGNAL,
  SENSOR_READING_SIGNAL
} from "../lib/temporal/messages";

async function client() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  return new Client({ connection });
}

function decodePayload<T>(): T {
  const raw = process.argv[3];
  if (!raw) return {} as T;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
}

async function main() {
  const op = process.argv[2];
  const temporal = await client();

  if (op === "start-batch") {
    const input = decodePayload<StartBatchInput>();
    await temporal.workflow.start("brewDayWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId: brewWorkflowId(input.batchId),
      args: [input]
    });
    console.log(JSON.stringify({ workflowId: brewWorkflowId(input.batchId) }));
    return;
  }

  if (op === "start-order") {
    const { order } = decodePayload<{ order: Order }>();
    await temporal.workflow.start("orderFulfillmentWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId: orderFulfillmentWorkflowId(order.id),
      args: [order]
    });
    console.log(JSON.stringify({ workflowId: orderFulfillmentWorkflowId(order.id) }));
    return;
  }

  if (op === "status") {
    const { batchId } = decodePayload<{ batchId: string }>();
    let brew: BrewWorkflowStatus | null = null;
    try {
      brew = await temporal.workflow.getHandle(brewWorkflowId(batchId)).query<BrewWorkflowStatus>(BREW_STATUS_QUERY);
    } catch {
      brew = null;
    }
    let fermentation: FermentationStatus | null = null;
    try {
      fermentation = await temporal.workflow.getHandle(fermentationWorkflowId(batchId)).query<FermentationStatus>(FERMENTATION_STATUS_QUERY);
    } catch {
      fermentation = null;
    }
    console.log(JSON.stringify({ batchId, brew, fermentation }));
    return;
  }

  if (op === "sensor-reading") {
    const { batchId, reading } = decodePayload<{ batchId: string; reading: SensorReading }>();
    await temporal.workflow.getHandle(fermentationWorkflowId(batchId)).signal(SENSOR_READING_SIGNAL, reading);
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  if (op === "manual-override") {
    const { batchId, payload } = decodePayload<{ batchId: string; payload: unknown }>();
    await temporal.workflow.getHandle(fermentationWorkflowId(batchId)).signal(MANUAL_OVERRIDE_SIGNAL, payload);
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  if (op === "approve-qa") {
    const { batchId, payload } = decodePayload<{ batchId: string; payload: unknown }>();
    await temporal.workflow.getHandle(fermentationWorkflowId(batchId)).signal(APPROVE_QA_SIGNAL, payload);
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  if (op === "complete-fermentation") {
    const { batchId } = decodePayload<{ batchId: string }>();
    await temporal.workflow.getHandle(fermentationWorkflowId(batchId)).signal(COMPLETE_FERMENTATION_SIGNAL);
    console.log(JSON.stringify({ ok: true }));
    return;
  }

  if (op === "cancel-batch") {
    const { batchId } = decodePayload<{ batchId: string }>();
    const ids = [fermentationWorkflowId(batchId), brewWorkflowId(batchId)];
    for (const workflowId of ids) {
      try {
        await temporal.workflow.getHandle(workflowId).cancel();
      } catch {
        /* Workflow may not exist or already finished */
      }
    }
    console.log(JSON.stringify({ ok: true, attempted: ids }));
    return;
  }

  if (op === "adjust-packaged-stock") {
    const adjustment = decodePayload<PackagedStockAdjustment>();
    const workflowId = `packaged-stock-${randomUUID()}`;
    await temporal.workflow.start("packagedStockWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [adjustment]
    });
    console.log(JSON.stringify({ ok: true, workflowId }));
    return;
  }

  throw new Error(`Unknown Temporal op: ${op}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
