export type BrewStage = "queued" | "mash" | "boil" | "chill" | "fermentation";

export type BatchStatus = "running" | "needs_attention" | "complete";

export type SensorScenario = "normal" | "stuck_fermentation" | "temp_spike" | "crash_recovery";

export type AlarmType = "temp_excursion" | "gravity_plateau" | "ph_out_of_range" | "co2_drop";

export type AlarmSeverity = "info" | "warning" | "critical";

export interface Batch {
  batchId: string;
  beerName: string;
  status: BatchStatus;
  createdAt: string;
}

export interface StartBatchInput {
  batchId: string;
  beerName: string;
  startedAt: string;
  stageDurations?: Partial<Record<"mash" | "boil" | "chill", string>>;
}

export interface BrewWorkflowStatus {
  batchId: string;
  beerName: string;
  stage: BrewStage;
  startedAt: string;
  updatedAt: string;
  fermentationWorkflowId?: string;
}

export interface SensorReading {
  id: string;
  batchId: string;
  scenario: SensorScenario;
  tick: number;
  timestamp: string;
  temperatureC: number;
  gravity: number;
  pH: number;
  co2Ppm: number;
}

export interface AlarmEvent {
  id: string;
  batchId: string;
  type: AlarmType;
  severity: AlarmSeverity;
  message: string;
  readingId?: string;
  timestamp: string;
}

export interface ManualTask {
  id: string;
  batchId: string;
  kind: "qa_checkpoint";
  reason: string;
  status: "pending" | "approved";
  createdAt: string;
  approvedAt?: string;
  note?: string;
}

export interface FermentationStatus {
  batchId: string;
  beerName: string;
  health: BatchStatus;
  latestReading?: SensorReading;
  readingCount: number;
  alarms: AlarmEvent[];
  pendingTasks: ManualTask[];
  updatedAt: string;
}

export interface ManualOverrideInput {
  note: string;
  targetTemperatureC?: number;
}

export interface ApproveQaInput {
  taskId: string;
  note?: string;
}

export interface BatchEvent {
  batchId: string;
  type: string;
  message: string;
  timestamp: string;
  beerName?: string;
}

export interface BatchSummary {
  batchId: string;
  beerName: string;
  status: BatchStatus;
  stage: BrewStage;
  startedAt: string;
  updatedAt: string;
  latestReading?: SensorReading;
  alarmCount: number;
  pendingTaskCount: number;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
}

export interface InventoryItem {
  sku: string;
  productName: string;
  quantity: number;
  unit: "keg" | "case" | "can";
  batchId?: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  customer: Customer;
  product: string;
  quantity: number;
  requestedDate?: string;
  status: "created" | "pending_batch" | "ready";
  createdAt: string;
}
