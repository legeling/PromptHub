import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { AgentSettingsRepository, closeDatabase, configureRuntimePaths, initDatabase, resetRuntimePaths } from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";

const execute = promisify(execFile);
const CLI_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHILD_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BYTES = 1_048_576;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function object(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  throw new Error("Expected a JSON object");
}

export function string(value: unknown): string {
  if (typeof value === "string") return value;
  throw new Error("Expected a string");
}

export function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error("Expected a JSON array");
}

export async function invoke(profile: string, args: string[], status = 0): Promise<unknown> {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    ({ stdout, stderr } = await execute(process.execPath, ["--import", "tsx", "src/index.ts", "--data-dir", profile, ...args], {
      cwd: CLI_ROOT, env: { ...process.env, NODE_NO_WARNINGS: "1" },
      encoding: "utf8", timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES,
    }));
  } catch (cause) {
    const error = object(cause);
    if (typeof error.code !== "number") throw cause;
    exitCode = error.code;
    stdout = string(error.stdout);
    stderr = string(error.stderr);
  }
  expect(exitCode, stderr).toBe(status);
  return JSON.parse(status === 0 ? stdout : stderr);
}

export function isolateAgents(profile: string, root: string): void {
  configureRuntimePaths({ userDataPath: profile });
  try {
    const repository = new AgentSettingsRepository(initDatabase());
    repository.patch({ builtinAgentOverrides: Object.fromEntries(SKILL_PLATFORMS.map((platform) => {
      const rootPath = path.join(root, "agents", platform.id);
      fs.mkdirSync(rootPath, { recursive: true });
      return [platform.id, { rootPath }];
    })), customAgents: [], disabledPlatformIds: [] });
  } finally { closeDatabase(); resetRuntimePaths(); }
}

export function inventory(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(relative: string): void {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) files[name] = fs.readFileSync(path.join(root, name)).toString("base64");
      else throw new Error(`Unexpected fixture entry: ${name}`);
    }
  }
  visit("");
  return files;
}
