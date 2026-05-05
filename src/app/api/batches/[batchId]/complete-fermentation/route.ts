import { NextResponse } from "next/server";
import { temporalBridge } from "../../../../../lib/temporal/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  try {
    await temporalBridge("complete-fermentation", { batchId });
    return NextResponse.json({ ok: true, batchId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
