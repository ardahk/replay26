import { defineQuery, proxyActivities, setHandler, sleep, startChild } from "@temporalio/workflow";
import type * as activities from "../activities";
import type { BrewStage, BrewWorkflowStatus, StartBatchInput } from "../../lib/domain/types";
import { fermentationMonitorWorkflow } from "./fermentation";

const activity = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 3 }
});

const DEFAULT_DURATIONS = {
  mash: "10 seconds",
  boil: "10 seconds",
  chill: "5 seconds"
} as const;

export const getBrewStatus = defineQuery<BrewWorkflowStatus>("getBrewStatus");

export async function brewDayWorkflow(input: StartBatchInput): Promise<void> {
  let stage: BrewStage = "queued";
  let updatedAt = input.startedAt;
  let fermentationWorkflowId: string | undefined;

  const status = (): BrewWorkflowStatus => ({
    batchId: input.batchId,
    beerName: input.beerName,
    stage,
    startedAt: input.startedAt,
    updatedAt,
    fermentationWorkflowId
  });

  setHandler(getBrewStatus, status);

  const runStage = async (nextStage: "mash" | "boil" | "chill") => {
    stage = nextStage;
    updatedAt = new Date(Date.now()).toISOString();
    await activity.recordBatchEvent({
      batchId: input.batchId,
      type: `stage_${nextStage}`,
      message: `${input.beerName} moved to ${nextStage}`,
      timestamp: updatedAt,
      beerName: input.beerName
    });
    await sleep(input.stageDurations?.[nextStage] ?? DEFAULT_DURATIONS[nextStage]);
  };

  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "batch_started",
    message: `${input.beerName} brew day started`,
    timestamp: input.startedAt,
    beerName: input.beerName
  });

  await runStage("mash");
  await runStage("boil");
  await runStage("chill");

  stage = "fermentation";
  updatedAt = new Date(Date.now()).toISOString();
  fermentationWorkflowId = `fermentation-${input.batchId}`;

  await startChild(fermentationMonitorWorkflow, {
    workflowId: fermentationWorkflowId,
    args: [{ ...input, startedAt: updatedAt }]
  });

  await activity.recordBatchEvent({
    batchId: input.batchId,
    type: "fermentation_handoff",
    message: `${input.beerName} handed off to fermentation monitor`,
    timestamp: updatedAt,
    beerName: input.beerName
  });

  await sleep("365 days");
}
