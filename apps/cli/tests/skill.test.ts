import fs from "fs";
import path from "path";
import { PassThrough } from "stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeDatabase,
  createCliSkillService,
  resetRuntimePaths,
  runCli,
} from "@prompthub/core";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";

import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

describe("CLI skill commands", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs a local skill from JSON", async () => {
    const root = makeTempRoot(tempDirs);
    const skillJsonPath = path.join(root, "skill.json");
    fs.writeFileSync(
      skillJsonPath,
      JSON.stringify(
        {
          name: "json-skill",
          description: "Imported from json",
          version: "1.2.3",
          author: "CLI Test",
          instructions: "# JSON Skill",
          tags: ["json"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      [...withDataDir(root), "skill", "install", skillJsonPath],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join("\n")).name).toBe("json-skill");
  });

  it("does not silently truncate long local JSON skill fields", async () => {
    const root = makeTempRoot(tempDirs);
    const skillJsonPath = path.join(root, "long-skill.json");
    const longDescription = `desc-${"d".repeat(12_000)}`;
    const longInstructions = `# Long JSON Skill\n\n${"Keep this content.\n".repeat(700)}done`;
    const longTag = `tag-${"x".repeat(180)}`;
    const longSourceUrl = `https://example.com/${"path/".repeat(300)}`;

    fs.writeFileSync(
      skillJsonPath,
      JSON.stringify(
        {
          name: "long-json-skill",
          description: longDescription,
          version: `1.0.0-${"v".repeat(300)}`,
          author: `author-${"a".repeat(300)}`,
          instructions: longInstructions,
          tags: [longTag],
          source_url: longSourceUrl,
        },
        null,
        2,
      ),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "install",
      skillJsonPath,
    ]);
    expect(installRes.exitCode).toBe(0);

    const exportRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "long-json-skill",
      "--format",
      "json",
    ]);

    expect(exportRes.exitCode).toBe(0);
    expect(exportRes.json.description).toBe(longDescription);
    expect(exportRes.json.version).toBe(`1.0.0-${"v".repeat(300)}`);
    expect(exportRes.json.author).toBe(`author-${"a".repeat(300)}`);
    expect(exportRes.json.instructions).toBe(longInstructions);
    expect(exportRes.json.tags).toEqual([longTag]);
    expect(exportRes.json.source_url).toBe(longSourceUrl);
  });

  it("scans a custom local skill directory", async () => {
    const root = makeTempRoot(tempDirs);
    const scanRoot = path.join(root, "scan-root");
    const skillDir = path.join(scanRoot, "writer-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: writer-skill",
        "description: Skill scan target",
        "version: 1.0.0",
        "author: CLI Scan",
        "tags: [scan, test]",
        "---",
        "",
        "# Writer Skill",
      ].join("\n"),
      "utf8",
    );

    const result = await execCli([
      ...withDataDir(root),
      "skill",
      "scan",
      scanRoot,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toHaveLength(1);
    expect(result.json[0]).toMatchObject({
      name: "writer-skill",
      localPath: skillDir,
    });
  });

  it("installs a remote https skill with injected fetch", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          [
            "---",
            "name: remote-skill",
            "description: Remote install",
            "version: 0.9.0",
            "author: Remote",
            "---",
            "",
            "# Remote Skill",
          ].join("\n"),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://example.com/skill.md",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ fetchImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/skill.md");
    expect(JSON.parse(stdout.join("\n")).name).toBe("remote-skill");
  });

  it("installs a github skill with injected git clone", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      fs.mkdirSync(destinationDir, { recursive: true });
      fs.writeFileSync(
        path.join(destinationDir, "SKILL.md"),
        [
          "---",
          "name: github-skill",
          "description: Github install",
          "version: 2.0.0",
          "author: Github",
          "---",
          "",
          "# Github Skill",
        ].join("\n"),
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "--full",
        "skill",
        "install",
        "https://github.com/acme/github-skill",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(gitCloneImpl).toHaveBeenCalled();
    const installed = JSON.parse(stdout.join("\n"));
    expect(installed).toMatchObject({
      name: "github-skill",
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      source_binding_state: "bound",
    });
    expect(installed.installed_directory_fingerprint).toBe(
      installed.directory_fingerprint,
    );
  });

  it("installs only the nested directory that contains SKILL.md from a github repo", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      const skillDir = path.join(destinationDir, "skills", "nested-skill");
      fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          "name: nested-skill",
          "description: Nested github install",
          "version: 1.0.0",
          "author: Github",
          "---",
          "",
          "# Nested Github Skill",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillDir, "assets", "helper.txt"),
        "nested",
        "utf8",
      );
      fs.writeFileSync(
        path.join(destinationDir, "README.md"),
        "repo root readme",
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "--full",
        "skill",
        "install",
        "https://github.com/acme/nested-skill-repo",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const installed = JSON.parse(stdout.join("\n"));
    expect(installed.local_repo_path).toContain("acme-nested-skill-repo");
    expect(
      fs.readFileSync(
        path.join(installed.local_repo_path, "assets", "helper.txt"),
        "utf8",
      ),
    ).toBe("nested");
    expect(
      fs.existsSync(path.join(installed.local_repo_path, "README.md")),
    ).toBe(false);
  });

  it("rejects github repo install when multiple skill directories are found", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      const skillA = path.join(destinationDir, "skills", "a-skill");
      const skillB = path.join(destinationDir, "skills", "b-skill");
      fs.mkdirSync(skillA, { recursive: true });
      fs.mkdirSync(skillB, { recursive: true });
      fs.writeFileSync(
        path.join(skillA, "SKILL.md"),
        "---\nname: a-skill\n---\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillB, "SKILL.md"),
        "---\nname: b-skill\n---\n",
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://github.com/acme/multi-skill-repo",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.join("\n")).toContain(
      "Multiple skill directories found in repository",
    );
  });

  it("deletes a skill while keeping platform installs when requested", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "keep-platform-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: keep-platform-skill",
        "description: Keep platform install flag",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Keep Platform Skill",
      ].join("\n"),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    const uninstallSkillMd = vi.fn(async () => undefined);
    const skillService = {
      ...createCliSkillService(),
      uninstallSkillMd,
    };

    const deleteRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "delete",
        "keep-platform-skill",
        "--keep-platform-installs",
      ],
      skillService,
    );

    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.platformInstallsKept).toBe(true);
    expect(deleteRes.json.uninstallResults).toEqual([]);
    expect(uninstallSkillMd).not.toHaveBeenCalled();
  });

  it("captures platform uninstall failures during skill delete", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "uninstall-failure-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: uninstall-failure-skill",
        "description: Delete flow coverage",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Uninstall Failure Skill",
      ].join("\n"),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    const baseSkillService = createCliSkillService();
    const firstPlatform = baseSkillService.getSupportedPlatforms()[0];
    const skillService = {
      ...baseSkillService,
      uninstallSkillMd: vi.fn(
        async (_skillName: string, platformId: string) => {
          if (platformId === firstPlatform.id) {
            throw new Error("mock uninstall failure");
          }
        },
      ),
    };

    const deleteRes = await execCli(
      [...withDataDir(root), "skill", "delete", "uninstall-failure-skill"],
      skillService,
    );

    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.deleted).toBe(true);
    const rejected = deleteRes.json.uninstallResults.find(
      (result: { platform: string; status: string }) =>
        result.platform === firstPlatform.id && result.status === "rejected",
    );
    expect(rejected).toMatchObject({
      platform: firstPlatform.id,
      status: "rejected",
      reason: "mock uninstall failure",
    });
  });

  it("renders skill scan table output when a safety report has no findings array", async () => {
    const root = makeTempRoot(tempDirs);
    const partialSafetyReport = {
      level: "warn",
    } as unknown as SkillSafetyReport;
    const skillService = {
      ...createCliSkillService(),
      scanLocalPreview: vi.fn(async () => [
        {
          name: "partial-report-skill",
          description: "Partial safety report fixture",
          author: "CLI Test",
          tags: [],
          instructions: "# Partial Report Skill",
          filePath: path.join(root, "partial-report-skill", "SKILL.md"),
          localPath: path.join(root, "partial-report-skill"),
          platforms: ["Custom"],
          safetyReport: partialSafetyReport,
        },
      ]),
    };

    const result = await execCli(
      [...withDataDir(root), "--output", "table", "skill", "scan", root],
      skillService,
    );

    expect(result.exitCode).toBe(0);
    expect(result.joinedStdout).toContain("partial-report-skill");
    expect(result.joinedStdout).toContain("warn");
    expect(result.joinedStdout).toContain("0");
    expect(result.stderr).toEqual([]);
  });

  it("supports skill versions, repo operations, export, sync, safety scan, and rollback", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "writer-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: writer-skill",
        "description: Original skill",
        "version: 1.0.0",
        "author: CLI Test",
        "tags: [writing, safe]",
        "---",
        "",
        "# Writer Skill",
        "",
        "Use calm language.",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(skillDir, "guide.md"), "Guide v1", "utf8");

    const installRes = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);
    expect(installRes.json.name).toBe("writer-skill");
    expect(installRes.json).toMatchObject({
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      source_binding_state: "bound",
    });
    expect(installRes.json.installed_directory_fingerprint).toBe(
      installRes.json.directory_fingerprint,
    );

    const createVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "create-version",
      "writer-skill",
      "--note",
      "baseline",
    ]);
    expect(createVersionRes.exitCode).toBe(0);
    expect(createVersionRes.json.note).toBe("baseline");

    const mkdirRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-mkdir",
      "writer-skill",
      "--path",
      "notes",
    ]);
    expect(mkdirRes.exitCode).toBe(0);
    expect(mkdirRes.json.created).toBe(true);

    const writeRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "notes/draft.md",
      "--content",
      "Draft note",
    ]);
    expect(writeRes.exitCode).toBe(0);
    expect(writeRes.json.written).toBe(true);

    const renameRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-rename",
      "writer-skill",
      "--from",
      "notes/draft.md",
      "--to",
      "notes/final.md",
    ]);
    expect(renameRes.exitCode).toBe(0);
    expect(renameRes.json.renamed).toBe(true);

    const repoReadRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "notes/final.md",
    ]);
    expect(repoReadRes.exitCode).toBe(0);
    expect(repoReadRes.json).toEqual({
      path: "notes/final.md",
      content: "Draft note",
      encoding: "text",
      isDirectory: false,
    });

    const repoFilesRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-files",
      "writer-skill",
    ]);
    expect(repoFilesRes.exitCode).toBe(0);
    expect(repoFilesRes.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md", isDirectory: false }),
        expect.objectContaining({ path: "guide.md", isDirectory: false }),
        expect.objectContaining({ path: "notes", isDirectory: true }),
        expect.objectContaining({ path: "notes/final.md", isDirectory: false }),
      ]),
    );

    const syncedSkillMd = [
      "---",
      "name: writer-skill",
      "description: Synced skill",
      "version: 2.0.0",
      "author: CLI Test",
      "tags: [writing, risky]",
      "---",
      "",
      "# Writer Skill",
      "",
      "Use curl before publishing.",
    ].join("\n");

    await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "SKILL.md",
      "--content",
      syncedSkillMd,
    ]);
    await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "guide.md",
      "--content",
      "Guide v2",
    ]);

    const syncRes = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "sync-from-repo",
      "writer-skill",
    ]);
    expect(syncRes.exitCode).toBe(0);
    expect(syncRes.json.description).toBe("Synced skill");
    expect(syncRes.json.version).toBe("2.0.0");
    expect(syncRes.json.tags).toEqual(["writing", "risky"]);

    const safetyRes = await execCli([
      ...withDataDir(root),
      "skill",
      "scan-safety",
      "writer-skill",
    ]);
    expect(safetyRes.exitCode).toBe(0);
    expect(safetyRes.json.level).toBe("safe");
    expect(safetyRes.json.scanMethod).toBe("preflight");
    expect(safetyRes.json.findings).toEqual([]);

    const createSyncedVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "create-version",
      "writer-skill",
      "--note",
      "synced",
    ]);
    expect(createSyncedVersionRes.exitCode).toBe(0);
    expect(createSyncedVersionRes.json.note).toBe("synced");

    const versionsRes = await execCli([
      ...withDataDir(root),
      "skill",
      "versions",
      "writer-skill",
    ]);
    expect(versionsRes.exitCode).toBe(0);
    expect(versionsRes.json).toHaveLength(2);
    expect(
      versionsRes.json.map((version: { note?: string }) => version.note),
    ).toEqual(["synced", "baseline"]);

    const exportJsonRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "writer-skill",
      "--format",
      "json",
    ]);
    expect(exportJsonRes.exitCode).toBe(0);
    expect(exportJsonRes.json.name).toBe("writer-skill");
    expect(exportJsonRes.json.version).toBe("2.0.0");

    const exportSkillMdRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "writer-skill",
      "--format",
      "skillmd",
    ]);
    expect(exportSkillMdRes.exitCode).toBe(0);
    expect(exportSkillMdRes.joinedStdout).toContain("name: writer-skill");
    expect(exportSkillMdRes.joinedStdout).toContain(
      "Use curl before publishing.",
    );

    const rollbackRes = await execCli([
      ...withDataDir(root),
      "--full",
      "skill",
      "rollback",
      "writer-skill",
      "--version",
      "1",
    ]);
    expect(rollbackRes.exitCode).toBe(0);
    expect(rollbackRes.json.content).toContain("Use calm language.");

    const rolledBackSkillMdRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "SKILL.md",
    ]);
    expect(rolledBackSkillMdRes.exitCode).toBe(0);
    expect(rolledBackSkillMdRes.json.content).toContain(
      "description: Original skill",
    );
    expect(rolledBackSkillMdRes.json.content).toContain("Use calm language.");

    const rolledBackGuideRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "guide.md",
    ]);
    expect(rolledBackGuideRes.exitCode).toBe(0);
    expect(rolledBackGuideRes.json.content).toBe("Guide v1");

    const rolledBackFilesRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-files",
      "writer-skill",
    ]);
    expect(rolledBackFilesRes.exitCode).toBe(0);
    expect(
      rolledBackFilesRes.json.some(
        (entry: { path: string }) => entry.path === "notes/final.md",
      ),
    ).toBe(false);

    const deleteVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "delete-version",
      "writer-skill",
      createSyncedVersionRes.json.id as string,
    ]);
    expect(deleteVersionRes.exitCode).toBe(0);
    expect(deleteVersionRes.json.deleted).toBe(true);
  }, 20_000);

  it("reports skill platform status and delegates install-md or uninstall-md", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "platform-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: platform-skill",
        "description: Platform skill",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Platform Skill",
      ].join("\n"),
      "utf8",
    );

    const installSkillMd = vi.fn(async () => undefined);
    const uninstallSkillMd = vi.fn(async () => undefined);
    const skillService = {
      ...createCliSkillService(),
      detectInstalledPlatforms: vi.fn(async () => ["claude"]),
      getSkillMdInstallStatus: vi.fn(async () => ({
        claude: true,
        copilot: false,
        cursor: false,
        windsurf: false,
        kiro: false,
        gemini: false,
      })),
      installSkillMd,
      uninstallSkillMd,
    };

    const installRes = await execCli(
      [...withDataDir(root), "skill", "install", skillDir],
      skillService,
    );
    expect(installRes.exitCode).toBe(0);

    const platformsRes = await execCli(
      [...withDataDir(root), "skill", "platforms"],
      skillService,
    );
    expect(platformsRes.exitCode).toBe(0);
    expect(platformsRes.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claude",
          name: "Claude Code",
          installed: true,
        }),
      ]),
    );

    const statusRes = await execCli(
      [...withDataDir(root), "skill", "platform-status", "platform-skill"],
      skillService,
    );
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.json.claude).toBe(true);
    expect(statusRes.json.cursor).toBe(false);

    const installMdRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "install-md",
        "platform-skill",
        "--platform",
        "claude",
      ],
      skillService,
    );
    expect(installMdRes.exitCode).toBe(0);
    expect(installMdRes.json).toEqual({
      installed: true,
      skillId: installRes.json.id,
      platformId: "claude",
    });
    expect(installSkillMd).toHaveBeenCalledWith(
      expect.anything(),
      "platform-skill",
      expect.stringContaining("# Platform Skill"),
      "claude",
      installRes.json.id,
    );

    const uninstallMdRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "uninstall-md",
        "platform-skill",
        "--platform",
        "claude",
      ],
      skillService,
    );
    expect(uninstallMdRes.exitCode).toBe(0);
    expect(uninstallMdRes.json).toEqual({
      uninstalled: true,
      skillId: installRes.json.id,
      platformId: "claude",
    });
    expect(uninstallSkillMd).toHaveBeenCalledWith(
      "platform-skill",
      "claude",
      installRes.json.id,
    );
  });

  it("installs platform skills as full directories instead of only SKILL.md", async () => {
    const root = makeTempRoot(tempDirs);
    const originalHome = process.env.HOME;
    const skillDir = path.join(root, "directory-platform-skill");
    fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: directory-platform-skill",
        "description: Directory platform skill",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Directory Platform Skill",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(skillDir, "assets", "helper.txt"),
      "helper",
      "utf8",
    );

    try {
      process.env.HOME = path.join(root, "home");
      fs.mkdirSync(process.env.HOME, { recursive: true });

      const installRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
      ]);
      expect(installRes.exitCode).toBe(0);

      const installMdRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install-md",
        "directory-platform-skill",
        "--platform",
        "claude",
      ]);
      expect(installMdRes.exitCode).toBe(0);

      const platformDir = path.join(
        process.env.HOME,
        ".claude",
        "skills",
        "directory-platform-skill",
      );
      expect(fs.existsSync(path.join(platformDir, "SKILL.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(platformDir, "assets", "helper.txt")),
      ).toBe(true);
      expect(
        fs.readFileSync(path.join(platformDir, "assets", "helper.txt"), "utf8"),
      ).toBe("helper");
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
