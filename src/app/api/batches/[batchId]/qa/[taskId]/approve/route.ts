import { NextResponse } from "next/server";
import { approveQaSchema } from "../../../../../../../lib/domain/schemas";
import { getTemporalClient } from "../../../../../../../lib/temporal/client";
import { fermentationWorkflowId } from "../../../../../../../lib/temporal/ids";
import { approveQaSignal } from "../../../../../../../temporal/workflows";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ batchId: string; taskId: string }> }) {
  const { batchId, taskId } = await context.params;

  try {
    const payload = approveQaSchema.parse(await request.json().catch(() => ({})));
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(fermentationWorkflowId(batchId));
    await handle.signal(approveQaSignal, { taskId, note: payload.note });
    return NextResponse.json({ ok: true, batchId, taskId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
