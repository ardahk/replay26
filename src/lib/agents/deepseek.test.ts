import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceWithDeepSeek } from "./deepseek";
import type { AgentDecision } from "./types";

const decision: AgentDecision = {
  role: "brewmaster",
  batchId: "batch-1",
  plan: ["Check status."],
  observations: ["Batch is stable."],
  toolsUsed: ["get_batch_status"],
  message: "Batch batch-1 looks stable."
};

describe("enhanceWithDeepSeek", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses deterministic fallback when no API key is configured", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(enhanced.provider).toBe("deterministic");
    expect(enhanced.message).toBe(decision.message);
  });

  it("uses DeepSeek content when the provider succeeds", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");
    const fetchMock = vi.fn(async () =>
      Response.json({
        model: "deepseek-v4-flash",
        choices: [{ message: { content: "I checked the tools. Batch batch-1 is stable." } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key"
        })
      })
    );
    expect(enhanced.provider).toBe("deepseek");
    expect(enhanced.model).toBe("deepseek-v4-flash");
    expect(enhanced.message).toBe("I checked the tools. Batch batch-1 is stable.");
  });

  it("removes markdown from DeepSeek content before returning it", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                content: "**Batch batch-1** is stable. **Next action:** keep telemetry running."
              }
            }
          ]
        })
      )
    );

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(enhanced.provider).toBe("deepseek");
    expect(enhanced.message).toBe("Batch batch-1 is stable. Next action: keep telemetry running.");
  });

  it("adds final punctuation to clipped provider text", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content: "Continue standard monitoring and await first telemetry for this batch" } }]
        })
      )
    );

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(enhanced.message).toBe("Continue standard monitoring and await first telemetry for this batch.");
  });

  it("retries once when DeepSeek returns empty content", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content: "" } }]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content: "Batch batch-1 is stable; keep telemetry running for now." } }]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(enhanced.provider).toBe("deepseek");
    expect(enhanced.message).toBe("Batch batch-1 is stable; keep telemetry running for now.");
  });

  it("retries once when DeepSeek returns clipped content", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content: "No alarms or." } }]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content: "No alarms or QA tasks are open, so continue monitoring for first telemetry." } }]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(enhanced.provider).toBe("deepseek");
    expect(enhanced.message).toBe("No alarms or QA tasks are open, so continue monitoring for first telemetry.");
  });

  it("falls back if DeepSeek returns an error", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "bad key" } }, { status: 401 }))
    );

    const enhanced = await enhanceWithDeepSeek("status?", decision);

    expect(enhanced.provider).toBe("deterministic");
    expect(enhanced.providerError).toBe("bad key");
    expect(enhanced.message).toBe(decision.message);
  });
});
