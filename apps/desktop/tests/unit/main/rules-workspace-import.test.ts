import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRulesWorkspaceService } from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { invalidateCustomPathsCache } from "../../../src/main/services/skill-installer-utils";
import type { RuleBackupRecord } from "@prompthub/shared/types";

import {
  closeDatabase,
  initDatabase,
  RuleDB,
} from "../../../src/main/database";
import {
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import {
  createProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  readRuleContent,
  saveRuleContent,
} from "../../../src/main/services/rules-workspace";

describe("rules workspace backup import", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(process.env.TMPDIR || "/tmp", "prompthub-rules-import-"),
    );
    configureRuntimePaths({ userDataPath: tempDir });
    initDatabase()
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(
        "builtinAgentOverrides",
        JSON.stringify(
          Object.fromEntries(
            SKILL_PLATFORMS.map((platform) => [
              platform.id,
              { rootPath: path.join(tempDir, "platforms", platform.id) },
            ]),
          ),
        ),
      );
    invalidateCustomPathsCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    invalidateCustomPathsCache();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function projectRecord(
    projectId: string,
    projectRootPath: string,
    overrides: Partial<RuleBackupRecord> = {},
  ): RuleBackupRecord {
    const targetPath = path.join(projectRootPath, "AGENTS.md");
    return {
      id: `project:${projectId}`,
      platformId: "workspace",
      platformName: projectId,
      platformIcon: "FolderRoot",
      platformDescription: "Imported project rules",
      name: "AGENTS.md",
      description: "Imported managed rule",
      path: targetPath,
      managedPath: undefined,
      targetPath,
      projectRootPath,
      syncStatus: "target-missing",
      content: "# Imported",
      versions: [],
      ...overrides,
    };
  }

  function createGlobalRulesTestService() {
    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    return createRulesWorkspaceService({
      getRulesDir,
      createRuleDb: () => new RuleDB(initDatabase()),
      getPlatformGlobalRulePath: (platform) =>
        path.join(
          homeDir,
          platform.id,
          platform.id === "claude" ? "CLAUDE.md" : "AGENTS.md",
        ),
      getPlatformRootDir: (platform) => path.join(homeDir, platform.id),
    });
  }

  it("imports managed state without creating or deploying an external target", async () => {
    const projectRoot = path.join(tempDir, "imported-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await importRuleBackupRecords([
      projectRecord("imported-site", projectRoot, {
        platformName: "Imported Site",
        content: "# Imported rule",
        versions: [
          {
            id: "imported-version-1",
            savedAt: "2026-05-09T00:00:00.000Z",
            source: "create",
            content: "# Imported rule",
          },
        ],
      }),
    ]);

    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(false);
    expect(await exportRuleBackupRecords()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project:imported-site",
          content: "# Imported rule",
        }),
      ]),
    );
    expect(new RuleDB(initDatabase()).getById("project:imported-site")).toEqual(
      expect.objectContaining({ currentVersion: 1 }),
    );
  });

  it("preserves divergent, empty, symlinked, and missing targets", async () => {
    const projectRoot = path.join(tempDir, "divergent-site");
    const targetPath = path.join(projectRoot, "AGENTS.md");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(targetPath, "# External rule", "utf8");
    await createProjectRule({
      id: "divergent-site",
      name: "Divergent Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:divergent-site", "# Managed rule");
    fs.writeFileSync(targetPath, "# External rule", "utf8");

    await importRuleBackupRecords([
      projectRecord("divergent-site", projectRoot, {
        platformName: "Divergent Site",
        content: "# Imported rule",
        syncStatus: "out-of-sync",
      }),
    ]);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("# External rule");
    await expect(
      readRuleContent("project:divergent-site"),
    ).resolves.toMatchObject({
      content: "# Imported rule",
      targetContent: "# External rule",
      syncStatus: "out-of-sync",
    });

    await importRuleBackupRecords([
      projectRecord("divergent-site", projectRoot, {
        platformName: "Divergent Site",
        content: "",
        syncStatus: "out-of-sync",
      }),
    ]);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("# External rule");
    await expect(
      readRuleContent("project:divergent-site"),
    ).resolves.toMatchObject({
      content: "",
      targetContent: "# External rule",
      syncStatus: "out-of-sync",
    });

    const referentPath = path.join(projectRoot, "external-AGENTS.md");
    fs.writeFileSync(referentPath, "# Symlink referent", "utf8");
    fs.rmSync(targetPath);
    fs.symlinkSync(referentPath, targetPath);
    await importRuleBackupRecords([
      projectRecord("divergent-site", projectRoot, {
        platformName: "Divergent Site",
        content: "# Through symlink",
        syncStatus: "out-of-sync",
      }),
    ]);
    expect(fs.readlinkSync(targetPath)).toBe(referentPath);
    expect(fs.readFileSync(referentPath, "utf8")).toBe("# Symlink referent");

    const missingRoot = path.join(tempDir, "missing-site");
    fs.mkdirSync(missingRoot, { recursive: true });
    await importRuleBackupRecords([
      projectRecord("missing-site", missingRoot, {
        content: "# Missing target",
      }),
    ]);
    expect(fs.existsSync(path.join(missingRoot, "AGENTS.md"))).toBe(false);
    await expect(
      readRuleContent("project:missing-site"),
    ).resolves.toMatchObject({
      content: "# Missing target",
      syncStatus: "target-missing",
    });
  });

  it("bounds history, normalizes invalid timestamps, and protects current bodies", async () => {
    const projectRoot = path.join(tempDir, "history-site");
    const targetPath = path.join(projectRoot, "AGENTS.md");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(targetPath, "# initial", "utf8");
    await createProjectRule({
      id: "history-site",
      name: "History Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:history-site", "# previous");
    fs.writeFileSync(targetPath, "# external", "utf8");
    fs.writeFileSync(
      path.join(getRulesDir(), "projects", "history-site", "AGENTS.md"),
      "# pre-import-only",
      "utf8",
    );

    const importedVersions = [
      {
        id: "invalid-time",
        savedAt: "not-a-date",
        source: "manual-save" as const,
        content: "# invalid-time",
      },
      {
        id: "duplicate-old",
        savedAt: "2026-01-01T00:00:00.000Z",
        source: "manual-save" as const,
        content: "# duplicate",
      },
      {
        id: "duplicate-new",
        savedAt: "9999-12-31T23:59:59.999Z",
        source: "manual-save" as const,
        content: "# duplicate",
      },
      {
        id: "duplicate-existing",
        savedAt: "9999-12-31T23:59:58.999Z",
        source: "manual-save" as const,
        content: "# previous",
      },
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `imported-${index}`,
        savedAt:
          index === 99
            ? "9999-12-31T23:59:59.999Z"
            : new Date(Date.UTC(2026, 3, index + 1)).toISOString(),
        source: "manual-save" as const,
        content: `# imported-${index}`,
      })),
    ];
    await importRuleBackupRecords([
      projectRecord("history-site", projectRoot, {
        platformName: "History Site",
        content: "# imported-current",
        versions: importedVersions,
        syncStatus: "out-of-sync",
      }),
    ]);

    const imported = await readRuleContent("project:history-site");
    const contents = imported.versions.map((version) => version.content);
    expect(contents).toHaveLength(20);
    expect(new Set(contents).size).toBe(20);
    expect(contents).toContain("# invalid-time");
    expect(contents).toContain("# duplicate");
    expect(contents).toContain("# pre-import-only");
    expect(contents).toContain("# imported-current");
    expect(fs.readFileSync(targetPath, "utf8")).toBe("# external");
  });

  it("deduplicates repeated contents and resolves history/import ID collisions", async () => {
    const projectRoot = path.join(tempDir, "identity-site");
    const targetPath = path.join(projectRoot, "AGENTS.md");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(targetPath, "# existing", "utf8");
    await createProjectRule({
      id: "identity-site",
      name: "Identity Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:identity-site", "# existing-2");
    await saveRuleContent("project:identity-site", "# existing-3");

    const versionDir = path.join(
      getRulesDir(),
      ".versions",
      encodeURIComponent("project:identity-site"),
    );
    const indexPath = path.join(versionDir, "index.json");
    const existingIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const sharedId = "shared-version-id";
    existingIndex[0].id = sharedId;
    existingIndex[1].id = sharedId;
    existingIndex[2].id = sharedId;
    const importedContent = "# imported-history";
    const baseId = `${encodeURIComponent("project:identity-site")}-import-${crypto
      .createHash("sha256")
      .update(`project:identity-site\n${importedContent}`)
      .digest("hex")}`;
    existingIndex[0].id = baseId;
    fs.writeFileSync(indexPath, JSON.stringify(existingIndex, null, 2), "utf8");
    await readRuleContent("project:identity-site");

    await importRuleBackupRecords([
      projectRecord("identity-site", projectRoot, {
        platformName: "Identity Site",
        content: "# imported-current",
        versions: [
          {
            id: sharedId,
            savedAt: "2026-07-01T00:00:00.000Z",
            source: "manual-save",
            content: "# existing",
          },
          {
            id: sharedId,
            savedAt: "2026-07-02T00:00:00.000Z",
            source: "manual-save",
            content: importedContent,
          },
          {
            id: sharedId,
            savedAt: "2026-07-03T00:00:00.000Z",
            source: "manual-save",
            content: "# imported-history-2",
          },
        ],
      }),
    ]);

    const imported = await readRuleContent("project:identity-site");
    const ids = imported.versions.map((version) => version.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(imported.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: baseId, content: "# existing-3" }),
        expect.objectContaining({ content: "# existing" }),
        expect.objectContaining({ content: importedContent }),
        expect.objectContaining({ content: "# imported-history-2" }),
      ]),
    );
    expect(
      imported.versions.find((version) => version.content === importedContent)
        ?.id,
    ).toBe(`${baseId}-1`);
    expect(
      imported.versions.find((version) => version.content === "# existing")?.id,
    ).not.toBe(sharedId);
  });

  it("rejects unsafe project ids before creating managed directories", async () => {
    const projectRoot = path.join(tempDir, "unsafe-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    await expect(
      importRuleBackupRecords([
        projectRecord("../../../escaped-rules", projectRoot, {
          content: "# Unsafe",
        }),
      ]),
    ).rejects.toThrow("Invalid rule project id");
    expect(fs.readdirSync(path.join(getRulesDir(), "projects"))).toEqual([]);
  });

  it("rolls back managed and history files when version staging fails", async () => {
    const projectRoot = path.join(tempDir, "version-failure-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    await createProjectRule({
      id: "version-failure-site",
      name: "Version Failure Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:version-failure-site", "# original");
    const originalWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, "writeFile").mockImplementation(
      async (file, data, options) => {
        if (data === "# broken version") {
          await originalWriteFile(file, "partial", options);
          throw new Error("simulated version write failure");
        }
        return originalWriteFile(file, data, options);
      },
    );

    await expect(
      importRuleBackupRecords([
        projectRecord("version-failure-site", projectRoot, {
          content: "# imported",
          versions: [
            {
              id: "broken-version",
              savedAt: "2026-05-01T00:00:00.000Z",
              source: "manual-save",
              content: "# broken version",
            },
          ],
        }),
      ]),
    ).rejects.toThrow("simulated version write failure");
    await expect(
      readRuleContent("project:version-failure-site"),
    ).resolves.toMatchObject({
      content: "# original",
      versions: [expect.objectContaining({ content: "# original" })],
    });
  });

  it("rolls back high-sequence history and rebuilds SQLite file paths after publication failure", async () => {
    const projectRoot = path.join(tempDir, "publication-failure-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    await createProjectRule({
      id: "publication-failure-site",
      name: "Publication Failure Site",
      rootPath: projectRoot,
    });
    for (let index = 1; index <= 22; index += 1) {
      await saveRuleContent(
        "project:publication-failure-site",
        `# original-${index}`,
      );
    }
    const before = await readRuleContent("project:publication-failure-site");
    const originalReplaceVersions = RuleDB.prototype.replaceVersions;
    let failPublication = true;
    vi.spyOn(RuleDB.prototype, "replaceVersions").mockImplementation(
      function replaceVersionsWithFailure(this: RuleDB, ruleId, versions) {
        if (failPublication && ruleId === "project:publication-failure-site") {
          failPublication = false;
          throw new Error("simulated publication failure");
        }
        return originalReplaceVersions.call(this, ruleId, versions);
      },
    );

    await expect(
      importRuleBackupRecords([
        projectRecord("publication-failure-site", projectRoot, {
          content: "# imported",
          versions: [
            {
              id: "imported-version",
              savedAt: "2026-05-01T00:00:00.000Z",
              source: "manual-save",
              content: "# imported",
            },
          ],
        }),
      ]),
    ).rejects.toThrow("simulated publication failure");

    const after = await readRuleContent("project:publication-failure-site");
    const versions = new RuleDB(initDatabase()).getVersions(
      "project:publication-failure-site",
    );
    expect(after.versions.map((version) => version.content)).toEqual(
      before.versions.map((version) => version.content),
    );
    for (const version of versions) {
      expect(fs.existsSync(version.filePath)).toBe(true);
      expect(fs.readFileSync(version.filePath, "utf8")).toBe(
        after.versions.find((item) => item.id === version.id)?.content,
      );
    }
  });

  it("does not clean missing projects before a later import succeeds", async () => {
    const staleRoot = path.join(tempDir, "stale-site");
    fs.mkdirSync(staleRoot, { recursive: true });
    await createProjectRule({
      id: "stale-site",
      name: "Stale",
      rootPath: staleRoot,
    });
    await saveRuleContent("project:stale-site", "# stale");
    const brokenRoot = path.join(tempDir, "broken-site");
    fs.mkdirSync(brokenRoot, { recursive: true });
    const originalWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, "writeFile").mockImplementation(
      async (file, data, options) => {
        if (data === "# broken version") {
          throw new Error("simulated deferred failure");
        }
        return originalWriteFile(file, data, options);
      },
    );

    await expect(
      importRuleBackupRecords(
        [
          projectRecord("broken-site", brokenRoot, {
            content: "# broken",
            versions: [
              {
                id: "broken-version",
                savedAt: "2026-05-01T00:00:00.000Z",
                source: "manual-save",
                content: "# broken version",
              },
            ],
          }),
        ],
        { replace: true },
      ),
    ).rejects.toThrow("simulated deferred failure");
    expect(
      new RuleDB(initDatabase()).getById("project:stale-site"),
    ).not.toBeNull();
    expect(
      fs.existsSync(path.join(getRulesDir(), "projects", "broken-site")),
    ).toBe(false);
  });

  it("removes project rules missing from a successful replace import", async () => {
    const staleRoot = path.join(tempDir, "stale-site");
    const keptRoot = path.join(tempDir, "kept-site");
    fs.mkdirSync(staleRoot, { recursive: true });
    fs.mkdirSync(keptRoot, { recursive: true });
    await createProjectRule({
      id: "stale-site",
      name: "Stale",
      rootPath: staleRoot,
    });
    await saveRuleContent("project:stale-site", "# stale");
    await importRuleBackupRecords(
      [projectRecord("kept-site", keptRoot, { content: "# kept" })],
      { replace: true },
    );
    const db = new RuleDB(initDatabase());
    expect(db.getById("project:stale-site")).toBeNull();
    expect(db.getById("project:kept-site")).not.toBeNull();
  });

  it("rolls back a global Rule with missing target, managed copy, and empty history", async () => {
    const service = createGlobalRulesTestService();
    const targetPath = path.join(tempDir, "home", "codex", "AGENTS.md");
    await service.resolveRuleMeta("codex-global");
    const originalReplaceVersions = RuleDB.prototype.replaceVersions;
    let failPublication = true;
    vi.spyOn(RuleDB.prototype, "replaceVersions").mockImplementation(
      function replaceVersionsWithFailure(this: RuleDB, ruleId, versions) {
        if (
          failPublication &&
          ruleId === "codex-global" &&
          versions.length > 0
        ) {
          failPublication = false;
          throw new Error("simulated global publication failure");
        }
        return originalReplaceVersions.call(this, ruleId, versions);
      },
    );

    await expect(
      service.importRuleBackupRecords([
        {
          id: "codex-global",
          platformId: "codex",
          platformName: "Codex",
          platformIcon: "Terminal",
          platformDescription: "Global Codex rules",
          name: "AGENTS.md",
          description: "Global rules",
          path: targetPath,
          targetPath,
          projectRootPath: null,
          syncStatus: "target-missing",
          content: "# imported global",
          versions: [],
        },
      ]),
    ).rejects.toThrow("simulated global publication failure");
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(
      fs.existsSync(path.join(getRulesDir(), "global", "codex", "AGENTS.md")),
    ).toBe(false);
    expect(new RuleDB(initDatabase()).getById("codex-global")).toEqual(
      expect.objectContaining({ currentVersion: 0 }),
    );
  });

  it("normalizes new Cursor projects and falls back to the target directory", async () => {
    const cursorRoot = path.join(tempDir, "cursor-root");
    fs.mkdirSync(cursorRoot, { recursive: true });
    const cursorTarget = path.join(
      cursorRoot,
      ".cursor",
      "rules",
      "prompthub.mdc",
    );
    await importRuleBackupRecords([
      {
        ...projectRecord("cursor-import", cursorRoot, {
          platformId: "cursor",
          platformName: "Cursor Imported / Cursor",
          name: "prompthub.mdc",
          path: cursorTarget,
          targetPath: cursorTarget,
          projectRootPath: cursorRoot,
          content: "# Cursor managed",
        }),
      },
    ]);
    expect(
      fs.existsSync(
        path.join(getRulesDir(), "projects", "cursor-import", "prompthub.mdc"),
      ),
    ).toBe(true);
    expect(fs.existsSync(cursorTarget)).toBe(false);

    const fallbackRoot = path.join(tempDir, "fallback-root");
    const fallbackTarget = path.join(fallbackRoot, "AGENTS.md");
    fs.mkdirSync(fallbackRoot, { recursive: true });
    await importRuleBackupRecords([
      projectRecord("fallback-import", fallbackRoot, {
        projectRootPath: undefined,
        path: fallbackTarget,
        targetPath: fallbackTarget,
        content: "# Fallback managed",
      }),
    ]);
    expect(
      (await readRuleContent("project:fallback-import")).projectRootPath,
    ).toBe(fallbackRoot);

    const pathOnlyRoot = path.join(tempDir, "path-only-root");
    const pathOnlyTarget = path.join(pathOnlyRoot, "AGENTS.md");
    fs.mkdirSync(pathOnlyRoot, { recursive: true });
    await importRuleBackupRecords([
      projectRecord("path-only-import", pathOnlyRoot, {
        projectRootPath: undefined,
        targetPath: undefined,
        path: pathOnlyTarget,
        content: "# Path-only managed",
      }),
    ]);
    expect(
      (await readRuleContent("project:path-only-import")).projectRootPath,
    ).toBe(pathOnlyRoot);
  });

  it("cleans a new project when import fails during version publication", async () => {
    const projectRoot = path.join(tempDir, "new-failure-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    const originalWriteFile = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, "writeFile").mockImplementation(
      async (file, data, options) => {
        if (data === "# broken version") {
          throw new Error("simulated new project failure");
        }
        return originalWriteFile(file, data, options);
      },
    );

    await expect(
      importRuleBackupRecords([
        projectRecord("new-failure-site", projectRoot, {
          content: "# imported",
          versions: [
            {
              id: "broken-version",
              savedAt: "2026-05-01T00:00:00.000Z",
              source: "manual-save",
              content: "# broken version",
            },
          ],
        }),
      ]),
    ).rejects.toThrow("simulated new project failure");
    expect(
      fs.existsSync(path.join(getRulesDir(), "projects", "new-failure-site")),
    ).toBe(false);
    expect(
      new RuleDB(initDatabase()).getById("project:new-failure-site"),
    ).toBeNull();
  });

  it("cleans a new project when its initial database publication fails", async () => {
    const projectRoot = path.join(tempDir, "initial-failure-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    const originalReplaceVersions = RuleDB.prototype.replaceVersions;
    vi.spyOn(RuleDB.prototype, "replaceVersions").mockImplementation(
      function replaceVersionsWithFailure(this: RuleDB, ruleId, versions) {
        if (
          ruleId === "project:initial-failure-site" &&
          versions.length === 0
        ) {
          throw new Error("simulated initial publication failure");
        }
        return originalReplaceVersions.call(this, ruleId, versions);
      },
    );

    await expect(
      importRuleBackupRecords([
        projectRecord("initial-failure-site", projectRoot, {
          content: "# imported",
        }),
      ]),
    ).rejects.toThrow("simulated initial publication failure");
    expect(
      fs.existsSync(
        path.join(getRulesDir(), "projects", "initial-failure-site"),
      ),
    ).toBe(false);
    expect(
      new RuleDB(initDatabase()).getById("project:initial-failure-site"),
    ).toBeNull();
  });
});
