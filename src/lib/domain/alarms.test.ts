import { describe, expect, it } from "vitest";
import { detectAlarmDrafts } from "./alarms";
import type { SensorReading } from "./types";

function reading(overrides: Partial<SensorReading>): SensorReading {
  return {
    id: "reading-1",
    batchId: "batch-1",
    scenario: "normal",
    tick: 0,
    timestamp: "2026-05-05T00:00:00.000Z",
    temperatureC: 20,
    gravity: 1.04,
    pH: 4.2,
    co2Ppm: 700,
    ...overrides
  };
}

describe("detectAlarmDrafts", () => {
  it("flags temperature excursions", () => {
    const alarms = detectAlarmDrafts(reading({ temperatureC: 27 }), []);

    expect(alarms.map((alarm) => alarm.type)).toContain("temp_excursion");
  });

  it("flags gravity plateau across three readings", () => {
    const previous = [reading({ id: "a", gravity: 1.035 }), reading({ id: "b", gravity: 1.0352 })];
    const alarms = detectAlarmDrafts(reading({ id: "c", gravity: 1.0351 }), previous);

    expect(alarms.map((alarm) => alarm.type)).toContain("gravity_plateau");
  });

  it("flags sharp CO2 drops", () => {
    const alarms = detectAlarmDrafts(reading({ co2Ppm: 500 }), [reading({ id: "previous", co2Ppm: 900 })]);

    expect(alarms.map((alarm) => alarm.type)).toContain("co2_drop");
  });
});
