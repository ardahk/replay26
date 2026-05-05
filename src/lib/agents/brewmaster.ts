import type {
  AlarmEvent,
  BatchSummary,
  FermentationStatus,
  ManualTask,
  SensorReading
} from "../domain/types";
import type { AgentDecision } from "./types";

export interface BrewmasterContext {
  batchId: string;
  batches: BatchSummary[];
  live?: FermentationStatus | null;
  readings: SensorReading[];
  alarms: AlarmEvent[];
  tasks: ManualTask[];
}

function statusLabel(value?: string): string {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function classifyIntent(message: string) {
  const lower = message.toLowerCase();
  return {
    wantsApproval: lower.includes("approve") || lower.includes("qa"),
    wantsOverride:
      lower.includes("override") ||
      lower.includes("signal") ||
      lower.includes("adjust") ||
      lower.includes("temperature"),
    wantsAlarms:
      lower.includes("alarm") ||
      lower.includes("worried") ||
      lower.includes("attention") ||
      lower.includes("risk"),
    wantsStatus:
      lower.includes("status") ||
      lower.includes("happening") ||
      lower.includes("current") ||
      lower.includes("what")
  };
}

export function buildBrewmasterDecision(message: string, context: BrewmasterContext): AgentDecision {
  const intent = classifyIntent(message);
  const latest = context.live?.latestReading ?? context.readings.at(-1);
  const pending = context.tasks.filter((task) => task.status === "pending");
  const critical = context.alarms.find((alarm) => alarm.severity === "critical");
  const newestAlarm = context.alarms[0];
  const summary = context.batches.find((batch) => batch.batchId === context.batchId);
  const health = context.live?.health ?? summary?.status ?? "running";
  const stage = summary?.stage ?? "fermentation";
  const observations: string[] = [
    `${summary?.beerName ?? "Selected batch"} is in ${statusLabel(stage)} with health ${statusLabel(health)}.`,
    latest
      ? `Latest telemetry reads ${latest.temperatureC}C, gravity ${latest.gravity}, pH ${latest.pH}, CO2 ${latest.co2Ppm}ppm.`
      : "No fermentation telemetry has landed for this batch yet.",
    newestAlarm
      ? `Newest alarm is ${statusLabel(newestAlarm.type)} at ${newestAlarm.severity}: ${newestAlarm.message}.`
      : "No alarms are recorded for this batch.",
    pending[0]
      ? `Pending QA task ${pending[0].id} is waiting on ${statusLabel(pending[0].reason)}.`
      : "No pending QA tasks are open."
  ];
  const toolsUsed = ["get_batch_status", "get_sensor_history", "review_alarms", "review_manual_tasks"];
  const plan = [
    "Check the live workflow and read-model state.",
    "Compare telemetry, alarms, and QA tasks.",
    "Recommend the next operator action."
  ];

  if (intent.wantsApproval && pending[0]) {
    return {
      role: "brewmaster",
      batchId: context.batchId,
      plan: [...plan, "Prepare a QA approval for operator confirmation."],
      observations,
      toolsUsed: [...toolsUsed, "propose_qa_approval"],
      message: `I found QA task ${pending[0].id} for ${statusLabel(pending[0].reason)}. The batch still needs operator confirmation before I approve it.`,
      pendingAction: {
        type: "approve_qa",
        payload: { taskId: pending[0].id, note: "Approved by brewmaster copilot" }
      }
    };
  }

  if (intent.wantsOverride) {
    if (!latest) {
      return {
        role: "brewmaster",
        batchId: context.batchId,
        plan: [...plan, "Check whether telemetry supports a manual override."],
        observations,
        toolsUsed,
        message:
          "I do not have fermentation telemetry yet, so I cannot justify a temperature override. Recommended next step: publish a telemetry reading, then I can reassess and prepare an override if the trend is risky."
      };
    }
    const targetTemperatureC =
      latest && latest.temperatureC > 24 ? 20 : latest && latest.temperatureC < 16 ? 19 : undefined;
    return {
      role: "brewmaster",
      batchId: context.batchId,
      plan: [...plan, "Prepare a manual override for operator confirmation."],
      observations,
      toolsUsed: [...toolsUsed, "propose_manual_override"],
      message: targetTemperatureC
        ? `I can propose a manual override to target ${targetTemperatureC}C based on the current temperature trend. Confirm before I send that workflow signal.`
        : "I can propose a manual override note for this batch. Confirm before I send that workflow signal.",
      pendingAction: {
        type: "send_signal",
        payload: {
          note: `Operator requested: ${message}`,
          targetTemperatureC
        }
      }
    };
  }

  const risk = pending.length > 0 || critical ? "needs attention" : newestAlarm ? "has warnings" : "looks stable";
  const recommendation =
    pending[0]
      ? `Recommended next step: review QA task ${pending[0].id} and approve it if the batch checks out.`
      : critical
        ? "Recommended next step: stabilize temperature before sending any approval."
        : newestAlarm
          ? "Recommended next step: keep telemetry running and watch whether the warning repeats."
          : intent.wantsAlarms || intent.wantsStatus
            ? "Recommended next step: continue normal telemetry ticks."
            : "Recommended next step: ask me to review alarms, approve QA, or propose an override.";

  return {
    role: "brewmaster",
    batchId: context.batchId,
    plan,
    observations,
    toolsUsed,
    message: `Batch ${context.batchId} ${risk}. ${recommendation}`
  };
}

export function buildBrewmasterConfirmationDecision(
  batchId: string,
  actionType: "approve_qa" | "send_signal"
): AgentDecision {
  const isQa = actionType === "approve_qa";
  return {
    role: "brewmaster",
    batchId,
    plan: ["Verify the operator confirmed the proposed action.", "Send the confirmed workflow signal."],
    observations: [
      isQa
        ? "The pending QA approval was confirmed by the operator."
        : "The manual override was confirmed by the operator."
    ],
    toolsUsed: [isQa ? "approve_qa" : "send_manual_override"],
    message: isQa
      ? "QA approval sent into the fermentation workflow."
      : "Manual override signal sent into the fermentation workflow."
  };
}
