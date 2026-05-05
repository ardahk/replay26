import { nanoid } from "nanoid";
import type { BatchSummary, InventoryItem, Order } from "../domain/types";
import type { AgentDecision } from "./types";

export interface SupportContext {
  batches: BatchSummary[];
  inventory: InventoryItem[];
  appendOrder: (order: Order) => Promise<void>;
}

function etaForStage(stage?: string): string {
  if (stage === "fermentation") return "about 3-5 days once fermentation stabilizes";
  if (stage === "chill") return "shortly after fermentation is underway";
  if (stage === "mash" || stage === "boil") return "later today after kettle operations finish";
  return "once the next batch completes fermentation";
}

function plural(unit: string, quantity: number): string {
  return `${unit}${quantity === 1 ? "" : "s"}`;
}

export async function buildSupportDecision(message: string, context: SupportContext): Promise<AgentDecision> {
  const lower = message.toLowerCase();
  const productMatch = context.inventory.find(
    (item) => lower.includes(item.productName.toLowerCase()) || lower.includes(item.sku.toLowerCase())
  );
  const batchMatch =
    context.batches.find(
      (batch) => lower.includes(batch.batchId.toLowerCase()) || lower.includes(batch.beerName.toLowerCase())
    ) ?? context.batches[0];
  const wantsOrder = lower.includes("order") || lower.includes("buy") || lower.includes("reserve");
  const wantsInventory = lower.includes("inventory") || lower.includes("available") || lower.includes("stock");
  const plan = [
    "Check customer-safe inventory.",
    "Check active batch availability.",
    wantsOrder ? "Create an order if stock or a matching batch is available." : "Return a customer-safe answer."
  ];
  const observations = [
    productMatch
      ? `${productMatch.productName} has ${productMatch.quantity} ${plural(productMatch.unit, productMatch.quantity)} available.`
      : "No exact inventory match was found in the request.",
    batchMatch
      ? `${batchMatch.beerName} is currently in ${batchMatch.stage}; availability is ${etaForStage(batchMatch.stage)}.`
      : "No active batches are available for an ETA."
  ];

  if (wantsOrder) {
    const product = productMatch?.productName ?? batchMatch?.beerName ?? "Hazy IPA";
    const order: Order = {
      id: `order-${nanoid(8)}`,
      customer: { id: `customer-${nanoid(6)}`, name: "Guest" },
      product,
      quantity: 1,
      status: productMatch && productMatch.quantity > 0 ? "created" : "pending_batch",
      createdAt: new Date().toISOString()
    };
    await context.appendOrder(order);
    return {
      role: "support",
      batchId: batchMatch?.batchId,
      plan,
      observations: [
        ...observations,
        order.status === "created"
          ? `Order ${order.id} can be fulfilled from current inventory.`
          : `Order ${order.id} is queued against future availability.`
      ],
      toolsUsed: ["check_inventory", "get_batch_eta", "create_order"],
      message: `I created order ${order.id} for ${order.quantity} ${order.product}. ${order.status === "created" ? "It is available now." : "It will be ready when the next matching batch is available."}`,
      order
    };
  }

  if (wantsInventory) {
    const item = productMatch ?? context.inventory[0];
    return {
      role: "support",
      batchId: batchMatch?.batchId,
      plan,
      observations,
      toolsUsed: ["check_inventory"],
      message: item
        ? `${item.productName} has ${item.quantity} ${plural(item.unit, item.quantity)} available.`
        : "I do not see available inventory yet, but I can check batch availability."
    };
  }

  return {
    role: "support",
    batchId: batchMatch?.batchId,
    plan,
    observations,
    toolsUsed: ["get_batch_eta", "check_inventory"],
    message: batchMatch
      ? `${batchMatch.beerName} is currently in ${batchMatch.stage}. Expected availability is ${etaForStage(batchMatch.stage)}.`
      : "No live batches are available yet, so I cannot provide a real ETA."
  };
}
