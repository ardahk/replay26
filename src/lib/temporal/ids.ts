export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "brewery-task-queue";

export function brewWorkflowId(batchId: string): string {
  return `brew-day-${batchId}`;
}

export function fermentationWorkflowId(batchId: string): string {
  return `fermentation-${batchId}`;
}
