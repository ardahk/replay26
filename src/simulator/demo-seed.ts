import { nanoid } from "nanoid";
import { getTemporalClient } from "../lib/temporal/client";
import { brewWorkflowId, fermentationWorkflowId, TASK_QUEUE } from "../lib/temporal/ids";
import { SENSOR_READING_SIGNAL } from "../lib/temporal/messages";
import { createSensorReading } from "./readings";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const batchId = `batch-${nanoid(8)}`;
  const beerName = "Hazy IPA";
  const startedAt = new Date().toISOString();
  const client = await getTemporalClient();

  await client.workflow.start("brewDayWorkflow", {
    taskQueue: TASK_QUEUE,
    workflowId: brewWorkflowId(batchId),
    args: [{ batchId, beerName, startedAt }]
  });

  console.log(`Started ${batchId}. Waiting for fermentation handoff...`);
  await sleep(28_000);

  const fermentation = client.workflow.getHandle(fermentationWorkflowId(batchId));
  for (let tick = 0; tick < 4; tick += 1) {
    await fermentation.signal(SENSOR_READING_SIGNAL, createSensorReading({ batchId, scenario: "normal", tick }));
    await sleep(500);
  }
  await fermentation.signal(SENSOR_READING_SIGNAL, createSensorReading({ batchId, scenario: "temp_spike", tick: 4 }));
  await fermentation.signal(SENSOR_READING_SIGNAL, createSensorReading({ batchId, scenario: "temp_spike", tick: 5 }));

  console.log(`Seeded ${batchId} with normal readings and a temperature spike.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
