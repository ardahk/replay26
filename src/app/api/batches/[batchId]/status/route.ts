import { NextResponse } from "next/server";
import type { BrewWorkflowStatus, FermentationStatus } from "../../../../../lib/domain/types";
import { getTemporalClient } from "../../../../../lib/temporal/client";
import { brewWorkflowId, fermentationWorkflowId } from "../../../../../lib/temporal/ids";
import { BREW_STATUS_QUERY, FERMENTATION_STATUS_QUERY } from "../../../../../lib/temporal/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;

  try {
    const temporal = await getTemporalClient();
    let brew: BrewWorkflowStatus | null = null;
    try {
      brew = await temporal.workflow.getHandle(brewWorkflowId(batchId)).query<BrewWorkflowStatus>(BREW_STATUS_QUERY);
    } catch {
      brew = null;
    }
    let fermentation: FermentationStatus | null = null;
    try {
      fermentation = await temporal.workflow
        .getHandle(fermentationWorkflowId(batchId))
        .query<FermentationStatus>(FERMENTATION_STATUS_QUERY);
    } catch {
      fermentation = null;
    }
    return NextResponse.json({ batchId, brew, fermentation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
