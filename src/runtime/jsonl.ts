import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

type RuntimeFile = "events" | "readings" | "alarms" | "manual_tasks" | "inventory" | "orders";

function runtimeDir(): string {
  return process.env.RUNTIME_DIR ?? ".runtime";
}

function runtimeRoot(): string {
  const dir = runtimeDir();
  return path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ process.cwd(), dir);
}

function filePath(file: RuntimeFile): string {
  return path.join(runtimeRoot(), `${file}.jsonl`);
}

export async function appendJsonl(file: RuntimeFile, value: unknown): Promise<void> {
  await mkdir(runtimeRoot(), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  await appendFile(filePath(file), line, "utf8");
}

export async function readJsonl<T>(file: RuntimeFile): Promise<T[]> {
  try {
    const content = await readFile(filePath(file), "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}
