import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module before importing SkillInstaller
vi.mock("@/main/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/main/database")>()),
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
import {
  SKILL_PLATFORMS,
  getPlatformMcpRelativePath,
} from "@prompthub/shared/constants/platforms";
import { isPlatformRootConfigured } from "@prompthub/core/platform-paths";
import * as remoteInstaller from "../../../src/main/services/skill-installer-remote";
import * as skillInstallerUtils from "../../../src/main/services/skill-installer-utils";
// Direct imports for real DB tests (these are NOT mocked)
import Database from "../../../src/main/database/sqlite";
import {
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";
import { closeDatabase, getDatabase } from "@prompthub/db";
import { AgentSettingsRepository } from "@prompthub/core";
import { initializeAgentSettingsFixture } from "../../helpers/agent-settings";

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
  initializeAgentSettingsFixture(tmpDir);
  invalidateCustomPathsCache();
});

afterEach(async () => {
  closeDatabase();
  invalidateCustomPathsCache();
  resetRuntimePaths();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ---------- exportAsSkillMd ----------

describe("SkillInstaller.exportAsSkillMd", () => {
  it("produces valid frontmatter with name only", () => {
    const md = SkillInstaller.exportAsSkillMd({ name: "test-skill" });
    expect(parseSkillMd(md)?.frontmatter).toMatchObject({
      name: "test-skill",
      compatibility: "prompthub",
    });
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

    const parsed = parseSkillMd(md);
    expect(parsed?.frontmatter).toMatchObject({
      name: "my-skill",
      description: "A great skill",
      version: "2.0.0",
      author: "Alice",
      license: "MIT",
      tags: ["coding", "python"],
      compatibility: "prompthub, claude",
    });
    expect(parsed?.body).toBe("# Hello\n\nDo stuff.");
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
    expect(parseSkillMd(md)?.frontmatter.description).toBe(
      'Has "quotes" and [brackets]',
    );
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
    expect(parseSkillMd(md)?.frontmatter.compatibility).toBe("claude");
  });

  it("handles compatibility as string (not array)", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      compatibility: "custom-platform",
    });
    expect(parseSkillMd(md)?.frontmatter.compatibility).toBe("custom-platform");
  });

  it("YAML-escapes colons in name", () => {
    const md = SkillInstaller.exportAsSkillMd({ name: "has:colon" });
    expect(parseSkillMd(md)?.frontmatter.name).toBe("has:colon");
  });

  it("round-trips descriptions containing newlines", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      description: "line1\nline2",
    });
    expect(parseSkillMd(md)?.frontmatter.description).toBe("line1\nline2");
  });

  it("handles tags with special chars", () => {
    const md = SkillInstaller.exportAsSkillMd({
      name: "test",
      tags: ["tag:with:colons", "normal"],
    });
    expect(parseSkillMd(md)?.frontmatter.tags).toEqual([
      "tag:with:colons",
      "normal",
    ]);
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
  it("scans Qwen native and shared compatibility skills without taking ownership of shared installs", async () => {
    const qwenSkillsDir = path.join(tmpDir, ".qwen", "skills");
    const sharedSkillsDir = path.join(tmpDir, ".agents", "skills");
    const nativeSkillDir = path.join(qwenSkillsDir, "native-skill");
    const sharedSkillDir = path.join(sharedSkillsDir, "shared-skill");

    for (const [directory, name] of [
      [nativeSkillDir, "native-skill"],
      [sharedSkillDir, "shared-skill"],
    ] as const) {
      await fs.mkdir(path.join(directory, "scripts"), { recursive: true });
      await fs.writeFile(
        path.join(directory, "SKILL.md"),
        `---\nname: ${name}\ndescription: Qwen skill\n---\n# ${name}`,
      );
      await fs.writeFile(path.join(directory, "scripts", "run.js"), "run();");
    }

    vi.spyOn(skillInstallerUtils, "getPlatformSkillsDir").mockReturnValue(
      qwenSkillsDir,
    );

    const result = await SkillInstaller.scanPlatformSkills("qwen", {
      homeDir: tmpDir,
    });
    const byName = new Map(
      result.scannedSkills.map((skill) => [skill.name, skill]),
    );

    expect(result.skillsDir).toBe(qwenSkillsDir);
    expect(byName.get("native-skill")).toMatchObject({
      platforms: ["Qwen Code"],
      platformSkillPath: nativeSkillDir,
      isReadOnlyDiscovery: undefined,
    });
    expect(byName.get("shared-skill")).toMatchObject({
      platforms: ["Qwen Code"],
      platformSkillPath: sharedSkillDir,
      isReadOnlyDiscovery: true,
    });
    expect(
      await fs.readFile(path.join(sharedSkillDir, "scripts", "run.js"), "utf8"),
    ).toBe("run();");
  });

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
    new AgentSettingsRepository(getDatabase()).patch({
      builtinAgentOverrides: {},
    });
    invalidateCustomPathsCache();
    const platforms = SkillInstaller.getSupportedPlatforms();
    expect(platforms).toStrictEqual(
      SKILL_PLATFORMS.map((platform) => {
        if (platform.id !== "claude") return platform;
        const root = skillInstallerUtils.getPlatformRootDir(platform);
        return {
          ...platform,
          resolvedRootPath: root,
          mcpRelativePath: getPlatformMcpRelativePath(
            platform,
            isPlatformRootConfigured(platform, root),
          ),
        };
      }),
    );
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

  it("accepts SSH Gitea URLs using the selected SSH transport", async () => {
    await SkillInstaller.init();
    const clone = vi
      .spyOn(skillInstallerUtils, "gitClone")
      .mockImplementation(async (_url, dest) => {
        await fs.mkdir(path.join(dest, "ssh-skill"), { recursive: true });
        await fs.writeFile(
          path.join(dest, "ssh-skill/SKILL.md"),
          "---\nname: ssh-skill\n---\n# SSH Skill",
        );
      });
    const fetch = vi.spyOn(SkillInstaller, "fetchRemoteContent");
    const result = await SkillInstaller.scanRemoteGithub(
      "git@gitea.example.com:icelemon/skills.git",
      [],
      "main",
    );
    expect(result).toHaveLength(1);
    expect(result[0].source_url).toBe(
      "git@gitea.example.com:icelemon/skills.git",
    );
    expect(clone).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("scans SSH GitHub store URLs by cloning through the local SSH transport", async () => {
    await SkillInstaller.init();

    const cloneSpy = vi.spyOn(skillInstallerUtils, "gitClone");
    const branchSpy = vi
      .spyOn(skillInstallerUtils, "gitGetCurrentBranch")
      .mockResolvedValue("main");
    const fetchSpy = vi.spyOn(SkillInstaller, "fetchRemoteContent");
    cloneSpy.mockImplementation(async (_url: string, destDir: string) => {
      const skillDir = path.join(destDir, "github-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          "name: github-skill",
          "description: GitHub SSH skill",
          "author: icelemon",
          "tags: [github]",
          "---",
          "# GitHub skill",
        ].join("\n"),
        "utf-8",
      );
      await fs.writeFile(path.join(skillDir, "README.md"), "docs", "utf-8");
    });

    const result = await SkillInstaller.scanRemoteGithub(
      "git@github.com:icelemon/skills.git",
      [],
    );

    expect(result).toHaveLength(1);
    expect(cloneSpy).toHaveBeenCalledWith(
      "git@github.com:icelemon/skills.git",
      expect.stringContaining("icelemon-skills"),
      undefined,
    );
    expect(branchSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result[0].source_url).toBe(
      "git@github.com:icelemon/skills.git",
    );
    expect(result[0].content_url).toBe(
      "https://raw.githubusercontent.com/icelemon/skills/main/github-skill/SKILL.md",
    );
  });

  it("rejects invalid git repository URLs", async () => {
    await SkillInstaller.init();

    await expect(
      SkillInstaller.scanRemoteGithub("not-a-url", []),
    ).rejects.toThrow("Invalid git repository URL");
  });
});
