import { proxyActivities } from "@temporalio/workflow";
import type { PackagedStockAdjustment } from "../../lib/domain/types";
import type * as activities from "../activities";

const activity = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 }
});

/** Single-step workflow: completes immediately after inventory is written (visible as a finished run in Temporal). */
export async function packagedStockWorkflow(input: PackagedStockAdjustment): Promise<void> {
  await activity.adjustPackagedInventory(input);
}
