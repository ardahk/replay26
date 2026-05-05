import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export async function temporalBridge<T>(op: string, payload: unknown): Promise<T> {
  const { stdout, stderr } = await execFileAsync("pnpm", ["exec", "tsx", "src/temporal/ops.ts", op, encode(payload)], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 20_000,
    maxBuffer: 1024 * 1024
  });
  if (stderr.trim()) {
    console.warn(stderr.trim());
  }
  return JSON.parse(stdout) as T;
}
