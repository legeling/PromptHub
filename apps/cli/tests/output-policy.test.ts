import fs from "fs";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import {
  countSkillFiles,
  skillOutputPayload,
  summarizeSkill,
  summarizeSkillVersion,
} from "@prompthub/core/cli/skill-output";
import type { Skill, SkillVersion } from "@prompthub/shared/types";

import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

function writeSkill(root: string, name: string): string {
  const skillDir = path.join(root, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, "version: 1.2.3", "---", "", "# Body"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(skillDir, "guide.md"), "guide body", "utf8");
  return skillDir;
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-id",
    name: "summary-skill",
    protocol_type: "skill",
    is_favorite: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe("CLI output detail policy", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses bounded summaries by default and preserves full Skill payloads on demand", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = writeSkill(root, "output-policy-skill");

    const imported = await execCli([
      ...withDataDir(root),
      "skill",
      "import",
      skillDir,
    ]);
    expect(imported.exitCode).toBe(0);
    expect(imported.json).toMatchObject({
      name: "output-policy-skill",
      version: "1.2.3",
      fileCount: 2,
    });
    expect(imported.json).not.toHaveProperty("content");
    expect(imported.json).not.toHaveProperty("instructions");
    expect(imported.json).not.toHaveProperty("local_repo_path");

    const full = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "get",
      "output-policy-skill",
    ]);
    expect(full.exitCode).toBe(0);
    expect(full.json.content).toContain("# Body");
    expect(full.json.local_repo_path).toBe(
      path.join(root, "user-data", "data", "skills", full.json.id, "files"),
    );
  });

  it("does not rewrite the imported package just to build a summary", async () => {
    const root = makeTempRoot(tempDirs);
    const jsonPath = path.join(root, "database-only.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        name: "database-only-skill",
        instructions: "# Stored in SQLite",
      }),
      "utf8",
    );

    const imported = await execCli([
      ...withDataDir(root),
      "skill",
      "import",
      jsonPath,
    ]);
    expect(imported.exitCode).toBe(0);
    expect(imported.json).toMatchObject({
      name: "database-only-skill",
      fileCount: 1,
    });

    const managedPath = path.join(
      root,
      "user-data",
      "data",
      "skills",
      imported.json.id,
      "files",
    );
    const original = fs.readFileSync(path.join(managedPath, "SKILL.md"));
    const originalMtime = fs.statSync(
      path.join(managedPath, "SKILL.md"),
    ).mtimeMs;

    const detail = await execCli([
      ...withDataDir(root),
      "skill",
      "get",
      "database-only-skill",
    ]);
    expect(detail.exitCode).toBe(0);
    expect(detail.json.fileCount).toBe(1);
    expect(fs.readFileSync(path.join(managedPath, "SKILL.md"))).toEqual(
      original,
    );
    expect(fs.statSync(path.join(managedPath, "SKILL.md")).mtimeMs).toBe(
      originalMtime,
    );
  });

  it("summarizes version snapshots without returning file contents", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = writeSkill(root, "version-summary-skill");
    await execCli([...withDataDir(root), "skill", "import", skillDir]);

    const summary = await execCli([
      ...withDataDir(root),
      "skill",
      "create-version",
      "version-summary-skill",
    ]);
    expect(summary.exitCode).toBe(0);
    expect(summary.json).toMatchObject({ version: 1, fileCount: 2 });
    expect(summary.json).not.toHaveProperty("content");
    expect(summary.json).not.toHaveProperty("filesSnapshot");

    const full = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "versions",
      "version-summary-skill",
    ]);
    expect(full.exitCode).toBe(0);
    expect(full.json[0].filesSnapshot).toHaveLength(2);
    expect(full.json[0].filesSnapshot[0]).toHaveProperty("content");
  });

  it("keeps summary fallbacks bounded and side-effect free", async () => {
    const root = makeTempRoot(tempDirs);
    const regularFile = path.join(root, "not-a-package.md");
    const missingPath = path.join(root, "missing-package");
    fs.writeFileSync(regularFile, "content", "utf8");

    expect(
      countSkillFiles([
        { path: "docs", isDirectory: true },
        { path: "SKILL.md", isDirectory: false },
      ]),
    ).toBe(1);
    expect(summarizeSkill(null)).toBeNull();
    expect(summarizeSkill(makeSkill())).not.toHaveProperty("fileCount");
    expect(summarizeSkillVersion(null)).toBeNull();
    expect(
      summarizeSkillVersion({
        id: "version-id",
        skillId: "skill-id",
        version: 1,
        content: "legacy content",
        createdAt: "2026-07-16T00:00:00.000Z",
      } satisfies SkillVersion),
    ).toMatchObject({ fileCount: 1 });
    expect(
      summarizeSkillVersion({
        id: "empty-version-id",
        skillId: "skill-id",
        version: 2,
        createdAt: "2026-07-16T00:00:00.000Z",
      } satisfies SkillVersion),
    ).toMatchObject({ fileCount: 0 });

    const summaryContext = { detail: "summary" } as Parameters<
      typeof skillOutputPayload
    >[0];
    const fullContext = { detail: "full" } as Parameters<
      typeof skillOutputPayload
    >[0];
    const unusedSkillDb = undefined as unknown as Parameters<
      typeof skillOutputPayload
    >[1];
    const fullSkill = makeSkill({ content: "full content" });

    expect(
      await skillOutputPayload(fullContext, unusedSkillDb, fullSkill),
    ).toBe(fullSkill);
    expect(
      await skillOutputPayload(summaryContext, unusedSkillDb, null),
    ).toBeNull();
    expect(
      await skillOutputPayload(
        summaryContext,
        unusedSkillDb,
        makeSkill({ content: "fallback", local_repo_path: regularFile }),
      ),
    ).toMatchObject({ fileCount: 1 });
    expect(
      await skillOutputPayload(
        summaryContext,
        unusedSkillDb,
        makeSkill({ local_repo_path: missingPath }),
      ),
    ).toMatchObject({ fileCount: 0 });
  });

  it("suppresses successful stdout in quiet mode but keeps errors visible", async () => {
    const root = makeTempRoot(tempDirs);
    const quiet = await execCli([
      ...withDataDir(root),
      "--quiet",
      "skill",
      "list",
    ]);
    expect(quiet.exitCode).toBe(0);
    expect(quiet.stdout).toEqual([]);

    const failed = await execCli([
      ...withDataDir(root),
      "--quiet",
      "skill",
      "unknown-action",
    ]);
    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).not.toEqual([]);

    const conflict = await execCli([
      ...withDataDir(root),
      "--summary",
      "--full",
      "skill",
      "list",
    ]);
    expect(conflict.exitCode).toBe(2);
    expect(conflict.errorJson.error.code).toBe("USAGE_ERROR");
  });

  it("provides import, distribute, and undistribute command semantics", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = writeSkill(root, "command-semantics-skill");
    expect(
      (await execCli([...withDataDir(root), "skill", "import", skillDir]))
        .exitCode,
    ).toBe(0);

    await withTempHome(root, async (homeDir) => {
      const destination = path.join(
        homeDir,
        ".claude",
        "skills",
        "command-semantics-skill",
      );
      const distributed = await execCli([
        ...withDataDir(root),
        "skill",
        "distribute",
        "command-semantics-skill",
        "--platform",
        "claude",
      ]);
      expect(distributed.exitCode).toBe(0);
      expect(fs.existsSync(destination)).toBe(true);

      const removed = await execCli([
        ...withDataDir(root),
        "skill",
        "undistribute",
        "command-semantics-skill",
        "--platform",
        "claude",
      ]);
      expect(removed.exitCode).toBe(0);
      expect(fs.existsSync(destination)).toBe(false);
    });
  });
});
