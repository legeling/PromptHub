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

describe("SkillInstaller.exportAsSkillMd", () => {
  it("produces valid frontmatter with name only", () => {
    const md = SkillInstaller.exportAsSkillMd({ name: "test-skill" });
    expect(md).toContain("---");
    expect(md).toContain("name: test-skill");
    // Default compatibility
    expect(md).toContain("compatibility: [prompthub]");
  });

  it("includes all provided metadata fields", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "my-skill",
      description: "A great skill",
      version: "2.0.0",
      author: "Alice",
      tags: ["coding", "python"],
      license: "MIT",
      compatibility: ["prompthub", "claude"],
      instructions: "# Hello\n\nDo stuff.",
    });

    expect(md).toContain("name: my-skill");
    expect(md).toContain("description: A great skill");
    expect(md).toContain("version: 2.0.0");
    expect(md).toContain("author: Alice");
    expect(md).toContain("license: MIT");
    expect(md).toContain("tags: [coding, python]");
    expect(md).toContain("compatibility: [prompthub, claude]");
    expect(md).toContain("# Hello\n\nDo stuff.");
  });

  it("omits optional fields when not provided", () => {
    const md = SkillInstaller.exportAsSkillMd({ name: "minimal" });
    expect(md).not.toContain("description:");
    expect(md).not.toContain("version:");
    expect(md).not.toContain("author:");
    expect(md).not.toContain("license:");
    expect(md).not.toContain("tags:");
  });

  it("YAML-escapes values with special characters", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test-skill",
      description: 'Has "quotes" and [brackets]',
    });
    // Should be YAML-escaped with double quotes
    expect(md).toContain('description: "Has \\"quotes\\" and [brackets]"');
  });

  it("handles empty string instructions as empty body", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      instructions: "",
    });
    // After the closing ---, there should be an empty line and no content
    expect(md.endsWith("---\n")).toBe(true);
  });

  it("handles single-item compatibility array", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      compatibility: ["claude"],
    });
    expect(md).toContain("compatibility: [claude]");
  });

  it("handles compatibility as string (not array)", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      compatibility: "custom-platform",
    });
    expect(md).toContain("compatibility: [custom-platform]");
  });

  it("YAML-escapes colons in name", () => {
    const md = SkillInstaller.exportAsSkillMd({ name: "has:colon" });
    expect(md).toContain('"has:colon"');
  });

  it("YAML-wraps description containing newlines in double quotes", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      description: "line1\nline2",
    });
    // The yamlStr helper wraps values containing \n in double quotes
    // but does NOT escape the literal newline to \\n — it produces a multi-line YAML value
    expect(md).toContain('description: "line1\nline2"');
  });

  it("handles tags with special chars", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      tags: ["tag:with:colons", "normal"],
    });
    expect(md).toContain('"tag:with:colons"');
    expect(md).toContain("normal");
  });
});

describe("SkillInstaller.fetchRemoteContent", () => {
  function mockInstalledRemoteSources(
    rows: Array<{ source_url: string | null; content_url: string | null }>,
  ) {
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => rows),
      })),
    } as unknown;
    vi.mocked(initDatabase).mockReturnValue(
      db as ReturnType<typeof initDatabase>,
    );
    vi.mocked(readGithubTokenSetting).mockReturnValue(null);
    return db;
  }

  const privateFetchOptions = {
    allowPrivateNetwork: true,
    allowInsecurePrivateNetworkHttp: true,
    githubToken: null,
  };

  it("reads the GitHub token without importing Electron-bound IPC modules", async () => {
    const db = { prepare: vi.fn() } as unknown;
    vi.mocked(initDatabase).mockReturnValue(
      db as ReturnType<typeof initDatabase>,
    );
    vi.mocked(readGithubTokenSetting).mockReturnValue("ghp_FromDb");
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    const result = await SkillInstaller.fetchRemoteContent(
      "https://api.github.com/repos/foo/bar/contents/SKILL.md",
    );

    expect(result).toBe("ok");
    expect(readGithubTokenSetting).toHaveBeenCalledWith(db);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/foo/bar/contents/SKILL.md",
      0,
      { githubToken: "ghp_FromDb" },
    );
  });

  it("allows private network fetches for installed skill content URLs", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20/team/skills",
        content_url:
          "http://192.168.1.20/team/skills/raw/branch/main/writer/SKILL.md",
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    const result = await SkillInstaller.fetchRemoteContent(
      "http://192.168.1.20/team/skills/raw/branch/main/writer/SKILL.md",
    );

    expect(result).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20/team/skills/raw/branch/main/writer/SKILL.md",
      0,
      privateFetchOptions,
    );
  });

  it("allows private network fetches within an installed source URL path scope", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20/team/skills/",
        content_url: null,
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    await SkillInstaller.fetchRemoteContent(
      "http://192.168.1.20/team/skills/raw/branch/main/assets/icon.png",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20/team/skills/raw/branch/main/assets/icon.png",
      0,
      privateFetchOptions,
    );
  });

  it("allows private network byte fetches within an installed source URL path scope", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20/team/skills",
        content_url: null,
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteBytes")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));

    await SkillInstaller.fetchRemoteContentBytes(
      "http://192.168.1.20/team/skills/raw/branch/main/assets/icon.png",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20/team/skills/raw/branch/main/assets/icon.png",
      0,
      privateFetchOptions,
    );
  });

  it("does not allow arbitrary private network URLs outside installed skill sources", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20/team/skills",
        content_url:
          "http://192.168.1.20/team/skills/raw/branch/main/writer/SKILL.md",
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    await SkillInstaller.fetchRemoteContent("http://192.168.1.99/admin/config");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.99/admin/config",
      0,
      { githubToken: null },
    );
  });

  it("does not allow same-origin sibling paths outside the installed source URL scope", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20/team/skills",
        content_url: null,
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    await SkillInstaller.fetchRemoteContent(
      "http://192.168.1.20/team/skills-other/raw/SKILL.md",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20/team/skills-other/raw/SKILL.md",
      0,
      { githubToken: null },
    );
  });

  it("does not allow different private origins even when the path matches", async () => {
    mockInstalledRemoteSources([
      {
        source_url: "http://192.168.1.20:3000/team/skills",
        content_url: null,
      },
    ]);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    await SkillInstaller.fetchRemoteContent(
      "http://192.168.1.20:3001/team/skills/raw/SKILL.md",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20:3001/team/skills/raw/SKILL.md",
      0,
      { githubToken: null },
    );
  });

  it("falls back to the default SSRF policy when installed source lookup fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = {
      prepare: vi.fn(() => {
        throw new Error("settings unavailable");
      }),
    } as unknown;
    vi.mocked(initDatabase).mockReturnValue(
      db as ReturnType<typeof initDatabase>,
    );
    vi.mocked(readGithubTokenSetting).mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(remoteInstaller, "fetchRemoteText")
      .mockResolvedValue("ok");

    await SkillInstaller.fetchRemoteContent(
      "http://192.168.1.20/team/skills/raw/SKILL.md",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.1.20/team/skills/raw/SKILL.md",
      0,
      { githubToken: null },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "Unable to load skill remote fetch settings, continuing unauthenticated:",
      expect.any(Error),
    );
  });
});

describe("SkillInstaller.scanRemoteGithub", () => {
  it("allows private network access for user-selected Gitea repository scans", async () => {
    const fetchSpy = vi
      .spyOn(SkillInstaller, "fetchRemoteContent")
      .mockImplementation(async (url) => {
        if (url === "https://gitea.company.test/api/v1/repos/team/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://gitea.company.test/api/v1/repos/team/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [
              {
                path: "tools/writer/SKILL.md",
                type: "blob",
                sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
              {
                path: "tools/writer/docs/guide.md",
                type: "blob",
                sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ],
          });
        }
        if (
          url ===
          "https://gitea.company.test/api/v1/repos/team/skills/raw/tools/writer/SKILL.md?ref=main"
        ) {
          return "---\nname: writer\ndescription: Private Gitea writer\n---\n\n# Writer\n";
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const skills = await SkillInstaller.scanRemoteGithub(
      "https://gitea.company.test/team/skills",
      [],
    );

    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual(
      expect.objectContaining({
        slug: "writer",
        name: "writer",
        source_branch: "main",
        source_directory: "tools/writer",
        canonical_skill_path: "tools/writer/SKILL.md",
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gitea.company.test/api/v1/repos/team/skills",
      { allowPrivateNetwork: true },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gitea.company.test/api/v1/repos/team/skills/git/trees/main?recursive=1",
      { allowPrivateNetwork: true },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gitea.company.test/api/v1/repos/team/skills/raw/tools/writer/SKILL.md?ref=main",
      { allowPrivateNetwork: true },
    );
  });

  it("allows direct RFC1918 IP addresses for user-selected Gitea repository scans", async () => {
    const fetchSpy = vi
      .spyOn(SkillInstaller, "fetchRemoteContent")
      .mockImplementation(async (url) => {
        if (url === "https://192.168.31.12:3000/api/v1/repos/team/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://192.168.31.12:3000/api/v1/repos/team/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [{ path: "SKILL.md", type: "blob" }],
          });
        }
        if (
          url ===
          "https://192.168.31.12:3000/api/v1/repos/team/skills/raw/SKILL.md?ref=main"
        ) {
          return "---\nname: lan-gitea-skill\n---\n\n# LAN Gitea Skill\n";
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const skills = await SkillInstaller.scanRemoteGithub(
      "https://192.168.31.12:3000/team/skills",
      [],
    );

    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual(
      expect.objectContaining({
        slug: "lan-gitea-skill",
        source_url: "https://192.168.31.12:3000/team/skills/tree/main",
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://192.168.31.12:3000/api/v1/repos/team/skills",
      { allowPrivateNetwork: true },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://192.168.31.12:3000/api/v1/repos/team/skills/git/trees/main?recursive=1",
      { allowPrivateNetwork: true },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://192.168.31.12:3000/api/v1/repos/team/skills/raw/SKILL.md?ref=main",
      { allowPrivateNetwork: true },
    );
  });

  it("preserves HTTP for direct RFC1918 Gitea repository scans", async () => {
    const fetchSpy = vi
      .spyOn(SkillInstaller, "fetchRemoteContent")
      .mockImplementation(async (url) => {
        if (url === "http://192.168.31.12:3000/api/v1/repos/team/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "http://192.168.31.12:3000/api/v1/repos/team/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [{ path: "SKILL.md", type: "blob" }],
          });
        }
        if (
          url ===
          "http://192.168.31.12:3000/api/v1/repos/team/skills/raw/SKILL.md?ref=main"
        ) {
          return "---\nname: lan-http-gitea-skill\n---\n\n# LAN HTTP Gitea Skill\n";
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const skills = await SkillInstaller.scanRemoteGithub(
      "http://192.168.31.12:3000/team/skills",
      [],
    );

    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual(
      expect.objectContaining({
        slug: "lan-http-gitea-skill",
        source_url: "http://192.168.31.12:3000/team/skills/tree/main",
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.31.12:3000/api/v1/repos/team/skills",
      {
        allowInsecurePrivateNetworkHttp: true,
        allowPrivateNetwork: true,
      },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.31.12:3000/api/v1/repos/team/skills/git/trees/main?recursive=1",
      {
        allowInsecurePrivateNetworkHttp: true,
        allowPrivateNetwork: true,
      },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://192.168.31.12:3000/api/v1/repos/team/skills/raw/SKILL.md?ref=main",
      {
        allowInsecurePrivateNetworkHttp: true,
        allowPrivateNetwork: true,
      },
    );
  });

  it("keeps GitHub repository scans on the default public-network policy", async () => {
    const fetchSpy = vi
      .spyOn(SkillInstaller, "fetchRemoteContent")
      .mockImplementation(async (url) => {
        if (url === "https://api.github.com/repos/team/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://api.github.com/repos/team/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [{ path: "SKILL.md", type: "blob" }],
          });
        }
        if (
          url === "https://raw.githubusercontent.com/team/skills/main/SKILL.md"
        ) {
          return "---\nname: github-skill\n---\n\n# GitHub Skill\n";
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const skills = await SkillInstaller.scanRemoteGithub(
      "https://github.com/team/skills",
      [],
    );

    expect(skills).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/team/skills",
      { allowPrivateNetwork: false },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/team/skills/git/trees/main?recursive=1",
      { allowPrivateNetwork: false },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/team/skills/main/SKILL.md",
      { allowPrivateNetwork: false },
    );
  });
});

describe("SkillInstaller.scanPlatformSkills", () => {
  it("scans real platform skill folders and distinguishes copy from symlink installs", async () => {
    const platformSkillsDir = path.join(tmpDir, "claude", "skills");
    const copiedSkillDir = path.join(platformSkillsDir, "copy-skill");
    const sourceSkillDir = path.join(tmpDir, "managed", "linked-skill");
    const linkedSkillDir = path.join(platformSkillsDir, "linked-skill");

    await fs.mkdir(copiedSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(copiedSkillDir, "SKILL.md"),
      [
        "---",
        "name: copy-skill",
        "description: Copied agent skill",
        "tags: [agent, copy]",
        "---",
        "# Copy Skill",
      ].join("\n"),
      "utf-8",
    );
    await fs.writeFile(path.join(copiedSkillDir, "asset.txt"), "full package");

    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: linked-skill",
        "description: Linked agent skill",
        "tags: [agent, symlink]",
        "---",
        "# Linked Skill",
      ].join("\n"),
      "utf-8",
    );
    await fs.symlink(sourceSkillDir, linkedSkillDir, "dir");

    vi.spyOn(skillInstallerUtils, "getPlatformSkillsDir").mockReturnValue(
      platformSkillsDir,
    );

    const result = await SkillInstaller.scanPlatformSkills("claude");
    const byName = new Map(
      result.scannedSkills.map((skill) => [skill.name, skill]),
    );

    expect(result.skillsDir).toBe(platformSkillsDir);
    expect(byName.get("copy-skill")).toEqual(
      expect.objectContaining({
        installMode: "copy",
        platformSkillPath: copiedSkillDir,
        localPath: copiedSkillDir,
        platforms: ["Claude Code"],
      }),
    );
    expect(byName.get("linked-skill")).toEqual(
      expect.objectContaining({
        installMode: "symlink",
        platformSkillPath: linkedSkillDir,
        localPath: linkedSkillDir,
        platforms: ["Claude Code"],
        symlinkTargetPath: sourceSkillDir,
      }),
    );
    expect(
      await fs.readFile(path.join(copiedSkillDir, "asset.txt"), "utf-8"),
    ).toBe("full package");
  });

  it("uninstalls only the selected platform folder and rejects paths outside the platform skills dir", async () => {
    const platformSkillsDir = path.join(tmpDir, "claude", "skills");
    const sourceSkillDir = path.join(tmpDir, "managed", "linked-skill");
    const linkedSkillDir = path.join(platformSkillsDir, "linked-skill");
    const outsideSkillDir = path.join(tmpDir, "outside-skill");

    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.mkdir(outsideSkillDir, { recursive: true });
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "# Linked");
    await fs.writeFile(path.join(outsideSkillDir, "SKILL.md"), "# Outside");
    await fs.mkdir(platformSkillsDir, { recursive: true });
    await fs.symlink(sourceSkillDir, linkedSkillDir, "dir");

    vi.spyOn(skillInstallerUtils, "getPlatformSkillsDir").mockReturnValue(
      platformSkillsDir,
    );

    await SkillInstaller.uninstallPlatformSkill("claude", linkedSkillDir);

    expect(fsSync.existsSync(linkedSkillDir)).toBe(false);
    expect(fsSync.existsSync(path.join(sourceSkillDir, "SKILL.md"))).toBe(true);

    await expect(
      SkillInstaller.uninstallPlatformSkill("claude", outsideSkillDir),
    ).rejects.toThrow(/outside platform/);
    expect(fsSync.existsSync(path.join(outsideSkillDir, "SKILL.md"))).toBe(
      true,
    );
  });

  it("uninstalls Cherry Studio scanned skills through the database-backed adapter", async () => {
    const cherryRoot = path.join(tmpDir, "CherryStudio");
    const cherrySkillsDir = path.join(cherryRoot, "Data", "Skills");
    const skillDir = path.join(cherrySkillsDir, "writer");
    const dbPath = path.join(cherryRoot, "Data", "agents.db");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: writer\n---",
    );
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const database = new Database(dbPath);
    database.exec(`
      CREATE TABLE skills (
        id text PRIMARY KEY NOT NULL,
        folder_name text NOT NULL
      );
      CREATE TABLE agents (
        id text PRIMARY KEY NOT NULL,
        accessible_paths text
      );
      CREATE TABLE agent_skills (
        agent_id text NOT NULL,
        skill_id text NOT NULL,
        is_enabled integer DEFAULT false NOT NULL
      );
    `);
    database.run(
      "INSERT INTO skills (id, folder_name) VALUES (?, ?)",
      "skill-1",
      "writer",
    );
    database.run(
      "INSERT INTO agent_skills (agent_id, skill_id, is_enabled) VALUES (?, ?, 0)",
      "agent-1",
      "skill-1",
    );
    database.close();

    vi.spyOn(skillInstallerUtils, "getPlatformRootDir").mockReturnValue(
      cherryRoot,
    );
    vi.spyOn(skillInstallerUtils, "getPlatformSkillsDir").mockReturnValue(
      cherrySkillsDir,
    );

    await SkillInstaller.uninstallPlatformSkill("cherry-studio", skillDir);

    const verifyDb = new Database(dbPath);
    try {
      expect(
        verifyDb.get("SELECT id FROM skills WHERE id = ?", "skill-1"),
      ).toBeFalsy();
      expect(
        verifyDb.get(
          "SELECT skill_id FROM agent_skills WHERE skill_id = ?",
          "skill-1",
        ),
      ).toBeFalsy();
    } finally {
      verifyDb.close();
    }
    expect(fsSync.existsSync(skillDir)).toBe(false);
  });

  it("marks Cherry Studio built-in scanned skills as platform built-ins", async () => {
    const cherryRoot = path.join(tmpDir, "CherryStudio");
    const cherrySkillsDir = path.join(cherryRoot, "Data", "Skills");
    const skillDir = path.join(cherrySkillsDir, "find-skills");
    const dbPath = path.join(cherryRoot, "Data", "agents.db");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: find-skills\ndescription: Built-in discovery\n---\n# Find",
    );
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const database = new Database(dbPath);
    database.exec(`
      CREATE TABLE skills (
        id text PRIMARY KEY NOT NULL,
        folder_name text NOT NULL,
        source text NOT NULL
      );
      CREATE TABLE agents (
        id text PRIMARY KEY NOT NULL,
        accessible_paths text
      );
      CREATE TABLE agent_skills (
        agent_id text NOT NULL,
        skill_id text NOT NULL,
        is_enabled integer DEFAULT false NOT NULL
      );
    `);
    database.run(
      "INSERT INTO skills (id, folder_name, source) VALUES (?, ?, ?)",
      "skill-1",
      "find-skills",
      "builtin",
    );
    database.close();

    vi.spyOn(skillInstallerUtils, "getPlatformRootDir").mockReturnValue(
      cherryRoot,
    );
    vi.spyOn(skillInstallerUtils, "getPlatformSkillsDir").mockReturnValue(
      cherrySkillsDir,
    );

    const result = await SkillInstaller.scanPlatformSkills("cherry-studio");

    expect(result.scannedSkills).toHaveLength(1);
    expect(result.scannedSkills[0]).toEqual(
      expect.objectContaining({
        name: "find-skills",
        isPlatformBuiltin: true,
        platformSkillPath: skillDir,
      }),
    );
  });
});

// ---------- exportAsJson ----------

describe("SkillInstaller.exportAsJson", () => {
  it("produces valid JSON with all default fields", () => {
    const json = SkillInstaller.exportAsJson({ name: "my-skill" });
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.name).toBe("my-skill");
    expect(parsed.description).toBe("");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.author).toBe("");
    expect(parsed.tags).toEqual([]);
    expect(parsed.instructions).toBe("");
    expect(parsed.protocol_type).toBe("skill");
    expect(parsed.format_version).toBe("1.0");
    expect(typeof parsed.exported_at).toBe("string");
  });

  it("includes all provided fields", () => {
    const json = SkillInstaller.exportAsJson({
      name: "advanced",
      description: "Advanced skill",
      version: "3.0.0",
      author: "Bob",
      tags: ["ai", "ml"],
      instructions: "Use this skill.",
      protocol_type: "mcp",
      icon_url: "https://example.com/icon.png",
      icon_emoji: "🚀",
      icon_background: "#ff0000",
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.name).toBe("advanced");
    expect(parsed.description).toBe("Advanced skill");
    expect(parsed.version).toBe("3.0.0");
    expect(parsed.author).toBe("Bob");
    expect(parsed.tags).toEqual(["ai", "ml"]);
    expect(parsed.instructions).toBe("Use this skill.");
    expect(parsed.protocol_type).toBe("mcp");
    expect(parsed.icon_url).toBe("https://example.com/icon.png");
    expect(parsed.icon_emoji).toBe("🚀");
    expect(parsed.icon_background).toBe("#ff0000");
  });

  it("produces well-formatted JSON (indented)", () => {
    const json = SkillInstaller.exportAsJson({ name: "test" });
    // Should have indentation (pretty-printed)
    expect(json).toContain("\n  ");
  });

  it("round-trips through JSON.parse without data loss", () => {
    const original = {
      name: "roundtrip",
      description: "Some 描述 with CJK",
      tags: ["日本語", "emoji🎉"],
    };
    const json = SkillInstaller.exportAsJson(original);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.name).toBe("roundtrip");
    expect(parsed.description).toBe("Some 描述 with CJK");
    expect(parsed.tags).toEqual(["日本語", "emoji🎉"]);
  });
});

// ---------- getSupportedPlatforms ----------

describe("SkillInstaller.getSupportedPlatforms", () => {
  it("returns the full SKILL_PLATFORMS list", () => {
    const platforms = SkillInstaller.getSupportedPlatforms();
    expect(platforms).toStrictEqual(SKILL_PLATFORMS);
    expect(platforms.length).toBeGreaterThan(0);
  });

  it("every platform has required fields", () => {
    for (const p of SkillInstaller.getSupportedPlatforms()) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(typeof p.icon).toBe("string");
      expect(typeof p.rootDir.darwin).toBe("string");
      expect(typeof p.rootDir.win32).toBe("string");
      expect(typeof p.rootDir.linux).toBe("string");
      expect(typeof p.skillsRelativePath).toBe("string");
    }
  });
});

describe("SkillInstaller.scanRemoteGithub", () => {
  it("accepts HTTPS Gitea URLs without cloning the repository", async () => {
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
              { path: "gitea-skill/SKILL.md", type: "blob", sha: "skill-sha" },
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
            "author: icelemon",
            "tags: [gitea]",
            "---",
            "# Gitea skill",
          ].join("\n");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const result = await SkillInstaller.scanRemoteGithub(
      "https://gitea.example.com/icelemon/skills",
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("gitea-skill");
    expect(result[0].author).toBe("icelemon");
    expect(result[0].content_url).toBe(
      "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/gitea-skill/SKILL.md?ref=main",
    );
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("accepts SSH Gitea URLs without cloning the repository", async () => {
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
              { path: "ssh-skill/SKILL.md", type: "blob", sha: "ssh-sha" },
            ],
          });
        }
        if (
          url ===
          "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/ssh-skill/SKILL.md?ref=main"
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
    expect(result[0].content_url).toBe(
      "https://gitea.example.com/api/v1/repos/icelemon/skills/raw/ssh-skill/SKILL.md?ref=main",
    );
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("accepts SSH GitHub store URLs without cloning the repository", async () => {
    await SkillInstaller.init();

    const cloneSpy = vi.spyOn(skillInstallerUtils, "gitClone");
    vi.spyOn(SkillInstaller, "fetchRemoteContent").mockImplementation(
      async (url: string) => {
        if (url === "https://api.github.com/repos/icelemon/skills") {
          return JSON.stringify({ default_branch: "main" });
        }
        if (
          url ===
          "https://api.github.com/repos/icelemon/skills/git/trees/main?recursive=1"
        ) {
          return JSON.stringify({
            tree: [
              {
                path: "github-skill/SKILL.md",
                type: "blob",
                sha: "github-sha",
              },
            ],
          });
        }
        if (
          url ===
          "https://raw.githubusercontent.com/icelemon/skills/main/github-skill/SKILL.md"
        ) {
          return [
            "---",
            "name: github-skill",
            "description: GitHub SSH skill",
            "author: icelemon",
            "tags: [github]",
            "---",
            "# GitHub skill",
          ].join("\n");
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const result = await SkillInstaller.scanRemoteGithub(
      "git@github.com:icelemon/skills.git",
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].source_url).toBe(
      "https://github.com/icelemon/skills/tree/main/github-skill",
    );
    expect(result[0].content_url).toBe(
      "https://raw.githubusercontent.com/icelemon/skills/main/github-skill/SKILL.md",
    );
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid git repository URLs", async () => {
    await SkillInstaller.init();

    await expect(
      SkillInstaller.scanRemoteGithub("not-a-url", []),
    ).rejects.toThrow("Invalid git repository URL");
  });
});

describe("SkillInstaller.copyRepoByPathToDirectory", () => {
  it("copies a whole skill directory into a project target directory", async () => {
    const sourceDir = path.join(tmpDir, "source-skill");
    const targetRootDir = path.join(tmpDir, "project", ".agents", "skills");
    await fs.mkdir(path.join(sourceDir, "docs"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# demo", "utf-8");
    await fs.writeFile(
      path.join(sourceDir, "docs", "guide.md"),
      "guide",
      "utf-8",
    );

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
    );

    expect(targetDir).toBe(path.join(targetRootDir, "demo-skill"));
    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# demo");
    await expect(
      fs.readFile(path.join(targetDir, "docs", "guide.md"), "utf-8"),
    ).resolves.toBe("guide");
  });

  it("copy mode dereferences a symlinked source directory", async () => {
    const realSourceDir = path.join(tmpDir, "real-source-skill");
    const linkedSourceDir = path.join(tmpDir, "linked-source-skill");
    const targetRootDir = path.join(
      tmpDir,
      "project-linked-copy",
      ".agents",
      "skills",
    );
    await fs.mkdir(path.join(realSourceDir, "assets"), { recursive: true });
    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# real source",
      "utf-8",
    );
    await fs.writeFile(
      path.join(realSourceDir, "assets", "note.txt"),
      "asset",
      "utf-8",
    );
    await fs.symlink(realSourceDir, linkedSourceDir, "dir");

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      linkedSourceDir,
      "demo-skill",
      targetRootDir,
      { mode: "copy" },
    );

    expect((await fs.lstat(targetDir)).isSymbolicLink()).toBe(false);
    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# real source");
    await expect(
      fs.readFile(path.join(targetDir, "assets", "note.txt"), "utf-8"),
    ).resolves.toBe("asset");

    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# changed source",
      "utf-8",
    );
    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# real source");
  });

  it("skips an existing project target when requested", async () => {
    const sourceDir = path.join(tmpDir, "source-skill-skip");
    const targetRootDir = path.join(
      tmpDir,
      "project-skip",
      ".agents",
      "skills",
    );
    const targetDir = path.join(targetRootDir, "demo-skill");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# new", "utf-8");
    await fs.writeFile(path.join(targetDir, "SKILL.md"), "# existing", "utf-8");

    const result = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
      { ifExists: "skip" },
    );

    expect(result).toBe(targetDir);
    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# existing");
  });

  it("supports symlink mode when importing a skill into a project target", async () => {
    const sourceDir = path.join(tmpDir, "source-skill-symlink");
    const targetRootDir = path.join(
      tmpDir,
      "project-symlink",
      ".agents",
      "skills",
    );
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      "# symlinked",
      "utf-8",
    );

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
      { mode: "symlink" },
    );

    expect(targetDir).toBe(path.join(targetRootDir, "demo-skill"));
    await expect(fs.lstat(targetDir)).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function),
    });
    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# symlinked");
  });

  it("reads source updates when scanning a symlink project skill", async () => {
    await SkillInstaller.init();

    const sourceDir = path.join(tmpDir, "source-skill-symlink-live");
    const targetRootDir = path.join(
      tmpDir,
      "project-symlink-live",
      ".agents",
      "skills",
    );
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      [
        "---",
        "name: demo-skill",
        "description: Before edit",
        "---",
        "",
        "# Before",
      ].join("\n"),
      "utf-8",
    );

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
      { mode: "symlink" },
    );

    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      [
        "---",
        "name: demo-skill",
        "description: After external edit",
        "---",
        "",
        "# After",
      ].join("\n"),
      "utf-8",
    );

    const results = await SkillInstaller.scanLocalPreview([targetRootDir]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        description: "After external edit",
        filePath: path.join(targetDir, "SKILL.md"),
        instructions: expect.stringContaining("# After"),
        localPath: targetDir,
      }),
    );
  });

  it("removes only the project symlink when uninstalling a symlink project skill", async () => {
    const sourceDir = path.join(tmpDir, "source-skill-symlink-remove");
    const targetRootDir = path.join(
      tmpDir,
      "project-symlink-remove",
      ".agents",
      "skills",
    );
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      "# keep source",
      "utf-8",
    );

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
      { mode: "symlink" },
    );
    expect((await fs.lstat(targetDir)).isSymbolicLink()).toBe(true);

    await SkillInstaller.deleteLocalRepoFileByPath(targetDir, ".");

    await expect(fs.lstat(targetDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.readFile(path.join(sourceDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# keep source");
  });

  it("rejects project targets nested inside the source skill directory", async () => {
    const sourceDir = path.join(tmpDir, "source-skill");
    const nestedTargetRootDir = path.join(sourceDir, ".agents", "skills");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# demo", "utf-8");

    await expect(
      SkillInstaller.copyRepoByPathToDirectory(
        sourceDir,
        "demo-skill",
        nestedTargetRootDir,
      ),
    ).rejects.toThrow(
      /Target directory must not be inside the source skill directory/,
    );
  });

  it("rejects copying a skill back onto the same target skill directory", async () => {
    const sourceDir = path.join(
      tmpDir,
      "project",
      ".agents",
      "skills",
      "demo-skill",
    );
    const targetRootDir = path.join(tmpDir, "project", ".agents", "skills");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# demo", "utf-8");

    await expect(
      SkillInstaller.copyRepoByPathToDirectory(
        sourceDir,
        "demo-skill",
        targetRootDir,
      ),
    ).rejects.toThrow(
      /Target skill directory must not equal the source skill directory/,
    );
  });
});

// ---------- getLocalRepoPath ----------

describe("SkillInstaller.getLocalRepoPath", () => {
  it("returns a path under the skills directory", () => {
    const repoPath = SkillInstaller.getLocalRepoPath("my-skill");
    expect(repoPath).toContain("skills");
    expect(repoPath).toContain("my-skill");
    expect(repoPath.endsWith("my-skill")).toBe(true);
  });

  it("rejects empty skill name", () => {
    expect(() => SkillInstaller.getLocalRepoPath("")).toThrow(
      /must not be empty/,
    );
  });

  it("rejects skill name with path traversal (..) ", () => {
    expect(() => SkillInstaller.getLocalRepoPath("../etc")).toThrow(
      /must not contain/,
    );
  });

  it("rejects skill name with forward slash", () => {
    expect(() => SkillInstaller.getLocalRepoPath("a/b")).toThrow(
      /must not contain/,
    );
  });

  it("rejects skill name with backslash", () => {
    expect(() => SkillInstaller.getLocalRepoPath("a\\b")).toThrow(
      /must not contain/,
    );
  });

  it("rejects Windows absolute path", () => {
    expect(() => SkillInstaller.getLocalRepoPath("C:\\Users")).toThrow(
      /must not contain.*\\|must not be an absolute path/,
    );
  });

  it("rejects whitespace-only name", () => {
    expect(() => SkillInstaller.getLocalRepoPath("   ")).toThrow(
      /must not be empty/,
    );
  });
});

// ---------- init ----------

describe("SkillInstaller.init", () => {
  it("creates the skills directory if it does not exist", async () => {
    const skillsDir = managedSkillsDir();
    // Should not exist yet
    await expect(fs.access(skillsDir)).rejects.toThrow();

    await SkillInstaller.init();

    const stat = await fs.stat(skillsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("succeeds if skills directory already exists", async () => {
    await SkillInstaller.init();
    // Call again — should not throw
    await expect(SkillInstaller.init()).resolves.toBeUndefined();
  });
});

describe("SkillInstaller.saveToLocalRepo", () => {
  it("copy mode dereferences a symlinked source directory", async () => {
    const realSourceDir = path.join(tmpDir, "real-library-source");
    const linkedSourceDir = path.join(tmpDir, "linked-library-source");
    await fs.mkdir(path.join(realSourceDir, "assets"), { recursive: true });
    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# library source",
      "utf-8",
    );
    await fs.writeFile(
      path.join(realSourceDir, "assets", "example.txt"),
      "example",
      "utf-8",
    );
    await fs.symlink(realSourceDir, linkedSourceDir, "dir");

    const repoDir = await SkillInstaller.saveToLocalRepo(
      "library-copy",
      linkedSourceDir,
      "copy",
    );

    expect((await fs.lstat(repoDir)).isSymbolicLink()).toBe(false);
    await expect(
      fs.readFile(path.join(repoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# library source");
    await expect(
      fs.readFile(path.join(repoDir, "assets", "example.txt"), "utf-8"),
    ).resolves.toBe("example");

    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# changed library source",
      "utf-8",
    );
    await expect(
      fs.readFile(path.join(repoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# library source");
  });

  it("materializes requested symlink mode inside data Skills", async () => {
    const realSourceDir = path.join(tmpDir, "real-library-symlink-request");
    await fs.mkdir(realSourceDir, { recursive: true });
    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# symlink request source",
      "utf-8",
    );

    const repoDir = await SkillInstaller.saveToLocalRepo(
      "library-symlink-request",
      realSourceDir,
      "symlink",
    );

    expect((await fs.lstat(repoDir)).isSymbolicLink()).toBe(false);
    await expect(
      fs.readFile(path.join(repoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# symlink request source");

    await fs.writeFile(
      path.join(realSourceDir, "SKILL.md"),
      "# changed after import",
      "utf-8",
    );
    await expect(
      fs.readFile(path.join(repoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# symlink request source");
  });

  it("materializes legacy managed repo symlinks in place", async () => {
    const externalSourceDir = path.join(tmpDir, "external-legacy-source");
    const managedRepoDir = path.join(
      managedSkillsDir(),
      "legacy-linked",
      "repo",
    );
    await fs.mkdir(externalSourceDir, { recursive: true });
    await fs.mkdir(path.dirname(managedRepoDir), { recursive: true });
    await fs.writeFile(
      path.join(externalSourceDir, "SKILL.md"),
      "# legacy linked source",
      "utf-8",
    );
    await fs.symlink(externalSourceDir, managedRepoDir, "dir");

    await expect(
      SkillInstaller.materializeManagedRepoSymlink(managedRepoDir),
    ).resolves.toBe(true);

    expect((await fs.lstat(managedRepoDir)).isSymbolicLink()).toBe(false);
    await expect(
      fs.readFile(path.join(managedRepoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# legacy linked source");

    await fs.writeFile(
      path.join(externalSourceDir, "SKILL.md"),
      "# changed legacy source",
      "utf-8",
    );
    await expect(
      fs.readFile(path.join(managedRepoDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# legacy linked source");
  });
});

// ---------- saveContentToLocalRepo ----------

describe("SkillInstaller.saveContentToLocalRepo", () => {
  it("creates a SKILL.md file inside the skill directory", async () => {
    const content = "---\nname: test\n---\n# Test Skill";
    const destDir = await SkillInstaller.saveContentToLocalRepo(
      "test-skill",
      content,
    );

    const skillMdPath = path.join(destDir, "SKILL.md");
    const fileContent = await fs.readFile(skillMdPath, "utf-8");
    expect(fileContent).toBe(content);
  });

  it("overwrites existing SKILL.md on re-save", async () => {
    await SkillInstaller.saveContentToLocalRepo("test-skill", "v1");
    const destDir = await SkillInstaller.saveContentToLocalRepo(
      "test-skill",
      "v2",
    );

    const fileContent = await fs.readFile(
      path.join(destDir, "SKILL.md"),
      "utf-8",
    );
    expect(fileContent).toBe("v2");
  });

  it("rejects path traversal in skill name", async () => {
    await expect(
      SkillInstaller.saveContentToLocalRepo("../evil", "payload"),
    ).rejects.toThrow(/must not contain/);
  });

  it("saves CJK and emoji content correctly", async () => {
    const content = "---\nname: unicode\n---\n# 你好世界 🌍🏳️‍🌈";
    const destDir = await SkillInstaller.saveContentToLocalRepo(
      "unicode-test",
      content,
    );
    const fileContent = await fs.readFile(
      path.join(destDir, "SKILL.md"),
      "utf-8",
    );
    expect(fileContent).toBe(content);
  });
});

// ---------- writeLocalRepoFile ----------

describe("SkillInstaller.writeLocalRepoFile", () => {
  it("writes a file at a relative path inside the skill repo", async () => {
    await SkillInstaller.writeLocalRepoFile(
      "my-skill",
      "README.md",
      "# My Skill",
    );

    const filePath = path.join(managedSkillsDir(), "my-skill", "README.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("# My Skill");
  });

  it("creates nested directories automatically", async () => {
    await SkillInstaller.writeLocalRepoFile(
      "my-skill",
      "docs/guide/intro.md",
      "# Intro",
    );

    const filePath = path.join(
      managedSkillsDir(),
      "my-skill",
      "docs",
      "guide",
      "intro.md",
    );
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("# Intro");
  });

  it("rejects path traversal in skill name", async () => {
    await expect(
      SkillInstaller.writeLocalRepoFile("../evil", "file.md", "data"),
    ).rejects.toThrow(/must not contain/);
  });

  it("rejects path traversal in relative path (..)", async () => {
    await expect(
      SkillInstaller.writeLocalRepoFile(
        "my-skill",
        "../../../etc/passwd",
        "data",
      ),
    ).rejects.toThrow(/must not contain/);
  });

  it("rejects absolute relative path", async () => {
    await expect(
      SkillInstaller.writeLocalRepoFile("my-skill", "/etc/passwd", "data"),
    ).rejects.toThrow(/must not start with/);
  });

  it("rejects Windows absolute relative path", async () => {
    await expect(
      SkillInstaller.writeLocalRepoFile(
        "my-skill",
        "C:\\Users\\evil.txt",
        "data",
      ),
    ).rejects.toThrow(/must not be an absolute path/);
  });
});

// ---------- readLocalRepoFiles ----------

describe("SkillInstaller.readLocalRepoFiles", () => {
  it("returns empty array for non-existent skill", async () => {
    const files = await SkillInstaller.readLocalRepoFiles("nonexistent");
    expect(files).toEqual([]);
  });

  it("reads all files recursively from a skill repo", async () => {
    // Setup: create a skill with multiple files
    await SkillInstaller.saveContentToLocalRepo(
      "multi-file",
      "---\nname: multi-file\n---\n# Main",
    );
    await SkillInstaller.writeLocalRepoFile(
      "multi-file",
      "README.md",
      "# README",
    );
    await SkillInstaller.writeLocalRepoFile(
      "multi-file",
      "lib/utils.ts",
      "export const x = 1;",
    );

    const files = await SkillInstaller.readLocalRepoFiles("multi-file");

    // Should have SKILL.md, README.md, lib/ dir, and lib/utils.ts
    const filePaths = files.map((f) => f.path);
    expect(filePaths).toContain("SKILL.md");
    expect(filePaths).toContain("README.md");

    // Check SKILL.md content
    const skillMd = files.find((f) => f.path === "SKILL.md");
    expect(skillMd?.content).toContain("# Main");
    expect(skillMd?.isDirectory).toBe(false);

    // Check nested file
    const utilsFile = files.find((f) => f.path === "lib/utils.ts");
    expect(utilsFile?.content).toBe("export const x = 1;");
  });

  it("rejects path traversal in skill name", async () => {
    await expect(SkillInstaller.readLocalRepoFiles("../evil")).rejects.toThrow(
      /must not contain/,
    );
  });
});

describe("SkillInstaller.readLocalRepoFileBuffersByPath", () => {
  it("returns original bytes for nested binary files", async () => {
    const repoPath = await SkillInstaller.saveContentToLocalRepo(
      "archive-skill",
      "---\nname: archive-skill\n---\n# Archive",
    );
    const binaryPath = path.join(repoPath, "assets", "icon.bin");
    const binaryBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff,
    ]);

    await fs.mkdir(path.dirname(binaryPath), { recursive: true });
    await fs.writeFile(binaryPath, binaryBytes);

    const files = await SkillInstaller.readLocalRepoFileBuffersByPath(repoPath);

    const skillMd = files.find((file) => file.path === "SKILL.md");
    const binaryFile = files.find((file) => file.path === "assets/icon.bin");

    expect(skillMd).toBeDefined();
    expect(new TextDecoder().decode(skillMd!.data)).toContain("# Archive");
    expect(binaryFile).toBeDefined();
    expect(Array.from(binaryFile!.data)).toEqual(Array.from(binaryBytes));
  });
});

describe("SkillInstaller external repo by-path access", () => {
  const previewCases: Array<{
    relativePath: string;
    mimeType: string;
    previewKind: "image" | "audio" | "video" | "pdf";
  }> = [
    {
      relativePath: "assets/logo.svg",
      mimeType: "image/svg+xml",
      previewKind: "image",
    },
    {
      relativePath: "assets/logo.png",
      mimeType: "image/png",
      previewKind: "image",
    },
    {
      relativePath: "assets/photo.jpg",
      mimeType: "image/jpeg",
      previewKind: "image",
    },
    {
      relativePath: "assets/cover.webp",
      mimeType: "image/webp",
      previewKind: "image",
    },
    {
      relativePath: "media/intro.mp3",
      mimeType: "audio/mpeg",
      previewKind: "audio",
    },
    {
      relativePath: "media/intro.wav",
      mimeType: "audio/wav",
      previewKind: "audio",
    },
    {
      relativePath: "media/demo.mp4",
      mimeType: "video/mp4",
      previewKind: "video",
    },
    {
      relativePath: "media/demo.webm",
      mimeType: "video/webm",
      previewKind: "video",
    },
    {
      relativePath: "docs/manual.pdf",
      mimeType: "application/pdf",
      previewKind: "pdf",
    },
  ];

  it("lists and edits files under an external project skill root", async () => {
    const repoPath = path.join(tmpDir, "project", ".claude", "skills", "novel");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "SKILL.md"),
      "---\nname: novel\n---\n# Novel\n",
    );

    const files = await SkillInstaller.listLocalRepoFilesByPath(repoPath);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md", isDirectory: false }),
      ]),
    );

    const skillMd = await SkillInstaller.readLocalRepoFileByPath(
      repoPath,
      "SKILL.md",
    );
    expect(skillMd?.content).toContain("# Novel");

    await SkillInstaller.writeLocalRepoFileByPath(
      repoPath,
      "notes.txt",
      "hello project skill",
    );
    await SkillInstaller.createLocalRepoDirByPath(repoPath, "docs");
    await SkillInstaller.renameLocalRepoPathByPath(
      repoPath,
      "notes.txt",
      "docs/notes.txt",
    );

    const renamedFile = await SkillInstaller.readLocalRepoFileByPath(
      repoPath,
      "docs/notes.txt",
    );
    expect(renamedFile?.content).toBe("hello project skill");

    await SkillInstaller.deleteLocalRepoFileByPath(repoPath, "docs/notes.txt");
    await expect(
      fs.access(path.join(repoPath, "docs", "notes.txt")),
    ).rejects.toThrow();
  });

  it("accepts a SKILL.md file path as the by-path repo base", async () => {
    const repoPath = path.join(
      tmpDir,
      "project",
      ".claude",
      "skills",
      "novel-file-base",
    );
    const skillMdPath = path.join(repoPath, "SKILL.md");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(
      skillMdPath,
      "---\nname: novel-file-base\n---\n# Novel File Base\n",
    );

    const files = await SkillInstaller.listLocalRepoFilesByPath(skillMdPath);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md", isDirectory: false }),
      ]),
    );

    const skillMd = await SkillInstaller.readLocalRepoFileByPath(
      skillMdPath,
      "SKILL.md",
    );
    expect(skillMd?.content).toContain("# Novel File Base");

    await SkillInstaller.writeLocalRepoFileByPath(
      skillMdPath,
      "notes.txt",
      "hello file-base skill",
    );
    const note = await SkillInstaller.readLocalRepoFileByPath(
      skillMdPath,
      "notes.txt",
    );
    expect(note?.content).toBe("hello file-base skill");
  });

  it("returns preview data URLs for supported resource files without changing bulk reads", async () => {
    const repoPath = path.join(
      tmpDir,
      "project",
      ".claude",
      "skills",
      "asset-skill",
    );
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "# Asset Skill\n");
    for (const testCase of previewCases) {
      const fullPath = path.join(repoPath, testCase.relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from([1, 2, 3, 4]));
    }

    const all = await SkillInstaller.readLocalRepoFilesByPath(repoPath);
    for (const testCase of previewCases) {
      const single = await SkillInstaller.readLocalRepoFileByPath(
        repoPath,
        testCase.relativePath,
      );
      const bulkFile = all.find((file) => file.path === testCase.relativePath);

      expect(single?.encoding).toBe("data-url");
      expect(single?.mimeType).toBe(testCase.mimeType);
      expect(single?.previewKind).toBe(testCase.previewKind);
      expect(single?.content).toMatch(
        new RegExp(`^data:${testCase.mimeType.replace("+", "\\+")};base64,`),
      );
      expect(bulkFile?.content).toBe("[binary file]");
      expect(bulkFile?.encoding).toBe("placeholder");
    }
  });

  it("keeps unsupported and oversized binary files as non-editable placeholders", async () => {
    const repoPath = path.join(tmpDir, "project", "skills", "binary-skill");
    await fs.mkdir(path.join(repoPath, "assets"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "# Binary Skill\n");
    await fs.writeFile(path.join(repoPath, "assets", "archive.zip"), "zip");
    await fs.writeFile(
      path.join(repoPath, "assets", "huge.png"),
      Buffer.alloc(5 * 1_048_576 + 1),
    );

    const unsupported = await SkillInstaller.readLocalRepoFileByPath(
      repoPath,
      "assets/archive.zip",
    );
    const oversized = await SkillInstaller.readLocalRepoFileByPath(
      repoPath,
      "assets/huge.png",
    );

    expect(unsupported).toMatchObject({
      content: "[binary file]",
      encoding: "placeholder",
    });
    expect(unsupported?.mimeType).toBeUndefined();
    expect(unsupported?.previewKind).toBeUndefined();
    expect(oversized).toMatchObject({
      content: "[file too large]",
      encoding: "placeholder",
      mimeType: "image/png",
      previewKind: "image",
    });
  });

  it("still rejects traversal outside an external project skill root", async () => {
    const repoPath = path.join(tmpDir, "project", "skills", "safe-skill");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "# Safe\n");

    await expect(
      SkillInstaller.readLocalRepoFileByPath(repoPath, "../outside.txt"),
    ).rejects.toThrow(/must not contain/);
  });
});

// ---------- deleteLocalRepo ----------

describe("SkillInstaller.deleteLocalRepo", () => {
  it("deletes an existing skill repo", async () => {
    await SkillInstaller.saveContentToLocalRepo("delete-me", "content");
    const repoPath = SkillInstaller.getLocalRepoPath("delete-me");

    // Verify it exists
    await expect(fs.access(repoPath)).resolves.toBeUndefined();

    await SkillInstaller.deleteLocalRepo("delete-me");

    // Verify it's gone
    await expect(fs.access(repoPath)).rejects.toThrow();
  });

  it("silently succeeds for non-existent skill", async () => {
    await expect(
      SkillInstaller.deleteLocalRepo("does-not-exist"),
    ).resolves.toBeUndefined();
  });

  it("rejects path traversal", async () => {
    await expect(SkillInstaller.deleteLocalRepo("../evil")).rejects.toThrow(
      /must not contain/,
    );
  });
});

// ---------- deleteRepoByPath ----------

describe("SkillInstaller.deleteRepoByPath", () => {
  it("deletes a repo within the skills directory", async () => {
    await SkillInstaller.saveContentToLocalRepo("target", "content");
    const repoPath = path.join(managedSkillsDir(), "target");

    await expect(fs.access(repoPath)).resolves.toBeUndefined();
    await SkillInstaller.deleteRepoByPath(repoPath);
    await expect(fs.access(repoPath)).rejects.toThrow();
  });

  it("blocks deletion of paths outside skills directory", async () => {
    // Create a directory outside skills dir
    const outsidePath = path.join(tmpDir, "outside-dir");
    await fs.mkdir(outsidePath, { recursive: true });

    await expect(SkillInstaller.deleteRepoByPath(outsidePath)).rejects.toThrow(
      /Path traversal detected/,
    );

    // Verify it still exists (not deleted)
    await expect(fs.access(outsidePath)).resolves.toBeUndefined();
  });

  it("blocks path traversal via ../", async () => {
    // Attempt to delete a sibling of skills dir
    const skillsDir = managedSkillsDir();
    await fs.mkdir(skillsDir, { recursive: true });

    const traversalPath = path.join(skillsDir, "..", "other-dir");
    await fs.mkdir(path.join(tmpDir, "other-dir"), { recursive: true });

    await expect(
      SkillInstaller.deleteRepoByPath(traversalPath),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("silently succeeds for non-existent path within skills dir", async () => {
    await SkillInstaller.init();
    const nonExistent = path.join(managedSkillsDir(), "ghost");
    await expect(
      SkillInstaller.deleteRepoByPath(nonExistent),
    ).resolves.toBeUndefined();
  });
});

// ---------- deleteAllLocalRepos ----------

describe("SkillInstaller.deleteAllLocalRepos", () => {
  it("deletes all repos and recreates an empty skills root", async () => {
    // Create several repos
    await SkillInstaller.saveContentToLocalRepo("skill-a", "a");
    await SkillInstaller.saveContentToLocalRepo("skill-b", "b");
    await SkillInstaller.saveContentToLocalRepo("skill-c", "c");

    await SkillInstaller.deleteAllLocalRepos();

    const skillsDir = managedSkillsDir();
    const stat = await fs.stat(skillsDir);
    expect(stat.isDirectory()).toBe(true);

    const entries = await fs.readdir(skillsDir);
    expect(entries).toEqual([]);
  });

  it("creates skills root if it does not exist", async () => {
    const skillsDir = managedSkillsDir();
    // Ensure it doesn't exist
    await fs.rm(skillsDir, { recursive: true, force: true }).catch(() => {});

    await SkillInstaller.deleteAllLocalRepos();

    const stat = await fs.stat(skillsDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

// ---------- isManagedRepoPath ----------

describe("SkillInstaller.isManagedRepoPath", () => {
  it("returns true for a path inside skills directory", async () => {
    await SkillInstaller.init();
    // The path must actually exist so that realpathSync.native resolves symlinks
    // (e.g., macOS /var -> /private/var). Create the directory to ensure consistency.
    const skillDir = path.join(managedSkillsDir(), "my-skill");
    await fs.mkdir(skillDir, { recursive: true });
    expect(await SkillInstaller.isManagedRepoPath(skillDir)).toBe(true);
  });

  it("returns false for a path outside skills directory", async () => {
    expect(await SkillInstaller.isManagedRepoPath("/usr/local/bin")).toBe(
      false,
    );
  });

  it("returns true for the skills directory itself", async () => {
    // isPathWithin("base", "base") => relative is "" which doesn't start with ".."
    // and is not absolute, so it returns true.
    // Create the dir first so realpathSync resolves consistently on macOS.
    await SkillInstaller.init();
    const skillsDir = managedSkillsDir();
    expect(await SkillInstaller.isManagedRepoPath(skillsDir)).toBe(true);
  });

  it("returns false for parent of skills directory", async () => {
    expect(await SkillInstaller.isManagedRepoPath(tmpDir)).toBe(false);
  });
});

// ---------- deleteLocalRepoFile ----------

describe("SkillInstaller.deleteLocalRepoFile", () => {
  it("deletes a specific file from a skill repo", async () => {
    await SkillInstaller.writeLocalRepoFile(
      "my-skill",
      "extra.txt",
      "temporary",
    );
    const filePath = path.join(managedSkillsDir(), "my-skill", "extra.txt");
    await expect(fs.access(filePath)).resolves.toBeUndefined();

    await SkillInstaller.deleteLocalRepoFile("my-skill", "extra.txt");
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("rejects path traversal in relative path", async () => {
    await expect(
      SkillInstaller.deleteLocalRepoFile("my-skill", "../../etc/passwd"),
    ).rejects.toThrow(/must not contain/);
  });
});

// ---------- createLocalRepoDir ----------

describe("SkillInstaller.createLocalRepoDir", () => {
  it("creates a subdirectory inside the skill repo", async () => {
    await SkillInstaller.createLocalRepoDir("my-skill", "src/lib");

    const dirPath = path.join(managedSkillsDir(), "my-skill", "src", "lib");
    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects path traversal", async () => {
    await expect(
      SkillInstaller.createLocalRepoDir("my-skill", "../outside"),
    ).rejects.toThrow(/must not contain/);
  });
});

// ---------- adversarial: validateSkillName edge cases ----------

describe("SkillInstaller path safety (adversarial)", () => {
  it.each([
    ["..", "bare double dot"],
    ["./hidden", "dot-slash prefix (contains /)"],
    ["a/b/c", "nested slash path"],
    ["..\\windows", "backslash traversal"],
  ])("getLocalRepoPath rejects %s (%s)", (name) => {
    expect(() => SkillInstaller.getLocalRepoPath(name)).toThrow();
  });

  it("null byte in skill name is rejected by validateSkillName", () => {
    // P1-9: validateSkillName now rejects null bytes to prevent SQLite truncation
    // (better-sqlite3 silently truncates strings at \x00, causing data loss).
    expect(() => SkillInstaller.getLocalRepoPath("skill\x00name")).toThrow(
      /must not contain null bytes/,
    );
  });

  it("URL-encoded traversal (..%2F) is still rejected because it contains '..'", () => {
    // ..%2F..%2Fetc starts with ".." which is caught by the literal check
    expect(() => SkillInstaller.getLocalRepoPath("..%2F..%2Fetc")).toThrow(
      /must not contain/,
    );
  });

  it("pure percent-encoded path without literal '..' is accepted", () => {
    // %2E%2E%2F does NOT contain literal "..", "/", or "\\"
    // The OS filesystem treats these as literal characters, not traversal
    expect(() => SkillInstaller.getLocalRepoPath("%2E%2E%2Fetc")).not.toThrow();
  });

  it("getLocalRepoPath rejects names with backslash on any OS", () => {
    expect(() => SkillInstaller.getLocalRepoPath("a\\b")).toThrow(
      /must not contain/,
    );
  });

  it("writeLocalRepoFile rejects backslash in relative path on detection", async () => {
    // The validateRelativePath rejects paths starting with backslash
    await expect(
      SkillInstaller.writeLocalRepoFile("valid-skill", "\\etc\\passwd", "x"),
    ).rejects.toThrow(/must not start with/);
  });
});

// ---------- exportAsSkillMd round-trip with parseSkillMd ----------

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
    ).rejects.toThrow(/must not contain null bytes/);

    // Verify original is preserved (atomic replacement rolled back)
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

  it("preserves original files when staging write fails (path traversal)", async () => {
    await SkillInstaller.init();
    const repoPath = SkillInstaller.getLocalRepoPath("rollback-test");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "must survive");

    await expect(
      SkillInstaller.replaceLocalRepoFilesByPath(repoPath, [
        { relativePath: "../escape.txt", content: "malicious" },
      ]),
    ).rejects.toThrow(/must not contain/);

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
      },
    );
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockResolvedValue(
      path.join(managedSkillsDir(), "icelemon-skills"),
    );
    vi.spyOn(SkillInstaller, "readManifest").mockResolvedValue({
      name: "skills",
      description: "Gitea repo",
      version: "1.0.0",
      author: "icelemon",
      tags: ["gitea"],
      instructions: "# Gitea repo",
    });

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
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockImplementation(
      async (installDir) => installDir,
    );
    vi.spyOn(SkillInstaller, "readManifest").mockResolvedValue({
      name: "repo",
      description: "Repo",
      version: "1.0.0",
      author: "owner",
      tags: ["github"],
      instructions: "# Repo\n",
    });

    await expect(
      SkillInstaller.installFromGithub("https://github.com/owner/repo", mockDb),
    ).resolves.toBe("skill-cleanup");

    expect(
      fsSync.existsSync(path.join(managedSkillsDir(), "owner-repo")),
    ).toBe(false);
    const managedRepoPath = dbMock.update.mock.calls[0]?.[1]?.local_repo_path;
    expect(typeof managedRepoPath).toBe("string");
    expect(fsSync.existsSync(path.join(String(managedRepoPath), "SKILL.md"))).toBe(
      true,
    );
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
        await fs.writeFile(path.join(destDir, "SKILL.md"), "# Repo\n");
      },
    );
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockImplementation(
      async (installDir) => installDir,
    );
    vi.spyOn(SkillInstaller, "readManifest").mockResolvedValue({
      name: "repo",
      description: "Repo",
      version: "1.0.0",
      author: "owner",
      tags: ["github"],
      instructions: "# Repo\n",
    });
    await expect(
      SkillInstaller.installFromGithub("https://github.com/owner/repo", mockDb),
    ).rejects.toThrow("update failed");

    expect(dbMock.delete).toHaveBeenCalledWith("skill-rollback");
    expect(
      fsSync.existsSync(path.join(managedSkillsDir(), "owner-repo")),
    ).toBe(false);
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
      },
    );
    vi.spyOn(SkillInstaller, "resolveSingleSkillDirFromRepo").mockResolvedValue(
      path.join(managedSkillsDir(), "owner-repo"),
    );
    vi.spyOn(SkillInstaller, "readManifest").mockResolvedValue({
      name: "repo",
      description: "SSH repo",
      version: "1.0.0",
      author: "owner",
      tags: ["github"],
      instructions: "# SSH repo",
    });

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
    expect(result[0].directory_fingerprint).toBeTruthy();
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

    // Real in-memory DB
    const sqliteDb = new Database(":memory:");
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
    const sqliteDb = new Database(":memory:");
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
    const sqliteDb = new Database(":memory:");
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
    const sqliteDb = new Database(":memory:");
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
