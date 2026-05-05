import { NextResponse } from "next/server";
import { getAlarms } from "../../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  const alarms = await getAlarms(batchId);
  return NextResponse.json({ batchId, alarms });
}
