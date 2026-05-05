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

export const agentChatSchema = z.object({
  batchId: z.string().min(1).optional(),
  message: z.string().min(1),
  pendingAction: z
    .object({
      type: z.enum(["approve_qa", "send_signal"]),
      payload: z.unknown()
    })
    .optional(),
  confirm: z.boolean().default(false)
});

export const customerSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional()
});

export const orderCreateSchema = z.object({
  customer: customerSchema,
  product: z.string().min(1),
  quantity: z.number().int().positive(),
  requestedDate: z.string().optional()
});

export const inventoryItemSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  unit: z.enum(["keg", "case", "can"]),
  batchId: z.string().optional(),
  updatedAt: z.string().min(1).optional()
});
