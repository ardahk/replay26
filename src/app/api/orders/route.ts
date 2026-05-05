import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { orderCreateSchema } from "../../../lib/domain/schemas";
import type {
  Order,
  OrderFulfillmentLiveState,
  OrderWithFulfillment
} from "../../../lib/domain/types";
import { temporalBridge } from "../../../lib/temporal/bridge";
import { getTemporalClient } from "../../../lib/temporal/client";
import { orderFulfillmentWorkflowId } from "../../../lib/temporal/ids";
import { ORDER_FULFILLMENT_QUERY } from "../../../lib/temporal/messages";
import { appendJsonl } from "../../../runtime/jsonl";
import { getOrders } from "../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live workflow queries per poll are costly; older rows rarely need fulfillment state in the UI. */
const MAX_ORDER_FULFILLMENT_QUERIES = 48;

export async function GET() {
  const orders = await getOrders();
  const byRecent = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const enrichIds = new Set(byRecent.slice(0, MAX_ORDER_FULFILLMENT_QUERIES).map((o) => o.id));

  let enriched: OrderWithFulfillment[];
  try {
    const client = await getTemporalClient();
    enriched = await Promise.all(
      orders.map(async (order) => {
        if (!enrichIds.has(order.id)) {
          return { ...order, fulfillment: null };
        }
        try {
          const handle = client.workflow.getHandle(orderFulfillmentWorkflowId(order.id));
          const fulfillment = await handle.query<OrderFulfillmentLiveState>(ORDER_FULFILLMENT_QUERY);
          return { ...order, fulfillment };
        } catch {
          return { ...order, fulfillment: null };
        }
      })
    );
  } catch {
    enriched = orders.map((order) => ({ ...order, fulfillment: null }));
  }
  return NextResponse.json({ orders: enriched });
}

export async function POST(request: Request) {
  try {
    const payload = orderCreateSchema.parse(await request.json());
    const createdAt = new Date().toISOString();
    const base: Order = {
      id: `order-${nanoid(8)}`,
      customer: {
        id: payload.customer.id ?? `customer-${nanoid(6)}`,
        name: payload.customer.name,
        email: payload.customer.email
      },
      product: payload.product,
      quantity: payload.quantity,
      requestedDate: payload.requestedDate,
      status: "created",
      createdAt
    };
    await appendJsonl("orders", { ...base, updatedAt: createdAt });
    await temporalBridge("start-order", { order: base });
    return NextResponse.json(
      { order: base, workflowId: orderFulfillmentWorkflowId(base.id) },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
