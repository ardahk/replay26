import { Client, Connection } from "@temporalio/client";

let clientPromise: Promise<Client> | undefined;

export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
    }).then((connection) => new Client({ connection }));
  }

  return clientPromise;
}
