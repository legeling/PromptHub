import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import { MCP_REDACTED_VALUE } from "@prompthub/shared/utils/mcp-config";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeDatabase,
  createCliSkillService,
  resetRuntimePaths,
  runCli,
} from "@prompthub/core";

import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

describe("standalone cli wiring", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    resetRuntimePaths();
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
    const manifest: { version: string } = JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const result = await execCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.joinedStdout.trim()).toBe(manifest.version);
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

  it("keeps concurrent programmatic CLI invocations in their own data directories", async () => {
    const firstRoot = makeTempRoot(tempDirs);
    const secondRoot = makeTempRoot(tempDirs);
    const [firstCreate, secondCreate] = await Promise.all([
      execCli([
        ...withDataDir(firstRoot),
        "prompt",
        "create",
        "--title",
        "First concurrent prompt",
        "--user-prompt",
        "first",
      ]),
      execCli([
        ...withDataDir(secondRoot),
        "prompt",
        "create",
        "--title",
        "Second concurrent prompt",
        "--user-prompt",
        "second",
      ]),
    ]);

    expect(firstCreate.exitCode).toBe(0);
    expect(secondCreate.exitCode).toBe(0);

    const firstList = await execCli([
      ...withDataDir(firstRoot),
      "prompt",
      "list",
    ]);
    const secondList = await execCli([
      ...withDataDir(secondRoot),
      "prompt",
      "list",
    ]);

    expect(
      firstList.json.map((prompt: { title: string }) => prompt.title),
    ).toEqual(["First concurrent prompt"]);
    expect(
      secondList.json.map((prompt: { title: string }) => prompt.title),
    ).toEqual(["Second concurrent prompt"]);
  }, 10_000);

  it("creates new CLI databases under the unified data directory", async () => {
    const root = makeTempRoot(tempDirs, { seedDatabase: false });
    const userDataDir = path.join(root, "user-data");

    const createRes = await execCli([
      "--data-dir",
      userDataDir,
      "prompt",
      "create",
      "--title",
      "Unified DB",
      "--user-prompt",
      "Stored in data",
    ]);

    expect(createRes.exitCode).toBe(0);
    expect(fs.existsSync(path.join(userDataDir, "data", "prompthub.db"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(userDataDir, "prompthub.db"))).toBe(false);
  });

  it("keeps reading an existing legacy root database when no unified database exists", async () => {
    const root = makeTempRoot(tempDirs);
    const userDataDir = path.join(root, "user-data");
    const unifiedDbPath = path.join(userDataDir, "data", "prompthub.db");
    const legacyDbPath = path.join(userDataDir, "prompthub.db");

    const createRes = await execCli([
      "--data-dir",
      userDataDir,
      "prompt",
      "create",
      "--title",
      "Legacy DB",
      "--user-prompt",
      "Still readable",
    ]);
    expect(createRes.exitCode).toBe(0);
    fs.renameSync(unifiedDbPath, legacyDbPath);
    fs.rmSync(path.dirname(unifiedDbPath), { recursive: true, force: true });

    const listRes = await execCli([
      "--data-dir",
      userDataDir,
      "prompt",
      "list",
    ]);

    expect(listRes.exitCode).toBe(0);
    expect(listRes.json).toHaveLength(1);
    expect(listRes.json[0].title).toBe("Legacy DB");
    expect(fs.existsSync(legacyDbPath)).toBe(true);
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
      API_TOKEN: MCP_REDACTED_VALUE,
    });
    expect(envImportRes.joinedStdout).not.toContain("token-from-env");

    const listRes = await execCli([...withDataDir(root), "mcp", "list"]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.json[0]).toMatchObject({
      name: "docs",
      env: { API_TOKEN: MCP_REDACTED_VALUE },
    });
    expect(listRes.joinedStdout).not.toContain("token-from-env");

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

    await withTempHome(sourceRoot, async () => {
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
});
