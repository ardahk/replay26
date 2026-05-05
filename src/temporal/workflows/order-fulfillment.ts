import { defineQuery, proxyActivities, setHandler, sleep } from "@temporalio/workflow";
import type {
  Order,
  OrderFulfillmentLiveState,
  OrderFulfillmentPhase
} from "../../lib/domain/types";
import type * as activities from "../activities";

const activity = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 }
});

export const getOrderFulfillmentStatus =
  defineQuery<OrderFulfillmentLiveState>("getOrderFulfillmentStatus");

export async function orderFulfillmentWorkflow(initialOrder: Order): Promise<void> {
  let phase: OrderFulfillmentPhase = "allocating";
  let orderState = initialOrder;

  const snapshot = (): OrderFulfillmentLiveState => ({
    orderId: orderState.id,
    phase,
    order: orderState
  });

  setHandler(getOrderFulfillmentStatus, snapshot);

  while (orderState.status !== "ready") {
    phase = "allocating";
    orderState = await activity.processOrderFulfillmentAttempt(orderState);
    if (orderState.status === "ready") {
      phase = "fulfilled";
      return;
    }
    phase = "awaiting_inventory";
    await sleep("15 seconds");
  }
}
