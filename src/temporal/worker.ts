import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { TASK_QUEUE } from "../lib/temporal/ids";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  });

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve("./workflows"),
    activities
  });

  console.log(`Temporal worker polling task queue "${TASK_QUEUE}"`);
  await worker.run();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
