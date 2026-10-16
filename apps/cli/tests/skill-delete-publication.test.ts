import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import {
  closeDatabase,
  configureRuntimePaths,
  initDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

it("preserves the managed package when SQL deletion fails, including an explicit purge request", async () => {
  const directories: string[] = [];
  const root = makeTempRoot(directories);
  const source = path.join(root, "source.json");
  fs.writeFileSync(
    source,
    JSON.stringify({
      name: "delete-publication",
      instructions: "Retained content",
    }),
  );
  try {
    const installed = await execCli([
      ...withDataDir(root),
      "skill",
      "import",
      source,
    ]);
    expect(installed.exitCode).toBe(0);
    const packagePath = path.join(
      root,
      "user-data",
      "data",
      "skills",
      installed.json.id,
      "files",
    );
    const original = fs.readFileSync(path.join(packagePath, "SKILL.md"));
    configureRuntimePaths({ userDataPath: path.join(root, "user-data") });
    initDatabase().exec(
      "CREATE TRIGGER reject_delete BEFORE DELETE ON skills BEGIN SELECT RAISE(ABORT, 'delete rejected'); END",
    );
    closeDatabase();
    const command = [
      ...withDataDir(root),
      "skill",
      "delete",
      installed.json.id,
      "--purge-managed-repo",
      "--keep-platform-installs",
    ];
    const failed = await execCli(command);
    expect(failed.exitCode).not.toBe(0);
    expect(fs.readFileSync(path.join(packagePath, "SKILL.md"))).toEqual(
      original,
    );
    expect(
      (await execCli([...withDataDir(root), "skill", "get", installed.json.id]))
        .exitCode,
    ).toBe(0);
    configureRuntimePaths({ userDataPath: path.join(root, "user-data") });
    initDatabase().exec("DROP TRIGGER reject_delete");
    closeDatabase();
    const deleted = await execCli(command);
    expect(deleted.exitCode).toBe(0);
    expect(deleted.json.managedRepoPurged).toBe(true);
    expect(fs.existsSync(packagePath)).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
    expect(
      (await execCli([...withDataDir(root), "skill", "get", installed.json.id]))
        .exitCode,
    ).not.toBe(0);
  } finally {
    closeDatabase();
    resetRuntimePaths();
    for (const directory of directories)
      fs.rmSync(directory, { recursive: true, force: true });
  }
});
