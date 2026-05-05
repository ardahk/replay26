import type { InventoryItem, Order } from "../lib/domain/types";
import { appendJsonl } from "./jsonl";
import { getInventory } from "./read-model";

function findInventoryLine(inventory: InventoryItem[], product: string): InventoryItem | undefined {
  const lower = product.trim().toLowerCase();
  return inventory.find(
    (item) => item.productName.toLowerCase() === lower || item.sku.toLowerCase() === lower
  );
}

/**
 * When stock covers the order quantity, append a lower inventory row (JSONL merge-by-SKU).
 * Otherwise leave inventory unchanged and mark the order pending production.
 */
export async function distributeOrderInventory(order: Order): Promise<Order> {
  const inventory = await getInventory();
  const match = findInventoryLine(inventory, order.product);
  if (!match || match.quantity < order.quantity) {
    return { ...order, status: "pending_batch" };
  }
  const now = new Date().toISOString();
  await appendJsonl("inventory", {
    ...match,
    quantity: match.quantity - order.quantity,
    updatedAt: now
  });
  return { ...order, status: "ready" };
}
