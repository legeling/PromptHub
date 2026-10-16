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
import { MAX_SKILL_PACKAGE_FILES } from "@prompthub/shared/constants/skill-package";
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

  it("does not copy ignored dependency directories from a local Skill source", async () => {
    const sourceDir = path.join(tmpDir, "source-skill-ignored-files");
    const targetRootDir = path.join(
      tmpDir,
      "project-ignored-files",
      ".agents",
      "skills",
    );
    await fs.mkdir(path.join(sourceDir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# source", "utf-8");
    await fs.writeFile(
      path.join(sourceDir, "node_modules", "runtime.js"),
      "runtime",
      "utf-8",
    );

    const targetDir = await SkillInstaller.copyRepoByPathToDirectory(
      sourceDir,
      "demo-skill",
      targetRootDir,
    );

    await expect(
      fs.readFile(path.join(targetDir, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# source");
    await expect(
      fs.lstat(path.join(targetDir, "node_modules")),
    ).rejects.toMatchObject({ code: "ENOENT" });
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

  it("reads every file when a valid package reaches the file-count limit", async () => {
    const repoPath = path.join(tmpDir, "project", "skills", "large-skill");
    const docsPath = path.join(repoPath, "docs");
    await fs.mkdir(docsPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "SKILL.md"), "# Large Skill\n");
    await Promise.all(
      Array.from({ length: MAX_SKILL_PACKAGE_FILES - 1 }, (_, index) =>
        fs.writeFile(
          path.join(docsPath, `file-${index.toString().padStart(3, "0")}.txt`),
          String(index),
        ),
      ),
    );

    const files = await SkillInstaller.readLocalRepoFilesByPath(repoPath);

    expect(files.filter((file) => !file.isDirectory)).toHaveLength(
      MAX_SKILL_PACKAGE_FILES,
    );
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

  it("does not treat the entire Skills library as one managed package", async () => {
    // Create the dir first so realpathSync resolves consistently on macOS.
    await SkillInstaller.init();
    const skillsDir = managedSkillsDir();
    await fs.mkdir(skillsDir, { recursive: true });
    expect(await SkillInstaller.isManagedRepoPath(skillsDir)).toBe(false);
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
