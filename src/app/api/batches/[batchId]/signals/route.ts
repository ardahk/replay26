import { NextResponse } from "next/server";
import { signalRequestSchema } from "../../../../../lib/domain/schemas";
import { temporalBridge } from "../../../../../lib/temporal/bridge";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;

  try {
    const payload = signalRequestSchema.parse(await request.json());

    if (payload.signalName === "sensor_reading") {
      await temporalBridge("sensor-reading", { batchId, reading: payload.payload });
    } else {
      await temporalBridge("manual-override", { batchId, payload: payload.payload });
    }

    return NextResponse.json({ ok: true, batchId, signalName: payload.signalName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
