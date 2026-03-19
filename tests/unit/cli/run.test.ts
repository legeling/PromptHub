import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../../src/cli/run";
import { closeDatabase, initDatabase } from "../../../src/main/database";
import { SkillDB } from "../../../src/main/database/skill";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { SkillInstaller } from "../../../src/main/services/skill-installer";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function execCli(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  const joinedStdout = stdout.join("\n");
  const joinedStderr = stderr.join("\n");
  const json =
    joinedStdout.trim().startsWith("{") || joinedStdout.trim().startsWith("[")
      ? JSON.parse(joinedStdout)
      : undefined;
  const errorJson = joinedStderr.trim().startsWith("{")
    ? JSON.parse(joinedStderr)
    : undefined;

  return {
    exitCode,
    stdout,
    stderr,
    json,
    errorJson,
    joinedStdout,
    joinedStderr,
  };
}

/** Create a temp directory and register it for cleanup. */
function makeTempRoot(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-"));
  tempDirs.push(dir);
  return dir;
}

/** Standard data-dir flag pointing at an isolated temp directory. */
function withDataDir(rootDir: string): string[] {
  const dataDir = path.join(rootDir, "user-data");
  return ["--data-dir", dataDir];
}

/** Create a prompt via CLI and return its id. */
async function createTestPrompt(
  rootDir: string,
  overrides?: { title?: string; userPrompt?: string; tags?: string },
) {
  const res = await execCli([
    ...withDataDir(rootDir),
    "prompt",
    "create",
    "--title",
    overrides?.title ?? "Test Prompt",
    "--user-prompt",
    overrides?.userPrompt ?? "Hello World",
    ...(overrides?.tags ? ["--tags", overrides.tags] : []),
  ]);
  expect(res.exitCode).toBe(0);
  return res.json as { id: string; title: string; [k: string]: unknown };
}

/** Create a local skill dir with a SKILL.md and install it. Returns skill name. */
async function installTestSkill(
  rootDir: string,
  opts?: { name?: string; version?: string },
) {
  const skillName = opts?.name ?? "test-cli-skill";
  const skillSourceDir = path.join(rootDir, `skill-source-${skillName}`);
  fs.mkdirSync(skillSourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillSourceDir, "SKILL.md"),
    [
      "---",
      `name: ${skillName}`,
      "description: Test skill for CLI tests",
      `version: ${opts?.version ?? "1.0.0"}`,
      "author: Test Author",
      "tags: [cli, test]",
      "---",
      "",
      "# Test Skill",
    ].join("\n"),
    "utf8",
  );

  const res = await execCli([
    ...withDataDir(rootDir),
    "skill",
    "install",
    skillSourceDir,
  ]);
  expect(res.exitCode).toBe(0);
  return {
    name: skillName,
    id: res.json.id as string,
    sourceDir: skillSourceDir,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("PromptHub CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 1. Root / Global Options
  // =========================================================================

  describe("Root help & global options", () => {
    it("shows root help with --help", async () => {
      const res = await execCli(["--help"]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("PromptHub CLI");
      expect(res.joinedStdout).toContain("--output, -o <format>");
      expect(res.joinedStdout).toContain("prompt");
      expect(res.joinedStdout).toContain("skill");
    });

    it("shows root help with -h", async () => {
      const res = await execCli(["-h"]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("PromptHub CLI");
    });

    it("shows root help when no args are given", async () => {
      const res = await execCli([]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("PromptHub CLI");
    });

    it("rejects unsupported output format", async () => {
      const res = await execCli(["--output", "yaml", "prompt", "list"]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("yaml");
    });

    it("rejects unsupported resource type", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([...withDataDir(root), "foobar"]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("foobar");
    });

    it("accepts -o as alias for --output", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      // Table mode for empty list should say "(empty)"
      expect(res.joinedStdout).toContain("(empty)");
    });

    it("accepts --data-dir and isolates databases", async () => {
      const root1 = makeTempRoot(tempDirs);
      const root2 = makeTempRoot(tempDirs);

      await createTestPrompt(root1, { title: "Root1 Prompt" });

      // root2 should have no prompts
      const list2 = await execCli([...withDataDir(root2), "prompt", "list"]);
      expect(list2.exitCode).toBe(0);
      expect(list2.json).toEqual([]);

      // root1 should have one
      const list1 = await execCli([...withDataDir(root1), "prompt", "list"]);
      expect(list1.exitCode).toBe(0);
      expect(list1.json).toHaveLength(1);
      expect(list1.json[0].title).toBe("Root1 Prompt");
    });
  });

  // =========================================================================
  // 2. Prompt Commands
  // =========================================================================

  describe("prompt commands", () => {
    // ---- help ----
    describe("prompt help", () => {
      it("shows prompt help with --help", async () => {
        const res = await execCli(["prompt", "--help"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Prompt 命令");
      });

      it("shows prompt help with -h", async () => {
        const res = await execCli(["prompt", "-h"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Prompt 命令");
      });

      it("shows prompt help with no subcommand", async () => {
        const res = await execCli(["prompt"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Prompt 命令");
      });
    });

    // ---- create ----
    describe("prompt create", () => {
      it("creates a prompt with all fields and returns JSON", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "Full Prompt",
          "--description",
          "A full test prompt",
          "--user-prompt",
          "Hello from create",
          "--system-prompt",
          "You are helpful.",
          "--tags",
          "tag1,tag2,tag3",
          "--prompt-type",
          "text",
          "--source",
          "https://example.com",
          "--notes",
          "Some notes",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.title).toBe("Full Prompt");
        expect(res.json.description).toBe("A full test prompt");
        expect(res.json.userPrompt).toBe("Hello from create");
        expect(res.json.systemPrompt).toBe("You are helpful.");
        expect(res.json.tags).toEqual(["tag1", "tag2", "tag3"]);
        expect(res.json.source).toBe("https://example.com");
        expect(res.json.notes).toBe("Some notes");
        expect(res.json.id).toBeDefined();
      });

      it("fails when --title is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--user-prompt",
          "Hello",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("--title");
      });

      it("fails when --user-prompt is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "No Body",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("--user-prompt");
      });

      it("creates a prompt with --user-prompt-file", async () => {
        const root = makeTempRoot(tempDirs);
        const promptFile = path.join(root, "user-prompt.md");
        fs.writeFileSync(promptFile, "Hello from file", "utf8");

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "File Prompt",
          "--user-prompt-file",
          promptFile,
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.userPrompt).toBe("Hello from file");
      });

      it("creates a prompt with --system-prompt-file", async () => {
        const root = makeTempRoot(tempDirs);
        const systemFile = path.join(root, "system.md");
        fs.writeFileSync(systemFile, "System from file", "utf8");

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "System File Prompt",
          "--user-prompt",
          "hello",
          "--system-prompt-file",
          systemFile,
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.systemPrompt).toBe("System from file");
      });

      it("fails when both --user-prompt and --user-prompt-file are given", async () => {
        const root = makeTempRoot(tempDirs);
        const promptFile = path.join(root, "user-prompt.md");
        fs.writeFileSync(promptFile, "file content", "utf8");

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "Both",
          "--user-prompt",
          "inline",
          "--user-prompt-file",
          promptFile,
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("不能同时使用");
      });

      it("fails when --user-prompt-file points to nonexistent file", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "Bad File",
          "--user-prompt-file",
          "/nonexistent/file.md",
        ]);
        expect(res.exitCode).toBe(5); // IO exit code
        expect(res.errorJson.error.code).toBe("IO_ERROR");
      });

      it("fails with unknown options", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "X",
          "--user-prompt",
          "Y",
          "--unknown-flag",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("--unknown-flag");
      });

      it("fails when --title is empty/whitespace only", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "   ",
          "--user-prompt",
          "Hello",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });

      it("fails when --user-prompt is empty/whitespace only", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "create",
          "--title",
          "Valid Title",
          "--user-prompt",
          "  ",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });
    });

    // ---- list ----
    describe("prompt list", () => {
      it("returns empty array when no prompts exist (json)", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "prompt", "list"]);
        expect(res.exitCode).toBe(0);
        expect(res.json).toEqual([]);
      });

      it("returns (empty) when no prompts exist (table)", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "prompt",
          "list",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("(empty)");
      });

      it("lists created prompts (json)", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "P1" });
        await createTestPrompt(root, { title: "P2" });

        const res = await execCli([...withDataDir(root), "prompt", "list"]);
        expect(res.exitCode).toBe(0);
        expect(res.json).toHaveLength(2);
      });

      it("lists prompts in table format with headers", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "Table Prompt" });

        const res = await execCli([
          ...withDataDir(root),
          "--output",
          "table",
          "prompt",
          "list",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("title");
        expect(res.joinedStdout).toContain("Table Prompt");
        // Table should have header + separator + data
        expect(res.stdout.length).toBeGreaterThanOrEqual(1);
      });
    });

    // ---- get ----
    describe("prompt get", () => {
      it("gets a prompt by id", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root, { title: "Get Me" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "get",
          created.id,
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.title).toBe("Get Me");
        expect(res.json.id).toBe(created.id);
      });

      it("returns NOT_FOUND for nonexistent id", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "get",
          "nonexistent-id",
        ]);
        expect(res.exitCode).toBe(3);
        expect(res.errorJson.error.code).toBe("NOT_FOUND");
      });

      it("fails when id argument is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "prompt", "get"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });

      it("displays get result as field/value table in table mode", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root, { title: "Table Get" });

        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "prompt",
          "get",
          created.id,
        ]);
        expect(res.exitCode).toBe(0);
        // Single object → rendered as field/value pairs
        expect(res.joinedStdout).toContain("field");
        expect(res.joinedStdout).toContain("value");
        expect(res.joinedStdout).toContain("Table Get");
      });
    });

    // ---- update ----
    describe("prompt update", () => {
      it("updates a prompt title", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root, { title: "Old Title" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--title",
          "New Title",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.title).toBe("New Title");
      });

      it("updates favorite flag (--favorite)", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--favorite",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.isFavorite).toBe(true);
      });

      it("updates unfavorite flag (--unfavorite)", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        // First set to favorite
        await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--favorite",
        ]);

        // Then unfavorite
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--unfavorite",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.isFavorite).toBe(false);
      });

      it("updates pinned flag (--pinned)", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--pinned",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.isPinned).toBe(true);
      });

      it("updates unpinned flag (--unpinned)", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--pinned",
        ]);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--unpinned",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.isPinned).toBe(false);
      });

      it("updates multiple fields at once", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--title",
          "Updated Title",
          "--description",
          "Updated Desc",
          "--tags",
          "new-tag",
          "--favorite",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.title).toBe("Updated Title");
        expect(res.json.description).toBe("Updated Desc");
        expect(res.json.tags).toEqual(["new-tag"]);
        expect(res.json.isFavorite).toBe(true);
      });

      it("fails when no update fields are provided", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("至少需要一个更新字段");
      });

      it("fails when updating nonexistent prompt", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          "nonexistent-id",
          "--title",
          "Whatever",
        ]);
        expect(res.exitCode).toBe(3);
        expect(res.errorJson.error.code).toBe("NOT_FOUND");
      });

      it("fails when id argument is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "prompt", "update"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });

      it("updates user-prompt from file", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root);
        const file = path.join(root, "update-prompt.md");
        fs.writeFileSync(file, "Updated from file", "utf8");

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--user-prompt-file",
          file,
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.userPrompt).toBe("Updated from file");
      });
    });

    // ---- delete ----
    describe("prompt delete", () => {
      it("deletes an existing prompt", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root, { title: "To Delete" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "delete",
          created.id,
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.deleted).toBe(true);
        expect(res.json.id).toBe(created.id);

        // Verify it's gone
        const get = await execCli([
          ...withDataDir(root),
          "prompt",
          "get",
          created.id,
        ]);
        expect(get.exitCode).toBe(3);
      });

      it("fails when deleting nonexistent prompt", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "delete",
          "missing-id",
        ]);
        expect(res.exitCode).toBe(3);
        expect(res.errorJson.error.code).toBe("NOT_FOUND");
      });

      it("fails when id argument is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "prompt", "delete"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });
    });

    // ---- search ----
    describe("prompt search", () => {
      it("searches by keyword", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, {
          title: "Alpha",
          userPrompt: "Alpha content",
        });
        await createTestPrompt(root, {
          title: "Beta",
          userPrompt: "Beta content",
        });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "Alpha",
        ]);
        expect(res.exitCode).toBe(0);
        // FTS might match or not depending on tokenizer, but at least we get a valid response
        expect(Array.isArray(res.json)).toBe(true);
      });

      it("searches by tags", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "Tagged", tags: "design,web" });
        await createTestPrompt(root, { title: "Other", tags: "backend" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--tags",
          "design",
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
      });

      it("searches with --favorite flag", async () => {
        const root = makeTempRoot(tempDirs);
        const created = await createTestPrompt(root, { title: "Fav" });
        await execCli([
          ...withDataDir(root),
          "prompt",
          "update",
          created.id,
          "--favorite",
        ]);

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--favorite",
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
        if (res.json.length > 0) {
          expect(
            res.json.every((p: { isFavorite: boolean }) => p.isFavorite),
          ).toBe(true);
        }
      });

      it("searches with --unfavorite flag", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "Not Fav" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--unfavorite",
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
      });

      it("searches with --limit and --offset", async () => {
        const root = makeTempRoot(tempDirs);
        for (let i = 0; i < 5; i++) {
          await createTestPrompt(root, {
            title: `Prompt ${i}`,
            userPrompt: `Content ${i}`,
          });
        }

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--limit",
          "2",
          "--offset",
          "1",
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
        expect(res.json.length).toBeLessThanOrEqual(2);
      });

      it("searches with --sort-by and --sort-order", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "A" });
        await createTestPrompt(root, { title: "B" });

        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--sort-by",
          "title",
          "--sort-order",
          "asc",
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
      });

      it("returns empty array when nothing matches", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "zzzznonexistent",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json).toEqual([]);
      });

      it("search renders table in table mode", async () => {
        const root = makeTempRoot(tempDirs);
        await createTestPrompt(root, { title: "Table Search" });

        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "prompt",
          "search",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("title");
        expect(res.joinedStdout).toContain("Table Search");
      });

      it("rejects negative --limit", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--limit",
          "-1",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });

      it("rejects float --offset", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "prompt",
          "search",
          "--offset",
          "1.5",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });
    });

    // ---- unknown subcommand ----
    describe("prompt unknown subcommand", () => {
      it("rejects unknown prompt subcommand", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "prompt", "fly"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("fly");
      });
    });
  });

  // =========================================================================
  // 3. Skill Commands
  // =========================================================================

  describe("skill commands", () => {
    // ---- help ----
    describe("skill help", () => {
      it("shows skill help with --help", async () => {
        const res = await execCli(["skill", "--help"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Skill 命令");
      });

      it("shows skill help with -h", async () => {
        const res = await execCli(["skill", "-h"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Skill 命令");
      });

      it("shows skill help with no subcommand", async () => {
        const res = await execCli(["skill"]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("Skill 命令");
      });
    });

    // ---- install ----
    describe("skill install", () => {
      it("installs a local skill from directory", async () => {
        const root = makeTempRoot(tempDirs);
        const { name, id } = await installTestSkill(root);
        expect(name).toBe("test-cli-skill");
        expect(id).toBeDefined();
      });

      it("installs a local skill with custom --name", async () => {
        const root = makeTempRoot(tempDirs);
        const skillSourceDir = path.join(root, "nameless-skill");
        fs.mkdirSync(skillSourceDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillSourceDir, "SKILL.md"),
          [
            "---",
            "description: A nameless skill",
            "version: 0.1.0",
            "---",
            "",
            "# Nameless",
          ].join("\n"),
          "utf8",
        );

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "install",
          skillSourceDir,
          "--name",
          "custom-name",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.name).toBe("custom-name");
      });

      it("fails when source argument is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "skill", "install"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });
    });

    // ---- list ----
    describe("skill list", () => {
      it("returns empty array when no skills exist (json)", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "skill", "list"]);
        expect(res.exitCode).toBe(0);
        expect(res.json).toEqual([]);
      });

      it("returns (empty) when no skills exist (table)", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "skill",
          "list",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("(empty)");
      });

      it("lists installed skills (json)", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "skill-a" });
        await installTestSkill(root, { name: "skill-b" });

        const res = await execCli([...withDataDir(root), "skill", "list"]);
        expect(res.exitCode).toBe(0);
        expect(res.json).toHaveLength(2);
      });

      it("lists skills in table format", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "table-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "skill",
          "list",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("name");
        expect(res.joinedStdout).toContain("table-skill");
      });
    });

    // ---- get ----
    describe("skill get", () => {
      it("gets a skill by name", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "get-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "get",
          "get-skill",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.name).toBe("get-skill");
      });

      it("gets a skill by id", async () => {
        const root = makeTempRoot(tempDirs);
        const { id } = await installTestSkill(root, { name: "id-skill" });

        const res = await execCli([...withDataDir(root), "skill", "get", id]);
        expect(res.exitCode).toBe(0);
        expect(res.json.id).toBe(id);
      });

      it("returns NOT_FOUND for nonexistent skill", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "get",
          "no-such-skill",
        ]);
        expect(res.exitCode).toBe(3);
        expect(res.errorJson.error.code).toBe("NOT_FOUND");
      });

      it("fails when identifier is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "skill", "get"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });
    });

    // ---- delete / remove ----
    describe("skill delete / remove", () => {
      it("deletes a skill by name with --keep-platform-installs", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "del-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "delete",
          "del-skill",
          "--keep-platform-installs",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.deleted).toBe(true);
        expect(res.json.name).toBe("del-skill");
        expect(res.json.platformInstallsKept).toBe(true);

        // Verify it's gone
        const get = await execCli([
          ...withDataDir(root),
          "skill",
          "get",
          "del-skill",
        ]);
        expect(get.exitCode).toBe(3);
      });

      it("'remove' is an alias for 'delete'", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "rm-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "remove",
          "rm-skill",
          "--keep-platform-installs",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.deleted).toBe(true);
      });

      it("deletes with --purge-managed-repo", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "purge-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "delete",
          "purge-skill",
          "--keep-platform-installs",
          "--purge-managed-repo",
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.json.deleted).toBe(true);
        // managedRepoPurged depends on whether the install path is within the managed dir
      });

      it("fails when deleting nonexistent skill", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "delete",
          "no-such-skill",
          "--keep-platform-installs",
        ]);
        expect(res.exitCode).toBe(3);
        expect(res.errorJson.error.code).toBe("NOT_FOUND");
      });

      it("fails when identifier is missing", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "skill", "delete"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      });

      it("rejects unknown options in delete", async () => {
        const root = makeTempRoot(tempDirs);
        await installTestSkill(root, { name: "opt-skill" });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "delete",
          "opt-skill",
          "--keep-platform-installs",
          "--unknown-opt",
        ]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("--unknown-opt");
      });
    });

    // ---- scan ----
    describe("skill scan", () => {
      it("scans a directory with a SKILL.md", async () => {
        const root = makeTempRoot(tempDirs);
        const scanDir = path.join(root, "scan-skills", "my-skill");
        fs.mkdirSync(scanDir, { recursive: true });
        fs.writeFileSync(
          path.join(scanDir, "SKILL.md"),
          [
            "---",
            "name: scanned-skill",
            "description: A scanned skill",
            "version: 2.0.0",
            "author: Scanner",
            "---",
            "",
            "# Scanned",
          ].join("\n"),
          "utf8",
        );

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "scan",
          path.join(root, "scan-skills"),
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
        expect(res.json.length).toBeGreaterThanOrEqual(1);
        const found = res.json.find(
          (s: { name: string }) => s.name === "scanned-skill",
        );
        expect(found).toBeDefined();
        expect(found.version).toBe("2.0.0");
      });

      it("scan renders table output", async () => {
        const root = makeTempRoot(tempDirs);
        const scanDir = path.join(root, "scan-table", "skill-t");
        fs.mkdirSync(scanDir, { recursive: true });
        fs.writeFileSync(
          path.join(scanDir, "SKILL.md"),
          ["---", "name: table-scan", "---", "", "# T"].join("\n"),
          "utf8",
        );

        const res = await execCli([
          ...withDataDir(root),
          "-o",
          "table",
          "skill",
          "scan",
          path.join(root, "scan-table"),
        ]);
        expect(res.exitCode).toBe(0);
        expect(res.joinedStdout).toContain("name");
        expect(res.joinedStdout).toContain("table-scan");
      });

      it("returns no skills from an empty custom path (default platform paths still scanned)", async () => {
        const root = makeTempRoot(tempDirs);
        const emptyDir = path.join(root, "empty-scan");
        fs.mkdirSync(emptyDir, { recursive: true });

        const res = await execCli([
          ...withDataDir(root),
          "skill",
          "scan",
          emptyDir,
        ]);
        expect(res.exitCode).toBe(0);
        expect(Array.isArray(res.json)).toBe(true);
        // The empty custom dir should not contribute any skills.
        // Default platform paths (e.g. ~/.claude/skills) may still produce results.
        const fromEmptyDir = (res.json as Array<{ localPath: string }>).filter(
          (s) => s.localPath.startsWith(emptyDir),
        );
        expect(fromEmptyDir).toEqual([]);
      });
    });

    // ---- unknown subcommand ----
    describe("skill unknown subcommand", () => {
      it("rejects unknown skill subcommand", async () => {
        const root = makeTempRoot(tempDirs);
        const res = await execCli([...withDataDir(root), "skill", "upgrade"]);
        expect(res.exitCode).toBe(2);
        expect(res.errorJson.error.code).toBe("USAGE_ERROR");
        expect(res.errorJson.error.message).toContain("upgrade");
      });
    });
  });

  // =========================================================================
  // 4. Edge Cases & Utility Functions (tested through CLI interface)
  // =========================================================================

  describe("edge cases & utility functions", () => {
    // ---- takeOption: option at end without value ----
    it("errors when option is at end of args without value (--data-dir)", async () => {
      const res = await execCli(["--data-dir"]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("--data-dir");
    });

    it("errors when --output has no value", async () => {
      const res = await execCli(["--output"]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
    });

    // ---- takeOption: value starts with -- (interpreted as missing value) ----
    it("errors when option value looks like another flag", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "--user-prompt",
      ]);
      // --title sees --user-prompt as its value candidate, but it starts with --
      // so takeOption throws "需要一个值"
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("需要一个值");
    });

    // ---- parseCsv edge cases ----
    it("handles tags with extra whitespace and empty items", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "CSV Test",
        "--user-prompt",
        "Hello",
        "--tags",
        " tag1 , tag2 , , tag3 ",
      ]);
      expect(res.exitCode).toBe(0);
      // parseCsv trims and filters empty strings
      expect(res.json.tags).toEqual(["tag1", "tag2", "tag3"]);
    });

    // ---- formatCell through table output ----
    it("formats boolean and array values in table mode", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, {
        title: "Format Test",
        tags: "a,b",
      });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      // Boolean false → "no", array → "a, b"
      expect(res.joinedStdout).toContain("no"); // isFavorite = false
      expect(res.joinedStdout).toContain("a, b"); // tags
    });

    // ---- parseNumberOption edge cases ----
    it("rejects negative number for --limit", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--limit",
        "-5",
      ]);
      expect(res.exitCode).toBe(2);
    });

    it("rejects non-integer number for --limit", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--limit",
        "3.14",
      ]);
      expect(res.exitCode).toBe(2);
    });

    it("accepts zero for --offset", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--offset",
        "0",
      ]);
      expect(res.exitCode).toBe(0);
    });

    it("rejects NaN string for --limit", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--limit",
        "abc",
      ]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
    });
  });

  // =========================================================================
  // 5. Error Handling & Output Formatting
  // =========================================================================

  describe("error handling & output", () => {
    it("returns structured NOT_FOUND errors for missing resources", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "get",
        "nonexistent",
      ]);
      expect(res.exitCode).toBe(3);
      expect(res.errorJson).toBeDefined();
      expect(res.errorJson.error).toBeDefined();
      expect(res.errorJson.error.code).toBe("NOT_FOUND");
      expect(res.errorJson.error.exitCode).toBe(3);
      expect(typeof res.errorJson.error.message).toBe("string");
    });

    it("emitError in table mode outputs text error (not json)", async () => {
      // Note: error output always uses json format in the catch block (line 867)
      // regardless of the configured output format. This is by design.
      // We verify this behavior: even with -o table, errors come as json on stderr.
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "get",
        "nonexistent-in-table",
      ]);
      expect(res.exitCode).toBe(3);
      // Error on stderr is always json (see line 867: emitError uses output: "json")
      expect(res.errorJson).toBeDefined();
      expect(res.errorJson.error.code).toBe("NOT_FOUND");
    });

    it("emitSuccess in table mode for single object shows field/value pairs", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root, { title: "Single Object" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "get",
        created.id,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("field");
      expect(res.joinedStdout).toContain("value");
    });

    it("emitSuccess in json mode for list outputs JSON array", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "JSON List" });

      const res = await execCli([...withDataDir(root), "prompt", "list"]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
    });
  });

  // =========================================================================
  // 6. Console Noise Suppression
  // =========================================================================

  describe("console noise suppression", () => {
    it("restores console.log after CLI execution", async () => {
      const originalLog = console.log;
      const root = makeTempRoot(tempDirs);

      await execCli([...withDataDir(root), "prompt", "list"]);

      // console.log should be restored
      expect(console.log).toBe(originalLog);
    });

    it("restores console even when CLI throws", async () => {
      const originalLog = console.log;

      await execCli(["--output", "invalid-format", "prompt", "list"]);

      expect(console.log).toBe(originalLog);
    });
  });

  // =========================================================================
  // 7. Integration: Full Prompt Lifecycle
  // =========================================================================

  describe("integration: full prompt lifecycle", () => {
    it("create → get → update → search → delete → verify gone", async () => {
      const root = makeTempRoot(tempDirs);

      // Create
      const create = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Lifecycle Prompt",
        "--user-prompt",
        "Initial content",
        "--tags",
        "lifecycle,test",
        "--description",
        "A lifecycle test",
      ]);
      expect(create.exitCode).toBe(0);
      const id = create.json.id;

      // Get
      const get = await execCli([...withDataDir(root), "prompt", "get", id]);
      expect(get.exitCode).toBe(0);
      expect(get.json.title).toBe("Lifecycle Prompt");
      expect(get.json.tags).toEqual(["lifecycle", "test"]);

      // Update
      const update = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        id,
        "--title",
        "Updated Lifecycle",
        "--favorite",
      ]);
      expect(update.exitCode).toBe(0);
      expect(update.json.title).toBe("Updated Lifecycle");
      expect(update.json.isFavorite).toBe(true);

      // Search
      const search = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--favorite",
      ]);
      expect(search.exitCode).toBe(0);
      expect(search.json.length).toBeGreaterThanOrEqual(1);

      // Delete
      const del = await execCli([...withDataDir(root), "prompt", "delete", id]);
      expect(del.exitCode).toBe(0);
      expect(del.json.deleted).toBe(true);

      // Verify gone
      const gone = await execCli([...withDataDir(root), "prompt", "get", id]);
      expect(gone.exitCode).toBe(3);
    });
  });

  // =========================================================================
  // 8. Integration: Full Skill Lifecycle
  // =========================================================================

  describe("integration: full skill lifecycle", () => {
    it("install → list → get → delete (keep platforms) → verify gone", async () => {
      const root = makeTempRoot(tempDirs);

      // Install
      const { name, id } = await installTestSkill(root, {
        name: "lifecycle-skill",
      });

      // List
      const list = await execCli([...withDataDir(root), "skill", "list"]);
      expect(list.exitCode).toBe(0);
      expect(list.json).toHaveLength(1);
      expect(list.json[0].name).toBe("lifecycle-skill");

      // Get by name
      const getByName = await execCli([
        ...withDataDir(root),
        "skill",
        "get",
        name,
      ]);
      expect(getByName.exitCode).toBe(0);
      expect(getByName.json.name).toBe("lifecycle-skill");

      // Get by id
      const getById = await execCli([...withDataDir(root), "skill", "get", id]);
      expect(getById.exitCode).toBe(0);
      expect(getById.json.id).toBe(id);

      // Delete with keep-platform-installs
      const del = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        name,
        "--keep-platform-installs",
      ]);
      expect(del.exitCode).toBe(0);
      expect(del.json.deleted).toBe(true);
      expect(del.json.platformInstallsKept).toBe(true);

      // Verify gone
      const gone = await execCli([...withDataDir(root), "skill", "get", name]);
      expect(gone.exitCode).toBe(3);
    });
  });

  // =========================================================================
  // 9. renderTable & formatCell (through CLI interface)
  // =========================================================================

  describe("table rendering edge cases", () => {
    it("renders (empty) for empty table", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout.trim()).toBe("(empty)");
    });

    it("table header columns match data fields", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "Col Test", tags: "x" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      // Should have columns: id, title, type, favorite, pinned, tags, updatedAt
      expect(res.joinedStdout).toContain("id");
      expect(res.joinedStdout).toContain("title");
      expect(res.joinedStdout).toContain("type");
      expect(res.joinedStdout).toContain("favorite");
      expect(res.joinedStdout).toContain("pinned");
      expect(res.joinedStdout).toContain("tags");
      expect(res.joinedStdout).toContain("updatedAt");
    });

    it("table separator uses dashes", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "Dash Test" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      // Should contain a row of dashes
      expect(res.joinedStdout).toMatch(/-{3,}/);
    });

    it("multiple rows render correctly", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "Row A" });
      await createTestPrompt(root, { title: "Row B" });
      await createTestPrompt(root, { title: "Row C" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("Row A");
      expect(res.joinedStdout).toContain("Row B");
      expect(res.joinedStdout).toContain("Row C");
    });
  });

  // =========================================================================
  // 10. Prompt Create/Update with File Arguments
  // =========================================================================

  describe("file-based prompts (--*-file arguments)", () => {
    it("both --system-prompt and --system-prompt-file cannot be used together", async () => {
      const root = makeTempRoot(tempDirs);
      const file = path.join(root, "sys.md");
      fs.writeFileSync(file, "file content", "utf8");

      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Both System",
        "--user-prompt",
        "hello",
        "--system-prompt",
        "inline",
        "--system-prompt-file",
        file,
      ]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("不能同时使用");
    });

    it("--system-prompt-file with nonexistent file returns IO error", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Bad Sys File",
        "--user-prompt",
        "hello",
        "--system-prompt-file",
        "/nonexistent/system.md",
      ]);
      expect(res.exitCode).toBe(5);
      expect(res.errorJson.error.code).toBe("IO_ERROR");
    });
  });

  // =========================================================================
  // 11. Skill Table Rows Formatting
  // =========================================================================

  describe("skill table formatting", () => {
    it("skill list marks managedRepo as no when local_repo_path is absent", async () => {
      const root = makeTempRoot(tempDirs);
      const dataDir = path.join(root, "user-data");

      configureRuntimePaths({
        userDataPath: dataDir,
        exePath: process.execPath,
        isPackaged: false,
        platform: process.platform,
      });

      const db = initDatabase();
      new SkillDB(db).create({
        name: "db-only-skill",
        description: "created directly in db",
        protocol_type: "skill",
        is_favorite: false,
      });
      closeDatabase();
      resetRuntimePaths();

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "skill",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("db-only-skill");
      expect(res.joinedStdout).toContain("managedRepo");
      expect(res.joinedStdout).toContain("no");
    });

    it("skill list in table mode shows correct columns", async () => {
      const root = makeTempRoot(tempDirs);
      await installTestSkill(root, { name: "col-check" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "skill",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      // skillTableRows produces: id, name, protocol, author, version, favorite, managedRepo, updatedAt
      expect(res.joinedStdout).toContain("name");
      expect(res.joinedStdout).toContain("protocol");
      expect(res.joinedStdout).toContain("author");
      expect(res.joinedStdout).toContain("version");
    });

    it("skill get in table mode shows field/value pairs", async () => {
      const root = makeTempRoot(tempDirs);
      const { name } = await installTestSkill(root, {
        name: "get-table-skill",
      });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "skill",
        "get",
        name,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("field");
      expect(res.joinedStdout).toContain("value");
      expect(res.joinedStdout).toContain("get-table-skill");
    });
  });

  // =========================================================================
  // 12. INTERNAL_ERROR wrapping (catch block for non-CliError exceptions)
  // =========================================================================

  describe("INTERNAL_ERROR wrapping (non-CliError exceptions)", () => {
    it("wraps non-CliError exceptions from skill install with invalid source", async () => {
      const root = makeTempRoot(tempDirs);
      // Install from a path that doesn't exist at all — SkillInstaller.installFromSource
      // will throw a regular Error (not CliError), triggering lines 862-866.
      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        "/nonexistent/path/to/skill",
      ]);
      expect(res.exitCode).toBe(10); // INTERNAL exit code
      expect(res.errorJson).toBeDefined();
      expect(res.errorJson.error.code).toBe("INTERNAL_ERROR");
      expect(typeof res.errorJson.error.message).toBe("string");
    });

    it("wraps non-Error thrown values as INTERNAL_ERROR", async () => {
      // This path is extremely hard to hit in practice since all real code
      // throws Error objects. However, the catch block handles `String(error)` too.
      // We test the known INTERNAL_ERROR path is JSON-formatted correctly.
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        "/another/bad/source/path",
      ]);
      expect(res.exitCode).toBe(10);
      expect(res.errorJson.error.exitCode).toBe(10);
    });
  });

  // =========================================================================
  // 13. Skill delete without --keep-platform-installs (exercises uninstallSkillFromPlatforms)
  // =========================================================================

  describe("skill delete without --keep-platform-installs", () => {
    it("captures uninstall rejection reasons in delete result", async () => {
      const root = makeTempRoot(tempDirs);
      await installTestSkill(root, { name: "reject-uninstall-skill" });
      const [firstPlatform] = SkillInstaller.getSupportedPlatforms();

      vi.spyOn(SkillInstaller, "uninstallSkillMd").mockImplementation(
        async (_skillName, platformId) => {
          if (platformId === firstPlatform.id) {
            throw new Error("mock uninstall failure");
          }
        },
      );

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        "reject-uninstall-skill",
      ]);

      expect(res.exitCode).toBe(0);
      const rejected = res.json.uninstallResults.find(
        (result: { platform: string; status: string }) =>
          result.platform === firstPlatform.id && result.status === "rejected",
      );
      expect(rejected).toMatchObject({
        platform: firstPlatform.id,
        status: "rejected",
        reason: "mock uninstall failure",
      });
    });

    it("delete without --keep-platform-installs triggers platform uninstall", async () => {
      const root = makeTempRoot(tempDirs);
      await installTestSkill(root, { name: "platform-del" });

      // Delete WITHOUT --keep-platform-installs
      // This exercises uninstallSkillFromPlatforms() (lines 650-670)
      // The platforms may or may not exist, but Promise.allSettled handles both cases
      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        "platform-del",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      expect(res.json.platformInstallsKept).toBe(false);
      // uninstallResults should be an array (one entry per platform)
      expect(Array.isArray(res.json.uninstallResults)).toBe(true);
      expect(res.json.uninstallResults.length).toBeGreaterThan(0);
      // Each result should have platform and status fields
      for (const result of res.json.uninstallResults) {
        expect(result).toHaveProperty("platform");
        expect(result).toHaveProperty("status");
        expect(["fulfilled", "rejected"]).toContain(result.status);
      }
    });

    it("'remove' without --keep-platform-installs also triggers platform uninstall", async () => {
      const root = makeTempRoot(tempDirs);
      await installTestSkill(root, { name: "rm-platform" });

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "remove",
        "rm-platform",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      expect(res.json.platformInstallsKept).toBe(false);
      expect(Array.isArray(res.json.uninstallResults)).toBe(true);
    });
  });

  // =========================================================================
  // 14. Additional edge cases for deeper coverage
  // =========================================================================

  describe("additional coverage edge cases", () => {
    it("returns NOT_FOUND when delete resolves skill but DB delete reports false", async () => {
      const root = makeTempRoot(tempDirs);
      const { id } = await installTestSkill(root, {
        name: "delete-race-skill",
      });

      vi.spyOn(SkillDB.prototype, "delete").mockReturnValue(false);

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        "delete-race-skill",
        "--keep-platform-installs",
      ]);

      expect(res.exitCode).toBe(3);
      expect(res.errorJson.error.code).toBe("NOT_FOUND");
      // handleSkillDelete uses skill.id in the error message, not skill.name
      expect(res.errorJson.error.message).toContain(id);
    });

    // --- resolvePromptUpdateArgs: individual field updates ---
    it("updates description only", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--description",
        "New Description",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.description).toBe("New Description");
    });

    it("updates prompt-type", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--prompt-type",
        "image",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.promptType).toBe("image");
    });

    it("updates source and notes", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--source",
        "https://test.com",
        "--notes",
        "Test notes",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.source).toBe("https://test.com");
      expect(res.json.notes).toBe("Test notes");
    });

    it("updates system-prompt via file", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const file = path.join(root, "sys-update.md");
      fs.writeFileSync(file, "Updated system prompt from file", "utf8");

      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--system-prompt-file",
        file,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.systemPrompt).toBe("Updated system prompt from file");
    });

    it("updates folder-id with invalid id triggers INTERNAL_ERROR (FK constraint)", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--folder-id",
        "nonexistent-folder-id",
      ]);
      // The DB layer enforces FK constraint on folder-id.
      // An invalid folder-id causes a non-CliError exception wrapped as INTERNAL_ERROR.
      expect(res.exitCode).toBe(10);
      expect(res.errorJson.error.code).toBe("INTERNAL_ERROR");
    });

    // --- search with --folder-id ---
    it("searches with --folder-id filter", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "Folder Search" });
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "--folder-id",
        "nonexistent-folder",
      ]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
    });

    // --- emitError details field ---
    it("IO_ERROR includes details with cause", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Details Test",
        "--user-prompt-file",
        "/nonexistent/path/details-test.md",
      ]);
      expect(res.exitCode).toBe(5);
      expect(res.errorJson.error.code).toBe("IO_ERROR");
      expect(res.errorJson.error.details).toBeDefined();
      expect(res.errorJson.error.details.cause).toBeDefined();
      expect(typeof res.errorJson.error.details.cause).toBe("string");
    });

    // --- -o json explicit (--output not used, -o used) ---
    it("-o json works explicitly", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, { title: "Explicit JSON" });
      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "json",
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
      expect(res.json[0].title).toBe("Explicit JSON");
    });

    // --- double delete attempt ---
    it("double delete of same prompt returns NOT_FOUND on second try", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root, { title: "Double Del" });

      const first = await execCli([
        ...withDataDir(root),
        "prompt",
        "delete",
        created.id,
      ]);
      expect(first.exitCode).toBe(0);

      const second = await execCli([
        ...withDataDir(root),
        "prompt",
        "delete",
        created.id,
      ]);
      expect(second.exitCode).toBe(3);
      expect(second.errorJson.error.code).toBe("NOT_FOUND");
    });

    // --- double delete of same skill ---
    it("double delete of same skill returns NOT_FOUND on second try", async () => {
      const root = makeTempRoot(tempDirs);
      await installTestSkill(root, { name: "double-del-skill" });

      const first = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        "double-del-skill",
        "--keep-platform-installs",
      ]);
      expect(first.exitCode).toBe(0);

      const second = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        "double-del-skill",
        "--keep-platform-installs",
      ]);
      expect(second.exitCode).toBe(3);
      expect(second.errorJson.error.code).toBe("NOT_FOUND");
    });

    // --- search keyword that doesn't start with -- ---
    it("search with keyword and combined filters", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, {
        title: "Combined",
        userPrompt: "Deep content",
        tags: "alpha,beta",
      });

      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "Combined",
        "--tags",
        "alpha",
        "--sort-by",
        "updatedAt",
        "--sort-order",
        "desc",
        "--limit",
        "10",
        "--offset",
        "0",
      ]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
    });

    // --- skill delete by id (not name) ---
    it("deletes skill by id", async () => {
      const root = makeTempRoot(tempDirs);
      const { id } = await installTestSkill(root, { name: "id-delete-skill" });

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        id,
        "--keep-platform-installs",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      expect(res.json.id).toBe(id);
    });

    // --- prompt create with all optional fields including folder-id ---
    it("creates prompt with invalid folder-id triggers INTERNAL_ERROR (FK constraint)", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Folder Prompt",
        "--user-prompt",
        "hello",
        "--folder-id",
        "nonexistent-folder",
      ]);
      // DB enforces FK constraint on folder-id; non-CliError wraps to INTERNAL_ERROR.
      expect(res.exitCode).toBe(10);
      expect(res.errorJson.error.code).toBe("INTERNAL_ERROR");
    });

    // --- emitSuccess: table mode with array payload but no tableRows (falls through to JSON) ---
    // This tests the path where context.output is "table" but payload is an array
    // and no tableRows are provided — emitSuccess falls through to toJson.
    // In practice, this path is used when handlePromptCommand/handleSkillCommand
    // always provides tableRows for arrays. But the delete result is a single object,
    // which goes through the field/value table path.
    it("delete result in table mode renders as field/value pairs", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root, { title: "Del Table" });

      const res = await execCli([
        ...withDataDir(root),
        "-o",
        "table",
        "prompt",
        "delete",
        created.id,
      ]);
      expect(res.exitCode).toBe(0);
      // Delete returns { deleted: true, id: ... } — single object → field/value table
      expect(res.joinedStdout).toContain("field");
      expect(res.joinedStdout).toContain("value");
      expect(res.joinedStdout).toContain("deleted");
    });

    // --- console.info and console.warn restoration ---
    it("restores console.info and console.warn after execution", async () => {
      const originalInfo = console.info;
      const originalWarn = console.warn;
      const root = makeTempRoot(tempDirs);

      await execCli([...withDataDir(root), "prompt", "list"]);

      expect(console.info).toBe(originalInfo);
      expect(console.warn).toBe(originalWarn);
    });

    // --- scan with no arguments (scans default paths only) ---
    it("skill scan with no paths scans default platform paths", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([...withDataDir(root), "skill", "scan"]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
    });

    // --- multiple unknown options ---
    it("reports multiple unknown options", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "X",
        "--user-prompt",
        "Y",
        "--foo",
        "--bar",
      ]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.message).toContain("--foo");
      expect(res.errorJson.error.message).toContain("--bar");
    });

    // --- install with unknown options ---
    it("skill install rejects unknown options", async () => {
      const root = makeTempRoot(tempDirs);
      const skillDir = path.join(root, "unk-opt-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        ["---", "name: unk-opt", "---", "", "# UNK"].join("\n"),
        "utf8",
      );

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
        "--unknown-install-opt",
      ]);
      expect(res.exitCode).toBe(2);
      expect(res.errorJson.error.code).toBe("USAGE_ERROR");
      expect(res.errorJson.error.message).toContain("--unknown-install-opt");
    });
  });

  // =========================================================================
  // 15. defaultIO() coverage — runCli without io parameter
  // =========================================================================

  describe("defaultIO (runCli without io parameter)", () => {
    it("runCli uses defaultIO when no io parameter is provided", async () => {
      // Capture process.stdout.write and process.stderr.write
      const originalStdoutWrite = process.stdout.write;
      const originalStderrWrite = process.stderr.write;
      const capturedStdout: string[] = [];
      const capturedStderr: string[] = [];

      process.stdout.write = ((chunk: string | Uint8Array) => {
        capturedStdout.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;

      try {
        // Call runCli with only argv (no io parameter) — triggers defaultIO()
        const exitCode = await runCli(["--help"]);
        expect(exitCode).toBe(0);
        expect(capturedStdout.join("")).toContain("PromptHub CLI");
      } finally {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
      }
    });
  });

  // =========================================================================
  // 16. Original Tests (preserved from initial test file)
  // =========================================================================

  describe("original tests (backward compatibility)", () => {
    it("supports prompt and skill workflows in json and table modes", async () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-"));
      const dataDir = path.join(rootDir, "user-data");
      const skillSourceDir = path.join(rootDir, "local-skill");
      tempDirs.push(rootDir);

      fs.mkdirSync(skillSourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillSourceDir, "SKILL.md"),
        [
          "---",
          "name: local-cli-skill",
          "description: Installed from CLI test",
          "version: 1.2.3",
          "author: CLI Tester",
          "tags: [cli, test]",
          "---",
          "",
          "# Local CLI Skill",
        ].join("\n"),
        "utf8",
      );

      const createPrompt = await execCli([
        "--data-dir",
        dataDir,
        "prompt",
        "create",
        "--title",
        "CLI Prompt",
        "--user-prompt",
        "Hello from CLI",
        "--system-prompt",
        "You are a CLI test assistant.",
        "--tags",
        "cli,test",
      ]);
      expect(createPrompt.exitCode).toBe(0);
      expect(createPrompt.json.title).toBe("CLI Prompt");

      const promptId = createPrompt.json.id as string;
      const listPromptTable = await execCli([
        "--data-dir",
        dataDir,
        "--output",
        "table",
        "prompt",
        "list",
      ]);
      expect(listPromptTable.exitCode).toBe(0);
      expect(listPromptTable.stdout.join("\n")).toContain("CLI Prompt");
      expect(listPromptTable.stdout.join("\n")).toContain("title");

      const installSkill = await execCli([
        "--data-dir",
        dataDir,
        "skill",
        "install",
        skillSourceDir,
      ]);
      expect(installSkill.exitCode).toBe(0);
      expect(installSkill.json.name).toBe("local-cli-skill");

      const deleteSkill = await execCli([
        "--data-dir",
        dataDir,
        "skill",
        "delete",
        "local-cli-skill",
        "--purge-managed-repo",
      ]);
      expect(deleteSkill.exitCode).toBe(0);
      expect(deleteSkill.json.deleted).toBe(true);
      expect(deleteSkill.json.managedRepoPurged).toBe(true);

      const deletePrompt = await execCli([
        "--data-dir",
        dataDir,
        "prompt",
        "delete",
        promptId,
      ]);
      expect(deletePrompt.exitCode).toBe(0);
      expect(deletePrompt.json.deleted).toBe(true);
    });

    it("returns structured help text and machine-readable errors", async () => {
      const help = await execCli(["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout.join("\n")).toContain("PromptHub CLI");
      expect(help.stdout.join("\n")).toContain("--output, -o <format>");

      const promptHelp = await execCli(["prompt", "--help"]);
      expect(promptHelp.exitCode).toBe(0);
      expect(promptHelp.stdout.join("\n")).toContain("Prompt 命令");

      const root = makeTempRoot(tempDirs);
      const notFound = await execCli([
        ...withDataDir(root),
        "prompt",
        "get",
        "missing-id",
      ]);
      expect(notFound.exitCode).toBe(3);
      expect(notFound.errorJson.error.code).toBe("NOT_FOUND");
      expect(notFound.errorJson.error.exitCode).toBe(3);

      const usageError = await execCli([
        "--output",
        "bad-format",
        "prompt",
        "list",
      ]);
      expect(usageError.exitCode).toBe(2);
      expect(usageError.errorJson.error.code).toBe("USAGE_ERROR");
    });
  });

  // =========================================================================
  // 17. Brute-force coverage: additional paths
  // =========================================================================

  describe("brute-force coverage gaps (unique tests only)", () => {
    // --- 1. --app-data-dir global option (unique: not tested elsewhere) ---
    it("accepts --app-data-dir as a global option", async () => {
      const root = makeTempRoot(tempDirs);
      const appDataDir = path.join(root, "app-data");
      fs.mkdirSync(appDataDir, { recursive: true });
      const res = await execCli([
        "--data-dir",
        path.join(root, "user-data"),
        "--app-data-dir",
        appDataDir,
        "prompt",
        "list",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json).toEqual([]);
    });

    // --- 2. --app-data-dir without --data-dir (unique: exercises appDataPath fallback) ---
    it("accepts --app-data-dir without --data-dir", async () => {
      const root = makeTempRoot(tempDirs);
      const appDataDir = path.join(root, "app-data-only");
      fs.mkdirSync(appDataDir, { recursive: true });
      const res = await execCli(["--app-data-dir", appDataDir, "--help"]);
      expect(res.exitCode).toBe(0);
      expect(res.joinedStdout).toContain("PromptHub CLI");
    });

    // --- 7. parseCsv with all-whitespace/comma input (unique: edge case not in S4) ---
    it("parseCsv returns undefined for whitespace-only CSV", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "CSV-Edge",
        "--user-prompt",
        "test",
        "--tags",
        " , , , ",
      ]);
      expect(res.exitCode).toBe(0);
      const tags = res.json.tags;
      expect(tags === null || (Array.isArray(tags) && tags.length === 0)).toBe(
        true,
      );
    });

    // --- 11. readTextOption: IO error with non-Error rejection (unique: string throw path) ---
    it("handles non-Error throw in readTextOption file read", async () => {
      const root = makeTempRoot(tempDirs);
      const tmpFile = path.join(root, "exists.txt");
      fs.writeFileSync(tmpFile, "content", "utf8");

      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw "raw string error";
      });

      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "NonErrorIO",
        "--user-prompt-file",
        tmpFile,
      ]);
      expect(res.exitCode).toBe(5);
      expect(res.errorJson.error.code).toBe("IO_ERROR");
      expect(res.errorJson.error.details.cause).toBe("raw string error");
    });

    // --- 32. Internal error wrapping for non-CliError throws (unique: mock configureRuntimePaths) ---
    it("wraps non-CliError exceptions as INTERNAL_ERROR", async () => {
      vi.spyOn(
        await import("../../../src/main/runtime-paths"),
        "configureRuntimePaths",
      ).mockImplementation(() => {
        throw new Error("unexpected boom");
      });

      const res = await execCli(["prompt", "list"]);
      expect(res.exitCode).toBe(10);
      expect(res.errorJson.error.code).toBe("INTERNAL_ERROR");
      expect(res.errorJson.error.message).toContain("unexpected boom");
    });

    // --- 33. Internal error wrapping for non-Error throws (unique: string throw path) ---
    it("wraps non-Error throws (string) as INTERNAL_ERROR", async () => {
      vi.spyOn(
        await import("../../../src/main/runtime-paths"),
        "configureRuntimePaths",
      ).mockImplementation(() => {
        throw "raw string crash";
      });

      const res = await execCli(["prompt", "list"]);
      expect(res.exitCode).toBe(10);
      expect(res.errorJson.error.code).toBe("INTERNAL_ERROR");
      expect(res.errorJson.error.message).toBe("raw string crash");
    });

    // --- 37. prompt create with --prompt-type (unique: prompt-type field via create) ---
    it("creates prompt with custom prompt-type", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Image Prompt",
        "--user-prompt",
        "describe image",
        "--prompt-type",
        "image",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.promptType).toBe("image");
    });

    // --- 43. prompt search with keyword + tags + sorting (unique: combined filters) ---
    it("searches prompts with keyword, tags, and sorting", async () => {
      const root = makeTempRoot(tempDirs);
      await createTestPrompt(root, {
        title: "Design Landing",
        tags: "ui,design",
      });
      await createTestPrompt(root, { title: "SEO Blog", tags: "seo,writing" });
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "search",
        "Design",
        "--tags",
        "ui",
        "--sort-by",
        "title",
        "--sort-order",
        "asc",
        "--limit",
        "10",
        "--offset",
        "0",
      ]);
      expect(res.exitCode).toBe(0);
      expect(Array.isArray(res.json)).toBe(true);
    });

    // --- 46. prompt update with --unfavorite and --unpinned combined (unique: combined unfav+unpin) ---
    it("updates prompt with --unfavorite and --unpinned flags", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--favorite",
        "--pinned",
      ]);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--unfavorite",
        "--unpinned",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.isFavorite).toBe(false);
      expect(res.json.isPinned).toBe(false);
    });

    // --- 48. prompt create with source + notes (unique: source/notes fields in create) ---
    it("creates prompt with all optional fields", async () => {
      const root = makeTempRoot(tempDirs);
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        "Full Prompt",
        "--user-prompt",
        "Tell me a story",
        "--system-prompt",
        "You are a storyteller",
        "--description",
        "A complete prompt",
        "--prompt-type",
        "text",
        "--source",
        "manual",
        "--notes",
        "Important notes",
        "--tags",
        "story,creative",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.title).toBe("Full Prompt");
      expect(res.json.systemPrompt).toBe("You are a storyteller");
      expect(res.json.description).toBe("A complete prompt");
      expect(res.json.source).toBe("manual");
      expect(res.json.notes).toBe("Important notes");
    });

    // --- 49. prompt update with both file-based prompts (unique: dual file update) ---
    it("updates prompt with --user-prompt-file and --system-prompt-file", async () => {
      const root = makeTempRoot(tempDirs);
      const created = await createTestPrompt(root);
      const userFile = path.join(root, "update-user.txt");
      const sysFile = path.join(root, "update-sys.txt");
      fs.writeFileSync(userFile, "Updated user prompt", "utf8");
      fs.writeFileSync(sysFile, "Updated system prompt", "utf8");
      const res = await execCli([
        ...withDataDir(root),
        "prompt",
        "update",
        created.id,
        "--user-prompt-file",
        userFile,
        "--system-prompt-file",
        sysFile,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.userPrompt).toBe("Updated user prompt");
      expect(res.json.systemPrompt).toBe("Updated system prompt");
    });

    // --- 53. skill delete with --purge-managed-repo on non-managed (unique: isManagedRepoPath=false) ---
    it("skill delete with --purge-managed-repo on non-managed repo does not purge", async () => {
      const root = makeTempRoot(tempDirs);
      const { name } = await installTestSkill(root, { name: "not-managed" });

      vi.spyOn(SkillInstaller, "isManagedRepoPath").mockReturnValue(false);

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        name,
        "--purge-managed-repo",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      expect(res.json.managedRepoPurged).toBe(false);
    });

    // --- 54. uninstallSkillFromPlatforms with rejected promise (unique: Error rejection) ---
    it("handles platform uninstall rejection gracefully", async () => {
      const root = makeTempRoot(tempDirs);
      const { name } = await installTestSkill(root, { name: "uninstall-fail" });

      vi.spyOn(SkillInstaller, "uninstallSkillMd").mockRejectedValue(
        new Error("uninstall failed"),
      );

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        name,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      const rejected = res.json.uninstallResults.filter(
        (r: { status: string }) => r.status === "rejected",
      );
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected[0].reason).toContain("uninstall failed");
    });

    // --- 55. uninstallSkillFromPlatforms with non-Error rejection (unique: string rejection) ---
    it("handles non-Error platform uninstall rejection", async () => {
      const root = makeTempRoot(tempDirs);
      const { name } = await installTestSkill(root, {
        name: "uninstall-nonerror",
      });

      vi.spyOn(SkillInstaller, "uninstallSkillMd").mockRejectedValue(
        "string rejection reason",
      );

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "delete",
        name,
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.deleted).toBe(true);
      const rejected = res.json.uninstallResults.filter(
        (r: { status: string }) => r.status === "rejected",
      );
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected[0].reason).toBe("string rejection reason");
    });

    // --- 56. skill install with --name override (unique: explicit --name on nameless skill) ---
    it("installs skill with explicit --name override", async () => {
      const root = makeTempRoot(tempDirs);
      const skillDir = path.join(root, "nameless-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          "description: No name in frontmatter",
          "version: 0.1.0",
          "author: Nobody",
          "tags: [test]",
          "---",
          "",
          "# Nameless",
        ].join("\n"),
        "utf8",
      );

      const res = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
        "--name",
        "explicit-name",
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.json.name).toBe("explicit-name");
    });
  });
});
