import { NextResponse } from "next/server";
import { getSensorHistory } from "../../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  const readings = await getSensorHistory(batchId);
  return NextResponse.json({ batchId, readings });
}
