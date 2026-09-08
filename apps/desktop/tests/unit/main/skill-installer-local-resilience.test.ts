import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module before importing SkillInstaller
vi.mock("@/main/database", () => ({
  initDatabase: vi.fn(),
}));

vi.mock("@/main/settings/settings-readers", () => ({
  readGithubTokenSetting: vi.fn(),
}));

import {
  configureRuntimePaths,
  getSkillsDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { SkillInstaller } from "../../../src/main/services/skill-installer";
import { parseSkillMd } from "../../../src/main/services/skill-validator";
import { initDatabase } from "@/main/database";
import { readGithubTokenSetting } from "@/main/settings/settings-readers";
import { invalidateCustomPathsCache } from "../../../src/main/services/skill-installer-utils";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import * as remoteInstaller from "../../../src/main/services/skill-installer-remote";
import * as skillInstallerUtils from "../../../src/main/services/skill-installer-utils";
// Direct imports for real DB tests (these are NOT mocked)
import Database from "../../../src/main/database/sqlite";
import {
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";

let tmpDir: string;

function managedSkillsDir(): string {
  return getSkillsDir();
}

const SKILL_MIGRATION_COLUMNS = [
  "source_url TEXT",
  "local_repo_path TEXT",
  "icon_url TEXT",
  "icon_emoji TEXT",
  "icon_background TEXT",
  "category TEXT DEFAULT 'general'",
  "is_builtin INTEGER DEFAULT 0",
  "registry_slug TEXT",
  "content_url TEXT",
  "prerequisites TEXT",
  "compatibility TEXT",
  "original_tags TEXT",
  "safety_level TEXT",
  "safety_score INTEGER",
  "safety_report TEXT",
  "safety_scanned_at INTEGER",
];

function applySkillMigrationColumns(db: Database.Database): void {
  for (const column of SKILL_MIGRATION_COLUMNS) {
    try {
      db.exec(`ALTER TABLE skills ADD COLUMN ${column}`);
    } catch {
      // Column may already exist in newer schema snapshots.
    }
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-installer-test-"));
  configureRuntimePaths({ userDataPath: tmpDir });
  invalidateCustomPathsCache();
});

afterEach(async () => {
  invalidateCustomPathsCache();
  resetRuntimePaths();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ---------- exportAsSkillMd ----------

describe("exportAsSkillMd round-trip", () => {
  // We can't import parseSkillMd here without potentially pulling in more mocks,
  // but we can verify the structure is parseable YAML
  it("produces content with exactly two --- delimiters", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "roundtrip-test",
      description: "Testing round-trip",
      version: "1.0.0",
      tags: ["test"],
      instructions: "# Instructions\n\nDo things.",
    });

    const delimiterCount = (md.match(/^---$/gm) || []).length;
    expect(delimiterCount).toBe(2);
  });

  it("body content appears after the second ---", () => {
    const instructions = "# My Instructions\n\nSome content here.";
    const md = SkillInstaller.exportAsSkillMd({
      name: "body-test",
      instructions,
    });

    const parts = md.split("---");
    // parts[0] is empty (before first ---), parts[1] is frontmatter, parts[2] is body
    expect(parts.length).toBe(3);
    expect(parts[2].trim()).toBe(instructions);
  });
});

// ---------- stress: rapid file operations ----------

describe("SkillInstaller stress tests", () => {
  it("handles 20 rapid creates and deletes", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `stress-skill-${i}`);

    // Create all
    await Promise.all(
      names.map((name) =>
        SkillInstaller.saveContentToLocalRepo(name, `content for ${name}`),
      ),
    );

    // Verify all exist
    for (const name of names) {
      const files = await SkillInstaller.readLocalRepoFiles(name);
      expect(files.length).toBeGreaterThan(0);
    }

    // Delete all
    await Promise.all(
      names.map((name) => SkillInstaller.deleteLocalRepo(name)),
    );

    // Verify all gone
    for (const name of names) {
      const files = await SkillInstaller.readLocalRepoFiles(name);
      expect(files).toEqual([]);
    }
  });

  it("overwriting same skill 10 times preserves only final content", async () => {
    const skillName = "overwrite-test";
    for (let i = 0; i < 10; i++) {
      await SkillInstaller.saveContentToLocalRepo(skillName, `version-${i}`);
    }

    const files = await SkillInstaller.readLocalRepoFiles(skillName);
    const skillMd = files.find((f) => f.path === "SKILL.md");
    expect(skillMd?.content).toBe("version-9");
  });
});

// =====================================================================
// P1 Feature Tests
// =====================================================================

// ---------- P1-9: null byte rejection in validation ----------

describe("P1-9: null byte rejection", () => {
  it("validateSkillName rejects null byte at start", () => {
    expect(() => SkillInstaller.getLocalRepoPath("\x00valid")).toThrow(
      /must not contain null bytes/,
    );
  });

  it("validateSkillName rejects null byte at end", () => {
    expect(() => SkillInstaller.getLocalRepoPath("valid\x00")).toThrow(
      /must not contain null bytes/,
    );
  });

  it("validateSkillName rejects embedded null byte", () => {
    expect(() => SkillInstaller.getLocalRepoPath("my\x00skill")).toThrow(
      /must not contain null bytes/,
    );
  });

  it("validateSkillName rejects multiple null bytes", () => {
    expect(() => SkillInstaller.getLocalRepoPath("\x00\x00\x00")).toThrow(
      /must not contain null bytes/,
    );
  });

  it("validateRelativePath rejects null byte via writeLocalRepoFile", async () => {
    await SkillInstaller.init();
    await SkillInstaller.saveContentToLocalRepo("null-test", "content");
    await expect(
      SkillInstaller.writeLocalRepoFile("null-test", "file\x00.md", "data"),
    ).rejects.toThrow(/must not contain null bytes/);
  });

  it("validateRelativePath rejects null byte via replaceLocalRepoFilesByPath", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("null-replace-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "original");

    await expect(
      SkillInstaller.replaceLocalRepoFilesByPath(repoPath, [
        { relativePath: "ok.md", content: "fine" },
        { relativePath: "bad\x00file.md", content: "data" },
      ]),
    ).rejects.toThrow("Invalid Skill snapshot relative path");

    // Invalid snapshots are rejected before replacing the original package.
    const content = await fs.readFile(path.join(repoPath, "SKILL.md"), "utf-8");
    expect(content).toBe("original");
  });
});

// ---------- P1-10: atomic replaceLocalRepoFilesByPath ----------

describe("P1-10: atomic replaceLocalRepoFilesByPath", () => {
  it("replaces repo files atomically", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("atomic-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "old content");
    await fs.writeFile(path.join(repoPath, "extra.txt"), "old extra");

    await SkillInstaller.replaceLocalRepoFilesByPath(repoPath, [
      { relativePath: "SKILL.md", content: "new content" },
      { relativePath: "subdir/nested.txt", content: "nested file" },
    ]);

    // New files exist
    const skillMd = await fs.readFile(path.join(repoPath, "SKILL.md"), "utf-8");
    expect(skillMd).toBe("new content");
    const nested = await fs.readFile(
      path.join(repoPath, "subdir", "nested.txt"),
      "utf-8",
    );
    expect(nested).toBe("nested file");

    // Old file that wasn't in the new snapshot is gone
    await expect(fs.access(path.join(repoPath, "extra.txt"))).rejects.toThrow();
  });

  it("preserves original files when snapshot validation rejects path traversal", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("rollback-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "must survive");

    await expect(
      SkillInstaller.replaceLocalRepoFilesByPath(repoPath, [
        { relativePath: "../escape.txt", content: "malicious" },
      ]),
    ).rejects.toThrow("Invalid Skill snapshot relative path");

    // Original preserved
    const content = await fs.readFile(path.join(repoPath, "SKILL.md"), "utf-8");
    expect(content).toBe("must survive");
  });

  it("cleans up staging directory on failure", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("staging-cleanup-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "content");

    await expect(
      SkillInstaller.replaceLocalRepoFilesByPath(repoPath, [
        { relativePath: "../traversal.txt", content: "bad" },
      ]),
    ).rejects.toThrow();

    // No leftover staging directories
    const parent = path.dirname(repoPath);
    const entries = await fs.readdir(parent);
    const stagingDirs = entries.filter((e) => e.includes(".staging-"));
    expect(stagingDirs).toEqual([]);
  });

  it("handles empty file list (replaces with empty directory)", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("empty-replace-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "should be removed");

    await SkillInstaller.replaceLocalRepoFilesByPath(repoPath, []);

    // Directory exists but is empty
    const entries = await fs.readdir(repoPath);
    expect(entries).toEqual([]);
  });
});

// ---------- P1-11: withConfigLock concurrent safety ----------

describe("P1-11: platform config concurrent safety", () => {
  it("installToPlatform rejects unsupported platform", async () => {
    // Verify input validation before config file operations
    await expect(
      SkillInstaller.installToPlatform(
        "invalid" as "claude" | "cursor", // intentionally invalid value to test runtime validation
        "test",
        {
          command: "node",
          args: ["server.js"],
        },
      ),
    ).rejects.toThrow(/Unsupported platform/);
  });

  it("installToPlatform validates MCP config structure", async () => {
    await expect(
      SkillInstaller.installToPlatform("claude", "test-server", {
        // Missing 'command' field
        args: ["server.js"],
      }),
    ).rejects.toThrow();
  });

  it("installToPlatform writes valid config to file", async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      // Create a mock config path to intercept file writes
      const homeDir = os.homedir();
      const configDir = path.join(
        homeDir,
        process.platform === "darwin"
          ? "Library/Application Support/Claude"
          : process.platform === "win32"
            ? "AppData/Roaming/Claude"
            : ".config/claude",
      );

      const configPath = path.join(configDir, "claude_desktop_config.json");
      await fs.mkdir(configDir, { recursive: true });

      await SkillInstaller.installToPlatform("claude", "__p1-test-server__", {
        command: "echo",
        args: ["test"],
      });

      const written = JSON.parse(await fs.readFile(configPath, "utf-8"));
      expect(written.mcpServers?.["__p1-test-server__"]).toEqual({
        command: "echo",
        args: ["test"],
      });

      await SkillInstaller.uninstallFromPlatform(
        "claude",
        "__p1-test-server__",
      );

      const afterCleanup = JSON.parse(await fs.readFile(configPath, "utf-8"));
      expect(afterCleanup.mcpServers?.["__p1-test-server__"]).toBeUndefined();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("concurrent installToPlatform calls are serialized (no data loss)", async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = tmpDir;

    try {
      // This test verifies the withConfigLock mechanism by running
      // multiple installs concurrently to the same platform config
      const homeDir = os.homedir();
      const configDir = path.join(
        homeDir,
        process.platform === "darwin"
          ? "Library/Application Support/Claude"
          : process.platform === "win32"
            ? "AppData/Roaming/Claude"
            : ".config/claude",
      );
      const configPath = path.join(configDir, "claude_desktop_config.json");

      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, '{"mcpServers":{}}', "utf-8");

      const names = Array.from({ length: 5 }, (_, i) => `__lock-test-${i}__`);
      await Promise.all(
        names.map((name) =>
          SkillInstaller.installToPlatform("claude", name, {
            command: "echo",
            args: [name],
          }),
        ),
      );

      const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
      for (const name of names) {
        expect(result.mcpServers?.[name]).toEqual({
          command: "echo",
          args: [name],
        });
      }

      await Promise.all(
        names.map((name) =>
          SkillInstaller.uninstallFromPlatform("claude", name),
        ),
      );
    } finally {
      process.env.HOME = previousHome;
    }
  });
});

// ---------- scanLocalPreview: custom-paths-only & dedup behavior ----------

describe("SkillInstaller.scanLocalPreview", () => {
  /**
   * Helper: create a minimal SKILL.md inside <parentDir>/<skillName>/SKILL.md
   */
  async function createSkillDir(
    parentDir: string,
    skillName: string,
    opts?: { description?: string; version?: string },
  ): Promise<string> {
    const skillDir = path.join(parentDir, skillName);
    await fs.mkdir(skillDir, { recursive: true });
    const desc = opts?.description || `${skillName} description`;
    const ver = opts?.version || "1.0.0";
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: ${desc}\nversion: ${ver}\n---\n\n# ${skillName}\n\nInstructions here.\n`,
    );
    return skillDir;
  }

  it("with customPaths scans ONLY those directories, not defaults", async () => {
    await SkillInstaller.init();

    // Create two separate directories: one simulating a custom path, one simulating
    // a default platform directory.  Place a unique skill in each.
    const customDir = path.join(tmpDir, "my-custom-skills");
    const defaultLikeDir = path.join(tmpDir, "default-like-skills");
    await fs.mkdir(customDir, { recursive: true });
    await fs.mkdir(defaultLikeDir, { recursive: true });

    await createSkillDir(customDir, "custom-skill-alpha");
    await createSkillDir(defaultLikeDir, "default-skill-beta");

    // Only scan the custom directory
    const results = await SkillInstaller.scanLocalPreview([customDir]);

    const names = results.map((r) => r.name);
    expect(names).toContain("custom-skill-alpha");
    // The default-like directory should NOT be scanned
    expect(names).not.toContain("default-skill-beta");
  });

  it("without customPaths scans default platform directories", async () => {
    await SkillInstaller.init();

    const isolatedDefaultPlatformDir = path.join(
      tmpDir,
      "isolated-platform-skills",
    );
    const getMock = vi.fn().mockReturnValue({
      value: JSON.stringify(
        Object.fromEntries(
          SKILL_PLATFORMS.map((platform) => [
            platform.id,
            isolatedDefaultPlatformDir,
          ]),
        ),
      ),
    });
    vi.mocked(initDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({ get: getMock }),
    } as unknown as ReturnType<typeof initDatabase>);
    invalidateCustomPathsCache();

    // Place a skill in PromptHub's own skills directory (which is inside tmpDir)
    const prompthubSkillsDir = managedSkillsDir();
    await fs.mkdir(prompthubSkillsDir, { recursive: true });
    await createSkillDir(prompthubSkillsDir, "prompthub-builtin");

    const results = await SkillInstaller.scanLocalPreview();

    // PromptHub's own skills directory is always in the default scan entries
    const names = results.map((r) => r.name);
    expect(names).toContain("prompthub-builtin");
  });

  it("deduplicates skills at the same physical path across multiple customPaths", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "shared-skills");
    await createSkillDir(dir, "dedupe-me");

    // Pass the same directory twice
    const results = await SkillInstaller.scanLocalPreview([dir, dir]);

    const matching = results.filter((r) => r.name === "dedupe-me");
    expect(matching).toHaveLength(1);
  });

  it("returns skills from multiple distinct customPaths", async () => {
    await SkillInstaller.init();

    const dirA = path.join(tmpDir, "dir-a");
    const dirB = path.join(tmpDir, "dir-b");
    await createSkillDir(dirA, "skill-from-a");
    await createSkillDir(dirB, "skill-from-b");

    const results = await SkillInstaller.scanLocalPreview([dirA, dirB]);

    const names = results.map((r) => r.name);
    expect(names).toContain("skill-from-a");
    expect(names).toContain("skill-from-b");
    expect(results).toHaveLength(2);
  });

  it("treats a custom path that is itself a skill directory as importable", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "direct-skill-dir");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: direct-skill\ndescription: Direct skill dir\n---\n\n# direct-skill\n`,
    );

    const results = await SkillInstaller.scanLocalPreview([dir]);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("direct-skill");
    expect(results[0].localPath).toBe(dir);
  });

  it("discovers project skills installed as symlink directories", async () => {
    await SkillInstaller.init();

    const sourceDir = path.join(tmpDir, "prompthub-source", "writer");
    const projectSkillRoot = path.join(
      tmpDir,
      "workspace",
      ".agents",
      "skills",
    );
    const projectSkillPath = path.join(projectSkillRoot, "writer");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(projectSkillRoot, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      [
        "---",
        "name: writer",
        "description: Project symlink skill",
        "---",
        "",
        "# Writer",
      ].join("\n"),
      "utf-8",
    );
    await fs.symlink(sourceDir, projectSkillPath, "dir");

    const results = await SkillInstaller.scanLocalPreview([projectSkillRoot]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        name: "writer",
        description: "Project symlink skill",
        filePath: path.join(projectSkillPath, "SKILL.md"),
        installMode: "symlink",
        isPromptHubManagedLink: false,
        localPath: projectSkillPath,
        platforms: ["Custom"],
        symlinkTargetPath: sourceDir,
      }),
    );
  });

  it("returns empty array for non-existent customPath", async () => {
    await SkillInstaller.init();

    const results = await SkillInstaller.scanLocalPreview([
      path.join(tmpDir, "does-not-exist"),
    ]);

    expect(results).toEqual([]);
  });

  it("ignores empty/whitespace customPaths", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "valid-dir");
    await createSkillDir(dir, "valid-skill");

    const results = await SkillInstaller.scanLocalPreview(["  ", "", dir]);

    // Only the valid directory's skill should appear
    const names = results.map((r) => r.name);
    expect(names).toContain("valid-skill");
  });

  it("skips entries without SKILL.md", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "mixed-dir");
    await createSkillDir(dir, "has-skill-md");
    // Create a directory without SKILL.md
    await fs.mkdir(path.join(dir, "no-skill-md"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "no-skill-md", "README.md"),
      "# Not a skill",
    );

    const results = await SkillInstaller.scanLocalPreview([dir]);

    const names = results.map((r) => r.name);
    expect(names).toEqual(["has-skill-md"]);
  });

  it("marks all results with 'Custom' platform name when using customPaths", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "custom-platform-test");
    await createSkillDir(dir, "platform-check-skill");

    const results = await SkillInstaller.scanLocalPreview([dir]);

    expect(results).toHaveLength(1);
    expect(results[0].platforms).toEqual(["Custom"]);
  });

  it("parses frontmatter metadata correctly", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "metadata-test");
    const skillDir = path.join(dir, "rich-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: rich-skill",
        "description: A richly described skill",
        "version: 2.5.0",
        "author: TestAuthor",
        "tags: [ai, testing]",
        "---",
        "",
        "# Rich Skill",
        "",
        "Do rich things.",
      ].join("\n"),
    );

    const results = await SkillInstaller.scanLocalPreview([dir]);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("rich-skill");
    expect(results[0].description).toBe("A richly described skill");
    expect(results[0].version).toBe("2.5.0");
    expect(results[0].author).toBe("TestAuthor");
  });

  it("still returns preview results without safety reports when AI is not configured", async () => {
    await SkillInstaller.init();

    const dir = path.join(tmpDir, "no-ai-scan-preview");
    await createSkillDir(dir, "preview-only-skill");

    const results = await SkillInstaller.scanLocalPreview([dir]);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("preview-only-skill");
    expect(results[0].safetyReport).toBeUndefined();
  });
});

// ---------- P1-8: deleteRepoByPath TOCTOU fix ----------

describe("P1-8: deleteRepoByPath TOCTOU resilience", () => {
  it("deleting non-existent path does not throw", async () => {
    await SkillInstaller.init();
    // Path doesn't exist — should NOT throw (ENOENT is silently ignored)
    await expect(
      SkillInstaller.deleteRepoByPath(
        path.join(managedSkillsDir(), "ghost-skill"),
      ),
    ).resolves.toBeUndefined();
  });

  it("double delete of same path succeeds", async () => {
    await SkillInstaller.init();
    await SkillInstaller.saveContentToLocalRepo("double-del", "data");
    const repoPath = SkillInstaller.getLocalRepoPath("double-del");

    await SkillInstaller.deleteRepoByPath(repoPath);
    // Second delete should not throw (ENOENT silenced)
    await expect(
      SkillInstaller.deleteRepoByPath(repoPath),
    ).resolves.toBeUndefined();
  });
});

// ---------- scanLocal: name collision reporting ----------

describe("SkillInstaller.scanLocal (with real DB)", () => {
  let scanTmpDir: string;
  let sqliteDb: Database.Database;
  let skillDb: SkillDB;
  let previousHome: string | undefined;

  async function createSkillInDir(
    parentDir: string,
    skillName: string,
  ): Promise<void> {
    const dir = path.join(parentDir, skillName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: ${skillName} desc\n---\n\n# ${skillName}\n`,
    );
  }

  beforeEach(async () => {
    scanTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scanlocal-test-"));
    // Redirect HOME so getDefaultScanEntries() won't find real skills
    previousHome = process.env.HOME;
    process.env.HOME = scanTmpDir;

    configureRuntimePaths({ userDataPath: scanTmpDir });
    await SkillInstaller.init();

    // Create a real in-memory DB for SkillDB
    const dbTmpDir = fsSync.mkdtempSync(
      path.join(os.tmpdir(), "scanlocal-db-"),
    );
    sqliteDb = new Database(path.join(dbTmpDir, "test.db"));
    sqliteDb.exec(SCHEMA_TABLES);
    applySkillMigrationColumns(sqliteDb);
    sqliteDb.exec(SCHEMA_INDEXES);
    skillDb = new SkillDB(sqliteDb);
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    resetRuntimePaths();
    vi.restoreAllMocks();
    try {
      sqliteDb?.close();
    } catch {
      /* may already be closed */
    }
    await fs.rm(scanTmpDir, { recursive: true, force: true }).catch(() => {});
  });

  afterEach(async () => {
    resetRuntimePaths();
    vi.restoreAllMocks();
    sqliteDb?.close();
    await fs.rm(scanTmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("returns imported count and empty skipped array for fresh import", async () => {
    // Place skills in PromptHub's own skills directory
    const skillsDir = managedSkillsDir();
    await createSkillInDir(skillsDir, "alpha");
    await createSkillInDir(skillsDir, "beta");

    const result = await SkillInstaller.scanLocal(skillDb);

    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([]);
    // Verify they're actually in the DB
    expect(skillDb.getByName("alpha")).not.toBeNull();
    expect(skillDb.getByName("beta")).not.toBeNull();
  });

  it("reports name collisions in the skipped array", async () => {
    // Pre-install a skill with the same name
    skillDb.create({
      name: "existing-skill",
      description: "Already here",
      content: "# Existing",
      instructions: "# Existing",
      protocol_type: "skill",
      is_favorite: false,
      tags: [],
    });

    // Place a skill with the same name in the scan directory
    const skillsDir = managedSkillsDir();
    await createSkillInDir(skillsDir, "existing-skill");
    await createSkillInDir(skillsDir, "new-skill");

    const result = await SkillInstaller.scanLocal(skillDb);

    expect(result.imported).toBe(1); // Only new-skill was imported
    expect(result.skipped).toContain("existing-skill");
    expect(result.skipped).toHaveLength(1);
    expect(skillDb.getByName("new-skill")).not.toBeNull();
  });

  it("returns zero imported and empty skipped for empty directories", async () => {
    const result = await SkillInstaller.scanLocal(skillDb);
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([]);
  });
});

// ---------- P3: UNIQUE index on skills.source_id ----------

describe("P3: skills table UNIQUE index on source_id", () => {
  it("SCHEMA_INDEXES contains UNIQUE index on source_id", () => {
    expect(SCHEMA_INDEXES).toContain("idx_skills_source_id");
    expect(SCHEMA_INDEXES).toContain("UNIQUE INDEX");
    expect(SCHEMA_INDEXES).toContain("skills(source_id)");
  });

  it("prevents inserting two skills with the same source_id at DB level", () => {
    const dbDir = fsSync.mkdtempSync(
      path.join(os.tmpdir(), "unique-idx-test-"),
    );
    const testDb = new Database(path.join(dbDir, "test.db"));
    try {
      testDb.exec(SCHEMA_TABLES);
      applySkillMigrationColumns(testDb);
      testDb.exec(SCHEMA_INDEXES);

      const now = Date.now();
      testDb
        .prepare(
          `INSERT INTO skills (id, name, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run("id-1", "My-Skill", "source://same-variant", now, now);

      // Same source_id should be rejected by the partial UNIQUE index
      expect(() => {
        testDb
          .prepare(
            `INSERT INTO skills (id, name, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run("id-2", "my-skill", "source://same-variant", now, now);
      }).toThrow(/UNIQUE constraint failed/);
    } finally {
      testDb.close();
      fsSync.rmSync(dbDir, { recursive: true, force: true });
    }
  });
});

// ================================================================
// scanLocalPreview — nameConflict marking
// ================================================================
describe("scanLocalPreview nameConflict detection", () => {
  it("marks skills with duplicate names across different paths as nameConflict", async () => {
    // Create two different directories each containing a SKILL.md with the same name
    const baseDir = path.join(tmpDir, "conflict-test");
    const dir1 = path.join(baseDir, "skill-alpha");
    const dir2 = path.join(baseDir, "skill-beta");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    const skillMd1 = `---\nname: shared-name\ndescription: First one\n---\nInstructions A`;
    const skillMd2 = `---\nname: shared-name\ndescription: Second one\n---\nInstructions B`;
    await fs.writeFile(path.join(dir1, "SKILL.md"), skillMd1);
    await fs.writeFile(path.join(dir2, "SKILL.md"), skillMd2);

    const results = await SkillInstaller.scanLocalPreview([baseDir]);

    expect(results.length).toBe(2);
    for (const skill of results) {
      expect(skill.nameConflict).toBe(true);
    }
  });

  it("marks case-insensitive name collisions as nameConflict", async () => {
    const baseDir = path.join(tmpDir, "case-conflict-test");
    const dir1 = path.join(baseDir, "upper-skill");
    const dir2 = path.join(baseDir, "lower-skill");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    await fs.writeFile(
      path.join(dir1, "SKILL.md"),
      `---\nname: My-Skill\ndescription: Upper\n---\nContent`,
    );
    await fs.writeFile(
      path.join(dir2, "SKILL.md"),
      `---\nname: my-skill\ndescription: Lower\n---\nContent`,
    );

    const results = await SkillInstaller.scanLocalPreview([baseDir]);

    expect(results.length).toBe(2);
    expect(results.every((s) => s.nameConflict === true)).toBe(true);
  });

  it("does NOT mark nameConflict when names are unique", async () => {
    const baseDir = path.join(tmpDir, "no-conflict-test");
    const dir1 = path.join(baseDir, "skill-a");
    const dir2 = path.join(baseDir, "skill-b");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    await fs.writeFile(
      path.join(dir1, "SKILL.md"),
      `---\nname: alpha\n---\nContent`,
    );
    await fs.writeFile(
      path.join(dir2, "SKILL.md"),
      `---\nname: beta\n---\nContent`,
    );

    const results = await SkillInstaller.scanLocalPreview([baseDir]);

    expect(results.length).toBe(2);
    expect(
      results.every(
        (s) => s.nameConflict === undefined || s.nameConflict === false,
      ),
    ).toBe(true);
  });

  it("only marks conflicting names, not all skills", async () => {
    const baseDir = path.join(tmpDir, "partial-conflict-test");
    const dir1 = path.join(baseDir, "dup1");
    const dir2 = path.join(baseDir, "dup2");
    const dir3 = path.join(baseDir, "unique");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });
    await fs.mkdir(dir3, { recursive: true });

    await fs.writeFile(path.join(dir1, "SKILL.md"), `---\nname: dupe\n---\nA`);
    await fs.writeFile(path.join(dir2, "SKILL.md"), `---\nname: dupe\n---\nB`);
    await fs.writeFile(
      path.join(dir3, "SKILL.md"),
      `---\nname: unique-name\n---\nC`,
    );

    const results = await SkillInstaller.scanLocalPreview([baseDir]);

    expect(results.length).toBe(3);

    const dupes = results.filter((s) => s.name === "dupe");
    const unique = results.filter((s) => s.name === "unique-name");

    expect(dupes.length).toBe(2);
    expect(dupes.every((s) => s.nameConflict === true)).toBe(true);
    expect(unique.length).toBe(1);
    expect(unique[0].nameConflict).toBeFalsy();
  });
});

// ---------- S3: GitHub URL regex in IPC crud-handlers ----------

describe("S3: git repository URL regex validation in skill:create IPC", () => {
  const GIT_REPO_REGEX =
    /^(?:https?:\/\/[^/]+\/[A-Za-z0-9_.-]*[A-Za-z_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]*[A-Za-z_-][A-Za-z0-9_.-]*|git@[^:]+:[A-Za-z0-9_.-]*[A-Za-z_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]*[A-Za-z_-][A-Za-z0-9_.-]*(?:\.git)?)$/;

  it.each([
    "https://github.com/owner/repo",
    "https://gitea.example.com/owner/repo",
    "https://github.com/my-org/my-repo",
    "https://github.com/user_name/repo.name",
    "http://github.com/owner/repo",
    "git@github.com:owner/repo.git",
    "git@gitea.example.com:owner/repo.git",
  ])("matches valid git repo URL: %s", (url) => {
    expect(GIT_REPO_REGEX.test(url)).toBe(true);
  });

  it.each([
    "https://evil.com/github.com/fake/path",
    "https://evil.com/owner/",
    "ftp://github.com/owner/repo",
    "github.com/owner/repo",
    "",
    "https://github.com/",
    "https://github.com/owner/",
    "git@host-only",
  ])("rejects invalid or spoofed URL: %s", (url) => {
    expect(GIT_REPO_REGEX.test(url)).toBe(false);
  });
});

// ---------- S3 + M3: installFromGithub URL validation & DB duplicate check ----------
