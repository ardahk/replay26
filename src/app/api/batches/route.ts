import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { startBatchSchema } from "../../../lib/domain/schemas";
import { brewWorkflowId } from "../../../lib/temporal/ids";
import { temporalBridge } from "../../../lib/temporal/bridge";
import { appendJsonl } from "../../../runtime/jsonl";
import { getBatchSummaries } from "../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const batches = await getBatchSummaries();
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  try {
    const payload = startBatchSchema.parse(await request.json().catch(() => ({})));
    const batchId = payload.batchId ?? `batch-${nanoid(8)}`;
    const startedAt = new Date().toISOString();

    await temporalBridge("start-batch", {
      batchId,
      beerName: payload.beerName,
      startedAt
    });

    await appendJsonl("events", {
      batchId,
      beerName: payload.beerName,
      type: "batch_started",
      message: `${payload.beerName} brew day requested`,
      timestamp: startedAt
    });

    return NextResponse.json({
      batchId,
      beerName: payload.beerName,
      workflowId: brewWorkflowId(batchId),
      startedAt
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
