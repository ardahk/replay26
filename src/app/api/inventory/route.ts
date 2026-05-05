import { NextResponse } from "next/server";
import { inventoryItemSchema } from "../../../lib/domain/schemas";
import { appendJsonl } from "../../../runtime/jsonl";
import { getInventory } from "../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const inventory = await getInventory();
  return NextResponse.json({ inventory });
}

export async function POST(request: Request) {
  try {
    const payload = inventoryItemSchema.parse(await request.json());
    const item = { ...payload, updatedAt: payload.updatedAt ?? new Date().toISOString() };
    await appendJsonl("inventory", item);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
