import { NextResponse } from "next/server";
import type { BrewWorkflowStatus, FermentationStatus } from "../../../../../lib/domain/types";
import { temporalBridge } from "../../../../../lib/temporal/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;

  try {
    const { brew, fermentation } = await temporalBridge<{
      brew: BrewWorkflowStatus;
      fermentation: FermentationStatus | null;
    }>("status", { batchId });
    return NextResponse.json({ batchId, brew, fermentation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
