import fs from "fs";
import os from "node:os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDatabase, resetRuntimePaths } from "@prompthub/core";

import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

describe("CLI shared Agent Skills target", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs and safely uninstalls the shared global target", async () => {
    const root = makeTempRoot(tempDirs);
    const homeDir = path.join(root, "home");
    const sourceDir = path.join(root, "shared-target-skill");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: shared-target-skill\n---\n# Shared Target",
      "utf8",
    );

    // os.homedir uses USERPROFILE on Windows; changing HOME alone leaks writes.
    vi.spyOn(os, "homedir").mockReturnValue(homeDir);
    fs.mkdirSync(homeDir, { recursive: true });
    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      sourceDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    const distributeRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install-md",
      "shared-target-skill",
      "--platform",
      "agent-skills-global",
    ]);
    expect(distributeRes.exitCode).toBe(0);
    const targetDir = path.join(
      homeDir,
      ".agents",
      "skills",
      "shared-target-skill",
    );
    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);

    const uninstallRes = await execCli([
      ...withDataDir(root),
      "skill",
      "uninstall-md",
      "shared-target-skill",
      "--platform",
      "agent-skills-global",
    ]);
    expect(uninstallRes.exitCode).toBe(0);
    expect(fs.existsSync(targetDir)).toBe(false);
    expect(fs.existsSync(sourceDir)).toBe(true);
  });
});
