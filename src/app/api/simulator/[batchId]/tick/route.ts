import { NextResponse } from "next/server";
import { simulatorTickSchema } from "../../../../../lib/domain/schemas";
import { temporalBridge } from "../../../../../lib/temporal/bridge";
import { createSensorReading } from "../../../../../simulator/readings";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;

  try {
    const payload = simulatorTickSchema.parse(await request.json().catch(() => ({})));
    const reading = createSensorReading({
      batchId,
      scenario: payload.scenario,
      tick: payload.tick ?? Math.floor(Date.now() / 2000) % 1000
    });
    await temporalBridge("sensor-reading", { batchId, reading });
    return NextResponse.json({ ok: true, reading });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
