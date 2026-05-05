import type { AlarmEvent, ManualTask, SensorReading } from "./types";

export const TEMP_MIN_C = 16;
export const TEMP_MAX_C = 24;
export const PH_MIN = 3.2;
export const PH_MAX = 4.8;
export const GRAVITY_PLATEAU_DELTA = 0.001;

export type AlarmDraft = Omit<AlarmEvent, "id" | "timestamp">;

export function detectAlarmDrafts(reading: SensorReading, recentReadings: SensorReading[]): AlarmDraft[] {
  const alarms: AlarmDraft[] = [];

  if (reading.temperatureC > TEMP_MAX_C || reading.temperatureC < TEMP_MIN_C) {
    alarms.push({
      batchId: reading.batchId,
      type: "temp_excursion",
      severity: reading.temperatureC > 28 || reading.temperatureC < 12 ? "critical" : "warning",
      message: `Temperature excursion at ${reading.temperatureC.toFixed(1)}C`,
      readingId: reading.id
    });
  }

  if (reading.pH < PH_MIN || reading.pH > PH_MAX) {
    alarms.push({
      batchId: reading.batchId,
      type: "ph_out_of_range",
      severity: "warning",
      message: `pH out of range at ${reading.pH.toFixed(2)}`,
      readingId: reading.id
    });
  }

  const lastThree = [...recentReadings.slice(-2), reading];
  if (lastThree.length === 3) {
    const gravitySpread = Math.max(...lastThree.map((item) => item.gravity)) - Math.min(...lastThree.map((item) => item.gravity));
    if (gravitySpread < GRAVITY_PLATEAU_DELTA) {
      alarms.push({
        batchId: reading.batchId,
        type: "gravity_plateau",
        severity: "warning",
        message: "Gravity has plateaued across three readings",
        readingId: reading.id
      });
    }
  }

  const previous = recentReadings.at(-1);
  if (previous && previous.co2Ppm - reading.co2Ppm > 350) {
    alarms.push({
      batchId: reading.batchId,
      type: "co2_drop",
      severity: "warning",
      message: `CO2 dropped sharply from ${previous.co2Ppm}ppm to ${reading.co2Ppm}ppm`,
      readingId: reading.id
    });
  }

  return alarms;
}

export function hasPendingTask(tasks: ManualTask[], reason: string): boolean {
  return tasks.some((task) => task.reason === reason && task.status === "pending");
}
