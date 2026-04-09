import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module before importing SkillInstaller
vi.mock("../../../src/main/database", () => ({
  initDatabase: vi.fn(),
}));

import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { SkillInstaller } from "../../../src/main/services/skill-installer";
import { SKILL_PLATFORMS } from "../../../src/shared/constants/platforms";
// Direct imports for real DB tests (these are NOT mocked)
import Database from "../../../src/main/database/sqlite";
import {
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-installer-test-"));
  configureRuntimePaths({ userDataPath: tmpDir });
});

afterEach(async () => {
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
    expect(platforms).toBe(SKILL_PLATFORMS);
    expect(platforms.length).toBeGreaterThan(0);
  });

  it("every platform has required fields", () => {
    for (const p of SkillInstaller.getSupportedPlatforms()) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(typeof p.icon).toBe("string");
      expect(typeof p.skillsDir.darwin).toBe("string");
      expect(typeof p.skillsDir.win32).toBe("string");
      expect(typeof p.skillsDir.linux).toBe("string");
    }
  });

  it("platform IDs are unique", () => {
    const ids = SkillInstaller.getSupportedPlatforms().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
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
    const skillsDir = path.join(tmpDir, "skills");
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

    const filePath = path.join(tmpDir, "skills", "my-skill", "README.md");
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
      tmpDir,
      "skills",
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
    const utilsFile = files.find(
      (f) => f.path === path.join("lib", "utils.ts"),
    );
    expect(utilsFile?.content).toBe("export const x = 1;");
  });

  it("rejects path traversal in skill name", async () => {
    await expect(SkillInstaller.readLocalRepoFiles("../evil")).rejects.toThrow(
      /must not contain/,
    );
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
    const repoPath = path.join(tmpDir, "skills", "target");

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
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });

    const traversalPath = path.join(skillsDir, "..", "other-dir");
    await fs.mkdir(path.join(tmpDir, "other-dir"), { recursive: true });

    await expect(
      SkillInstaller.deleteRepoByPath(traversalPath),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("silently succeeds for non-existent path within skills dir", async () => {
    await SkillInstaller.init();
    const nonExistent = path.join(tmpDir, "skills", "ghost");
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

    const skillsDir = path.join(tmpDir, "skills");
    const stat = await fs.stat(skillsDir);
    expect(stat.isDirectory()).toBe(true);

    const entries = await fs.readdir(skillsDir);
    expect(entries).toEqual([]);
  });

  it("creates skills root if it does not exist", async () => {
    const skillsDir = path.join(tmpDir, "skills");
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
    const skillDir = path.join(tmpDir, "skills", "my-skill");
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
    const skillsDir = path.join(tmpDir, "skills");
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
    const filePath = path.join(tmpDir, "skills", "my-skill", "extra.txt");
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

    const dirPath = path.join(tmpDir, "skills", "my-skill", "src", "lib");
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

    // Place a skill in PromptHub's own skills directory (which is inside tmpDir)
    const prompthubSkillsDir = path.join(tmpDir, "skills");
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
});

// ---------- P1-8: deleteRepoByPath TOCTOU fix ----------

describe("P1-8: deleteRepoByPath TOCTOU resilience", () => {
  it("deleting non-existent path does not throw", async () => {
    await SkillInstaller.init();
    // Path doesn't exist — should NOT throw (ENOENT is silently ignored)
    await expect(
      SkillInstaller.deleteRepoByPath(
        path.join(tmpDir, "skills", "ghost-skill"),
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

  /** SQL to add columns that migrations normally add */
  const SKILL_MIGRATIONS = `
    ALTER TABLE skills ADD COLUMN source_url TEXT;
    ALTER TABLE skills ADD COLUMN local_repo_path TEXT;
    ALTER TABLE skills ADD COLUMN icon_url TEXT;
    ALTER TABLE skills ADD COLUMN icon_emoji TEXT;
    ALTER TABLE skills ADD COLUMN icon_background TEXT;
    ALTER TABLE skills ADD COLUMN category TEXT DEFAULT 'general';
    ALTER TABLE skills ADD COLUMN is_builtin INTEGER DEFAULT 0;
    ALTER TABLE skills ADD COLUMN registry_slug TEXT;
    ALTER TABLE skills ADD COLUMN content_url TEXT;
    ALTER TABLE skills ADD COLUMN prerequisites TEXT;
    ALTER TABLE skills ADD COLUMN compatibility TEXT;
    ALTER TABLE skills ADD COLUMN original_tags TEXT;
  `;

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
    // Add migration columns one at a time (some may already exist from SCHEMA_TABLES)
    for (const line of SKILL_MIGRATIONS.split(";")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        sqliteDb.exec(trimmed);
      } catch {
        // Column already exists from SCHEMA_TABLES — expected
      }
    }
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
    const skillsDir = path.join(scanTmpDir, "skills");
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
    const skillsDir = path.join(scanTmpDir, "skills");
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

// ---------- P3: UNIQUE index on skills.LOWER(name) ----------

describe("P3: skills table UNIQUE index on LOWER(name)", () => {
  it("SCHEMA_INDEXES contains UNIQUE index on LOWER(name)", () => {
    expect(SCHEMA_INDEXES).toContain("idx_skills_name_lower");
    expect(SCHEMA_INDEXES).toContain("UNIQUE INDEX");
    expect(SCHEMA_INDEXES).toContain("LOWER(name)");
  });

  it("prevents inserting two skills with same name (case-insensitive) at DB level", () => {
    const dbDir = fsSync.mkdtempSync(
      path.join(os.tmpdir(), "unique-idx-test-"),
    );
    const testDb = new Database(path.join(dbDir, "test.db"));
    try {
      testDb.exec(SCHEMA_TABLES);
      // Add migration columns
      const migrationCols = [
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
      ];
      for (const col of migrationCols) {
        try {
          testDb.exec(`ALTER TABLE skills ADD COLUMN ${col}`);
        } catch {
          /* already exists */
        }
      }
      testDb.exec(SCHEMA_INDEXES);

      const now = Date.now();
      testDb
        .prepare(
          `INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        )
        .run("id-1", "My-Skill", now, now);

      // Same name, different case — should be rejected by UNIQUE index
      expect(() => {
        testDb
          .prepare(
            `INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          )
          .run("id-2", "my-skill", now, now);
      }).toThrow(/UNIQUE constraint failed/);
    } finally {
      testDb.close();
      fsSync.rmSync(dbDir, { recursive: true, force: true });
    }
  });
});
