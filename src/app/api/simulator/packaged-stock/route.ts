import { NextResponse } from "next/server";
import { packagedStockAdjustSchema } from "../../../../lib/domain/schemas";
import { temporalBridge } from "../../../../lib/temporal/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = packagedStockAdjustSchema.parse(await request.json());
    const result = await temporalBridge<{ ok: boolean; workflowId: string }>(
      "adjust-packaged-stock",
      payload
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
