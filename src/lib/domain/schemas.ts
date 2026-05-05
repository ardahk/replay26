import { z } from "zod";

export const sensorScenarioSchema = z.enum([
  "normal",
  "stuck_fermentation",
  "temp_spike",
  "crash_recovery"
]);

export const startBatchSchema = z.object({
  batchId: z.string().min(1).optional(),
  beerName: z.string().min(1).default("Hazy IPA")
});

export const sensorReadingSchema = z.object({
  id: z.string().min(1),
  batchId: z.string().min(1),
  scenario: sensorScenarioSchema,
  tick: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
  temperatureC: z.number(),
  gravity: z.number(),
  pH: z.number(),
  co2Ppm: z.number()
});

export const simulatorTickSchema = z.object({
  scenario: sensorScenarioSchema.default("normal"),
  tick: z.number().int().nonnegative().optional()
});

export const simulatorInjectSchema = z.object({
  kind: z.enum(["temp_spike", "stuck_fermentation", "crash_recovery"]).default("temp_spike"),
  tick: z.number().int().nonnegative().optional()
});

export const signalRequestSchema = z.discriminatedUnion("signalName", [
  z.object({
    signalName: z.literal("sensor_reading"),
    payload: sensorReadingSchema
  }),
  z.object({
    signalName: z.literal("manual_override"),
    payload: z.object({
      note: z.string().min(1),
      targetTemperatureC: z.number().optional()
    })
  })
]);

export const approveQaSchema = z.object({
  note: z.string().optional()
});
