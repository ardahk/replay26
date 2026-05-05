import { NextResponse } from "next/server";
import { approveQaSchema } from "../../../../../../../lib/domain/schemas";
import { temporalBridge } from "../../../../../../../lib/temporal/bridge";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ batchId: string; taskId: string }> }) {
  const { batchId, taskId } = await context.params;

  try {
    const payload = approveQaSchema.parse(await request.json().catch(() => ({})));
    await temporalBridge("approve-qa", { batchId, payload: { taskId, note: payload.note } });
    return NextResponse.json({ ok: true, batchId, taskId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
