import { NextResponse } from "next/server";
import { getTemporalClient } from "../../../../../lib/temporal/client";
import { brewWorkflowId, fermentationWorkflowId } from "../../../../../lib/temporal/ids";
import { getBrewStatus, getFermentationStatus } from "../../../../../temporal/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  const client = await getTemporalClient();

  try {
    const brew = await client.workflow.getHandle(brewWorkflowId(batchId)).query(getBrewStatus);
    let fermentation = null;

    try {
      fermentation = await client.workflow.getHandle(fermentationWorkflowId(batchId)).query(getFermentationStatus);
    } catch {
      fermentation = null;
    }

    return NextResponse.json({ batchId, brew, fermentation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
