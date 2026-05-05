import { describe, expect, it } from "vitest";
import { buildBrewmasterDecision } from "./brewmaster";
import type { AlarmEvent, BatchSummary, ManualTask, SensorReading } from "../domain/types";

const batch: BatchSummary = {
  batchId: "batch-1",
  beerName: "Hazy IPA",
  status: "needs_attention",
  stage: "fermentation",
  startedAt: "2026-05-05T12:00:00.000Z",
  updatedAt: "2026-05-05T12:05:00.000Z",
  alarmCount: 1,
  pendingTaskCount: 1
};

const reading: SensorReading = {
  id: "reading-1",
  batchId: "batch-1",
  scenario: "temp_spike",
  tick: 2,
  timestamp: "2026-05-05T12:05:00.000Z",
  temperatureC: 28.5,
  gravity: 1.04,
  pH: 4.2,
  co2Ppm: 760
};

const alarm: AlarmEvent = {
  id: "alarm-1",
  batchId: "batch-1",
  type: "temp_excursion",
  severity: "critical",
  message: "Temperature excursion at 28.5C",
  readingId: "reading-1",
  timestamp: "2026-05-05T12:05:00.000Z"
};

const task: ManualTask = {
  id: "task-1",
  batchId: "batch-1",
  kind: "qa_checkpoint",
  reason: "repeated_temp_excursion",
  status: "pending",
  createdAt: "2026-05-05T12:05:00.000Z"
};

function context() {
  return {
    batchId: "batch-1",
    batches: [batch],
    live: null,
    readings: [reading],
    alarms: [alarm],
    tasks: [task]
  };
}

describe("buildBrewmasterDecision", () => {
  it("returns an agentic status response with plan, tools, and observations", () => {
    const decision = buildBrewmasterDecision("what is happening?", context());

    expect(decision.plan.length).toBeGreaterThan(0);
    expect(decision.toolsUsed).toContain("get_batch_status");
    expect(decision.toolsUsed).toContain("review_alarms");
    expect(decision.observations.join(" ")).toContain("Temperature excursion");
    expect(decision.message).toContain("needs attention");
  });

  it("proposes QA approval without mutating workflow state", () => {
    const decision = buildBrewmasterDecision("approve the qa task", context());

    expect(decision.pendingAction).toEqual({
      type: "approve_qa",
      payload: { taskId: "task-1", note: "Approved by brewmaster copilot" }
    });
    expect(decision.toolsUsed).toContain("propose_qa_approval");
  });

  it("proposes manual override with a target temperature when telemetry is out of range", () => {
    const decision = buildBrewmasterDecision("send a temperature override", context());

    expect(decision.pendingAction).toEqual({
      type: "send_signal",
      payload: {
        note: "Operator requested: send a temperature override",
        targetTemperatureC: 20
      }
    });
    expect(decision.toolsUsed).toContain("propose_manual_override");
  });

  it("does not propose manual override before telemetry exists", () => {
    const decision = buildBrewmasterDecision("If temperature looks risky, prepare a confirmed override.", {
      ...context(),
      readings: []
    });

    expect(decision.pendingAction).toBeUndefined();
    expect(decision.message).toContain("cannot justify a temperature override");
  });
});
