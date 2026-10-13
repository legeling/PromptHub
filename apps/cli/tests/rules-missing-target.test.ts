import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

describe("#193 CLI missing project target", () => {
  const roots: string[] = [];
  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const root of roots.splice(0))
      fs.rmSync(root, { recursive: true, force: true });
  });

  it("persists missing status through scan/list/read and removes only its managed record", async () => {
    const root = makeTempRoot(roots);
    await withTempHome(root, async () => {
      const projectRoot = path.join(root, "project");
      fs.mkdirSync(projectRoot);
      fs.writeFileSync(path.join(projectRoot, "keep.txt"), "External file\n");
      const added = await execCli([
        ...withDataDir(root),
        "rules",
        "add-project",
        "--id",
        "missing-project",
        "--name",
        "Missing project",
        "--root-path",
        projectRoot,
      ]);
      expect(added.exitCode).toBe(0);
      const saved = await execCli([
        ...withDataDir(root),
        "rules",
        "save",
        "project:missing-project",
        "--content",
        "# Managed body\n",
      ]);
      expect(saved.exitCode).toBe(0);
      const before = await execCli([
        ...withDataDir(root),
        "rules",
        "read",
        "project:missing-project",
      ]);
      expect(before.exitCode).toBe(0);
      fs.unlinkSync(path.join(projectRoot, "AGENTS.md"));
      const scan = await execCli([...withDataDir(root), "rules", "scan"]);
      expect(scan.exitCode).toBe(0);
      expect(scan.json).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "project:missing-project",
            exists: false,
            syncStatus: "target-missing",
          }),
        ]),
      );
      closeDatabase();
      const listed = await execCli([...withDataDir(root), "rules", "list"]);
      expect(listed.exitCode).toBe(0);
      expect(listed.json).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "project:missing-project",
            exists: false,
            syncStatus: "target-missing",
          }),
        ]),
      );
      const read = await execCli([
        ...withDataDir(root),
        "rules",
        "read",
        "project:missing-project",
      ]);
      expect(read.exitCode).toBe(0);
      expect(read.json.content).toBe("# Managed body\n");
      expect(read.json.versions).toEqual(before.json.versions);
      const removed = await execCli([
        ...withDataDir(root),
        "rules",
        "remove-project",
        "missing-project",
      ]);
      expect(removed.exitCode).toBe(0);
      closeDatabase();
      const after = await execCli([...withDataDir(root), "rules", "list"]);
      expect(after.exitCode).toBe(0);
      expect(after.json).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "project:missing-project" }),
        ]),
      );
      expect(fs.readFileSync(path.join(projectRoot, "keep.txt"), "utf8")).toBe(
        "External file\n",
      );
    });
  });
});
