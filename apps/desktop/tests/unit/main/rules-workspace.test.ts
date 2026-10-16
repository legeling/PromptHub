import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRulesWorkspaceService } from "@prompthub/core";
import {
  getPlatformById,
  SKILL_PLATFORMS,
} from "@prompthub/shared/constants/platforms";

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
  listCachedRuleDescriptors,
  listRuleDescriptors,
  readRuleContent,
  removeMissingProjectRules,
  removeProjectRule,
  resolveRuleConflict,
  saveRuleContent,
  scanRuleDescriptors,
} from "../../../src/main/services/rules-workspace";
import {
  getPlatformGlobalRulePath,
  invalidateCustomPathsCache,
} from "../../../src/main/services/skill-installer-utils";

describe("rules workspace storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(process.env.TMPDIR || "/tmp", "prompthub-rules-"),
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

  function createGlobalRulesTestService(assertStorageAvailable?: () => void) {
    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });

    return createRulesWorkspaceService({
      getRulesDir,
      assertStorageAvailable,
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

  it("blocks rule mutations while structural storage maintenance is active", async () => {
    const service = createGlobalRulesTestService(() => {
      throw new Error("storage maintenance active");
    });

    await expect(service.bootstrapRuleWorkspace()).rejects.toThrow(
      "storage maintenance active",
    );
  });

  it("creates a managed project rule and indexes it in SQLite", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "AGENTS.md"),
      "# Existing docs rule",
      "utf8",
    );

    const descriptor = await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });

    expect(descriptor.id).toBe("project:docs-site");

    const managedPath = path.join(
      getRulesDir(),
      "projects",
      "docs-site",
      "AGENTS.md",
    );
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

  it("manages Cursor project MDC rules beside an independent AGENTS.md rule", async () => {
    const projectRoot = path.join(tempDir, "cursor-project");
    const cursorTarget = path.join(
      projectRoot,
      ".cursor",
      "rules",
      "prompthub.mdc",
    );
    fs.mkdirSync(path.dirname(cursorTarget), { recursive: true });
    fs.writeFileSync(
      cursorTarget,
      "---\ndescription: Existing Cursor rule\nalwaysApply: true\n---\n\n# Existing\n",
      "utf8",
    );

    await createProjectRule({
      id: "cursor-project",
      name: "Cursor Project",
      rootPath: projectRoot,
    });
    const cursor = await createProjectRule({
      id: "cursor-project.cursor",
      kind: "cursor",
      name: "Cursor Project",
      rootPath: projectRoot,
    });

    expect(cursor).toMatchObject({
      id: "project:cursor-project.cursor",
      platformId: "cursor",
      name: "prompthub.mdc",
      path: cursorTarget,
      projectRootPath: projectRoot,
      exists: true,
    });
    expect((await readRuleContent(cursor.id)).content).toContain("# Existing");

    await saveRuleContent(cursor.id, "# Updated Cursor rule\n");
    expect(fs.readFileSync(cursorTarget, "utf8")).toBe(
      "# Updated Cursor rule\n",
    );
    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(false);

    await expect(
      createProjectRule({
        id: "cursor-project.cursor-copy",
        kind: "cursor",
        name: "Cursor Project Copy",
        rootPath: projectRoot,
      }),
    ).rejects.toThrow("Rule project target path already exists");
  });

  it("persists a missing project target across a rescan and fresh cached read", async () => {
    const projectRoot = path.join(tempDir, "missing-site");
    const targetPath = path.join(projectRoot, "AGENTS.md");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(targetPath, "# Recoverable project rule", "utf8");

    await createProjectRule({
      id: "missing-site",
      name: "Missing Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:missing-site", "# Recoverable project rule");
    expect(
      new RuleDB(initDatabase()).getById("project:missing-site")?.syncStatus,
    ).toBe("synced");
    fs.rmSync(targetPath);

    const rescanned = await scanRuleDescriptors();
    const scannedProject = rescanned.find(
      (descriptor) => descriptor.id === "project:missing-site",
    );
    expect(scannedProject).toEqual(
      expect.objectContaining({
        exists: false,
        syncStatus: "target-missing",
      }),
    );

    const cached = await listCachedRuleDescriptors();
    expect(
      cached.find((descriptor) => descriptor.id === "project:missing-site"),
    ).toEqual(
      expect.objectContaining({
        exists: false,
        syncStatus: "target-missing",
      }),
    );

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:missing-site")?.syncStatus).toBe(
      "target-missing",
    );
    expect(
      fs.readFileSync(
        path.join(getRulesDir(), "projects", "missing-site", "AGENTS.md"),
        "utf8",
      ),
    ).toBe("# Recoverable project rule");
  });

  it("rejects unsafe project ids before creating managed project directories", async () => {
    const projectRoot = path.join(tempDir, "unsafe-create");
    fs.mkdirSync(projectRoot, { recursive: true });

    await expect(
      createProjectRule({
        id: "../escape-create",
        name: "Unsafe Create",
        rootPath: projectRoot,
      }),
    ).rejects.toThrow("Invalid rule project id");

    expect(
      fs.existsSync(path.join(getRulesDir(), "escape-create", "AGENTS.md")),
    ).toBe(false);
    const projectsDir = path.join(getRulesDir(), "projects");
    expect(
      fs.existsSync(projectsDir) ? fs.readdirSync(projectsDir) : [],
    ).toEqual([]);
  });

  it("saves managed content, writes versions, and updates rule index state", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });

    const updated = await saveRuleContent(
      "project:docs-site",
      "# Updated docs rule\n\n## Policy",
    );

    expect(updated.content).toContain("Updated docs rule");
    expect(
      fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8"),
    ).toContain("## Policy");

    const versionFile = new RuleDB(initDatabase()).getVersions(
      "project:docs-site",
    )[0].filePath;
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

  it("preserves previous managed content when a replacement write is interrupted", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# Stable docs rule");

    const managedPath = path.join(
      getRulesDir(),
      "projects",
      "docs-site",
      "AGENTS.md",
    );
    const originalWriteFile = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (data === "# Interrupted update") {
        originalWriteFile(file, "partial-write", options);
        throw new Error("simulated interrupted managed write");
      }

      return originalWriteFile(file, data, options);
    });

    await expect(
      saveRuleContent("project:docs-site", "# Interrupted update"),
    ).rejects.toThrow("simulated interrupted managed write");

    expect(fs.readFileSync(managedPath, "utf8")).toBe("# Stable docs rule");
  });

  it("reports external target edits as out-of-sync with both file versions", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# PromptHub copy");

    fs.writeFileSync(
      path.join(projectRoot, "AGENTS.md"),
      "# Edited outside PromptHub",
      "utf8",
    );

    const content = await readRuleContent("project:docs-site");

    expect(content.syncStatus).toBe("out-of-sync");
    expect(content.content).toBe("# PromptHub copy");
    expect(content.targetContent).toBe("# Edited outside PromptHub");
  });

  it("resolves external target edits by importing the target file into the managed copy", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# PromptHub copy");
    fs.writeFileSync(
      path.join(projectRoot, "AGENTS.md"),
      "# Edited outside PromptHub",
      "utf8",
    );

    const resolved = await resolveRuleConflict(
      "project:docs-site",
      "use-target",
    );

    expect(resolved.syncStatus).toBe("synced");
    expect(resolved.content).toBe("# Edited outside PromptHub");
    expect(resolved.targetContent).toBeUndefined();

    const managedPath = path.join(
      getRulesDir(),
      "projects",
      "docs-site",
      "AGENTS.md",
    );
    expect(fs.readFileSync(managedPath, "utf8")).toBe(
      "# Edited outside PromptHub",
    );
    expect(fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8")).toBe(
      "# Edited outside PromptHub",
    );
  });

  it("resolves external target edits by writing the managed copy back to the target file", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# PromptHub copy");
    fs.writeFileSync(
      path.join(projectRoot, "AGENTS.md"),
      "# Edited outside PromptHub",
      "utf8",
    );

    const resolved = await resolveRuleConflict(
      "project:docs-site",
      "use-managed",
    );

    expect(resolved.syncStatus).toBe("synced");
    expect(resolved.content).toBe("# PromptHub copy");
    expect(resolved.targetContent).toBeUndefined();
    expect(fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8")).toBe(
      "# PromptHub copy",
    );
  });

  it("removes a project rule from files and SQLite index", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# Updated docs rule");

    await removeProjectRule("docs-site");

    expect(
      fs.existsSync(path.join(getRulesDir(), "projects", "docs-site")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          getRulesDir(),
          ".versions",
          encodeURIComponent("project:docs-site"),
        ),
      ),
    ).toBe(false);

    const db = new RuleDB(initDatabase());
    expect(db.getById("project:docs-site")).toBeNull();
    expect(db.getVersions("project:docs-site")).toEqual([]);
  });

  it("cleans only deduplicated project records whose targets are still missing", async () => {
    const missingRoot = path.join(tempDir, "missing-cleanup");
    const presentRoot = path.join(tempDir, "present-cleanup");
    fs.mkdirSync(missingRoot, { recursive: true });
    fs.mkdirSync(presentRoot, { recursive: true });
    fs.writeFileSync(path.join(missingRoot, "AGENTS.md"), "# Missing", "utf8");
    fs.writeFileSync(path.join(presentRoot, "AGENTS.md"), "# Present", "utf8");

    await createProjectRule({
      id: "missing-cleanup",
      name: "Missing",
      rootPath: missingRoot,
    });
    await createProjectRule({
      id: "present-cleanup",
      name: "Present",
      rootPath: presentRoot,
    });
    fs.rmSync(path.join(missingRoot, "AGENTS.md"));

    const result = await removeMissingProjectRules([
      "project:missing-cleanup",
      "project:missing-cleanup",
      "project:present-cleanup",
      "claude-global",
      "project:../unsafe",
    ]);

    expect(result).toEqual({
      removed: ["project:missing-cleanup"],
      skipped: [
        "project:present-cleanup",
        "claude-global",
        "project:../unsafe",
      ],
      failed: [],
    });
    expect(
      new RuleDB(initDatabase()).getById("project:missing-cleanup"),
    ).toBeNull();
    expect(
      new RuleDB(initDatabase()).getById("project:present-cleanup"),
    ).not.toBeNull();
    expect(fs.existsSync(path.join(presentRoot, "AGENTS.md"))).toBe(true);
  });

  it("fails closed when a missing project record points outside its managed directory", async () => {
    const projectRoot = path.join(tempDir, "tampered-cleanup");
    const protectedRoot = path.join(tempDir, "protected");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(protectedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "# Missing", "utf8");
    fs.writeFileSync(path.join(protectedRoot, "keep.txt"), "keep", "utf8");

    await createProjectRule({
      id: "tampered-cleanup",
      name: "Tampered",
      rootPath: projectRoot,
    });
    const database = initDatabase();
    const original = new RuleDB(database).getById("project:tampered-cleanup")!;
    database.run(
      "UPDATE rules SET managed_path = ? WHERE id = ?",
      path.join(protectedRoot, "AGENTS.md"),
      original.id,
    );
    fs.rmSync(path.join(projectRoot, "AGENTS.md"));

    await expect(
      removeMissingProjectRules(["project:tampered-cleanup"]),
    ).resolves.toEqual({
      removed: [],
      skipped: [],
      failed: ["project:tampered-cleanup"],
    });
    expect(fs.readFileSync(path.join(protectedRoot, "keep.txt"), "utf8")).toBe(
      "keep",
    );
    expect(fs.readFileSync(original.managedPath, "utf8")).toBe("# Missing");
  });

  it("reports a per-record cleanup failure without removing another missing record", async () => {
    for (const projectId of ["cleanup-fails", "cleanup-succeeds"]) {
      const projectRoot = path.join(tempDir, projectId);
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, "AGENTS.md"),
        "# Missing",
        "utf8",
      );
      await createProjectRule({
        id: projectId,
        name: projectId,
        rootPath: projectRoot,
      });
      fs.rmSync(path.join(projectRoot, "AGENTS.md"));
    }

    const originalRename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation((target, destination) => {
      if (
        String(target) === path.join(getRulesDir(), "projects", "cleanup-fails")
      ) {
        throw new Error("simulated cleanup failure");
      }
      return originalRename(target, destination);
    });

    await expect(
      removeMissingProjectRules([
        "project:cleanup-fails",
        "project:cleanup-succeeds",
      ]),
    ).resolves.toEqual({
      removed: ["project:cleanup-succeeds"],
      skipped: [],
      failed: ["project:cleanup-fails"],
    });
    expect(
      new RuleDB(initDatabase()).getById("project:cleanup-fails"),
    ).not.toBeNull();
    expect(
      new RuleDB(initDatabase()).getById("project:cleanup-succeeds"),
    ).toBeNull();
  });

  it("keeps unique history after the version retention limit", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });

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
    const persistedVersions = new RuleDB(initDatabase()).getVersions(
      "project:docs-site",
    );
    expect(fs.readdirSync(versionDir)).toHaveLength(20);
    expect(fs.readFileSync(persistedVersions[0].filePath, "utf8")).toBe(
      "# version-22",
    );
    expect(fs.readFileSync(persistedVersions[1].filePath, "utf8")).toBe(
      "# version-21",
    );
  });

  it("always includes built-in global rule descriptors even when target files are missing", async () => {
    const service = createGlobalRulesTestService();
    for (const platformRoot of [".claude", "codex", "grok", "opencode"]) {
      fs.mkdirSync(path.join(tempDir, "home", platformRoot), {
        recursive: true,
      });
    }

    const descriptors = await service.listRuleDescriptors();

    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "codex-global", name: "AGENTS.md" }),
        expect.objectContaining({ id: "grok-global", name: "AGENTS.md" }),
        expect.objectContaining({ id: "opencode-global", name: "AGENTS.md" }),
        expect.objectContaining({ id: "claude-global", name: "CLAUDE.md" }),
      ]),
    );

    const opencodeRule = descriptors.find(
      (descriptor) => descriptor.id === "opencode-global",
    );
    expect(opencodeRule?.path).toContain("AGENTS.md");
  });

  it("rebinds a rebuilt catalog to device paths before serving the cached list", async () => {
    const service = createGlobalRulesTestService();
    const targetPath = path.join(tempDir, "home", ".claude", "CLAUDE.md");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "# Device rule", "utf8");
    const staleCanonicalPath = path.join(
      tempDir,
      "data",
      "rules",
      "claude-global",
      "rule.md",
    );
    const existingManagedPath = path.join(
      getRulesDir(),
      "global",
      "claude-global",
      "CLAUDE.md",
    );
    fs.mkdirSync(path.dirname(existingManagedPath), { recursive: true });
    fs.writeFileSync(existingManagedPath, "# Device rule");
    const db = new RuleDB(initDatabase());
    db.upsert({
      id: "claude-global",
      scope: "global",
      platformId: "claude",
      platformName: "Claude Code",
      platformIcon: "Bot",
      platformDescription: "Claude rules",
      canonicalFileName: "CLAUDE.md",
      description: "Global Claude rules",
      managedPath: existingManagedPath,
      targetPath: staleCanonicalPath,
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: 1,
      contentHash: "stale",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });

    const descriptors = await service.listCachedRuleDescriptors();

    expect(descriptors).toContainEqual(
      expect.objectContaining({
        id: "claude-global",
        path: targetPath,
        exists: true,
        syncStatus: "synced",
      }),
    );
    expect(db.getById("claude-global")).toMatchObject({
      targetPath,
      syncStatus: "synced",
    });
  });

  it("keeps managed Rules in the cached list when only the deployment target is missing", async () => {
    const service = createGlobalRulesTestService();
    const managedPath = path.join(getRulesDir(), "global", "pi-global", "AGENTS.md");
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.writeFileSync(managedPath, "# Managed Pi rule", "utf8");
    new RuleDB(initDatabase()).upsert({
      id: "pi-global",
      scope: "global",
      platformId: "pi",
      platformName: "Pi",
      platformIcon: "Bot",
      platformDescription: "Pi rules",
      canonicalFileName: "AGENTS.md",
      description: "Global Pi rules",
      managedPath,
      targetPath: path.join(tempDir, "home", "pi", "AGENTS.md"),
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: 1,
      contentHash: "managed",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });

    expect(await service.listCachedRuleDescriptors()).toContainEqual(
      expect.objectContaining({
        id: "pi-global",
        exists: false,
        syncStatus: "target-missing",
      }),
    );
  });

  it("reuses one SQLite adapter while rebuilding the Rule projection", async () => {
    const database = initDatabase();
    const createRuleDb = vi.fn(() => new RuleDB(database));
    const homeDir = path.join(tempDir, "bounded-scan-home");
    fs.mkdirSync(path.join(homeDir, "claude"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, "claude", "CLAUDE.md"),
      "# Claude rules",
      "utf8",
    );
    const service = createRulesWorkspaceService({
      getRulesDir,
      createRuleDb,
      getPlatformGlobalRulePath: (platform) =>
        path.join(
          homeDir,
          platform.id,
          platform.id === "claude" ? "CLAUDE.md" : "AGENTS.md",
        ),
      getPlatformRootDir: (platform) => path.join(homeDir, platform.id),
    });

    const descriptors = await service.scanRuleDescriptors();

    expect(descriptors).toContainEqual(
      expect.objectContaining({ id: "claude-global", exists: true }),
    );
    expect(createRuleDb).toHaveBeenCalledTimes(1);
  });

  it("reads SQL history without adopting a stray workspace JSON index", async () => {
    const service = createGlobalRulesTestService();
    await service.saveRuleContent("codex-global", "# Version 1");
    await service.saveRuleContent("codex-global", "# Version 2");
    const repository = new RuleDB(initDatabase());
    const original = repository.getVersions("codex-global");
    const strayIndex = path.join(
      path.dirname(original[0].filePath),
      "index.json",
    );
    fs.writeFileSync(strayIndex, JSON.stringify([{ id: "untrusted-stray" }]));
    const result = await service.readRuleContent("codex-global");
    expect(result.versions.map((version) => version.content)).toEqual([
      "# Version 2",
      "# Version 1",
    ]);
    expect(repository.getVersions("codex-global")).toEqual(original);
    expect(fs.readFileSync(strayIndex, "utf8")).toBe(
      JSON.stringify([{ id: "untrusted-stray" }]),
    );
  });

  it("deduplicates concurrent initial snapshots for global rules on first read", async () => {
    const service = createGlobalRulesTestService();
    const platform = getPlatformById("claude");
    expect(platform).toBeDefined();

    const globalRulePath = path.join(tempDir, "home", ".claude", "CLAUDE.md");
    expect(globalRulePath).toBeTruthy();

    fs.mkdirSync(path.dirname(globalRulePath!), { recursive: true });
    fs.writeFileSync(
      globalRulePath!,
      "# Claude global rule\n\nFollow the house style.",
      "utf8",
    );

    const originalRename = fsp.rename.bind(fsp);
    let claudeMetaWrites = 0;
    vi.spyOn(fsp, "rename").mockImplementation(async (temporary, file) => {
      if (
        path.basename(String(file)) === "_rule.json" &&
        String(file).includes(`${path.sep}global${path.sep}claude${path.sep}`)
      ) {
        claudeMetaWrites += 1;
      }

      return originalRename(temporary, file);
    });

    await Promise.all([
      service.listRuleDescriptors(),
      service.readRuleContent("claude-global"),
      service.readRuleContent("claude-global"),
    ]);

    const content = await service.readRuleContent("claude-global");
    expect(claudeMetaWrites).toBe(0);
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
    fs.writeFileSync(
      path.join(homeDir, ".claude", "CLAUDE.md"),
      "# Original",
      "utf8",
    );

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
    const claude = refreshed.find(
      (descriptor) => descriptor.id === "claude-global",
    );

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
    const kilo = descriptors.find(
      (descriptor) => descriptor.id === "kilo-global",
    );

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

    expect(
      cached.find((descriptor) => descriptor.id === "custom:team-agents"),
    ).toBeUndefined();
  });

  it("reports missing history without deleting its SQL identity", async () => {
    const projectRoot = path.join(tempDir, "docs-site");
    await createProjectRule({
      id: "docs-site",
      name: "Docs Site",
      rootPath: projectRoot,
    });
    await saveRuleContent("project:docs-site", "# version-1");
    await saveRuleContent("project:docs-site", "# version-2");
    const repository = new RuleDB(initDatabase());
    const versions = repository.getVersions("project:docs-site");
    fs.rmSync(versions[0].filePath);
    await expect(readRuleContent("project:docs-site")).rejects.toThrow();
    expect(repository.getVersions("project:docs-site")).toEqual(versions);
    expect(repository.getById("project:docs-site")?.currentVersion).toBe(2);
    expect(fs.readFileSync(versions[1].filePath, "utf8")).toBe("# version-1");
  });

  it("does not repair a lost managed global body by silently adopting its deployment", async () => {
    const service = createGlobalRulesTestService();
    await service.saveRuleContent("claude-global", "# Claude global rule");
    const repository = new RuleDB(initDatabase());
    const record = repository.getById("claude-global")!;
    const versions = repository.getVersions(record.id);
    fs.rmSync(record.managedPath);
    await expect(service.listRuleDescriptors()).rejects.toThrow();
    expect(fs.existsSync(record.managedPath)).toBe(false);
    expect(repository.getVersions(record.id)).toEqual(versions);
    expect(fs.readFileSync(record.targetPath, "utf8")).toBe(
      "# Claude global rule",
    );
  });

  it("migrates legacy rule-history JSON into managed rule versions", async () => {
    const service = createGlobalRulesTestService();
    const globalRulePath = path.join(tempDir, "home", ".claude", "CLAUDE.md");
    fs.mkdirSync(path.dirname(globalRulePath), { recursive: true });
    fs.writeFileSync(globalRulePath, "# Current Claude rule", "utf8");

    const legacyHistoryDir = path.join(tempDir, "rule-history");
    fs.mkdirSync(legacyHistoryDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyHistoryDir, "claude-global.json"),
      JSON.stringify({
        versions: [
          {
            id: "legacy-1",
            savedAt: "2026-05-01T00:00:00.000Z",
            content: "# Legacy Claude rule",
            source: "manual-save",
          },
        ],
      }),
      "utf8",
    );

    await service.bootstrapRuleWorkspace();
    await service.listRuleDescriptors();
    const content = await service.readRuleContent("claude-global");

    expect(content.content).toBe("# Current Claude rule");
    expect(content.versions.map((version) => version.content)).toEqual([
      "# Current Claude rule",
      "# Legacy Claude rule",
    ]);
    expect(
      fs.existsSync(
        path.join(getRulesDir(), ".versions", "claude-global", "index.json"),
      ),
    ).toBe(false);
  });

  it("restores managed content from legacy rule-history when the target file is missing", async () => {
    const service = createGlobalRulesTestService();
    const legacyHistoryDir = path.join(tempDir, "rule-history");
    fs.mkdirSync(legacyHistoryDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyHistoryDir, "claude-global.json"),
      JSON.stringify([
        {
          id: "legacy-old",
          savedAt: "2026-05-01T00:00:00.000Z",
          content: "# Older Claude rule",
          source: "manual-save",
        },
        {
          id: "legacy-new",
          savedAt: "2026-05-02T00:00:00.000Z",
          content: "# Latest Claude rule",
          source: "manual-save",
        },
      ]),
      "utf8",
    );

    await service.bootstrapRuleWorkspace();
    await service.listRuleDescriptors();
    const content = await service.readRuleContent("claude-global");

    expect(content.content).toBe("# Latest Claude rule");
    expect(content.syncStatus).toBe("target-missing");
    expect(content.versions.map((version) => version.content)).toEqual([
      "# Latest Claude rule",
      "# Older Claude rule",
    ]);
  });
});
