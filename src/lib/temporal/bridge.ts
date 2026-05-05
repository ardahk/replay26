import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export async function temporalBridge<T>(op: string, payload: unknown): Promise<T> {
  const root = process.cwd();
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const opsScript = path.join(root, "src", "temporal", "ops.ts");

  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(
      process.execPath,
      [tsxCli, opsScript, op, encode(payload)],
      {
        cwd: root,
        env: process.env,
        timeout: 20_000,
        maxBuffer: 1024 * 1024
      }
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer };
    const detail = err.stderr?.toString().trim() || err.stdout?.toString().trim() || err.message;
    throw new Error(
      `Couldn't reach the brewing control service (${detail}). Ask IT to confirm the scheduling server is running, or try again shortly.`
    );
  }

  if (stderr.trim()) {
    console.warn(stderr.trim());
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(
      "The brewing control service didn't return a usable reply. Check that it is running and try again."
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error("The brewing control service sent back garbled data. Try again or contact support.");
  }
}
