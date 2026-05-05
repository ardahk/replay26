import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { orderCreateSchema } from "../../../lib/domain/schemas";
import type { Order } from "../../../lib/domain/types";
import { appendJsonl } from "../../../runtime/jsonl";
import { getOrders } from "../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const orders = await getOrders();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  try {
    const payload = orderCreateSchema.parse(await request.json());
    const order: Order = {
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
      createdAt: new Date().toISOString()
    };
    await appendJsonl("orders", order);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
