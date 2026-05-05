import { describe, expect, it } from "vitest";
import { createSensorReading } from "./readings";

describe("createSensorReading", () => {
  it("generates normal readings with falling gravity", () => {
    const first = createSensorReading({ batchId: "batch-1", scenario: "normal", tick: 0 });
    const later = createSensorReading({ batchId: "batch-1", scenario: "normal", tick: 8 });

    expect(later.gravity).toBeLessThan(first.gravity);
    expect(first.temperatureC).toBeGreaterThan(16);
    expect(first.temperatureC).toBeLessThan(24);
  });

  it("generates a temperature spike scenario", () => {
    const reading = createSensorReading({ batchId: "batch-1", scenario: "temp_spike", tick: 4 });

    expect(reading.temperatureC).toBeGreaterThan(24);
  });

  it("generates stuck fermentation with nearly flat gravity", () => {
    const a = createSensorReading({ batchId: "batch-1", scenario: "stuck_fermentation", tick: 4 });
    const b = createSensorReading({ batchId: "batch-1", scenario: "stuck_fermentation", tick: 5 });

    expect(Math.abs(a.gravity - b.gravity)).toBeLessThan(0.001);
  });
});
