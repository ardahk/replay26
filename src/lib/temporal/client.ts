import { Client, Connection } from "@temporalio/client";

let clientPromise: Promise<Client> | undefined;

const temporalAddress = () => process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({
      address: temporalAddress()
    }).then((connection) => new Client({ connection }));
  }

  try {
    return await clientPromise;
  } catch (cause) {
    clientPromise = undefined;
    throw new Error(
      "Can't connect to the scheduling service. Start the scheduling server and worker, then refresh.",
      { cause }
    );
  }
}
