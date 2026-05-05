import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendJsonl, readJsonl } from "./jsonl";

let previousRuntimeDir: string | undefined;
let tempDir: string;

beforeEach(async () => {
  previousRuntimeDir = process.env.RUNTIME_DIR;
  tempDir = await mkdtemp(path.join(tmpdir(), "replay26-jsonl-"));
  process.env.RUNTIME_DIR = tempDir;
});

afterEach(async () => {
  if (previousRuntimeDir === undefined) {
    delete process.env.RUNTIME_DIR;
  } else {
    process.env.RUNTIME_DIR = previousRuntimeDir;
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe("jsonl runtime helpers", () => {
  it("appends and reads jsonl records", async () => {
    await appendJsonl("events", { id: "one" });
    await appendJsonl("events", { id: "two" });

    await expect(readJsonl<{ id: string }>("events")).resolves.toEqual([{ id: "one" }, { id: "two" }]);
  });
});
