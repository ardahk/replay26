import { describe, expect, it } from "vitest";
import { buildSupportDecision } from "./support";
import type { BatchSummary, InventoryItem, Order } from "../domain/types";

const batch: BatchSummary = {
  batchId: "batch-1",
  beerName: "Hazy IPA",
  status: "running",
  stage: "fermentation",
  startedAt: "2026-05-05T12:00:00.000Z",
  updatedAt: "2026-05-05T12:05:00.000Z",
  alarmCount: 2,
  pendingTaskCount: 1
};

const inventory: InventoryItem = {
  sku: "HAZY-IPA-CASE",
  productName: "Hazy IPA",
  quantity: 3,
  unit: "case",
  updatedAt: "2026-05-05T12:05:00.000Z"
};

describe("buildSupportDecision", () => {
  it("answers inventory questions with customer-safe tool traces", async () => {
    const decision = await buildSupportDecision("what is available?", {
      batches: [batch],
      inventory: [inventory],
      appendOrder: async () => undefined
    });

    expect(decision.toolsUsed).toContain("check_inventory");
    expect(decision.message).toContain("Hazy IPA has 3 cases available");
    expect(decision.message).not.toContain("alarm");
  });

  it("creates orders through the supplied order writer", async () => {
    const orders: Order[] = [];
    const decision = await buildSupportDecision("buy Hazy IPA", {
      batches: [batch],
      inventory: [inventory],
      appendOrder: async (order) => {
        orders.push(order);
      }
    });

    expect(orders).toHaveLength(1);
    expect(decision.order?.status).toBe("created");
    expect(decision.toolsUsed).toContain("create_order");
  });
});
