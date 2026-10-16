import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter } from "@prompthub/db";
import { getCliProcessEntry } from "./helpers/cli-process";

const CLI_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHILD_TIMEOUT_MS = 10_000;
const CHILD_OUTPUT_BYTES = 1_048_576;
let root = "";

function invoke(args: string[], runtimeArgs = ["--data-dir", root]): SpawnSyncReturns<string> {
  const result = spawnSync(
    process.execPath,
    [getCliProcessEntry(), ...runtimeArgs, ...args],
    {
      cwd: CLI_ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
      maxBuffer: CHILD_OUTPUT_BYTES,
    },
  );
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  return result;
}

function success(args: string[]): unknown {
  const result = invoke(args);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function idOf(value: unknown): string {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  throw new Error("CLI response must contain a string id");
}

function prompt(title: string): string {
  return idOf(success(["prompt", "create", "--title", title, "--user-prompt", title]));
}

function readPromptRows(): unknown[] {
  const db = new DatabaseAdapter(path.join(root, "data", "prompthub.db"), { readOnly: true });
  try {
    return db.prepare("SELECT title, user_prompt, folder_id FROM prompts ORDER BY title").all();
  } finally {
    db.close();
  }
}

describe("release acceptance: real CLI processes", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cross-cli-"));
    root = path.join(root, "数据 空格");
  });

  afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

  it.each(["--help", "-h"])("doctor %s explains recovery without opening a database (D01)", (flag) => {
    const result = invoke(["doctor", flag]);
    expect.soft(result.status, result.stderr).toBe(0);
    expect.soft(result.stdout).toContain("database-lock");
    expect.soft(result.stdout).toContain("--recover");
    expect(fs.existsSync(path.join(root, "data", "prompthub.db"))).toBe(false);
  });

  it("doctor help leaves recovery artifacts intact and keeps a missing action invalid", () => {
    const lock = path.join(root, "data", "prompthub.db.lock");
    fs.mkdirSync(lock, { recursive: true });
    const help = invoke(["doctor", "database-lock", "--recover", "--help"]);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("database-lock");
    expect(fs.statSync(lock).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(root, "data", "prompthub.db"))).toBe(false);
    const missing = invoke(["doctor"]);
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stderr)).toMatchObject({ error: { code: "USAGE_ERROR" } });
    expect(fs.statSync(lock).isDirectory()).toBe(true);
  });

  it("runs the README pnpm dev invocation against isolated data (D02)", () => {
    const result = spawnSync("pnpm", ["--filter", "@prompthub/cli", "run", "dev", "--data-dir", root, "prompt", "list"], {
      cwd: CLI_ROOT, env: { ...process.env, NODE_NO_WARNINGS: "1" }, encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS, maxBuffer: CHILD_OUTPUT_BYTES,
    });
    if (result.error) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().endsWith("[]")).toBe(true);
    expect(readPromptRows()).toEqual([]);
  });

  it("uses app-data-dir for the database and preserves data after conflicting output flags", () => {
    const runtimeArgs = ["--app-data-dir", root];
    const created = invoke(["prompt", "create", "--title", "App data", "--user-prompt", "Persisted"], runtimeArgs);
    expect(created.status, created.stderr).toBe(0);
    const id = idOf(JSON.parse(created.stdout));
    expect(fs.existsSync(path.join(root, "PromptHub", "data", "prompthub.db"))).toBe(true);
    expect(fs.existsSync(path.join(root, "data", "prompthub.db"))).toBe(false);
    const rejected = invoke(["--full", "--summary", "prompt", "delete", id], runtimeArgs);
    expect(rejected.status).toBe(2);
    expect(JSON.parse(rejected.stderr)).toMatchObject({ error: { code: "USAGE_ERROR" } });
    const read = invoke(["--full", "prompt", "get", id], runtimeArgs);
    expect(read.status, read.stderr).toBe(0);
    expect(JSON.parse(read.stdout)).toMatchObject({ id, title: "App data", userPrompt: "Persisted" });
  });

  it("persists exact content across CLI processes and preserves it after rejected commands", () => {
    const folderId = idOf(success(["folder", "create", "--name", "验收 📁"]));
    const content = '中文 🦌 "quotes"\n<script>literal</script> SELECT * FROM prompts;';
    const id = idOf(success([
      "prompt", "create", "--title", "Original", "--user-prompt", content,
      "--folder-id", folderId,
    ]));
    expect(success(["--full", "prompt", "get", id])).toMatchObject({ userPrompt: content, folderId });
    success(["prompt", "update", id, "--title", "Updated"]);
    const invalid = invoke(["prompt", "create"]);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stderr)).toMatchObject({ error: { code: "USAGE_ERROR", exitCode: 2 } });
    expect(readPromptRows()).toEqual([{ title: "Updated", user_prompt: content, folder_id: folderId }]);
    expect(success(["prompt", "list"])).toEqual([expect.objectContaining({ id, title: "Updated" })]);
    const quiet = invoke(["--quiet", "prompt", "list"]);
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).toBe("");
    success(["prompt", "delete", id]);
    const missing = invoke(["prompt", "get", id]);
    expect(missing.status).toBe(3);
    expect(JSON.parse(missing.stderr)).toMatchObject({ error: { code: "NOT_FOUND", exitCode: 3 } });
    expect(readPromptRows()).toEqual([]);
    expect(fs.existsSync(path.join(root, "data", "prompthub.db.lock"))).toBe(false);
    const leases = path.join(root, "data", "prompthub.db.clients");
    expect(fs.existsSync(leases) ? fs.readdirSync(leases) : []).toEqual([]);
  });

  it("reads relation changes and output-format ordering from later CLI processes", () => {
    const source = prompt("Source");
    const target = prompt("Target");
    const relationId = idOf(success([
      "prompt", "relation", "create", "--source", source, "--target", target, "--kind", "depends_on",
    ]));
    success(["prompt", "relation", "update", relationId, "--kind", "next_step", "--note", "Next"]);
    expect(success(["prompt", "relation", "list", "--prompt-id", source])).toEqual([
      expect.objectContaining({ id: relationId, kind: "next_step", note: "Next" }),
    ]);
    const itemId = idOf(success(["prompt", "output-format", "create", "--source", source, "--target", target]));
    const order = 4;
    success(["prompt", "output-format", "reorder", "--source", source, "--id", itemId, "--sort-order", String(order)]);
    expect(success(["prompt", "output-format", "list", "--source", source])).toEqual([
      expect.objectContaining({ id: itemId, sourcePromptId: source, targetPromptId: target, sortOrder: order }),
    ]);
    success(["prompt", "relation", "delete", relationId]);
    success(["prompt", "output-format", "delete", itemId]);
    expect(success(["prompt", "relation", "list", "--prompt-id", source])).toEqual([]);
    expect(success(["prompt", "output-format", "list", "--source", source])).toEqual([]);
    expect(readPromptRows()).toEqual([
      { title: "Source", user_prompt: "Source", folder_id: null },
      { title: "Target", user_prompt: "Target", folder_id: null },
    ]);
  });

  it("copies literal variable values and exact metacharacter keys through the real CLI", () => {
    const template = "Before {{value}} after | {{a.b}} | {{axb}} | {{a[b]}}";
    const variables = { value: "$& $$ $` $' 中文 🦌", "a.b": "dot key", "a[b]": "bracket key" };
    const id = idOf(success(["prompt", "create", "--title", "Literal variable copy", "--user-prompt", template]));
    const versions = success(["prompt", "versions", id]);
    const copied = success([
      "prompt", "copy", id,
      ...Object.entries(variables).flatMap(([key, value]) => ["--var", `${key}=${value}`]),
    ]);
    expect.soft(copied).toEqual({
      promptId: id, content: `Before ${variables.value} after | dot key | {{axb}} | bracket key`,
      usageCount: 1, variables,
    });
    expect(success(["--full", "prompt", "get", id])).toMatchObject({ userPrompt: template, usageCount: 1 });
    expect(success(["prompt", "versions", id])).toEqual(versions);
  });
});
