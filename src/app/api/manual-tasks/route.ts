import { NextResponse } from "next/server";
import { getManualTasks } from "../../../runtime/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId") ?? undefined;
  const tasks = await getManualTasks(batchId);
  return NextResponse.json({ tasks });
}
