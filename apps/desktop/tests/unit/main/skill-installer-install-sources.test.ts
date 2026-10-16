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

describe("SkillInstaller.installFromGithub", () => {
  it("rejects an invalid git repository URL (missing owner/repo)", async () => {
    await SkillInstaller.init();
    // Need a real SkillDB for the DB check, but URL validation comes first
    const mockDb = { getByName: vi.fn() } as unknown as SkillDB;
    await expect(
      SkillInstaller.installFromGithub("https://evil.com/owner/", mockDb),
    ).rejects.toThrow("Invalid git repository URL");
  });

  it("accepts self-hosted git repository URLs", async () => {
    await SkillInstaller.init();

    const mockDb = {
      getByName: vi.fn().mockReturnValue(null),
      create: vi.fn().mockReturnValue({ id: "skill-gitea" }),
      update: vi.fn(),
    } as unknown as SkillDB;

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(
          path.join(destDir, "SKILL.md"),
          "---\nname: repo\ndescription: Repository skill\n---\n# Repo\n",
        );
      },
    );
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockResolvedValue(
      path.join(managedSkillsDir(), "icelemon-skills"),
    );

    const skillId = await SkillInstaller.installFromGithub(
      "https://gitea.example.com/icelemon/skills",
      mockDb,
    );

    expect(skillId).toBe("skill-gitea");
    expect(skillInstallerUtils.gitClone).toHaveBeenCalledWith(
      "https://gitea.example.com/icelemon/skills",
      path.join(managedSkillsDir(), "icelemon-skills"),
    );
  });

  it("removes the temporary clone after moving a GitHub install into the managed repo", async () => {
    await SkillInstaller.init();

    const dbMock = {
      getByName: vi.fn().mockReturnValue(null),
      create: vi.fn().mockReturnValue({
        id: "skill-cleanup",
        name: "repo",
        source_id: "source-repo-main",
        local_repo_path: path.join(managedSkillsDir(), "owner-repo"),
      }),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const mockDb = dbMock as unknown as SkillDB;

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        await fs.mkdir(path.join(destDir, "docs"), { recursive: true });
        await fs.writeFile(path.join(destDir, "SKILL.md"), "# Repo\n");
        await fs.writeFile(path.join(destDir, "docs", "guide.md"), "Guide");
      },
    );
    vi.spyOn(
      SkillInstaller,
      "resolveSingleSkillDirFromRepo",
    ).mockImplementation(async (installDir) => installDir);

    await expect(
      SkillInstaller.installFromGithub("https://github.com/owner/repo", mockDb),
    ).resolves.toBe("skill-cleanup");

    expect(fsSync.existsSync(path.join(managedSkillsDir(), "owner-repo"))).toBe(
      false,
    );
    const managedRepoPath = dbMock.update.mock.calls[0]?.[1]?.local_repo_path;
    expect(typeof managedRepoPath).toBe("string");
    expect(
      fsSync.existsSync(path.join(String(managedRepoPath), "SKILL.md")),
    ).toBe(true);
  });

  it("rolls back the created DB row when post-create persistence fails", async () => {
    await SkillInstaller.init();

    const dbMock = {
      getByName: vi.fn().mockReturnValue(null),
      create: vi.fn().mockReturnValue({
        id: "skill-rollback",
        name: "repo",
        source_id: "source-repo-main",
        local_repo_path: path.join(managedSkillsDir(), "owner-repo"),
      }),
      update: vi.fn().mockImplementation(() => {
        throw new Error("update failed");
      }),
      delete: vi.fn(),
    };
    const mockDb = dbMock as unknown as SkillDB;

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(
          path.join(destDir, "SKILL.md"),
          "---\nname: repo\ndescription: Repository skill\n---\n# Repo\n",
        );
      },
    );
    vi.spyOn(
      SkillInstaller,
      "resolveSingleSkillDirFromRepo",
    ).mockImplementation(async (installDir) => installDir);
    await expect(
      SkillInstaller.installFromGithub("https://github.com/owner/repo", mockDb),
    ).rejects.toThrow("update failed");

    expect(dbMock.delete).toHaveBeenCalledWith("skill-rollback");
    expect(fsSync.existsSync(path.join(managedSkillsDir(), "owner-repo"))).toBe(
      false,
    );
  });

  it("rejects when a skill with the derived repo name already exists in DB", async () => {
    await SkillInstaller.init();

    // Create a fake DB that reports the skill already exists
    const mockDb = {
      getByName: vi.fn((name: string) => {
        if (name === "my-repo") {
          return { id: "existing-id", name: "my-repo" };
        }
        return null;
      }),
    } as unknown as SkillDB;

    await expect(
      SkillInstaller.installFromGithub(
        "https://github.com/some-owner/my-repo",
        mockDb,
      ),
    ).rejects.toThrow(/already exists in the library/);
  });

  it("accepts SSH GitHub URLs and clones using the original SSH address", async () => {
    await SkillInstaller.init();

    const mockDb = {
      getByName: vi.fn().mockReturnValue(null),
      create: vi.fn().mockReturnValue({ id: "skill-1" }),
      update: vi.fn(),
    } as unknown as SkillDB;

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(
          path.join(destDir, "SKILL.md"),
          "---\nname: repo\ndescription: Repository skill\n---\n# Repo\n",
        );
      },
    );
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockResolvedValue(
      path.join(managedSkillsDir(), "owner-repo"),
    );

    const skillId = await SkillInstaller.installFromGithub(
      "git@github.com:owner/repo.git",
      mockDb,
    );

    expect(skillId).toBe("skill-1");
    expect(skillInstallerUtils.gitClone).toHaveBeenCalledWith(
      "git@github.com:owner/repo.git",
      path.join(managedSkillsDir(), "owner-repo"),
    );
  });
});

describe("SkillInstaller.scanRemoteGithub", () => {
  it("scans HTTPS Gitea stores by reading only tree metadata and SKILL.md files", async () => {
    await SkillInstaller.init();

    const cloneSpy = vi.spyOn(skillInstallerUtils, "gitClone");
    const scanLocalPreviewSpy = vi.spyOn(SkillInstaller, "scanLocalPreview");
    const fetchRemoteContent = vi
      .spyOn(SkillInstaller, "fetchRemoteContent")
      .mockImplementation(async (url: string) => {
        if (url === "https://gitea.example.com/api/v1/repos/icelemon/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [
              { path: "gitea-skill/SKILL.md", type: "blob", sha: "skill-sha" },
              {
                path: "gitea-skill/docs/guide.md",
                type: "blob",
                sha: "guide-sha",
              },
            ],
          });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/gitea-skill/SKILL.md?ref=main"
        ) {
          return [
            "---",
            "name: gitea-skill",
            "description: A skill from Gitea",
            "version: 1.0.0",
            "author: icelemon",
            "tags: [gitea]",
            "---",
            "# Gitea skill",
            "",
            "Content",
          ].join("\n");
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const result = await SkillInstaller.scanRemoteGithub(
      "https://gitea.example.com/icelemon/skills",
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("gitea-skill");
    expect(result[0].author).toBe("icelemon");
    expect(result[0].directory_fingerprint).toBeUndefined();
    expect(result[0].source_url).toBe(
      "https://gitea.example.com/icelemon/skills/tree/main/gitea-skill",
    );
    expect(result[0].content_url).toBe(
      "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/gitea-skill/SKILL.md?ref=main",
    );
    expect(fetchRemoteContent).toHaveBeenCalledTimes(3);
    expect(cloneSpy).not.toHaveBeenCalled();
    expect(scanLocalPreviewSpy).not.toHaveBeenCalled();
  });

  it("scans SSH Gitea store URLs through the same SKILL.md-only metadata path", async () => {
    await SkillInstaller.init();

    const cloneSpy = vi.spyOn(skillInstallerUtils, "gitClone");
    vi.spyOn(SkillInstaller, "fetchRemoteContent").mockImplementation(
      async (url: string) => {
        if (url === "https://gitea.example.com/api/v1/repos/icelemon/skills") {
          return JSON.stringify({ default_branch: "stable" });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/git/trees/stable?recursive=1"
        ) {
          return JSON.stringify({
            tree: [
              { path: "ssh-skill/SKILL.md", type: "blob", sha: "ssh-sha" },
            ],
          });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/ssh-skill/SKILL.md?ref=stable"
        ) {
          return [
            "---",
            "name: ssh-skill",
            "description: SSH skill",
            "author: owner",
            "tags: [ssh]",
            "---",
            "# SSH skill",
          ].join("\n");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const result = await SkillInstaller.scanRemoteGithub(
      "git@gitea.example.com:icelemon/skills.git",
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("ssh-skill");
    expect(result[0].source_url).toBe(
      "https://gitea.example.com/icelemon/skills/tree/stable/ssh-skill",
    );
    expect(result[0].content_url).toBe(
      "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/ssh-skill/SKILL.md?ref=stable",
    );
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("keeps source identity stable across refreshes even when clone roots differ", async () => {
    await SkillInstaller.init();

    const cloneSpy = vi.spyOn(skillInstallerUtils, "gitClone");
    vi.spyOn(SkillInstaller, "fetchRemoteContent").mockImplementation(
      async (url: string) => {
        if (url === "https://gitea.example.com/api/v1/repos/icelemon/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [
              {
                path: "skills/writer/SKILL.md",
                type: "blob",
                sha: "writer-sha",
              },
              {
                path: "skills/writer/references/style.md",
                type: "blob",
                sha: "style-sha",
              },
            ],
          });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/skills/writer/SKILL.md?ref=main"
        ) {
          return [
            "---",
            "name: writer",
            "description: Nested writer skill",
            "version: 1.0.0",
            "author: icelemon",
            "tags: [writer]",
            "---",
            "",
            "# writer",
          ].join("\n");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const first = await SkillInstaller.scanRemoteGithub(
      "https://gitea.example.com/icelemon/skills",
      [],
      "main",
      "skills",
    );
    const second = await SkillInstaller.scanRemoteGithub(
      "https://gitea.example.com/icelemon/skills",
      [],
      "main",
      "skills",
    );

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].source_id).toBe(second[0].source_id);
    expect(first[0].source_directory).toBe("skills/writer");
    expect(second[0].source_directory).toBe("skills/writer");
    expect(first[0].canonical_skill_path).toBe("skills/writer/SKILL.md");
    expect(second[0].canonical_skill_path).toBe("skills/writer/SKILL.md");
    expect(first[0].source_url).toBe(
      "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
    );
    expect(second[0].source_url).toBe(
      "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
    );
    expect(cloneSpy).not.toHaveBeenCalled();
  });
});

// ---------- M6: scanLocalPreview with db param marks DB-existing names ----------

describe("scanLocalPreview DB conflict detection (M6)", () => {
  let scanDb: Database.Database;
  let skillDb: SkillDB;

  beforeEach(async () => {
    await SkillInstaller.init();

    // Real database with managed package files in the isolated profile.
    const sqliteDb = new Database(path.join(tmpDir, "skills-test.db"));
    sqliteDb.exec(SCHEMA_TABLES);
    applySkillMigrationColumns(sqliteDb);
    sqliteDb.exec(SCHEMA_INDEXES);
    scanDb = sqliteDb;
    skillDb = new SkillDB(sqliteDb);
  });

  afterEach(() => {
    try {
      scanDb.close();
    } catch {
      /* already closed */
    }
  });

  async function createSkillDirM6(
    parentDir: string,
    skillName: string,
  ): Promise<string> {
    const skillDir = path.join(parentDir, skillName);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: ${skillName} desc\n---\n\n# ${skillName}\n`,
    );
    return skillDir;
  }

  it("marks nameConflict for skills that already exist in DB", async () => {
    // Pre-install a skill in the database
    skillDb.create({
      name: "already-installed",
      description: "An installed skill",
      protocol_type: "skill",
      is_favorite: false,
    });

    // Create a scanned skill with the same name on disk
    const scanDir = path.join(tmpDir, "db-conflict-scan");
    await createSkillDirM6(scanDir, "already-installed");
    await createSkillDirM6(scanDir, "brand-new");

    const results = await SkillInstaller.scanLocalPreview([scanDir], skillDb);

    const installed = results.find((s) => s.name === "already-installed");
    const fresh = results.find((s) => s.name === "brand-new");

    expect(installed).toBeDefined();
    expect(installed!.nameConflict).toBe(true);

    expect(fresh).toBeDefined();
    expect(fresh!.nameConflict).toBeFalsy();
  });

  it("does NOT mark nameConflict when db param is omitted", async () => {
    // Pre-install a skill in the database
    skillDb.create({
      name: "db-only",
      description: "DB-only skill",
      protocol_type: "skill",
      is_favorite: false,
    });

    // Create a scanned skill with the same name on disk
    const scanDir = path.join(tmpDir, "no-db-param-scan");
    await createSkillDirM6(scanDir, "db-only");

    // Call without db param — should NOT check DB
    const results = await SkillInstaller.scanLocalPreview([scanDir]);

    const scanned = results.find((s) => s.name === "db-only");
    expect(scanned).toBeDefined();
    // Without db param, the code can't know about DB conflicts
    expect(scanned!.nameConflict).toBeFalsy();
  });

  it("marks case-insensitive DB conflicts via db.getByName", async () => {
    // DB has "My-Skill" (mixed case)
    skillDb.create({
      name: "my-skill",
      description: "Mixed case skill",
      protocol_type: "skill",
      is_favorite: false,
    });

    // Disk has "my-skill" (lowercase) — should conflict because
    // db.getByName uses LOWER() matching
    const scanDir = path.join(tmpDir, "case-db-conflict");
    await createSkillDirM6(scanDir, "my-skill");

    const results = await SkillInstaller.scanLocalPreview([scanDir], skillDb);

    expect(results).toHaveLength(1);
    expect(results[0].nameConflict).toBe(true);
  });
});

// ---------- L3: JSON export/import round-trip preserves source_url ----------

describe("L3: JSON export/import preserves source_url", () => {
  it("exportAsJson includes source_url in output", () => {
    const json = SkillInstaller.exportAsJson({
      name: "url-skill",
      source_url: "https://github.com/owner/repo",
      source_label: "owner/repo",
      source_branch: "main",
      source_directory: "skills/pdf",
      canonical_skill_path: "skills/pdf/SKILL.md",
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.source_url).toBe("https://github.com/owner/repo");
    expect(parsed.source_label).toBe("owner/repo");
    expect(parsed.source_branch).toBe("main");
    expect(parsed.source_directory).toBe("skills/pdf");
    expect(parsed.canonical_skill_path).toBe("skills/pdf/SKILL.md");
  });

  it("exportAsJson defaults source_url to empty string when not provided", () => {
    const json = SkillInstaller.exportAsJson({ name: "no-url-skill" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.source_url).toBe("");
  });

  it("importFromJson round-trips source_url through export → import", async () => {
    // Create a real in-memory DB
    const sqliteDb = new Database(path.join(tmpDir, "skills-test.db"));
    sqliteDb.exec(SCHEMA_TABLES);
    applySkillMigrationColumns(sqliteDb);
    sqliteDb.exec(SCHEMA_INDEXES);
    const db = new SkillDB(sqliteDb);

    try {
      // Export a skill with source_url
      const json = SkillInstaller.exportAsJson({
        name: "roundtrip-url",
        description: "A skill with source URL",
        source_url: "https://github.com/test/roundtrip",
        source_label: "test/roundtrip",
        source_branch: "release",
        source_directory: "skills/.curated/roundtrip",
        canonical_skill_path: "skills/.curated/roundtrip/SKILL.md",
        instructions: "# Instructions\n\nDo things.",
      });

      // Import it
      const id = await SkillInstaller.importFromJson(json, db);
      expect(typeof id).toBe("string");

      // Verify the source_url was preserved in DB
      const imported = db.getById(id);
      expect(imported).not.toBeNull();
      expect(imported!.name).toBe("roundtrip-url");
      expect(imported!.source_url).toBe("https://github.com/test/roundtrip");
      expect(imported!.source_label).toBe("test/roundtrip");
      expect(imported!.source_branch).toBe("release");
      expect(imported!.source_directory).toBe("skills/.curated/roundtrip");
      expect(imported!.canonical_skill_path).toBe(
        "skills/.curated/roundtrip/SKILL.md",
      );
    } finally {
      sqliteDb.close();
    }
  });

  it("importFromJson preserves source_id alongside source metadata", async () => {
    const sqliteDb = new Database(path.join(tmpDir, "skills-test.db"));
    sqliteDb.exec(SCHEMA_TABLES);
    applySkillMigrationColumns(sqliteDb);
    sqliteDb.exec(SCHEMA_INDEXES);
    const db = new SkillDB(sqliteDb);

    try {
      const json = JSON.stringify({
        name: "source-id-roundtrip",
        description: "Keeps source identity",
        instructions: "# Content",
        source_id: "source-id-roundtrip-main",
        source_label: "owner/repo",
        source_branch: "main",
        source_directory: "skills/.curated/source-id-roundtrip",
        canonical_skill_path: "skills/.curated/source-id-roundtrip/SKILL.md",
      });

      const id = await SkillInstaller.importFromJson(json, db);
      const imported = db.getById(id);

      expect(imported).not.toBeNull();
      expect(imported!.source_id).toBe("source-id-roundtrip-main");
      expect(imported!.source_label).toBe("owner/repo");
      expect(imported!.source_branch).toBe("main");
      expect(imported!.source_directory).toBe(
        "skills/.curated/source-id-roundtrip",
      );
      expect(imported!.canonical_skill_path).toBe(
        "skills/.curated/source-id-roundtrip/SKILL.md",
      );
    } finally {
      sqliteDb.close();
    }
  });

  it("importFromJson handles missing source_url gracefully", async () => {
    const sqliteDb = new Database(path.join(tmpDir, "skills-test.db"));
    sqliteDb.exec(SCHEMA_TABLES);
    applySkillMigrationColumns(sqliteDb);
    sqliteDb.exec(SCHEMA_INDEXES);
    const db = new SkillDB(sqliteDb);

    try {
      // JSON without source_url field
      const json = JSON.stringify({
        name: "no-url-import",
        description: "No source URL",
        instructions: "# Content",
      });

      const id = await SkillInstaller.importFromJson(json, db);
      const imported = db.getById(id);
      expect(imported).not.toBeNull();
      expect(imported!.name).toBe("no-url-import");
      // source_url should be null or undefined — not crash
      expect(imported!.source_url).toBeFalsy();
    } finally {
      sqliteDb.close();
    }
  });
});
