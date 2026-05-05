import { NextResponse } from "next/server";
import { temporalBridge } from "../../../../../lib/temporal/bridge";
import { appendJsonl } from "../../../../../runtime/jsonl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    await temporalBridge("cancel-batch", { batchId });
    await appendJsonl("events", {
      batchId,
      type: "batch_cancelled",
      message: "Batch cancelled by operator",
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ ok: true, batchId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
