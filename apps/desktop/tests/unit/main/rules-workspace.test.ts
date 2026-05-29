import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRulesWorkspaceService } from "@prompthub/core";
import { getPlatformById } from "@prompthub/shared/constants/platforms";

import { closeDatabase, initDatabase, RuleDB } from "../../../src/main/database";
import {
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import {
  createProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  listRuleDescriptors,
  readRuleContent,
  removeProjectRule,
  saveRuleContent,
} from "../../../src/main/services/rules-workspace";
import { getPlatformGlobalRulePath } from "../../../src/main/services/skill-installer-utils";

describe("rules workspace storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "prompthub-rules-"));
    configureRuntimePaths({ userDataPath: tempDir });
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createGlobalRulesTestService() {
    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });

    return createRulesWorkspaceService({
      getRulesDir,
      createRuleDb: () => new RuleDB(initDatabase()),
      getPlatformGlobalRulePath: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude", "CLAUDE.md");
        }

        return path.join(homeDir, platform.id, "AGENTS.md");
      },
      getPlatformRootDir: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude");
        }

        return path.join(homeDir, platform.id);
      },
    });
  }

  it("creates a managed project rule and indexes it in SQLite", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "# Existing docs rule", "utf8");

    const descriptor = await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });

    expect(descriptor.id).toBe("project:docs-site");

    const managedPath = path.join(getRulesDir(), "projects", "docs-site__docs-site", "AGENTS.md");
    expect(fs.existsSync(managedPath)).toBe(true);
    expect(fs.readFileSync(managedPath, "utf8")).toBe("# Existing docs rule");

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:docs-site")).toEqual(
      expect.objectContaining({
        platformName: "Docs Site",
        managedPath,
        currentVersion: 1,
      }),
    );
  });

  it("saves managed content, writes versions, and updates rule index state", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({ id: "docs-site", name: "Docs Site", rootPath: projectRoot });

    const updated = await saveRuleContent("project:docs-site", "# Updated docs rule\n\n## Policy");

    expect(updated.content).toContain("Updated docs rule");
    expect(fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8")).toContain("## Policy");

    const versionFile = path.join(
      getRulesDir(),
      ".versions",
      encodeURIComponent("project:docs-site"),
      "0001.md",
    );
    expect(fs.existsSync(versionFile)).toBe(true);

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:docs-site")).toEqual(
      expect.objectContaining({
        syncStatus: "synced",
        currentVersion: 1,
      }),
    );
    expect(db.getVersions("project:docs-site")).toHaveLength(1);

    const content = await readRuleContent("project:docs-site");
    expect(content.versions).toHaveLength(1);
    expect(content.versions[0].content).toContain("Updated docs rule");
  });

  it("removes a project rule from files and SQLite index", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({ id: "docs-site", name: "Docs Site", rootPath: projectRoot });
    await saveRuleContent("project:docs-site", "# Updated docs rule");

    await removeProjectRule("docs-site");

    expect(fs.existsSync(path.join(getRulesDir(), "projects", "docs-site__docs-site"))).toBe(false);
    expect(
      fs.existsSync(path.join(getRulesDir(), ".versions", encodeURIComponent("project:docs-site"))),
    ).toBe(false);

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:docs-site")).toBeNull();
    expect(db.getVersions("project:docs-site")).toEqual([]);
  });

  it("imports backup records into managed files and SQLite index", async () => {
    const projectRoot = path.join(tempDir, "imported-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await importRuleBackupRecords([
      {
        id: "project:imported-site",
        platformId: "workspace",
        platformName: "Imported Site",
        platformIcon: "FolderRoot",
        platformDescription: "Imported project rules",
        name: "AGENTS.md",
        description: "Imported managed rule",
        path: path.join(projectRoot, "AGENTS.md"),
        managedPath: undefined,
        targetPath: path.join(projectRoot, "AGENTS.md"),
        projectRootPath: projectRoot,
        syncStatus: "target-missing",
        content: "# Imported rule",
        versions: [
          {
            id: "imported-version-1",
            savedAt: "2026-05-09T00:00:00.000Z",
            source: "create",
            content: "# Imported rule",
          },
        ],
      },
    ]);

    const records = await exportRuleBackupRecords();
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project:imported-site",
          content: "# Imported rule",
        }),
      ]),
    );

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:imported-site")).toEqual(
      expect.objectContaining({
        platformName: "Imported Site",
        currentVersion: 1,
      }),
    );
    expect(fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8")).toBe("# Imported rule");
  });

  it("removes project rules missing from a replace import", async () => {
    const staleProjectRoot = path.join(tempDir, "stale-site");
    fs.mkdirSync(staleProjectRoot, { recursive: true });
    await createProjectRule({ id: "stale-site", name: "Stale Site", rootPath: staleProjectRoot });
    await saveRuleContent("project:stale-site", "# stale");

    const keptProjectRoot = path.join(tempDir, "kept-site");
    fs.mkdirSync(keptProjectRoot, { recursive: true });

    await importRuleBackupRecords(
      [
        {
          id: "project:kept-site",
          platformId: "workspace",
          platformName: "Kept Site",
          platformIcon: "FolderRoot",
          platformDescription: "Kept project rules",
          name: "AGENTS.md",
          description: "Kept rule",
          path: path.join(keptProjectRoot, "AGENTS.md"),
          managedPath: undefined,
          targetPath: path.join(keptProjectRoot, "AGENTS.md"),
          projectRootPath: keptProjectRoot,
          syncStatus: "synced",
          content: "# kept",
          versions: [],
        },
      ],
      { replace: true },
    );

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:stale-site")).toBeNull();
    expect(db.getById("project:kept-site")).toEqual(
      expect.objectContaining({ platformName: "Kept Site" }),
    );
  });

  it("keeps unique history after the version retention limit", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({ id: "docs-site", name: "Docs Site", rootPath: projectRoot });

    for (let index = 1; index <= 22; index += 1) {
      await saveRuleContent("project:docs-site", `# version-${index}`);
    }

    const content = await readRuleContent("project:docs-site");
    expect(content.versions).toHaveLength(20);
    expect(content.versions[0]?.content).toBe("# version-22");
    expect(content.versions[1]?.content).toBe("# version-21");
    expect(content.versions[19]?.content).toBe("# version-3");

    const versionDir = path.join(
      getRulesDir(),
      ".versions",
      encodeURIComponent("project:docs-site"),
    );
    expect(fs.existsSync(path.join(versionDir, "0022.md"))).toBe(true);
    expect(fs.existsSync(path.join(versionDir, "0021.md"))).toBe(true);
  });

  it("always includes built-in global rule descriptors even when target files are missing", async () => {
    const descriptors = await listRuleDescriptors();

    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "codex-global", name: "AGENTS.md" }),
        expect.objectContaining({ id: "opencode-global", name: "AGENTS.md" }),
        expect.objectContaining({ id: "claude-global", name: "CLAUDE.md" }),
      ]),
    );

    const opencodeRule = descriptors.find((descriptor) => descriptor.id === "opencode-global");
    expect(opencodeRule?.path).toContain("AGENTS.md");
  });

  it("deduplicates concurrent initial snapshots for global rules on first read", async () => {
    const service = createGlobalRulesTestService();
    const platform = getPlatformById("claude");
    expect(platform).toBeDefined();

    const globalRulePath = path.join(tempDir, "home", ".claude", "CLAUDE.md");
    expect(globalRulePath).toBeTruthy();

    fs.mkdirSync(path.dirname(globalRulePath!), { recursive: true });
    fs.writeFileSync(globalRulePath!, "# Claude global rule\n\nFollow the house style.", "utf8");

    await Promise.all([
      service.listRuleDescriptors(),
      service.readRuleContent("claude-global"),
    ]);

    const content = await service.readRuleContent("claude-global");
    expect(content.versions).toHaveLength(1);
    expect(content.versions[0]).toEqual(
      expect.objectContaining({
        source: "create",
        content: "# Claude global rule\n\nFollow the house style.",
      }),
    );
  });

  it("refreshes stored global target paths when the platform root changes", async () => {
    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(path.join(homeDir, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".claude-custom"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, ".claude", "CLAUDE.md"), "# Original", "utf8");

    const service = createRulesWorkspaceService({
      getRulesDir,
      createRuleDb: () => new RuleDB(initDatabase()),
      getPlatformGlobalRulePath: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude-custom", "CLAUDE.md");
        }
        return path.join(homeDir, platform.id, "AGENTS.md");
      },
      getPlatformRootDir: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude-custom");
        }
        return path.join(homeDir, platform.id);
      },
    });

    await listRuleDescriptors();
    const refreshed = await service.listRuleDescriptors();
    const claude = refreshed.find((descriptor) => descriptor.id === "claude-global");

    expect(claude?.path).toContain(".claude-custom/CLAUDE.md");
  });

  it("uses the overridden target file name for built-in global rule descriptors", async () => {
    const homeDir = path.join(tempDir, "home");
    const kiloRoot = path.join(homeDir, ".kilo");
    const kiloRulePath = path.join(kiloRoot, "AGENTS.md");
    fs.mkdirSync(kiloRoot, { recursive: true });
    fs.writeFileSync(kiloRulePath, "# Kilo custom rule", "utf8");

    const service = createRulesWorkspaceService({
      getRulesDir,
      createRuleDb: () => new RuleDB(initDatabase()),
      getPlatformGlobalRulePath: (platform) => {
        if (platform.id === "kilo") {
          return kiloRulePath;
        }
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude", "CLAUDE.md");
        }
        return path.join(homeDir, platform.id, "AGENTS.md");
      },
      getPlatformRootDir: (platform) => {
        if (platform.id === "kilo") {
          return kiloRoot;
        }
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude");
        }
        return path.join(homeDir, platform.id);
      },
    });

    const descriptors = await service.scanRuleDescriptors();
    const kilo = descriptors.find((descriptor) => descriptor.id === "kilo-global");

    expect(kilo).toEqual(
      expect.objectContaining({
        name: "AGENTS.md",
        path: kiloRulePath,
      }),
    );

    const content = await service.readRuleContent("kilo-global");
    expect(content.name).toBe("AGENTS.md");
  });

  it("supports custom agent global rule files", async () => {
    const homeDir = path.join(tempDir, "home");
    const customRoot = path.join(homeDir, ".agents");
    const customRulePath = path.join(customRoot, "AGENTS.md");
    fs.mkdirSync(customRoot, { recursive: true });
    fs.writeFileSync(customRulePath, "# Team agent rule", "utf8");

    const service = createRulesWorkspaceService({
      getRulesDir,
      createRuleDb: () => new RuleDB(initDatabase()),
      getPlatformGlobalRulePath: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude", "CLAUDE.md");
        }
        return path.join(homeDir, platform.id, "AGENTS.md");
      },
      getPlatformRootDir: (platform) => {
        if (platform.id === "claude") {
          return path.join(homeDir, ".claude");
        }
        return path.join(homeDir, platform.id);
      },
      getExtraGlobalRuleTemplates: () => [
        {
          id: "custom:team-agents",
          platformId: "custom:team-agents",
          platformName: "Team Agents",
          platformIcon: "Bot",
          platformDescription: "Custom team agent rules",
          name: "AGENTS.md",
          description: "Global rules for Team Agents.",
          group: "assistant",
        },
      ],
      getExtraGlobalRuleTargetPath: () => customRulePath,
    });

    const descriptors = await service.scanRuleDescriptors();
    const customDescriptor = descriptors.find(
      (descriptor) => descriptor.id === "custom:team-agents",
    );

    expect(customDescriptor).toEqual(
      expect.objectContaining({
        platformName: "Team Agents",
        path: customRulePath,
        exists: true,
      }),
    );

    const content = await service.readRuleContent("custom:team-agents");
    expect(content.content).toContain("Team agent rule");

    const updated = await service.saveRuleContent(
      "custom:team-agents",
      "# Updated team agent rule",
    );
    expect(updated.content).toContain("Updated team agent rule");
    expect(fs.readFileSync(customRulePath, "utf8")).toContain(
      "Updated team agent rule",
    );
  });

  it("drops cached custom rule descriptors when the custom agent is no longer configured", async () => {
    const homeDir = path.join(tempDir, "home");
    const customRoot = path.join(homeDir, ".agents");
    const customRulePath = path.join(customRoot, "AGENTS.md");
    fs.mkdirSync(customRoot, { recursive: true });
    fs.writeFileSync(customRulePath, "# Team agent rule", "utf8");

    const createService = (includeCustom: boolean) =>
      createRulesWorkspaceService({
        getRulesDir,
        createRuleDb: () => new RuleDB(initDatabase()),
        getPlatformGlobalRulePath: (platform) => {
          if (platform.id === "claude") {
            return path.join(homeDir, ".claude", "CLAUDE.md");
          }
          return path.join(homeDir, platform.id, "AGENTS.md");
        },
        getPlatformRootDir: (platform) => {
          if (platform.id === "claude") {
            return path.join(homeDir, ".claude");
          }
          return path.join(homeDir, platform.id);
        },
        getExtraGlobalRuleTemplates: () =>
          includeCustom
            ? [
                {
                  id: "custom:team-agents",
                  platformId: "custom:team-agents",
                  platformName: "Team Agents",
                  platformIcon: "Bot",
                  platformDescription: "Custom team agent rules",
                  name: "AGENTS.md",
                  description: "Global rules for Team Agents.",
                  group: "assistant",
                },
              ]
            : [],
        getExtraGlobalRuleTargetPath: () => customRulePath,
      });

    await createService(true).scanRuleDescriptors();

    const cached = await createService(false).listCachedRuleDescriptors();

    expect(cached.find((descriptor) => descriptor.id === "custom:team-agents")).toBeUndefined();
  });

  it("skips missing version files and repairs the index instead of crashing", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({ id: "docs-site", name: "Docs Site", rootPath: projectRoot });
    await saveRuleContent("project:docs-site", "# version-1");
    await saveRuleContent("project:docs-site", "# version-2");

    // Manually delete the latest version file (simulate disk corruption)
    const versionDir = path.join(
      getRulesDir(),
      ".versions",
      encodeURIComponent("project:docs-site"),
    );
    fs.rmSync(path.join(versionDir, "0002.md"), { force: true });

    // readRuleContent should NOT throw; it should skip the missing file
    const content = await readRuleContent("project:docs-site");
    expect(content.versions).toHaveLength(1);
    expect(content.versions[0]?.content).toBe("# version-1");

    // The index should have been repaired on disk
    const indexPath = path.join(versionDir, "index.json");
    const repairedIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    expect(repairedIndex).toHaveLength(1);
    expect(repairedIndex[0]?.fileName).toBe("0001.md");

    // The DB version count should also be repaired
    const db = new RuleDB(initDatabase());
    expect(db.getById("project:docs-site")?.currentVersion).toBe(1);
  });

  it("does not create duplicate initial versions when re-materializing a global rule", async () => {
    const service = createGlobalRulesTestService();
    const platform = getPlatformById("claude");
    expect(platform).toBeDefined();

    const globalRulePath = path.join(tempDir, "home", ".claude", "CLAUDE.md");
    expect(globalRulePath).toBeTruthy();

    fs.mkdirSync(path.dirname(globalRulePath!), { recursive: true });
    fs.writeFileSync(globalRulePath!, "# Claude global rule", "utf8");

    // First materialization
    await service.listRuleDescriptors();

    // Delete the managed copy but keep versions
    const managedPath = path.join(getRulesDir(), "global", "claude", "CLAUDE.md");
    fs.rmSync(managedPath, { force: true });

    // Re-materialize (e.g., a later scan)
    await service.listRuleDescriptors();

    const content = await service.readRuleContent("claude-global");
    expect(content.versions).toHaveLength(1);
  });
});
