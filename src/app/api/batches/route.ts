import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { startBatchSchema } from "../../../lib/domain/schemas";
import { getTemporalClient } from "../../../lib/temporal/client";
import { brewWorkflowId, TASK_QUEUE } from "../../../lib/temporal/ids";
import { appendJsonl } from "../../../runtime/jsonl";
import { getBatchSummaries } from "../../../runtime/read-model";
import { brewDayWorkflow } from "../../../temporal/workflows";

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
    const client = await getTemporalClient();

    await client.workflow.start(brewDayWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: brewWorkflowId(batchId),
      args: [
        {
          batchId,
          beerName: payload.beerName,
          startedAt
        }
      ]
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
