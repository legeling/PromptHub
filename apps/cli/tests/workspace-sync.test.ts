import fs from "fs";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeDatabase,
  configureRuntimePaths,
  CoreMcpLibraryService,
  CorePluginLibraryService,
  initDatabase,
  resetRuntimePaths,
  runCli,
} from "@prompthub/core";
import type { PluginLibraryFile } from "@prompthub/shared/types/plugin";
import { MCP_STORAGE_SNAPSHOT_FILE } from "@prompthub/core/mcp-storage-snapshot";

import { makeTempRoot } from "./helpers/cli-harness";

function dataArgs(rootDir: string): string[] {
  return ["--data-dir", path.join(rootDir, "user-data")];
}

async function execCli(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  const joinedStdout = stdout.join("\n");
  return {
    exitCode,
    stdout: joinedStdout.trim() ? JSON.parse(joinedStdout) : undefined,
    stderr: stderr.join("\n"),
  };
}

function withRuntimePaths<T>(rootDir: string, run: () => T): T {
  configureRuntimePaths({
    userDataPath: path.join(rootDir, "user-data"),
    exePath: process.execPath,
    isPackaged: false,
    platform: process.platform,
  });
  try {
    initDatabase();
    return run();
  } finally {
    closeDatabase();
    resetRuntimePaths();
  }
}

function seedMcpAndPluginLibraries(
  rootDir: string,
  apiToken = "cli-secret",
): void {
  withRuntimePaths(rootDir, () => {
    new CoreMcpLibraryService().write({
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-06-28T00:00:00.000Z",
      bindings: [],
      servers: [
        {
          id: "mcp-1",
          name: "docs-mcp",
          displayName: "Docs MCP",
          description: "Docs helper",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          env: { API_TOKEN: apiToken },
          enabled: true,
          tags: ["docs"],
          source: { type: "manual" },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const packagePath = path.join(rootDir, "fixture-plugin");
    fs.mkdirSync(packagePath);
    fs.writeFileSync(path.join(packagePath, "plugin-note.txt"), "plugin asset");
    const now = Date.now();
    const pluginLibrary: PluginLibraryFile = {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: "2026-06-28T00:00:00.000Z",
      plugins: [
        {
          id: "plugin-1",
          localPackagePath: packagePath,
          name: "demo-plugin",
          displayName: "Demo Plugin",
          description: "Plugin for workspace sync",
          trustLevel: "custom",
          inventory: {
            skills: 0,
            mcpServers: 0,
            apps: 0,
            commands: 0,
            hooks: 0,
            agents: 0,
            assets: 0,
            docs: 0,
            lspServers: 0,
            scripts: 0,
          },
          classification: "bundle",
          source: {
            kind: "local",
            label: "Local",
          },
          installedAt: now,
          updatedAt: now,
        },
      ],
    };
    new CorePluginLibraryService().write(pluginLibrary);
    new CorePluginLibraryService().updatePluginMetadata("plugin-1", {
      userNotes: "Snapshot history",
    });
    new CorePluginLibraryService().createPluginVersion(
      "plugin-1",
      "Retained package snapshot",
    );
  });
}

describe("CLI workspace sync snapshots", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    closeDatabase();
    resetRuntimePaths();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports a sync-compatible workspace bundle with skills, MCP, and plugins", async () => {
    const root = makeTempRoot(tempDirs);
    const exportFile = path.join(root, "workspace.json");

    expect(
      (
        await execCli([
          ...dataArgs(root),
          "prompt",
          "create",
          "--title",
          "CLI Full Snapshot",
          "--user-prompt",
          "Use the full workspace",
        ])
      ).exitCode,
    ).toBe(0);
    const skillFile = path.join(root, "sync-skill.SKILL.md");
    fs.writeFileSync(
      skillFile,
      "---\nname: sync-skill\ndescription: Sync Skill\n---\nUse sync.\n",
      "utf8",
    );
    expect(
      (await execCli([...dataArgs(root), "skill", "install", skillFile]))
        .exitCode,
    ).toBe(0);
    seedMcpAndPluginLibraries(root);

    const exportResult = await execCli([
      ...dataArgs(root),
      "workspace",
      "export",
      "--file",
      exportFile,
    ]);

    expect(exportResult.exitCode).toBe(0);
    expect(exportResult.stdout).toMatchObject({
      exported: true,
      prompts: 1,
      skills: 1,
      mcpServers: 1,
      plugins: 1,
    });

    const bundle = JSON.parse(fs.readFileSync(exportFile, "utf8"));
    expect(JSON.stringify(bundle)).not.toContain("cli-secret");
    const mcpLibraryAsset = bundle.payload.agentAssetFiles.mcp.find(
      (file: { relativePath: string }) =>
        file.relativePath === MCP_STORAGE_SNAPSHOT_FILE,
    );
    expect(mcpLibraryAsset).toBeDefined();
    expect(
      Buffer.from(mcpLibraryAsset.contentBase64, "base64").toString("utf8"),
    ).not.toContain("cli-secret");
    expect(bundle).toMatchObject({
      kind: "prompthub-cli-workspace",
      version: 2,
      payload: {
        prompts: [expect.objectContaining({ title: "CLI Full Snapshot" })],
        skills: [expect.objectContaining({ name: "sync-skill" })],
        mcpLibrary: {
          servers: [
            expect.objectContaining({
              name: "docs-mcp",
              env: { API_TOKEN: "[REDACTED]" },
            }),
          ],
        },
        pluginLibrary: {
          plugins: [expect.objectContaining({ id: "plugin-1" })],
        },
        agentAssetFiles: {
          plugins: expect.arrayContaining([
            expect.objectContaining({
              relativePath: "plugin-1/files/plugin-note.txt",
            }),
          ]),
        },
      },
    });
  });

  it("imports a v2 workspace bundle into the shared local workspace", async () => {
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const exportFile = path.join(sourceRoot, "workspace.json");

    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "prompt",
          "create",
          "--title",
          "Portable Prompt",
          "--user-prompt",
          "Portable body",
        ])
      ).exitCode,
    ).toBe(0);
    seedMcpAndPluginLibraries(sourceRoot);

    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "workspace",
          "export",
          "--file",
          exportFile,
        ])
      ).exitCode,
    ).toBe(0);
    const importResult = await execCli([
      ...dataArgs(targetRoot),
      "workspace",
      "import",
      "--file",
      exportFile,
      "--force-clear",
    ]);

    expect(importResult.exitCode, importResult.stderr).toBe(0);
    expect(importResult.stdout).toMatchObject({
      imported: true,
      prompts: 1,
      mcpServers: 1,
      plugins: 1,
      forceCleared: true,
    });

    const promptList = await execCli([
      ...dataArgs(targetRoot),
      "prompt",
      "list",
    ]);
    expect(promptList.stdout).toEqual([
      expect.objectContaining({ title: "Portable Prompt" }),
    ]);

    const libraries = withRuntimePaths(targetRoot, () => ({
      mcp: new CoreMcpLibraryService().readForTransport(),
      plugin: new CorePluginLibraryService().read(),
      versions: new CorePluginLibraryService().getPluginVersions("plugin-1"),
      pluginNote: fs.readFileSync(
        path.join(
          new CorePluginLibraryService().read().plugins[0].localPackagePath!,
          "plugin-note.txt",
        ),
        "utf8",
      ),
    }));

    expect(libraries.mcp.servers).toEqual([
      expect.objectContaining({ name: "docs-mcp" }),
    ]);
    expect(libraries.plugin.plugins).toEqual([
      expect.objectContaining({ id: "plugin-1" }),
    ]);
    expect(libraries.pluginNote).toBe("plugin asset");
    expect(libraries.versions.length).toBeGreaterThan(0);
    expect(
      libraries.versions.some((version) =>
        version.packageSnapshot?.files.some(
          (file) =>
            file.contentBase64 ===
            Buffer.from("plugin asset").toString("base64"),
        ),
      ),
    ).toBe(true);
  });

  it("pushes the full workspace snapshot to a remote sync endpoint", async () => {
    const root = makeTempRoot(tempDirs);
    let requestBody: any;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          data: {
            ok: true,
            summary: {
              prompts: 1,
              folders: 0,
              rules: 0,
              skills: 0,
              mcpServers: 1,
              plugins: 1,
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(
      (
        await execCli([
          ...dataArgs(root),
          "prompt",
          "create",
          "--title",
          "Remote Push",
          "--user-prompt",
          "Push body",
        ])
      ).exitCode,
    ).toBe(0);
    seedMcpAndPluginLibraries(root);

    const result = await execCli([
      ...dataArgs(root),
      "sync",
      "push",
      "--endpoint",
      "https://sync.example.com/",
      "--token",
      "token-1",
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sync.example.com/api/sync/data",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(requestBody.payload).toMatchObject({
      prompts: [expect.objectContaining({ title: "Remote Push" })],
      mcpLibrary: {
        servers: [expect.objectContaining({ name: "docs-mcp" })],
      },
      pluginLibrary: {
        plugins: [expect.objectContaining({ id: "plugin-1" })],
      },
    });
    expect(JSON.stringify(requestBody)).not.toContain("cli-secret");
    expect(result.stdout).toMatchObject({
      pushed: true,
      localSummary: {
        prompts: 1,
        mcpServers: 1,
        plugins: 1,
      },
    });
  });

  it("falls back to sync manifest when a cloud endpoint has no status route", async () => {
    const root = makeTempRoot(tempDirs);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Not found" } }), {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              version: "web-cloudflare-backup-v1",
              exportedAt: "2026-06-28T00:00:00.000Z",
              counts: {
                prompts: 1,
                folders: 0,
                rules: 0,
                skills: 0,
                mcpServers: 1,
                plugins: 1,
              },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await execCli([
      ...dataArgs(root),
      "sync",
      "status",
      "--endpoint",
      "https://cloud.example.com",
      "--token",
      "token-1",
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://cloud.example.com/api/sync/status",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://cloud.example.com/api/sync/manifest",
      expect.any(Object),
    );
    expect(result.stdout.counts).toMatchObject({
      prompts: 1,
      mcpServers: 1,
      plugins: 1,
    });
  });

  it("pulls a remote sync snapshot into the local workspace", async () => {
    const sourceRoot = makeTempRoot(tempDirs);
    const targetRoot = makeTempRoot(tempDirs);
    const exportFile = path.join(sourceRoot, "workspace.json");

    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "prompt",
          "create",
          "--title",
          "Remote Pull",
          "--user-prompt",
          "Pull body",
        ])
      ).exitCode,
    ).toBe(0);
    const sourceRuleRoot = path.join(sourceRoot, "remote-rule");
    fs.mkdirSync(sourceRuleRoot, { recursive: true });
    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "rules",
          "add-project",
          "--id",
          "remote-rule",
          "--name",
          "Remote Rule",
          "--root-path",
          sourceRuleRoot,
        ])
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "rules",
          "save",
          "project:remote-rule",
          "--content",
          "# remote managed",
        ])
      ).exitCode,
    ).toBe(0);
    seedMcpAndPluginLibraries(sourceRoot);
    seedMcpAndPluginLibraries(targetRoot, "target-secret");
    expect(
      (
        await execCli([
          ...dataArgs(sourceRoot),
          "workspace",
          "export",
          "--file",
          exportFile,
        ])
      ).exitCode,
    ).toBe(0);
    fs.writeFileSync(
      path.join(sourceRuleRoot, "AGENTS.md"),
      "# target changed externally",
      "utf8",
    );

    const remoteBundle = JSON.parse(fs.readFileSync(exportFile, "utf8"));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: remoteBundle.payload }), {
            status: 200,
          }),
      ),
    );

    const result = await execCli([
      ...dataArgs(targetRoot),
      "sync",
      "pull",
      "--endpoint",
      "https://sync.example.com",
      "--token",
      "token-1",
      "--force-clear",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchObject({
      pulled: true,
      prompts: 1,
      mcpServers: 1,
      plugins: 1,
      forceCleared: true,
    });

    const promptList = await execCli([
      ...dataArgs(targetRoot),
      "prompt",
      "list",
    ]);
    expect(promptList.stdout).toEqual([
      expect.objectContaining({ title: "Remote Pull" }),
    ]);
    expect(
      withRuntimePaths(
        targetRoot,
        () => new CoreMcpLibraryService().read().servers[0]?.env,
      ),
    ).toEqual({ API_TOKEN: "target-secret" });
    const importedRule = await execCli([
      ...dataArgs(targetRoot),
      "rules",
      "read",
      "project:remote-rule",
    ]);
    expect(importedRule.exitCode).toBe(0);
    expect(importedRule.stdout).toMatchObject({
      content: "# remote managed",
      syncStatus: "target-missing",
      targetPath: "",
      projectRootPath: null,
    });
    expect(
      fs.readFileSync(path.join(sourceRuleRoot, "AGENTS.md"), "utf8"),
    ).toBe("# target changed externally");
  });
});
