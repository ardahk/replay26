import { beforeEach, describe, expect, it, vi } from "vitest";

const temporalBridgeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/temporal/bridge", () => ({
  temporalBridge: temporalBridgeMock
}));

vi.mock("../../../../../runtime/read-model", () => ({
  getBatchSummaries: vi.fn(async () => [
    {
      batchId: "batch-1",
      beerName: "Hazy IPA",
      status: "needs_attention",
      stage: "fermentation",
      startedAt: "2026-05-05T12:00:00.000Z",
      updatedAt: "2026-05-05T12:05:00.000Z",
      alarmCount: 0,
      pendingTaskCount: 1
    }
  ]),
  getSensorHistory: vi.fn(async () => []),
  getAlarms: vi.fn(async () => []),
  getManualTasks: vi.fn(async () => [
    {
      id: "task-1",
      batchId: "batch-1",
      kind: "qa_checkpoint",
      reason: "repeated_temp_excursion",
      status: "pending",
      createdAt: "2026-05-05T12:05:00.000Z"
    }
  ])
}));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/agents/brewmaster/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("brewmaster chat route", () => {
  beforeEach(() => {
    temporalBridgeMock.mockReset();
    temporalBridgeMock.mockResolvedValue({ fermentation: null });
  });

  it("does not mutate workflows when proposing a pending action", async () => {
    const response = await POST(request({ batchId: "batch-1", message: "approve qa" }));
    const json = await response.json();

    expect(temporalBridgeMock).toHaveBeenCalledTimes(1);
    expect(temporalBridgeMock).toHaveBeenCalledWith("status", { batchId: "batch-1" });
    expect(json.pendingAction.type).toBe("approve_qa");
  });

  it("mutates workflows only after confirmation", async () => {
    const response = await POST(
      request({
        batchId: "batch-1",
        message: "Confirm action",
        confirm: true,
        pendingAction: {
          type: "approve_qa",
          payload: { taskId: "task-1", note: "Approved by brewmaster copilot" }
        }
      })
    );
    const json = await response.json();

    expect(temporalBridgeMock).toHaveBeenCalledTimes(1);
    expect(temporalBridgeMock).toHaveBeenCalledWith("approve-qa", {
      batchId: "batch-1",
      payload: { taskId: "task-1", note: "Approved by brewmaster copilot" }
    });
    expect(json.toolsUsed).toEqual(["approve_qa"]);
  });
});
