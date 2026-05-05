import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { agentChatSchema, orderCreateSchema } from "../../../../../lib/domain/schemas";
import type { Order } from "../../../../../lib/domain/types";
import { appendJsonl } from "../../../../../runtime/jsonl";
import { getBatchSummaries, getInventory } from "../../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function etaForStage(stage?: string): string {
  if (stage === "fermentation") return "about 3–5 days once fermentation stabilizes";
  if (stage === "chill") return "shortly after fermentation is underway";
  if (stage === "mash" || stage === "boil") return "later today after kettle operations finish";
  return "once the next batch completes fermentation";
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
      const order: Order = {
        id: `order-${nanoid(8)}`,
        customer: { id: `customer-${nanoid(6)}`, ...parsed.data.customer },
        product: parsed.data.product,
        quantity: parsed.data.quantity,
        requestedDate: parsed.data.requestedDate,
        status: productMatch && productMatch.quantity > 0 ? "created" : "pending_batch",
        createdAt: new Date().toISOString()
      };
      await appendJsonl("orders", order);
      return NextResponse.json({
        role: "support",
        toolsUsed: ["check_inventory", "create_order"],
        message: `I created order ${order.id} for ${order.quantity} ${order.product}. ${order.status === "created" ? "It is available now." : "It will be ready when the next batch finishes."}`,
        order
      });
    }

    if (lower.includes("inventory") || lower.includes("available") || lower.includes("stock")) {
      const item = productMatch ?? inventory[0];
      return NextResponse.json({
        role: "support",
        toolsUsed: ["check_inventory"],
        message: item
          ? `${item.productName} has ${item.quantity} ${item.unit}${item.quantity === 1 ? "" : "s"} available.`
          : "I do not see available inventory yet, but I can check live batch readiness."
      });
    }

    return NextResponse.json({
      role: "support",
      toolsUsed: ["get_batch_eta"],
      message: batchMatch
        ? `${batchMatch.beerName} is currently in ${batchMatch.stage}. Expected availability is ${etaForStage(batchMatch.stage)}.`
        : "No live batches are available yet, so I cannot provide a real ETA."
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
