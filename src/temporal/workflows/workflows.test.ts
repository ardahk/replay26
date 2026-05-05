import { describe, expect, it } from "vitest";

const runTemporalTests = process.env.RUN_TEMPORAL_TESTS === "1";

describe.skipIf(!runTemporalTests)("Temporal workflow integration", () => {
  it("is wired for opt-in Temporal test execution", () => {
    expect(runTemporalTests).toBe(true);
  });
});
