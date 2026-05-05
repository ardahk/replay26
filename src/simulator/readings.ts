import { nanoid } from "nanoid";
import type { SensorReading, SensorScenario } from "../lib/domain/types";

export interface ReadingInput {
  batchId: string;
  scenario?: SensorScenario;
  tick?: number;
  timestamp?: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createSensorReading(input: ReadingInput): SensorReading {
  const tick = input.tick ?? 0;
  const scenario = input.scenario ?? "normal";
  const timestamp = input.timestamp ?? new Date().toISOString();

  let temperatureC = 20 + Math.sin(tick / 3) * 0.7;
  let gravity = Math.max(1.008, 1.06 - tick * 0.002);
  let pH = 4.45 - Math.min(tick * 0.015, 0.5);
  let co2Ppm = 450 + Math.min(tick * 60, 900);

  if (scenario === "temp_spike") {
    temperatureC = tick < 2 ? 20.5 : 27.5 + Math.sin(tick) * 1.1;
  }

  if (scenario === "stuck_fermentation") {
    gravity = 1.035 + Math.sin(tick / 5) * 0.0002;
    co2Ppm = 620 + Math.sin(tick / 2) * 20;
  }

  if (scenario === "crash_recovery") {
    temperatureC = tick < 3 ? 12.5 : 18 + Math.min(tick, 8) * 0.35;
    co2Ppm = tick < 3 ? 980 - tick * 420 : 450 + tick * 45;
  }

  return {
    id: `reading-${nanoid(8)}`,
    batchId: input.batchId,
    scenario,
    tick,
    timestamp,
    temperatureC: round(temperatureC, 1),
    gravity: round(gravity, 4),
    pH: round(pH, 2),
    co2Ppm: Math.max(0, Math.round(co2Ppm))
  };
}
