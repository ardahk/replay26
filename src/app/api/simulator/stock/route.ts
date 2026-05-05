import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { stockSimulatorSchema } from "../../../../lib/domain/schemas";
import { brewWorkflowId } from "../../../../lib/temporal/ids";
import { temporalBridge } from "../../../../lib/temporal/bridge";
import { appendJsonl } from "../../../../runtime/jsonl";
import { getBatchSummaries, getInventory } from "../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = stockSimulatorSchema.parse(await request.json().catch(() => ({})));
    const inventory = await getInventory();
    const batches = await getBatchSummaries();

    const replenished: Array<{ sku: string; productName: string; before: number; after: number }> = [];
    const batchesStarted: Array<{ batchId: string; beerName: string; workflowId: string }> = [];
    const skipped: Array<{ sku: string; productName: string; reason: "batch_already_active" }> = [];

    const filterSku = payload.sku?.trim().toLowerCase();

    for (const item of inventory) {
      if (filterSku && item.sku.toLowerCase() !== filterSku) continue;
      if (item.quantity >= payload.lowThreshold) continue;

      const now = new Date().toISOString();

      if (payload.restockInventory) {
        const after = item.quantity + payload.restockAmount;
        await appendJsonl("inventory", {
          ...item,
          quantity: after,
          updatedAt: now
        });
        replenished.push({ sku: item.sku, productName: item.productName, before: item.quantity, after });
      }

      if (payload.startBatch) {
        const beerLower = item.productName.toLowerCase();
        const hasActive = batches.some(
          (b) => b.beerName.toLowerCase() === beerLower && b.status !== "complete"
        );
        if (hasActive) {
          skipped.push({ sku: item.sku, productName: item.productName, reason: "batch_already_active" });
        } else {
          const batchId = `batch-${nanoid(8)}`;
          const startedAt = now;
          await temporalBridge("start-batch", {
            batchId,
            beerName: item.productName,
            startedAt
          });
          await appendJsonl("events", {
            batchId,
            beerName: item.productName,
            type: "batch_started",
            message: `${item.productName} brew day requested`,
            timestamp: startedAt
          });
          const workflowId = brewWorkflowId(batchId);
          batchesStarted.push({ batchId, beerName: item.productName, workflowId });
          batches.push({
            batchId,
            beerName: item.productName,
            status: "running",
            stage: "queued",
            startedAt,
            updatedAt: startedAt,
            alarmCount: 0,
            pendingTaskCount: 0
          });
        }
      }
    }

    return NextResponse.json({ ok: true, replenished, batchesStarted, skipped });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
