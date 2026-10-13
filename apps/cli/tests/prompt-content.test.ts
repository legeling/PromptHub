import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

const tempDirs: string[] = [];
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const directory of tempDirs.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

it.each(["inline", "file"])(
  "creates and reopens a system-only Prompt from %s CLI input (#225)",
  async (input) => {
    const root = makeTempRoot(tempDirs, { seedDatabase: false });
    const system = "Return JSON only. 中文 🦌";
    const systemFile = path.join(root, "system.md");
    fs.writeFileSync(systemFile, system);
    const contentArgs =
      input === "file"
        ? ["--system-prompt-file", systemFile]
        : ["--system-prompt", system];
    const result = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "System policy",
      ...contentArgs,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.json).toMatchObject({ systemPrompt: system, userPrompt: "" });
    closeDatabase();
    const read = await execCli([
      ...withDataDir(root),
      "prompt",
      "get",
      result.json.id,
    ]);
    expect(read.exitCode).toBe(0);
    expect(read.json).toMatchObject({
      title: "System policy",
      systemPrompt: system,
      userPrompt: "",
    });
    const versions = await execCli([
      ...withDataDir(root),
      "prompt",
      "versions",
      result.json.id,
    ]);
    expect(versions.exitCode).toBe(0);
    expect(versions.json).toHaveLength(1);
    expect(versions.json[0]).toMatchObject({
      systemPrompt: system,
      userPrompt: "",
    });
  },
);

it("rejects blank creation and invalid partial updates without changing records or versions (#225)", async () => {
  const root = makeTempRoot(tempDirs);
  const base = withDataDir(root);
  const empty = await execCli([
    ...base,
    "prompt",
    "create",
    "--title",
    "Empty",
    "--system-prompt",
    " \n\t ",
  ]);
  expect(empty.exitCode).toBe(2);
  expect(empty.errorJson.error).toMatchObject({
    code: "USAGE_ERROR",
    message: expect.stringContaining("At least one"),
  });
  const created = await execCli([
    ...base,
    "prompt",
    "create",
    "--title",
    "Policy",
    "--system-prompt",
    "Keep JSON",
  ]);
  expect(created.exitCode).toBe(0);
  const id = created.json.id;
  const rename = await execCli([
    ...base,
    "prompt",
    "update",
    id,
    "--title",
    "Renamed",
  ]);
  expect(rename.exitCode).toBe(0);
  const before = await execCli([...base, "prompt", "get", id]);
  const history = await execCli([...base, "prompt", "versions", id]);
  const rejected = await execCli([
    ...base,
    "prompt",
    "update",
    id,
    "--title",
    "Must not save",
    "--system-prompt",
    " \n ",
  ]);
  expect(rejected.exitCode).toBe(2);
  expect(rejected.errorJson.error).toMatchObject({
    code: "USAGE_ERROR",
    message: expect.stringContaining("At least one"),
  });
  expect((await execCli([...base, "prompt", "get", id])).json).toEqual(
    before.json,
  );
  expect((await execCli([...base, "prompt", "versions", id])).json).toEqual(
    history.json,
  );
  expect((await execCli([...base, "prompt", "list"])).json).toHaveLength(1);
});
