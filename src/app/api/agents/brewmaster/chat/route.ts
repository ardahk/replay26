import { NextResponse } from "next/server";
import { buildBrewmasterConfirmationDecision, buildBrewmasterDecision } from "../../../../../lib/agents/brewmaster";
import { enhanceWithDeepSeek } from "../../../../../lib/agents/deepseek";
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
        const decision = buildBrewmasterConfirmationDecision(batchId, "approve_qa");
        return NextResponse.json(await enhanceWithDeepSeek(payload.message, decision));
      }

      await temporalBridge("manual-override", { batchId, payload: payload.pendingAction.payload as ManualOverrideInput });
      const decision = buildBrewmasterConfirmationDecision(batchId, "send_signal");
      return NextResponse.json(await enhanceWithDeepSeek(payload.message, decision));
    }

    const [live, readings, alarms, tasks] = await Promise.all([
      getLiveFermentation(batchId),
      getSensorHistory(batchId),
      getAlarms(batchId),
      getManualTasks(batchId)
    ]);

    const decision = buildBrewmasterDecision(payload.message, {
      batchId,
      batches,
      live,
      readings,
      alarms,
      tasks
    });

    return NextResponse.json(await enhanceWithDeepSeek(payload.message, decision));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
