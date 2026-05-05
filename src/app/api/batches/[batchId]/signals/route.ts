import { NextResponse } from "next/server";
import { signalRequestSchema } from "../../../../../lib/domain/schemas";
import { getTemporalClient } from "../../../../../lib/temporal/client";
import { fermentationWorkflowId } from "../../../../../lib/temporal/ids";
import { manualOverrideSignal, sensorReadingSignal } from "../../../../../temporal/workflows";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;

  try {
    const payload = signalRequestSchema.parse(await request.json());
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(fermentationWorkflowId(batchId));

    if (payload.signalName === "sensor_reading") {
      await handle.signal(sensorReadingSignal, payload.payload);
    } else {
      await handle.signal(manualOverrideSignal, payload.payload);
    }

    return NextResponse.json({ ok: true, batchId, signalName: payload.signalName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
