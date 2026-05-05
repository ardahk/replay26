import { NextResponse } from "next/server";
import { agentChatSchema } from "../../../../../lib/domain/schemas";
import type { ApproveQaInput, FermentationStatus, ManualOverrideInput } from "../../../../../lib/domain/types";
import { temporalBridge } from "../../../../../lib/temporal/bridge";
import { getAlarms, getBatchSummaries, getManualTasks, getSensorHistory } from "../../../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getLiveFermentation(batchId: string) {
  try {
    const status = await temporalBridge<{ fermentation: FermentationStatus | null }>("status", { batchId });
    return status.fermentation;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const payload = agentChatSchema.parse(await request.json());
    const batches = await getBatchSummaries();
    const batchId = payload.batchId ?? batches[0]?.batchId;
    if (!batchId) {
      return NextResponse.json({ role: "brewmaster", message: "No batches are available yet. Start a batch first." });
    }

    if (payload.confirm && payload.pendingAction) {
      if (payload.pendingAction.type === "approve_qa") {
        await temporalBridge("approve-qa", { batchId, payload: payload.pendingAction.payload as ApproveQaInput });
        return NextResponse.json({ role: "brewmaster", batchId, message: "QA approval sent — fermentation can continue." });
      }
      await temporalBridge("manual-override", { batchId, payload: payload.pendingAction.payload as ManualOverrideInput });
      return NextResponse.json({ role: "brewmaster", batchId, message: "Manual override applied on the fermentation side." });
    }

    const [live, readings, alarms, tasks] = await Promise.all([
      getLiveFermentation(batchId),
      getSensorHistory(batchId),
      getAlarms(batchId),
      getManualTasks(batchId)
    ]);
    const latest = live?.latestReading ?? readings.at(-1);
    const pending = tasks.filter((task) => task.status === "pending");
    const lower = payload.message.toLowerCase();

    if (lower.includes("approve") && pending[0]) {
      return NextResponse.json({
        role: "brewmaster",
        batchId,
        message: `I found pending QA task ${pending[0].id} for ${pending[0].reason}. Confirm to approve it.`,
        pendingAction: {
          type: "approve_qa",
          payload: { taskId: pending[0].id, note: "Approved by brewmaster agent" }
        }
      });
    }

    if (lower.includes("override") || lower.includes("signal")) {
      return NextResponse.json({
        role: "brewmaster",
        batchId,
        message: "I can apply a manual override on fermentation, but I need you to confirm first.",
        pendingAction: {
          type: "send_signal",
          payload: { note: `Operator requested: ${payload.message}` }
        }
      });
    }

    const risk = pending.length > 0 || alarms.some((alarm) => alarm.severity === "critical") ? "needs attention" : "stable";
    const message = [
      `Batch ${batchId} is ${risk}.`,
      latest
        ? `Latest reading: ${latest.temperatureC}C, gravity ${latest.gravity}, pH ${latest.pH}, CO2 ${latest.co2Ppm}ppm.`
        : "No fermentation readings have landed yet.",
      alarms[0] ? `Most recent alarm: ${alarms[0].type} (${alarms[0].severity}) - ${alarms[0].message}.` : "No alarms are recorded.",
      pending[0] ? `Pending QA: ${pending[0].reason} (${pending[0].id}).` : "No pending QA tasks."
    ].join(" ");

    return NextResponse.json({
      role: "brewmaster",
      batchId,
      toolsUsed: ["get_batch_status", "get_sensor_history"],
      message
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
