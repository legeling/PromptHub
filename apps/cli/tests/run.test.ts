import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDatabase } from "@prompthub/core";
import { createCliSkillService, runCli } from "@prompthub/core";
import type { SkillSafetyReport } from "@prompthub/shared/types";

function makeTempRoot(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-app-"));
  tempDirs.push(dir);
  return dir;
}

function withDataDir(rootDir: string): string[] {
  return ["--data-dir", path.join(rootDir, "user-data")];
}

async function withTempHome<T>(
  rootDir: string,
  run: (homeDir: string) => Promise<T>,
): Promise<T> {
  const originalHome = process.env.HOME;
  const homeDir = path.join(rootDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });

  try {
    process.env.HOME = homeDir;
    return await run(homeDir);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
}

async function execCli(
  args: string[],
  skillService?: ReturnType<typeof createCliSkillService>,
  ioOptions?: {
    stdin?: PassThrough;
    isInteractive?: boolean;
  },
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(
    args,
    {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
      ...ioOptions,
    },
    undefined,
    undefined,
    skillService,
  );

  const joinedStdout = stdout.join("\n");
  const joinedStderr = stderr.join("\n");
  const parseMaybeJson = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  return {
    exitCode,
    stdout,
    stderr,
    joinedStdout,
    joinedStderr,
    errorJson: parseMaybeJson(joinedStderr),
    json: parseMaybeJson(joinedStdout),
  };
}

describe("standalone cli wiring", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("shows root help", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["--help"], {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("PromptHub CLI");
    expect(stderr).toEqual([]);
  });

  it("shows the cli version", async () => {
    const result = await execCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.joinedStdout.trim()).toBe("0.5.9-beta.2");
    expect(result.stderr).toEqual([]);
  });

  it("returns a usage error when --data-dir has no value", async () => {
    const result = await execCli(["--data-dir"]);

    expect(result.exitCode).toBe(2);
    expect(result.errorJson.error.code).toBe("USAGE_ERROR");
    expect(result.errorJson.error.message).toContain("--data-dir");
  });

  it("supports prompt create and list in an isolated data dir", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "CLI Prompt",
      "--user-prompt",
      "Hello CLI",
    ]);
    expect(createRes.exitCode).toBe(0);

    const listRes = await execCli([...withDataDir(root), "prompt", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json).toHaveLength(1);
    expect(listRes.json[0].title).toBe("CLI Prompt");
  });

  it("copies prompts by title query and reports ambiguous matches", async () => {
    const root = makeTempRoot(tempDirs);

    const seoRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "SEO Blog Writer",
      "--user-prompt",
      "Write for {{audience}}",
    ]);
    expect(seoRes.exitCode).toBe(0);

    const copyRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "copy",
      "seo blog",
      "--var",
      "audience=developers",
    ]);
    expect(copyRes.exitCode).toBe(0);
    expect(copyRes.json.promptId).toBe(seoRes.json.id);
    expect(copyRes.json.content).toBe("Write for developers");

    const secondSeoRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "SEO Checklist",
      "--user-prompt",
      "Checklist",
    ]);
    expect(secondSeoRes.exitCode).toBe(0);

    const ambiguousRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "copy",
      "seo",
    ]);
    expect(ambiguousRes.exitCode).toBe(4);
    expect(ambiguousRes.errorJson.error.code).toBe("CONFLICT");
    expect(ambiguousRes.errorJson.error.details.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "SEO Blog Writer" }),
        expect.objectContaining({ title: "SEO Checklist" }),
      ]),
    );
  });

  it("selects prompts interactively when a query is ambiguous", async () => {
    const root = makeTempRoot(tempDirs);

    for (const title of ["Release Alpha", "Release Beta"]) {
      const createRes = await execCli([
        ...withDataDir(root),
        "prompt",
        "create",
        "--title",
        title,
        "--user-prompt",
        title,
      ]);
      expect(createRes.exitCode).toBe(0);
    }

    const stdin = new PassThrough();
    stdin.end("2\n");
    const copyRes = await execCli(
      [...withDataDir(root), "prompt", "copy", "release"],
      undefined,
      { stdin, isInteractive: true },
    );

    expect(copyRes.exitCode).toBe(0);
    expect(copyRes.joinedStderr).toContain("选择 Prompt");
    expect(copyRes.json.content).toBe("Release Beta");
  });

  it("reports empty MCP market templates without installing placeholders", async () => {
    const root = makeTempRoot(tempDirs);

    const marketRes = await execCli([...withDataDir(root), "mcp", "market"]);
    expect(marketRes.exitCode).toBe(0);
    expect(marketRes.json).toEqual([]);

    const sourcesRes = await execCli([...withDataDir(root), "mcp", "sources"]);
    expect(sourcesRes.exitCode).toBe(0);
    expect(
      sourcesRes.json.some(
        (source: { id: string }) => source.id === "prompthub-official",
      ),
    ).toBe(true);
    expect(
      sourcesRes.json.some(
        (source: { id: string }) => source.id === "modelcontextprotocol",
      ),
    ).toBe(true);

    const installRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "install",
      "up-to-date",
    ]);
    expect(installRes.exitCode).toBe(3);
    expect(installRes.errorJson.error).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("supports MCP market, import, env import, and health check in the shared library", async () => {
    const root = makeTempRoot(tempDirs);
    const mcpConfigPath = path.join(root, "mcp.json");
    const envPath = path.join(root, ".env");
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify({
        mcpServers: {
          docs: {
            command: process.execPath,
            args: ["server.js", "${API_TOKEN}"],
            env: { API_TOKEN: "" },
          },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      envPath,
      ["API_TOKEN=token-from-env", "UNRELATED_SECRET=skip-me"].join("\n"),
      "utf8",
    );

    const marketRes = await execCli([...withDataDir(root), "mcp", "market"]);
    expect(marketRes.exitCode).toBe(0);
    expect(marketRes.json).toEqual([]);

    const importRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "import",
      mcpConfigPath,
    ]);
    expect(importRes.exitCode).toBe(0);
    expect(importRes.json.imported[0].name).toBe("docs");

    const checkBefore = await execCli([
      ...withDataDir(root),
      "mcp",
      "check",
      "docs",
    ]);
    expect(checkBefore.exitCode).toBe(0);
    expect(checkBefore.json.status).toBe("error");
    expect(
      checkBefore.json.issues.some(
        (issue: { code: string; field?: string }) =>
          issue.code === "MISSING_ENV" && issue.field === "API_TOKEN",
      ),
    ).toBe(true);

    const envImportRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "env-import",
      "docs",
      "--file",
      envPath,
    ]);
    expect(envImportRes.exitCode).toBe(0);
    expect(envImportRes.json.importedKeys).toEqual(["API_TOKEN"]);
    expect(envImportRes.json.server.env).toEqual({
      API_TOKEN: "token-from-env",
    });

    const listRes = await execCli([...withDataDir(root), "mcp", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json[0]).toMatchObject({
      name: "docs",
      env: { API_TOKEN: "token-from-env" },
    });

    const exportRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "export",
      "--target",
      "codex",
      "--servers",
      "docs",
    ]);
    expect(exportRes.exitCode).toBe(0);
    expect(exportRes.joinedStdout).toContain("[mcp_servers.docs]");
    expect(exportRes.joinedStdout).toContain(
      `command = ${JSON.stringify(process.execPath)}`,
    );

    const disableRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "disable",
      "docs",
    ]);
    expect(disableRes.exitCode).toBe(0);
    expect(disableRes.json.enabled).toBe(false);

    const enableRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "enable",
      "docs",
    ]);
    expect(enableRes.exitCode).toBe(0);
    expect(enableRes.json.enabled).toBe(true);

    const jsonTargetPath = path.join(root, "target-mcp.json");
    fs.writeFileSync(
      jsonTargetPath,
      JSON.stringify({
        mcpServers: {
          docs: { command: "node", args: ["external.js"] },
        },
      }),
      "utf8",
    );
    const conflictRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "apply",
      "--target",
      "claude",
      "--path",
      jsonTargetPath,
      "--servers",
      "docs",
    ]);
    expect(conflictRes.exitCode).toBe(4);
    expect(conflictRes.errorJson.error.code).toBe("TARGET_CONFLICT");
    expect(
      JSON.parse(fs.readFileSync(jsonTargetPath, "utf8")).mcpServers.docs
        .command,
    ).toBe("node");

    const forcedJsonApplyRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "apply",
      "--target",
      "claude",
      "--path",
      jsonTargetPath,
      "--servers",
      "docs",
      "--force",
    ]);
    expect(forcedJsonApplyRes.exitCode).toBe(0);
    expect(forcedJsonApplyRes.json.overwrittenServerNames).toEqual(["docs"]);
    expect(
      JSON.parse(fs.readFileSync(jsonTargetPath, "utf8")).mcpServers.docs
        .command,
    ).toBe(process.execPath);

    const targetPath = path.join(root, "codex-config.toml");
    const applyRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "apply",
      "--target",
      "codex",
      "--path",
      targetPath,
      "--servers",
      "docs",
    ]);
    expect(applyRes.exitCode).toBe(0);
    expect(fs.readFileSync(targetPath, "utf8")).toContain("[mcp_servers.docs]");

    const removeRes = await execCli([
      ...withDataDir(root),
      "mcp",
      "remove",
      "--target",
      "codex",
      "--path",
      targetPath,
      "--servers",
      "docs",
    ]);
    expect(removeRes.exitCode).toBe(0);
    expect(removeRes.json.removedServerNames).toEqual(["docs"]);
    expect(fs.readFileSync(targetPath, "utf8")).not.toContain(
      "[mcp_servers.docs]",
    );
  });

  it("normalizes CSV tags by trimming whitespace and dropping empty items", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "CSV Prompt",
      "--user-prompt",
      "Hello CSV",
      "--tags",
      " tag1 , tag2 , , tag3 ",
    ]);

    expect(createRes.exitCode).toBe(0);
    expect(createRes.json.tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("rejects using inline and file system prompt inputs together", async () => {
    const root = makeTempRoot(tempDirs);
    const systemPromptFile = path.join(root, "system.md");
    fs.writeFileSync(systemPromptFile, "System prompt from file", "utf8");

    const result = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Prompt With Conflict",
      "--user-prompt",
      "Hello conflict",
      "--system-prompt",
      "Inline system prompt",
      "--system-prompt-file",
      systemPromptFile,
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.errorJson.error.code).toBe("USAGE_ERROR");
    expect(result.errorJson.error.message).toContain("不能同时使用");
  });

  it("supports the full prompt lifecycle", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Lifecycle Prompt",
      "--user-prompt",
      "Initial content",
      "--tags",
      "lifecycle,test",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    const updateRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "update",
      promptId,
      "--title",
      "Updated Lifecycle Prompt",
      "--favorite",
    ]);
    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json.title).toBe("Updated Lifecycle Prompt");
    expect(updateRes.json.isFavorite).toBe(true);

    const searchRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "search",
      "Lifecycle",
      "--favorite",
    ]);
    expect(searchRes.exitCode).toBe(0);
    expect(searchRes.json).toHaveLength(1);
    expect(searchRes.json[0].id).toBe(promptId);

    const deleteRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "delete",
      promptId,
    ]);
    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.deleted).toBe(true);

    const missingRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "get",
      promptId,
    ]);
    expect(missingRes.exitCode).toBe(3);
    expect(missingRes.errorJson.error.code).toBe("NOT_FOUND");
  });

  it("filters prompts by visibility scope and renders copied prompt variables", async () => {
    const root = makeTempRoot(tempDirs);

    await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Private Prompt",
      "--user-prompt",
      "Private body",
      "--visibility",
      "private",
    ]);

    const createSharedRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Shared Prompt",
      "--user-prompt",
      "Hello {{name}} from {{team}}",
      "--visibility",
      "shared",
    ]);
    expect(createSharedRes.exitCode).toBe(0);
    expect(createSharedRes.json.visibility).toBe("shared");

    const sharedOnlyRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "search",
      "--scope",
      "shared",
    ]);
    expect(sharedOnlyRes.exitCode).toBe(0);
    expect(sharedOnlyRes.json).toHaveLength(1);
    expect(sharedOnlyRes.json[0].title).toBe("Shared Prompt");

    const copyRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "copy",
      createSharedRes.json.id as string,
      "--var",
      "name=PromptHub",
      "--var",
      "team=CLI",
    ]);
    expect(copyRes.exitCode).toBe(0);
    expect(copyRes.json).toEqual({
      promptId: createSharedRes.json.id,
      content: "Hello PromptHub from CLI",
      usageCount: 1,
      variables: {
        name: "PromptHub",
        team: "CLI",
      },
    });
  });

  it("creates prompts with extended fields and variables", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Advanced Prompt",
      "--user-prompt",
      "Primary prompt",
      "--user-prompt-en",
      "English prompt",
      "--system-prompt",
      "System prompt",
      "--system-prompt-en",
      "English system",
      "--variables",
      JSON.stringify([
        {
          name: "topic",
          type: "text",
          required: true,
          label: "Topic",
        },
      ]),
      "--images",
      "cover.png,hero.png",
      "--videos",
      "demo.mp4",
      "--notes",
      "Important notes",
      "--source",
      "https://example.com/source",
    ]);

    expect(createRes.exitCode).toBe(0);
    expect(createRes.json.userPromptEn).toBe("English prompt");
    expect(createRes.json.systemPromptEn).toBe("English system");
    expect(createRes.json.images).toEqual(["cover.png", "hero.png"]);
    expect(createRes.json.videos).toEqual(["demo.mp4"]);
    expect(createRes.json.variables).toEqual([
      {
        name: "topic",
        type: "text",
        required: true,
        label: "Topic",
      },
    ]);
  });

  it("duplicates a prompt with copied content", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Original Prompt",
      "--user-prompt",
      "Original body",
      "--tags",
      "copy,test",
    ]);
    expect(createRes.exitCode).toBe(0);

    const duplicateRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "duplicate",
      createRes.json.id as string,
    ]);

    expect(duplicateRes.exitCode).toBe(0);
    expect(duplicateRes.json.title).toBe("Original Prompt (Duplicate)");
    expect(duplicateRes.json.userPrompt).toBe("Original body");
    expect(duplicateRes.json.tags).toEqual(["copy", "test"]);
  });

  it("lists prompt versions after content updates", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Versioned Prompt",
      "--user-prompt",
      "Initial version",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    const updateRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "update",
      promptId,
      "--user-prompt",
      "Updated version",
    ]);
    expect(updateRes.exitCode).toBe(0);

    const versionsRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "versions",
      promptId,
    ]);

    expect(versionsRes.exitCode).toBe(0);
    expect(versionsRes.json).toHaveLength(2);
    expect(versionsRes.json[0].version).toBe(2);
    expect(versionsRes.json[1].version).toBe(1);
  });

  it("creates and deletes a manual prompt version", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Manual Version Prompt",
      "--user-prompt",
      "Initial body",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    const createVersionRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create-version",
      promptId,
      "--note",
      "Named snapshot",
    ]);
    expect(createVersionRes.exitCode).toBe(0);
    expect(createVersionRes.json.note).toBe("Named snapshot");

    const deleteVersionRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "delete-version",
      promptId,
      createVersionRes.json.id as string,
    ]);
    expect(deleteVersionRes.exitCode).toBe(0);
    expect(deleteVersionRes.json.deleted).toBe(true);
  });

  it("shows diffs between prompt versions", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Diff Prompt",
      "--user-prompt",
      "Version A",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    await execCli([
      ...withDataDir(root),
      "prompt",
      "update",
      promptId,
      "--user-prompt",
      "Version B",
      "--last-ai-response",
      "AI result B",
    ]);

    const diffRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "diff",
      promptId,
      "--from",
      "1",
      "--to",
      "2",
    ]);

    expect(diffRes.exitCode).toBe(0);
    expect(diffRes.json.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "userPrompt",
          from: "Version A",
          to: "Version B",
        }),
      ]),
    );
  });

  it("rolls back a prompt to a previous version", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Rollback Prompt",
      "--user-prompt",
      "Version one",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    const updateRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "update",
      promptId,
      "--user-prompt",
      "Version two",
    ]);
    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json.userPrompt).toBe("Version two");

    const rollbackRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "rollback",
      promptId,
      "--version",
      "1",
    ]);

    expect(rollbackRes.exitCode).toBe(0);
    expect(rollbackRes.json.userPrompt).toBe("Version one");
    expect(rollbackRes.json.currentVersion).toBeGreaterThanOrEqual(3);
  });

  it("increments usage count when prompt use is invoked", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Usage Prompt",
      "--user-prompt",
      "Track me",
    ]);
    expect(createRes.exitCode).toBe(0);
    const promptId = createRes.json.id as string;

    const useRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "use",
      promptId,
    ]);

    expect(useRes.exitCode).toBe(0);
    expect(useRes.json.usageCount).toBe(1);
  });

  it("lists, renames, and deletes prompt tags", async () => {
    const root = makeTempRoot(tempDirs);

    await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Tag Prompt",
      "--user-prompt",
      "Tag me",
      "--tags",
      "alpha,beta",
    ]);

    const listTagsRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "list-tags",
    ]);
    expect(listTagsRes.exitCode).toBe(0);
    expect(listTagsRes.json).toEqual(["alpha", "beta"]);

    const renameTagRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "rename-tag",
      "alpha",
      "gamma",
    ]);
    expect(renameTagRes.exitCode).toBe(0);
    expect(renameTagRes.json.renamed).toBe(true);

    const deleteTagRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "delete-tag",
      "beta",
    ]);
    expect(deleteTagRes.exitCode).toBe(0);
    expect(deleteTagRes.json.deleted).toBe(true);

    const promptListRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "list",
    ]);
    expect(promptListRes.exitCode).toBe(0);
    expect(promptListRes.json[0].tags).toEqual(["gamma"]);
  });

  it("updates advanced prompt fields", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Updatable Prompt",
      "--user-prompt",
      "Original",
    ]);
    expect(createRes.exitCode).toBe(0);

    const updateRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "update",
      createRes.json.id as string,
      "--user-prompt-en",
      "English update",
      "--variables",
      JSON.stringify([
        {
          name: "audience",
          type: "select",
          required: false,
          options: ["dev", "ops"],
        },
      ]),
      "--images",
      "updated.png",
      "--videos",
      "updated.mp4",
      "--usage-count",
      "7",
      "--last-ai-response",
      "Latest answer",
    ]);

    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json.userPromptEn).toBe("English update");
    expect(updateRes.json.usageCount).toBe(7);
    expect(updateRes.json.lastAiResponse).toBe("Latest answer");
    expect(updateRes.json.images).toEqual(["updated.png"]);
    expect(updateRes.json.videos).toEqual(["updated.mp4"]);
    expect(updateRes.json.variables).toEqual([
      {
        name: "audience",
        type: "select",
        required: false,
        options: ["dev", "ops"],
      },
    ]);
  });

  it("returns usage error when rollback omits --version", async () => {
    const root = makeTempRoot(tempDirs);

    const createRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "create",
      "--title",
      "Missing Version Prompt",
      "--user-prompt",
      "Hello",
    ]);
    expect(createRes.exitCode).toBe(0);

    const rollbackRes = await execCli([
      ...withDataDir(root),
      "prompt",
      "rollback",
      createRes.json.id as string,
    ]);

    expect(rollbackRes.exitCode).toBe(2);
    expect(rollbackRes.errorJson.error.code).toBe("USAGE_ERROR");
  });

  it("renders empty table output for prompt list", async () => {
    const root = makeTempRoot(tempDirs);

    const result = await execCli([
      ...withDataDir(root),
      "-o",
      "table",
      "prompt",
      "list",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.joinedStdout).toContain("(empty)");
  });

  it("installs a local skill from JSON", async () => {
    const root = makeTempRoot(tempDirs);
    const skillJsonPath = path.join(root, "skill.json");
    fs.writeFileSync(
      skillJsonPath,
      JSON.stringify(
        {
          name: "json-skill",
          description: "Imported from json",
          version: "1.2.3",
          author: "CLI Test",
          instructions: "# JSON Skill",
          tags: ["json"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      [...withDataDir(root), "skill", "install", skillJsonPath],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join("\n")).name).toBe("json-skill");
  });

  it("does not silently truncate long local JSON skill fields", async () => {
    const root = makeTempRoot(tempDirs);
    const skillJsonPath = path.join(root, "long-skill.json");
    const longDescription = `desc-${"d".repeat(12_000)}`;
    const longInstructions = `# Long JSON Skill\n\n${"Keep this content.\n".repeat(700)}done`;
    const longTag = `tag-${"x".repeat(180)}`;
    const longSourceUrl = `https://example.com/${"path/".repeat(300)}`;

    fs.writeFileSync(
      skillJsonPath,
      JSON.stringify(
        {
          name: "long-json-skill",
          description: longDescription,
          version: `1.0.0-${"v".repeat(300)}`,
          author: `author-${"a".repeat(300)}`,
          instructions: longInstructions,
          tags: [longTag],
          source_url: longSourceUrl,
        },
        null,
        2,
      ),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillJsonPath,
    ]);
    expect(installRes.exitCode).toBe(0);

    const exportRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "long-json-skill",
      "--format",
      "json",
    ]);

    expect(exportRes.exitCode).toBe(0);
    expect(exportRes.json.description).toBe(longDescription);
    expect(exportRes.json.version).toBe(`1.0.0-${"v".repeat(300)}`);
    expect(exportRes.json.author).toBe(`author-${"a".repeat(300)}`);
    expect(exportRes.json.instructions).toBe(longInstructions);
    expect(exportRes.json.tags).toEqual([longTag]);
    expect(exportRes.json.source_url).toBe(longSourceUrl);
  });

  it("scans a custom local skill directory", async () => {
    const root = makeTempRoot(tempDirs);
    const scanRoot = path.join(root, "scan-root");
    const skillDir = path.join(scanRoot, "writer-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: writer-skill",
        "description: Skill scan target",
        "version: 1.0.0",
        "author: CLI Scan",
        "tags: [scan, test]",
        "---",
        "",
        "# Writer Skill",
      ].join("\n"),
      "utf8",
    );

    const result = await execCli([
      ...withDataDir(root),
      "skill",
      "scan",
      scanRoot,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toHaveLength(1);
    expect(result.json[0]).toMatchObject({
      name: "writer-skill",
      localPath: skillDir,
    });
  });

  it("installs a remote https skill with injected fetch", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          [
            "---",
            "name: remote-skill",
            "description: Remote install",
            "version: 0.9.0",
            "author: Remote",
            "---",
            "",
            "# Remote Skill",
          ].join("\n"),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://example.com/skill.md",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ fetchImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/skill.md");
    expect(JSON.parse(stdout.join("\n")).name).toBe("remote-skill");
  });

  it("installs a github skill with injected git clone", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      fs.mkdirSync(destinationDir, { recursive: true });
      fs.writeFileSync(
        path.join(destinationDir, "SKILL.md"),
        [
          "---",
          "name: github-skill",
          "description: Github install",
          "version: 2.0.0",
          "author: Github",
          "---",
          "",
          "# Github Skill",
        ].join("\n"),
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://github.com/acme/github-skill",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(gitCloneImpl).toHaveBeenCalled();
    expect(JSON.parse(stdout.join("\n")).name).toBe("github-skill");
  });

  it("installs only the nested directory that contains SKILL.md from a github repo", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      const skillDir = path.join(destinationDir, "skills", "nested-skill");
      fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          "name: nested-skill",
          "description: Nested github install",
          "version: 1.0.0",
          "author: Github",
          "---",
          "",
          "# Nested Github Skill",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillDir, "assets", "helper.txt"),
        "nested",
        "utf8",
      );
      fs.writeFileSync(
        path.join(destinationDir, "README.md"),
        "repo root readme",
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://github.com/acme/nested-skill-repo",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join("\n")).local_repo_path).toContain(
      path.join("skills", "nested-skill"),
    );
  });

  it("rejects github repo install when multiple skill directories are found", async () => {
    const root = makeTempRoot(tempDirs);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const gitCloneImpl = vi.fn(async (_url: string, destinationDir: string) => {
      const skillA = path.join(destinationDir, "skills", "a-skill");
      const skillB = path.join(destinationDir, "skills", "b-skill");
      fs.mkdirSync(skillA, { recursive: true });
      fs.mkdirSync(skillB, { recursive: true });
      fs.writeFileSync(
        path.join(skillA, "SKILL.md"),
        "---\nname: a-skill\n---\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillB, "SKILL.md"),
        "---\nname: b-skill\n---\n",
        "utf8",
      );
    });

    const exitCode = await runCli(
      [
        ...withDataDir(root),
        "skill",
        "install",
        "https://github.com/acme/multi-skill-repo",
      ],
      {
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
      undefined,
      undefined,
      createCliSkillService({ gitCloneImpl }),
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.join("\n")).toContain(
      "Multiple skill directories found in repository",
    );
  });

  it("deletes a skill while keeping platform installs when requested", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "keep-platform-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: keep-platform-skill",
        "description: Keep platform install flag",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Keep Platform Skill",
      ].join("\n"),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    const uninstallSkillMd = vi.fn(async () => undefined);
    const skillService = {
      ...createCliSkillService(),
      uninstallSkillMd,
    };

    const deleteRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "delete",
        "keep-platform-skill",
        "--keep-platform-installs",
      ],
      skillService,
    );

    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.platformInstallsKept).toBe(true);
    expect(deleteRes.json.uninstallResults).toEqual([]);
    expect(uninstallSkillMd).not.toHaveBeenCalled();
  });

  it("captures platform uninstall failures during skill delete", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "uninstall-failure-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: uninstall-failure-skill",
        "description: Delete flow coverage",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Uninstall Failure Skill",
      ].join("\n"),
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    const baseSkillService = createCliSkillService();
    const firstPlatform = baseSkillService.getSupportedPlatforms()[0];
    const skillService = {
      ...baseSkillService,
      uninstallSkillMd: vi.fn(
        async (_skillName: string, platformId: string) => {
          if (platformId === firstPlatform.id) {
            throw new Error("mock uninstall failure");
          }
        },
      ),
    };

    const deleteRes = await execCli(
      [...withDataDir(root), "skill", "delete", "uninstall-failure-skill"],
      skillService,
    );

    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.deleted).toBe(true);
    const rejected = deleteRes.json.uninstallResults.find(
      (result: { platform: string; status: string }) =>
        result.platform === firstPlatform.id && result.status === "rejected",
    );
    expect(rejected).toMatchObject({
      platform: firstPlatform.id,
      status: "rejected",
      reason: "mock uninstall failure",
    });
  });

  it("renders skill scan table output when a safety report has no findings array", async () => {
    const root = makeTempRoot(tempDirs);
    const partialSafetyReport = {
      level: "warn",
    } as unknown as SkillSafetyReport;
    const skillService = {
      ...createCliSkillService(),
      scanLocalPreview: vi.fn(async () => [
        {
          name: "partial-report-skill",
          description: "Partial safety report fixture",
          author: "CLI Test",
          tags: [],
          instructions: "# Partial Report Skill",
          filePath: path.join(root, "partial-report-skill", "SKILL.md"),
          localPath: path.join(root, "partial-report-skill"),
          platforms: ["Custom"],
          safetyReport: partialSafetyReport,
        },
      ]),
    };

    const result = await execCli(
      [...withDataDir(root), "--output", "table", "skill", "scan", root],
      skillService,
    );

    expect(result.exitCode).toBe(0);
    expect(result.joinedStdout).toContain("partial-report-skill");
    expect(result.joinedStdout).toContain("warn");
    expect(result.joinedStdout).toContain("0");
    expect(result.stderr).toEqual([]);
  });

  it("supports skill versions, repo operations, export, sync, safety scan, and rollback", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "writer-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: writer-skill",
        "description: Original skill",
        "version: 1.0.0",
        "author: CLI Test",
        "tags: [writing, safe]",
        "---",
        "",
        "# Writer Skill",
        "",
        "Use calm language.",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(skillDir, "guide.md"), "Guide v1", "utf8");

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);
    expect(installRes.json.name).toBe("writer-skill");

    const createVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "create-version",
      "writer-skill",
      "--note",
      "baseline",
    ]);
    expect(createVersionRes.exitCode).toBe(0);
    expect(createVersionRes.json.note).toBe("baseline");

    const mkdirRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-mkdir",
      "writer-skill",
      "--path",
      "notes",
    ]);
    expect(mkdirRes.exitCode).toBe(0);
    expect(mkdirRes.json.created).toBe(true);

    const writeRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "notes/draft.md",
      "--content",
      "Draft note",
    ]);
    expect(writeRes.exitCode).toBe(0);
    expect(writeRes.json.written).toBe(true);

    const renameRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-rename",
      "writer-skill",
      "--from",
      "notes/draft.md",
      "--to",
      "notes/final.md",
    ]);
    expect(renameRes.exitCode).toBe(0);
    expect(renameRes.json.renamed).toBe(true);

    const repoReadRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "notes/final.md",
    ]);
    expect(repoReadRes.exitCode).toBe(0);
    expect(repoReadRes.json).toEqual({
      path: "notes/final.md",
      content: "Draft note",
      encoding: "text",
      isDirectory: false,
    });

    const repoFilesRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-files",
      "writer-skill",
    ]);
    expect(repoFilesRes.exitCode).toBe(0);
    expect(repoFilesRes.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md", isDirectory: false }),
        expect.objectContaining({ path: "guide.md", isDirectory: false }),
        expect.objectContaining({ path: "notes", isDirectory: true }),
        expect.objectContaining({ path: "notes/final.md", isDirectory: false }),
      ]),
    );

    const syncedSkillMd = [
      "---",
      "name: writer-skill",
      "description: Synced skill",
      "version: 2.0.0",
      "author: CLI Test",
      "tags: [writing, risky]",
      "---",
      "",
      "# Writer Skill",
      "",
      "Use curl before publishing.",
    ].join("\n");

    await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "SKILL.md",
      "--content",
      syncedSkillMd,
    ]);
    await execCli([
      ...withDataDir(root),
      "skill",
      "repo-write",
      "writer-skill",
      "--path",
      "guide.md",
      "--content",
      "Guide v2",
    ]);

    const syncRes = await execCli([
      ...withDataDir(root),
      "skill",
      "sync-from-repo",
      "writer-skill",
    ]);
    expect(syncRes.exitCode).toBe(0);
    expect(syncRes.json.description).toBe("Synced skill");
    expect(syncRes.json.version).toBe("2.0.0");
    expect(syncRes.json.tags).toEqual(["writing", "risky"]);

    const safetyRes = await execCli([
      ...withDataDir(root),
      "skill",
      "scan-safety",
      "writer-skill",
    ]);
    expect(safetyRes.exitCode).toBe(0);
    expect(safetyRes.json.level).toBe("warn");
    expect(safetyRes.json.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dangerous-command",
          severity: "high",
        }),
      ]),
    );

    const createSyncedVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "create-version",
      "writer-skill",
      "--note",
      "synced",
    ]);
    expect(createSyncedVersionRes.exitCode).toBe(0);
    expect(createSyncedVersionRes.json.note).toBe("synced");

    const versionsRes = await execCli([
      ...withDataDir(root),
      "skill",
      "versions",
      "writer-skill",
    ]);
    expect(versionsRes.exitCode).toBe(0);
    expect(versionsRes.json).toHaveLength(2);
    expect(
      versionsRes.json.map((version: { note?: string }) => version.note),
    ).toEqual(["synced", "baseline"]);

    const exportJsonRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "writer-skill",
      "--format",
      "json",
    ]);
    expect(exportJsonRes.exitCode).toBe(0);
    expect(exportJsonRes.json.name).toBe("writer-skill");
    expect(exportJsonRes.json.version).toBe("2.0.0");

    const exportSkillMdRes = await execCli([
      ...withDataDir(root),
      "skill",
      "export",
      "writer-skill",
      "--format",
      "skillmd",
    ]);
    expect(exportSkillMdRes.exitCode).toBe(0);
    expect(exportSkillMdRes.joinedStdout).toContain("name: writer-skill");
    expect(exportSkillMdRes.joinedStdout).toContain(
      "Use curl before publishing.",
    );

    const rollbackRes = await execCli([
      ...withDataDir(root),
      "skill",
      "rollback",
      "writer-skill",
      "--version",
      "1",
    ]);
    expect(rollbackRes.exitCode).toBe(0);
    expect(rollbackRes.json.content).toContain("Use calm language.");

    const rolledBackSkillMdRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "SKILL.md",
    ]);
    expect(rolledBackSkillMdRes.exitCode).toBe(0);
    expect(rolledBackSkillMdRes.json.content).toContain(
      "description: Original skill",
    );
    expect(rolledBackSkillMdRes.json.content).toContain("Use calm language.");

    const rolledBackGuideRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-read",
      "writer-skill",
      "--path",
      "guide.md",
    ]);
    expect(rolledBackGuideRes.exitCode).toBe(0);
    expect(rolledBackGuideRes.json.content).toBe("Guide v1");

    const rolledBackFilesRes = await execCli([
      ...withDataDir(root),
      "skill",
      "repo-files",
      "writer-skill",
    ]);
    expect(rolledBackFilesRes.exitCode).toBe(0);
    expect(
      rolledBackFilesRes.json.some(
        (entry: { path: string }) => entry.path === "notes/final.md",
      ),
    ).toBe(false);

    const deleteVersionRes = await execCli([
      ...withDataDir(root),
      "skill",
      "delete-version",
      "writer-skill",
      createSyncedVersionRes.json.id as string,
    ]);
    expect(deleteVersionRes.exitCode).toBe(0);
    expect(deleteVersionRes.json.deleted).toBe(true);
  });

  it("reports skill platform status and delegates install-md or uninstall-md", async () => {
    const root = makeTempRoot(tempDirs);
    const skillDir = path.join(root, "platform-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: platform-skill",
        "description: Platform skill",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Platform Skill",
      ].join("\n"),
      "utf8",
    );

    const installSkillMd = vi.fn(async () => undefined);
    const uninstallSkillMd = vi.fn(async () => undefined);
    const skillService = {
      ...createCliSkillService(),
      detectInstalledPlatforms: vi.fn(async () => ["claude"]),
      getSkillMdInstallStatus: vi.fn(async () => ({
        claude: true,
        copilot: false,
        cursor: false,
        windsurf: false,
        kiro: false,
        gemini: false,
      })),
      installSkillMd,
      uninstallSkillMd,
    };

    const installRes = await execCli(
      [...withDataDir(root), "skill", "install", skillDir],
      skillService,
    );
    expect(installRes.exitCode).toBe(0);

    const platformsRes = await execCli(
      [...withDataDir(root), "skill", "platforms"],
      skillService,
    );
    expect(platformsRes.exitCode).toBe(0);
    expect(platformsRes.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claude",
          name: "Claude Code",
          installed: true,
        }),
      ]),
    );

    const statusRes = await execCli(
      [...withDataDir(root), "skill", "platform-status", "platform-skill"],
      skillService,
    );
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.json.claude).toBe(true);
    expect(statusRes.json.cursor).toBe(false);

    const installMdRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "install-md",
        "platform-skill",
        "--platform",
        "claude",
      ],
      skillService,
    );
    expect(installMdRes.exitCode).toBe(0);
    expect(installMdRes.json).toEqual({
      installed: true,
      skillId: installRes.json.id,
      platformId: "claude",
    });
    expect(installSkillMd).toHaveBeenCalledWith(
      expect.anything(),
      "platform-skill",
      expect.stringContaining("# Platform Skill"),
      "claude",
    );

    const uninstallMdRes = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "uninstall-md",
        "platform-skill",
        "--platform",
        "claude",
      ],
      skillService,
    );
    expect(uninstallMdRes.exitCode).toBe(0);
    expect(uninstallMdRes.json).toEqual({
      uninstalled: true,
      skillId: installRes.json.id,
      platformId: "claude",
    });
    expect(uninstallSkillMd).toHaveBeenCalledWith("platform-skill", "claude");
  });

  it("installs platform skills as full directories instead of only SKILL.md", async () => {
    const root = makeTempRoot(tempDirs);
    const originalHome = process.env.HOME;
    const skillDir = path.join(root, "directory-platform-skill");
    fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: directory-platform-skill",
        "description: Directory platform skill",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Directory Platform Skill",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(skillDir, "assets", "helper.txt"),
      "helper",
      "utf8",
    );

    try {
      process.env.HOME = path.join(root, "home");
      fs.mkdirSync(process.env.HOME, { recursive: true });

      const installRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
      ]);
      expect(installRes.exitCode).toBe(0);

      const installMdRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install-md",
        "directory-platform-skill",
        "--platform",
        "claude",
      ]);
      expect(installMdRes.exitCode).toBe(0);

      const platformDir = path.join(
        process.env.HOME,
        ".claude",
        "skills",
        "directory-platform-skill",
      );
      expect(fs.existsSync(path.join(platformDir, "SKILL.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(platformDir, "assets", "helper.txt")),
      ).toBe(true);
      expect(
        fs.readFileSync(path.join(platformDir, "assets", "helper.txt"), "utf8"),
      ).toBe("helper");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("installs a My Skills package into the current project directory", async () => {
    const root = makeTempRoot(tempDirs);
    const originalCwd = process.cwd();
    const skillDir = path.join(root, "project-writer");
    const projectRoot = path.join(root, "project");
    fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: project-writer",
        "description: Project writer",
        "version: 1.0.0",
        "author: CLI Test",
        "---",
        "",
        "# Project Writer",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(skillDir, "assets", "helper.txt"),
      "helper v1",
      "utf8",
    );

    const installRes = await execCli([
      ...withDataDir(root),
      "skill",
      "install",
      skillDir,
    ]);
    expect(installRes.exitCode).toBe(0);

    try {
      process.chdir(projectRoot);
      const resolvedProjectRoot = fs.realpathSync(projectRoot);
      const projectInstallRes = await execCli([
        ...withDataDir(root),
        "skill",
        "project-install",
        "project-writer",
      ]);
      expect(projectInstallRes.exitCode).toBe(0);
      expect(projectInstallRes.json).toMatchObject({
        status: "installed",
        skillName: "project-writer",
        projectRoot: resolvedProjectRoot,
        targetRootDir: path.join(resolvedProjectRoot, ".agents", "skills"),
        mode: "copy",
        forced: false,
      });

      const targetSkillDir = path.join(
        projectRoot,
        ".agents",
        "skills",
        "project-writer",
      );
      expect(fs.existsSync(path.join(targetSkillDir, "SKILL.md"))).toBe(true);
      expect(
        fs.readFileSync(
          path.join(targetSkillDir, "assets", "helper.txt"),
          "utf8",
        ),
      ).toBe("helper v1");

      fs.writeFileSync(
        path.join(targetSkillDir, "assets", "helper.txt"),
        "local edit",
        "utf8",
      );
      const skippedRes = await execCli([
        ...withDataDir(root),
        "skill",
        "project-install",
        "project-writer",
      ]);
      expect(skippedRes.exitCode).toBe(0);
      expect(skippedRes.json.status).toBe("skipped");
      expect(
        fs.readFileSync(
          path.join(targetSkillDir, "assets", "helper.txt"),
          "utf8",
        ),
      ).toBe("local edit");

      const forcedRes = await execCli([
        ...withDataDir(root),
        "skill",
        "project-install",
        "project-writer",
        "--force",
      ]);
      expect(forcedRes.exitCode).toBe(0);
      expect(forcedRes.json.status).toBe("updated");
      expect(forcedRes.json.forced).toBe(true);
      expect(
        fs.readFileSync(
          path.join(targetSkillDir, "assets", "helper.txt"),
          "utf8",
        ),
      ).toBe("helper v1");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("selects a project Skill interactively when no identifier is provided", async () => {
    const root = makeTempRoot(tempDirs);
    const projectRoot = path.join(root, "interactive-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    for (const skillName of ["alpha-skill", "beta-skill"]) {
      const skillDir = path.join(root, skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          `name: ${skillName}`,
          `description: ${skillName} description`,
          "version: 1.0.0",
          "author: CLI Test",
          "---",
          "",
          `# ${skillName}`,
        ].join("\n"),
        "utf8",
      );
      const installRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
      ]);
      expect(installRes.exitCode).toBe(0);
    }

    const stdin = new PassThrough();
    stdin.end("1\n");
    const result = await execCli(
      [
        ...withDataDir(root),
        "skill",
        "project-install",
        "--project",
        projectRoot,
      ],
      undefined,
      { stdin, isInteractive: true },
    );

    expect(result.exitCode).toBe(0);
    expect(result.joinedStderr).toContain("选择要安装到项目的 Skill");
    expect(result.json.status).toBe("installed");
    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          ".agents",
          "skills",
          result.json.skillName,
          "SKILL.md",
        ),
      ),
    ).toBe(true);
  });

  it("supports fuzzy project Skill selection and rejects ambiguous matches", async () => {
    const root = makeTempRoot(tempDirs);
    const projectRoot = path.join(root, "fuzzy-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    for (const skillName of ["writer-alpha", "writer-beta"]) {
      const skillDir = path.join(root, skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        [
          "---",
          `name: ${skillName}`,
          `description: ${skillName} description`,
          "version: 1.0.0",
          "author: CLI Test",
          "---",
          "",
          `# ${skillName}`,
        ].join("\n"),
        "utf8",
      );
      const installRes = await execCli([
        ...withDataDir(root),
        "skill",
        "install",
        skillDir,
      ]);
      expect(installRes.exitCode).toBe(0);
    }

    const uniqueRes = await execCli([
      ...withDataDir(root),
      "skill",
      "project-install",
      "alpha",
      "--project",
      projectRoot,
    ]);
    expect(uniqueRes.exitCode).toBe(0);
    expect(uniqueRes.json.skillName).toBe("writer-alpha");

    const ambiguousRes = await execCli([
      ...withDataDir(root),
      "skill",
      "project-install",
      "writer",
      "--project",
      projectRoot,
    ]);
    expect(ambiguousRes.exitCode).toBe(4);
    expect(ambiguousRes.errorJson.error.code).toBe("CONFLICT");
    expect(ambiguousRes.errorJson.error.details.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "writer-alpha" }),
        expect.objectContaining({ name: "writer-beta" }),
      ]),
    );
  });

  it("supports the full folder lifecycle", async () => {
    const root = makeTempRoot(tempDirs);

    const createRootRes = await execCli([
      ...withDataDir(root),
      "folder",
      "create",
      "--name",
      "Root Folder",
      "--icon",
      "📁",
    ]);
    expect(createRootRes.exitCode).toBe(0);
    const rootFolderId = createRootRes.json.id as string;

    const createChildRes = await execCli([
      ...withDataDir(root),
      "folder",
      "create",
      "--name",
      "Child Folder",
      "--parent-id",
      rootFolderId,
      "--private",
    ]);
    expect(createChildRes.exitCode).toBe(0);
    const childFolderId = createChildRes.json.id as string;

    const listRes = await execCli([...withDataDir(root), "folder", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json).toHaveLength(2);

    const updateRes = await execCli([
      ...withDataDir(root),
      "folder",
      "update",
      childFolderId,
      "--name",
      "Updated Child",
      "--order",
      "0",
    ]);
    expect(updateRes.exitCode).toBe(0);
    expect(updateRes.json.name).toBe("Updated Child");
    expect(updateRes.json.order).toBe(0);

    const reorderRes = await execCli([
      ...withDataDir(root),
      "folder",
      "reorder",
      "--ids",
      `${childFolderId},${rootFolderId}`,
    ]);
    expect(reorderRes.exitCode).toBe(0);
    expect(reorderRes.json.reordered).toBe(true);

    const getRes = await execCli([
      ...withDataDir(root),
      "folder",
      "get",
      childFolderId,
    ]);
    expect(getRes.exitCode).toBe(0);
    expect(getRes.json.name).toBe("Updated Child");

    const deleteRes = await execCli([
      ...withDataDir(root),
      "folder",
      "delete",
      childFolderId,
    ]);
    expect(deleteRes.exitCode).toBe(0);
    expect(deleteRes.json.deleted).toBe(true);
  });

  it("returns usage error when folder reorder omits ids", async () => {
    const root = makeTempRoot(tempDirs);

    const result = await execCli([...withDataDir(root), "folder", "reorder"]);

    expect(result.exitCode).toBe(2);
    expect(result.errorJson.error.code).toBe("USAGE_ERROR");
    expect(result.errorJson.error.message).toContain("--ids");
  });

  it("exports and imports workspace core data", async () => {
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const exportFile = path.join(sourceRoot, "workspace-export.json");

    const folderRes = await execCli([
      ...withDataDir(sourceRoot),
      "folder",
      "create",
      "--name",
      "Workspace Folder",
    ]);
    expect(folderRes.exitCode).toBe(0);

    const promptRes = await execCli([
      ...withDataDir(sourceRoot),
      "prompt",
      "create",
      "--title",
      "Workspace Prompt",
      "--user-prompt",
      "Export me",
      "--folder-id",
      folderRes.json.id as string,
    ]);
    expect(promptRes.exitCode).toBe(0);

    const exportRes = await execCli([
      ...withDataDir(sourceRoot),
      "workspace",
      "export",
      "--file",
      exportFile,
    ]);
    expect(exportRes.exitCode).toBe(0);
    expect(fs.existsSync(exportFile)).toBe(true);

    const importRes = await execCli([
      ...withDataDir(targetRoot),
      "workspace",
      "import",
      "--file",
      exportFile,
    ]);
    expect(importRes.exitCode).toBe(0);
    expect(importRes.json.imported).toBe(true);

    const importedPrompts = await execCli([
      ...withDataDir(targetRoot),
      "prompt",
      "list",
    ]);
    expect(importedPrompts.exitCode).toBe(0);
    expect(importedPrompts.json).toHaveLength(1);
    expect(importedPrompts.json[0].title).toBe("Workspace Prompt");

    const importedFolders = await execCli([
      ...withDataDir(targetRoot),
      "folder",
      "list",
    ]);
    expect(importedFolders.exitCode).toBe(0);
    expect(importedFolders.json).toHaveLength(1);
    expect(importedFolders.json[0].name).toBe("Workspace Folder");
  });

  it("requires force clear when importing into a non-empty workspace", async () => {
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const exportFile = path.join(sourceRoot, "workspace-export.json");

    await execCli([
      ...withDataDir(sourceRoot),
      "prompt",
      "create",
      "--title",
      "Source Prompt",
      "--user-prompt",
      "Source body",
    ]);

    await execCli([
      ...withDataDir(sourceRoot),
      "workspace",
      "export",
      "--file",
      exportFile,
    ]);

    await execCli([
      ...withDataDir(targetRoot),
      "prompt",
      "create",
      "--title",
      "Existing Prompt",
      "--user-prompt",
      "Existing body",
    ]);

    const blockedImport = await execCli([
      ...withDataDir(targetRoot),
      "workspace",
      "import",
      "--file",
      exportFile,
    ]);
    expect(blockedImport.exitCode).toBe(4);
    expect(blockedImport.errorJson.error.code).toBe("CONFLICT");

    const forcedImport = await execCli([
      ...withDataDir(targetRoot),
      "workspace",
      "import",
      "--file",
      exportFile,
      "--force-clear",
    ]);
    expect(forcedImport.exitCode).toBe(0);
    expect(forcedImport.json.forceCleared).toBe(true);

    const promptsAfterImport = await execCli([
      ...withDataDir(targetRoot),
      "prompt",
      "list",
    ]);
    expect(promptsAfterImport.exitCode).toBe(0);
    expect(promptsAfterImport.json).toHaveLength(1);
    expect(promptsAfterImport.json[0].title).toBe("Source Prompt");
  });

  it("supports the rules project lifecycle", async () => {
    const root = makeTempRoot(tempDirs);
    const projectRoot = path.join(root, "docs-site");
    fs.mkdirSync(projectRoot, { recursive: true });

    const addProjectRes = await execCli([
      ...withDataDir(root),
      "rules",
      "add-project",
      "--id",
      "docs-site",
      "--name",
      "Docs Site",
      "--root-path",
      projectRoot,
    ]);
    expect(addProjectRes.exitCode).toBe(0);
    expect(addProjectRes.json.id).toBe("project:docs-site");

    const listRes = await execCli([...withDataDir(root), "rules", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project:docs-site",
          platformName: "Docs Site",
        }),
      ]),
    );

    const saveRes = await execCli([
      ...withDataDir(root),
      "rules",
      "save",
      "project:docs-site",
      "--content",
      "# Docs rule\n\nFollow the handbook.",
    ]);
    expect(saveRes.exitCode).toBe(0);
    expect(saveRes.json.content).toContain("Follow the handbook");

    const readRes = await execCli([
      ...withDataDir(root),
      "rules",
      "read",
      "project:docs-site",
    ]);
    expect(readRes.exitCode).toBe(0);
    expect(readRes.json.content).toContain("Docs rule");
    expect(readRes.json.versions).toHaveLength(1);

    const versionDeleteRes = await execCli([
      ...withDataDir(root),
      "rules",
      "version-delete",
      "project:docs-site",
      readRes.json.versions[0].id as string,
    ]);
    expect(versionDeleteRes.exitCode).toBe(0);
    expect(versionDeleteRes.json).toEqual([]);

    const removeRes = await execCli([
      ...withDataDir(root),
      "rules",
      "remove-project",
      "docs-site",
    ]);
    expect(removeRes.exitCode).toBe(0);
    expect(removeRes.json.removed).toBe(true);
  });

  it("initializes project rules from the current working directory", async () => {
    const root = makeTempRoot(tempDirs);
    const originalCwd = process.cwd();
    const projectRoot = path.join(root, "cwd-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    try {
      process.chdir(projectRoot);
      const initRes = await execCli([
        ...withDataDir(root),
        "rules",
        "project-init",
        "--id",
        "cwd-project",
      ]);
      expect(initRes.exitCode).toBe(0);
      expect(initRes.json.id).toBe("project:cwd-project");
      expect(initRes.json.platformName).toBe("cwd-project");
      expect(initRes.json.projectRootPath).toBe(fs.realpathSync(projectRoot));

      const saveRes = await execCli([
        ...withDataDir(root),
        "rules",
        "save",
        "cwd-project",
        "--content",
        "# CWD Rule",
      ]);
      expect(saveRes.exitCode).toBe(0);
      expect(saveRes.json.content).toBe("# CWD Rule");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("lists, reads, restores, and deletes rule versions", async () => {
    const root = makeTempRoot(tempDirs);

    await withTempHome(root, async (homeDir) => {
      const initialSaveRes = await execCli([
        ...withDataDir(root),
        "rules",
        "save",
        "claude-global",
        "--content",
        "# Rule v1\n\nStay concise.",
      ]);
      expect(initialSaveRes.exitCode).toBe(0);
      expect(
        fs.readFileSync(path.join(homeDir, ".claude", "CLAUDE.md"), "utf8"),
      ).toContain("Stay concise.");

      const secondSaveRes = await execCli([
        ...withDataDir(root),
        "rules",
        "save",
        "claude-global",
        "--content",
        "# Rule v2\n\nStay extremely concise.",
      ]);
      expect(secondSaveRes.exitCode).toBe(0);

      const versionsRes = await execCli([
        ...withDataDir(root),
        "rules",
        "versions",
        "claude-global",
      ]);
      expect(versionsRes.exitCode).toBe(0);
      expect(versionsRes.json.length).toBeGreaterThanOrEqual(2);

      const olderVersionId = versionsRes.json[1].id as string;
      const versionReadRes = await execCli([
        ...withDataDir(root),
        "rules",
        "version-read",
        "claude-global",
        olderVersionId,
      ]);
      expect(versionReadRes.exitCode).toBe(0);
      expect(versionReadRes.json.content).toContain("Stay concise.");

      const restoreRes = await execCli([
        ...withDataDir(root),
        "rules",
        "version-restore",
        "claude-global",
        olderVersionId,
      ]);
      expect(restoreRes.exitCode).toBe(0);
      expect(restoreRes.json.content).toContain("Stay concise.");

      const readRes = await execCli([
        ...withDataDir(root),
        "rules",
        "read",
        "claude-global",
      ]);
      expect(readRes.exitCode).toBe(0);
      expect(readRes.json.content).toContain("Stay concise.");
      expect(readRes.json.versions.length).toBeGreaterThanOrEqual(3);

      const deleteRes = await execCli([
        ...withDataDir(root),
        "rules",
        "version-delete",
        "claude-global",
        olderVersionId,
      ]);
      expect(deleteRes.exitCode).toBe(0);
      expect(
        deleteRes.json.some(
          (version: { id: string }) => version.id === olderVersionId,
        ),
      ).toBe(false);
    });
  });

  it("rewrites a rule through explicit AI config", async () => {
    const root = makeTempRoot(tempDirs);
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "# Rewritten by CLI" } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    global.fetch = fetchMock as typeof fetch;

    try {
      await withTempHome(root, async (homeDir) => {
        const saveRes = await execCli([
          ...withDataDir(root),
          "rules",
          "save",
          "claude-global",
          "--content",
          "# Original Claude Rule",
        ]);
        expect(saveRes.exitCode).toBe(0);
        expect(
          fs.readFileSync(path.join(homeDir, ".claude", "CLAUDE.md"), "utf8"),
        ).toBe("# Original Claude Rule");

        const rewriteRes = await execCli([
          ...withDataDir(root),
          "rules",
          "rewrite",
          "claude-global",
          "--instruction",
          "Tighten the structure",
          "--api-key",
          "test-key",
          "--api-url",
          "https://api.openai.com/v1",
          "--model",
          "gpt-4o-mini",
          "--provider",
          "openai",
          "--api-protocol",
          "openai",
        ]);

        expect(rewriteRes.exitCode).toBe(0);
        expect(rewriteRes.json).toEqual({
          content: "# Rewritten by CLI",
          summary: "AI rewrite generated a new draft.",
        });
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("exports and imports rules bundles", async () => {
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const projectRoot = path.join(sourceRoot, "project-a");
    const exportFile = path.join(sourceRoot, "rules-export.json");
    fs.mkdirSync(projectRoot, { recursive: true });

    await execCli([
      ...withDataDir(sourceRoot),
      "rules",
      "add-project",
      "--id",
      "project-a",
      "--name",
      "Project A",
      "--root-path",
      projectRoot,
    ]);

    await execCli([
      ...withDataDir(sourceRoot),
      "rules",
      "save",
      "project:project-a",
      "--content",
      "# Project A Rule",
    ]);

    const exportRes = await execCli([
      ...withDataDir(sourceRoot),
      "rules",
      "export",
      "--file",
      exportFile,
    ]);
    expect(exportRes.exitCode).toBe(0);
    expect(fs.existsSync(exportFile)).toBe(true);

    const importRes = await execCli([
      ...withDataDir(targetRoot),
      "rules",
      "import",
      "--file",
      exportFile,
      "--replace",
    ]);
    expect(importRes.exitCode).toBe(0);
    expect(importRes.json.imported).toBe(true);

    const readImportedRes = await execCli([
      ...withDataDir(targetRoot),
      "rules",
      "read",
      "project:project-a",
    ]);
    expect(readImportedRes.exitCode).toBe(0);
    expect(readImportedRes.json.content).toBe("# Project A Rule");
  }, 10_000);

  it("requires content for rules save", async () => {
    const root = makeTempRoot(tempDirs);
    const result = await execCli([
      ...withDataDir(root),
      "rules",
      "save",
      "claude-global",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.errorJson.error.code).toBe("USAGE_ERROR");
    expect(result.errorJson.error.message).toContain("--content");
  });

  it("requires explicit AI config for rules rewrite", async () => {
    const root = makeTempRoot(tempDirs);
    const result = await execCli([
      ...withDataDir(root),
      "rules",
      "rewrite",
      "claude-global",
      "--instruction",
      "Tighten the structure",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.errorJson.error.code).toBe("USAGE_ERROR");
    expect(result.errorJson.error.message).toContain("--api-key");
  });
});
