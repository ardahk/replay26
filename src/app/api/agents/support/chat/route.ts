import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { agentChatSchema, orderCreateSchema } from "../../../../../lib/domain/schemas";
import type { Order } from "../../../../../lib/domain/types";
import { temporalBridge } from "../../../../../lib/temporal/bridge";
import { appendJsonl } from "../../../../../runtime/jsonl";
import { getBatchSummaries, getInventory } from "../../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function etaForStage(stage?: string): string {
  if (stage === "fermentation") return "about 3–5 days once fermentation stabilizes";
  if (stage === "chill") return "shortly after fermentation is underway";
  if (stage === "mash" || stage === "boil") return "later today after kettle work wraps";
  return "once the next batch finishes fermentation";
}

function stageWords(stage: string): string {
  return stage.replaceAll("_", " ");
}

export async function POST(request: Request) {
  try {
    const payload = agentChatSchema.parse(await request.json());
    const lower = payload.message.toLowerCase();
    const [batches, inventory] = await Promise.all([getBatchSummaries(), getInventory()]);
    const productMatch = inventory.find((item) => lower.includes(item.productName.toLowerCase()) || lower.includes(item.sku.toLowerCase()));
    const batchMatch = batches.find((batch) => lower.includes(batch.batchId.toLowerCase()) || lower.includes(batch.beerName.toLowerCase())) ?? batches[0];

    if (lower.includes("order") || lower.includes("buy")) {
      const parsed = orderCreateSchema.safeParse({
        customer: { name: "Guest" },
        product: productMatch?.productName ?? batchMatch?.beerName ?? "Hazy IPA",
        quantity: 1
      });
      if (!parsed.success) throw new Error(parsed.error.message);
      const createdAt = new Date().toISOString();
      const base: Order = {
        id: `order-${nanoid(8)}`,
        customer: { id: `customer-${nanoid(6)}`, ...parsed.data.customer },
        product: parsed.data.product,
        quantity: parsed.data.quantity,
        requestedDate: parsed.data.requestedDate,
        status: "created",
        createdAt
      };
      await appendJsonl("orders", { ...base, updatedAt: createdAt });
      await temporalBridge("start-order", { order: base });
      return NextResponse.json({
        role: "support",
        toolsUsed: ["check_inventory", "create_order", "start_order_workflow"],
        message: `I placed order ${base.id} for ${base.quantity}× ${base.product}. Share the Customer tab so they can watch status move from checking stock to ready.`,
        order: base
      });
    }

    if (lower.includes("inventory") || lower.includes("available") || lower.includes("stock")) {
      const item = productMatch ?? inventory[0];
      return NextResponse.json({
        role: "support",
        toolsUsed: ["check_inventory"],
        message: item
          ? `${item.productName} has ${item.quantity} ${item.unit}${item.quantity === 1 ? "" : "s"} available.`
          : "I don't see packaged counts loaded yet, but I can still talk through what's brewing."
      });
    }

    return NextResponse.json({
      role: "support",
      toolsUsed: ["get_batch_eta"],
      message: batchMatch
        ? `${batchMatch.beerName} is in ${stageWords(batchMatch.stage)} right now. Rough timing: ${etaForStage(batchMatch.stage)}.`
        : "Nothing is brewing on the board yet, so I can't estimate when beer will be ready."
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
