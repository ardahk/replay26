import { getTemporalClient } from "../lib/temporal/client";
import { fermentationWorkflowId } from "../lib/temporal/ids";
import type { SensorScenario } from "../lib/domain/types";
import { sensorReadingSignal } from "../temporal/workflows";
import { createSensorReading } from "./readings";

function argValue(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function run() {
  const batchId = argValue("--batch-id");
  if (!batchId) {
    throw new Error("Missing --batch-id <id>");
  }

  const scenario = (argValue("--scenario", "normal") ?? "normal") as SensorScenario;
  const tickSeconds = Number(argValue("--tick-seconds", "2"));
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(fermentationWorkflowId(batchId));
  let tick = 0;

  console.log(`Simulator sending ${scenario} readings to ${fermentationWorkflowId(batchId)} every ${tickSeconds}s`);
  for (;;) {
    const reading = createSensorReading({ batchId, scenario, tick });
    await handle.signal(sensorReadingSignal, reading);
    console.log(`${reading.timestamp} ${reading.batchId} temp=${reading.temperatureC}C gravity=${reading.gravity}`);
    tick += 1;
    await new Promise((resolve) => setTimeout(resolve, tickSeconds * 1000));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
