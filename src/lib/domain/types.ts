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

/** Demo / integration: bump packaged counts through Temporal so runs show up as completed workflows. */
export interface PackagedStockAdjustment {
  productName: string;
  sku?: string;
  quantityDelta: number;
  unit?: InventoryItem["unit"];
  /** Optional link back to the batch that was packaged */
  sourceBatchId?: string;
}

export interface Order {
  id: string;
  customer: Customer;
  product: string;
  quantity: number;
  requestedDate?: string;
  status: "created" | "pending_batch" | "ready";
  createdAt: string;
  /** Latest mutation time for JSONL merge / UI */
  updatedAt?: string;
}

export type OrderFulfillmentPhase = "allocating" | "awaiting_inventory" | "fulfilled";

/** Live snapshot from `orderFulfillmentWorkflow` query (running workflows only). */
export interface OrderFulfillmentLiveState {
  orderId: string;
  phase: OrderFulfillmentPhase;
  order: Order;
}

/** Order row merged from JSONL plus optional Temporal fulfillment query. */
export interface OrderWithFulfillment extends Order {
  fulfillment: OrderFulfillmentLiveState | null;
}
