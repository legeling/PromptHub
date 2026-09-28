/**
 * @vitest-environment node
 */
import fs from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";

import {
  createPortableSnapshot,
  AgentSettingsRepository,
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "@prompthub/core";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  RuleDB,
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
  recordCurrentDatabaseMigration,
} from "@prompthub/db";
import type { Prompt } from "@prompthub/shared/types";
import { afterEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";

import {
  restorePortableLogicalSnapshot,
  restorePortableSnapshotArchive,
} from "../../../src/main/services/portable-snapshot-restore";

const encryption = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.from(""),
  decryptString: () => "",
};

function prompt(id: string, title: string): Prompt {
  return {
    id,
    title,
    userPrompt: title,
    variables: [],
    tags: [],
    images: [],
    videos: [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

describe("portable snapshot restore", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function createActiveRoot(): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-portable-restore-"),
    );
    roots.push(root);
    fs.mkdirSync(path.join(root, "data", "prompts"), { recursive: true });
    fs.mkdirSync(path.join(root, "cache"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "prompts", "old.json"),
      "old projection",
    );
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
    );
    try {
      database.exec(SCHEMA_TABLES);
      database.exec(SCHEMA_INDEXES);
      recordCurrentDatabaseMigration(database, 0);
      new PromptDB(database).insertPromptDirect(prompt("old", "Old"));
    } finally {
      database.close();
    }
    return root;
  }

  function createArchive(
    root: string,
    payload: Record<string, unknown>,
    options: { generationFile?: string; orphanCanonical?: boolean } = {},
  ): string {
    const sourceRoot = path.join(root, "portable-source");
    const promptProjection = path.join(sourceRoot, "data", "prompts");
    fs.mkdirSync(promptProjection, { recursive: true });
    fs.writeFileSync(path.join(promptProjection, "new.json"), "new projection");
    const snapshotPath = path.join(root, "portable-snapshot");
    const generationPath = path.join(sourceRoot, "data", "generations");
    if (options.generationFile) {
      fs.mkdirSync(generationPath, { recursive: true });
      fs.writeFileSync(
        path.join(generationPath, "batch.json"),
        options.generationFile,
        "utf8",
      );
    }
    const canonicalPath = path.join(sourceRoot, "canonical");
    if (options.orphanCanonical) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "orphan.json"), "{}");
    }
    createPortableSnapshot({
      sourceRoot,
      destinationPath: snapshotPath,
      scopes: [
        {
          id: "prompts",
          sourcePath: promptProjection,
          archivePath: "data/prompts",
        },
        ...(options.generationFile
          ? [
              {
                id: "generations",
                sourcePath: generationPath,
                archivePath: "data/generations",
              },
            ]
          : []),
        ...(options.orphanCanonical
          ? [
              {
                id: "canonical",
                sourcePath: canonicalPath,
                archivePath: "canonical",
              },
            ]
          : []),
      ],
      generatedFiles: [
        {
          archivePath: "import-with-prompthub.json",
          scope: "logical",
          content: Buffer.from(
            JSON.stringify({
              kind: "prompthub-export",
              exportedAt: "2026-08-11T00:00:00.000Z",
              scope: {
                prompts: true,
                folders: true,
                versions: false,
                images: false,
                videos: false,
                aiConfig: false,
                settings: false,
                rules: false,
                skills: false,
                mcp: false,
                plugins: false,
                agents: false,
              },
              payload,
            }),
          ),
        },
      ],
      operationId: "portable-restore-test",
    });
    const files: Record<string, Uint8Array> = {};
    const visit = (directoryPath: string, prefix = ""): void => {
      for (const entry of fs.readdirSync(directoryPath, {
        withFileTypes: true,
      })) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) visit(absolutePath, relativePath);
        else files[relativePath] = fs.readFileSync(absolutePath);
      }
    };
    visit(snapshotPath);
    const archivePath = path.join(root, "portable.zip");
    fs.writeFileSync(archivePath, zipSync(files));
    return archivePath;
  }

  function createCanonicalMismatchArchive(root: string): string {
    const sourceRoot = path.join(root, "canonical-mismatch-source");
    const canonicalPath = path.join(sourceRoot, "canonical");
    materializeCanonicalStorageShadow({
      targetPath: canonicalPath,
      prompts: {
        prompts: [],
        promptVersions: [],
        folders: [],
        promptRelations: [],
        outputFormatItems: [],
      },
    });
    const catalogPath = path.join(sourceRoot, "catalog.db");
    const staged = stageCanonicalStorageDatabase(canonicalPath, catalogPath);
    fs.rmSync(catalogPath, { force: true });
    const consistencyId = crypto
      .createHash("sha256")
      .update(`${staged.promptGraphHash}:${staged.resourceCatalogHash}`)
      .digest("hex");
    const logical = {
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: true,
        folders: true,
        versions: true,
        images: true,
        videos: true,
        aiConfig: true,
        settings: true,
        rules: true,
        skills: true,
        mcp: true,
        plugins: true,
        agents: true,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        promptRelations: [],
        outputFormatItems: [],
        skills: [],
        skillVersions: [],
        rules: [],
        mcpLibrary: {
          kind: "prompthub-mcp-library",
          version: 1,
          updatedAt: "2026-08-11T00:00:00.000Z",
          servers: [
            {
              id: "stale-server",
              name: "stale-server",
              displayName: "Stale server",
              transport: "stdio",
              command: "stale",
              enabled: true,
              source: { type: "manual" },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          bindings: [],
        },
        pluginLibrary: {
          kind: "prompthub-plugin-library",
          version: 1,
          updatedAt: "2026-08-11T00:00:00.000Z",
          plugins: [],
        },
        agentManagement: {
          version: 1,
          providerProfiles: [],
          snapshots: [],
        },
        aiConfig: {},
        settings: { state: {} },
      },
    };
    const snapshotPath = path.join(root, "canonical-mismatch-snapshot");
    createPortableSnapshot({
      sourceRoot,
      destinationPath: snapshotPath,
      scopes: [
        {
          id: "canonical",
          sourcePath: canonicalPath,
          archivePath: "canonical",
        },
      ],
      generatedFiles: [
        {
          archivePath: "canonical-checkpoint.json",
          scope: "canonical",
          content: Buffer.from(
            JSON.stringify({
              kind: "prompthub-canonical-storage-checkpoint",
              version: 1,
              createdAt: "2026-08-11T00:00:00.000Z",
              consistencyId,
              canonicalPath: "canonical",
              catalogPath: "catalog/prompthub.db",
              catalogByteSize: 0,
              catalogSha256: "0".repeat(64),
              promptGraphHash: staged.promptGraphHash,
              resourceCatalogHash: staged.resourceCatalogHash,
              resourceCount: staged.resourceCount,
              domainCounts: staged.domainCounts,
            }),
          ),
        },
        {
          archivePath: "import-with-prompthub.json",
          scope: "logical",
          content: Buffer.from(JSON.stringify(logical)),
        },
      ],
    });
    const files: Record<string, Uint8Array> = {};
    const visit = (directoryPath: string, prefix = ""): void => {
      for (const entry of fs.readdirSync(directoryPath, {
        withFileTypes: true,
      })) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) visit(absolutePath, relativePath);
        else files[relativePath] = fs.readFileSync(absolutePath);
      }
    };
    visit(snapshotPath);
    const archivePath = path.join(root, "canonical-mismatch.zip");
    fs.writeFileSync(archivePath, zipSync(files));
    return archivePath;
  }

  it("publishes the verified database and files as one recoverable set", async () => {
    const root = createActiveRoot();
    const archivePath = createArchive(root, {
      version: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      prompts: [prompt("new", "New")],
      folders: [],
      versions: [],
    });

    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-success",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result).toMatchObject({ success: true, needsRestart: true });
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(database).getAll().map((item) => item.id)).toEqual([
        "new",
      ]);
    } finally {
      database.close();
    }
    expect(
      fs.readFileSync(path.join(root, "data", "prompts", "new.json"), "utf8"),
    ).toBe("new projection");
    expect(result.recoveryArtifactPath).toBeTruthy();
    expect(
      fs.existsSync(path.join(result.recoveryArtifactPath!, "manifest.json")),
    ).toBe(true);
  });

  it("restores raw generation files when the portable manifest declares the domain", async () => {
    const root = createActiveRoot();
    fs.mkdirSync(path.join(root, "data", "generations"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "generations", "old.json"),
      "old generation",
      "utf8",
    );
    const archivePath = createArchive(
      root,
      {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [prompt("new", "New")],
        folders: [],
        versions: [],
      },
      { generationFile: "new generation" },
    );

    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-generations",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result.success).toBe(true);
    expect(
      fs.readFileSync(
        path.join(root, "data", "generations", "batch.json"),
        "utf8",
      ),
    ).toBe("new generation");
    expect(
      fs.existsSync(path.join(root, "data", "generations", "old.json")),
    ).toBe(false);
  });

  it("keeps active state unchanged when candidate validation fails", async () => {
    const root = createActiveRoot();
    const archivePath = createArchive(root, {
      version: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      prompts: [prompt("new", "New")],
      folders: [],
      versions: [],
      promptRelations: [
        {
          id: "bad-relation",
          sourcePromptId: "new",
          targetPromptId: "missing",
          relationType: "related",
          createdAt: "2026-08-11T00:00:00.000Z",
        },
      ],
    });

    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-invalid",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result.success).toBe(false);
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(database).getAll().map((item) => item.id)).toEqual([
        "old",
      ]);
    } finally {
      database.close();
    }
    expect(fs.existsSync(path.join(root, "data", "prompts", "old.json"))).toBe(
      true,
    );
  });

  it("rejects an orphaned canonical tree before active mutation", async () => {
    const root = createActiveRoot();
    const archivePath = createArchive(
      root,
      {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [prompt("new", "New")],
        folders: [],
        versions: [],
      },
      { orphanCanonical: true },
    );

    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-orphan-canonical",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result).toMatchObject({ success: false, needsRestart: false });
    expect(result.error).toMatch(/canonical checkpoint manifest/i);
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      {
        readOnly: true,
      },
    );
    expect(new PromptDB(database).getAll().map((item) => item.id)).toEqual([
      "old",
    ]);
    database.close();
  });

  it("rejects a valid canonical tree paired with a stale logical envelope", async () => {
    const root = createActiveRoot();
    const archivePath = createCanonicalMismatchArchive(root);

    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-canonical-mismatch",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result).toMatchObject({ success: false, needsRestart: false });
    expect(result.error).toContain("does not match canonical MCP servers");
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(database).getById("old")?.title).toBe("Old");
    } finally {
      database.close();
    }
  });

  it("fails capacity preflight before extracting or mutating", async () => {
    const root = createActiveRoot();
    const archivePath = createArchive(root, {
      version: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      prompts: [prompt("new", "New")],
      folders: [],
      versions: [],
    });
    const result = await restorePortableSnapshotArchive({
      archivePath,
      activeRoot: root,
      cacheRoot: path.join(root, "cache"),
      encryption,
      operationId: "restore-no-space",
      getAvailableBytes: () => 0,
    });
    expect(result.error).toMatch(/Insufficient space/);
    expect(
      fs.existsSync(
        path.join(root, "cache", "portable-imports", "restore-no-space"),
      ),
    ).toBe(false);
  });

  it("atomically restores a bounded logical compatibility snapshot", async () => {
    const root = createActiveRoot();
    const logicalText = JSON.stringify({
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: true,
        folders: true,
        versions: false,
        images: false,
        videos: false,
        aiConfig: false,
        settings: true,
        rules: false,
        skills: false,
        mcp: false,
        plugins: false,
        agents: false,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [prompt("logical", "Logical")],
        folders: [],
        versions: [],
        settings: {
          state: {
            customPlatformRootPaths: {
              codex: path.join(root, "restored-agent"),
            },
          },
        },
      },
    });

    const result = await restorePortableLogicalSnapshot({
      logicalText,
      activeRoot: root,
      encryption,
      operationId: "logical-success",
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result).toMatchObject({ success: true, needsRestart: true });
    expect(result.consistencyId).toMatch(/^[a-f0-9]{64}$/);
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(database).getAll().map((item) => item.id)).toEqual([
        "logical",
      ]);
      expect(
        new AgentSettingsRepository(database).read().builtinAgentOverrides,
      ).toEqual({ codex: { rootPath: path.join(root, "restored-agent") } });
      expect(
        database
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("customPlatformRootPaths"),
      ).toBeNull();
    } finally {
      database.close();
    }
  });

  it("replaces Folders without deleting Prompts or their membership", async () => {
    const root = createActiveRoot();
    const database = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
    );
    try {
      new FolderDB(database).insertFolderDirect({
        id: "folder-1",
        name: "Before",
        parentId: null,
        order: 0,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      });
      database.run("UPDATE prompts SET folder_id = ? WHERE id = ?", [
        "folder-1",
        "old",
      ]);
    } finally {
      database.close();
    }
    const logicalText = JSON.stringify({
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: false,
        folders: true,
        versions: false,
        images: false,
        videos: false,
        aiConfig: false,
        settings: false,
        rules: false,
        skills: false,
        mcp: false,
        plugins: false,
        agents: false,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [],
        folders: [
          {
            id: "folder-1",
            name: "After",
            parentId: null,
            sortOrder: 0,
            createdAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:01.000Z",
          },
        ],
        versions: [],
      },
    });

    const result = await restorePortableLogicalSnapshot({
      logicalText,
      activeRoot: root,
      encryption,
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });
    expect(result.success).toBe(true);
    const restored = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(restored).getById("old")?.folderId).toBe("folder-1");
      expect(new FolderDB(restored).getById("folder-1")?.name).toBe("After");
    } finally {
      restored.close();
    }
    expect(fs.existsSync(path.join(root, "data", "prompts", "old.json"))).toBe(
      true,
    );
  });

  it("restores Rule files and chronological version metadata together", async () => {
    const root = createActiveRoot();
    const ruleId = "custom:codex-agents";
    const logicalText = JSON.stringify({
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: false,
        folders: false,
        versions: false,
        images: false,
        videos: false,
        aiConfig: false,
        settings: false,
        rules: true,
        skills: false,
        mcp: false,
        plugins: false,
        agents: false,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        rules: [
          {
            id: ruleId,
            platformId: "codex",
            platformName: "Codex",
            platformIcon: "codex",
            platformDescription: "Codex rules",
            name: "AGENTS.md",
            description: "Managed rules",
            group: "assistant",
            path: "AGENTS.md",
            content: "current",
            versions: [
              {
                id: "newer",
                savedAt: "2026-08-11T00:00:02.000Z",
                content: "newer",
                source: "manual-save",
              },
              {
                id: "older",
                savedAt: "2026-08-11T00:00:01.000Z",
                content: "older",
                source: "create",
              },
            ],
          },
        ],
      },
    });

    const result = await restorePortableLogicalSnapshot({
      logicalText,
      activeRoot: root,
      encryption,
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });
    expect(result.success).toBe(true);
    const encodedId = encodeURIComponent(ruleId);
    expect(
      fs.readFileSync(
        path.join(root, "data", "rules", "managed", `${encodedId}.md`),
        "utf8",
      ),
    ).toBe("current");
    const restored = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      const versions = new RuleDB(restored).getVersions(ruleId);
      expect(versions.map((version) => version.id)).toEqual(["newer", "older"]);
      expect(versions.find((version) => version.id === "older")?.version).toBe(
        1,
      );
      expect(versions.find((version) => version.id === "newer")?.version).toBe(
        2,
      );
    } finally {
      restored.close();
    }
  });

  it("rejects logical settings secrets before publishing staged state", async () => {
    const root = createActiveRoot();
    const logicalText = JSON.stringify({
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: false,
        folders: false,
        versions: false,
        images: false,
        videos: false,
        aiConfig: false,
        settings: true,
        rules: false,
        skills: false,
        mcp: false,
        plugins: false,
        agents: false,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        settings: { state: { apiKey: "must-not-import" } },
      },
    });

    const result = await restorePortableLogicalSnapshot({
      logicalText,
      activeRoot: root,
      encryption,
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });
    expect(result.error).toMatch(/forbidden secret field/);
    const restored = new DatabaseAdapter(
      path.join(root, "data", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(new PromptDB(restored).getById("old")?.title).toBe("Old");
    } finally {
      restored.close();
    }
  });

  it("restores Plugin packages under the active root and rewrites local paths", async () => {
    const root = createActiveRoot();
    const logicalText = JSON.stringify({
      kind: "prompthub-export",
      exportedAt: "2026-08-11T00:00:00.000Z",
      scope: {
        prompts: false,
        folders: false,
        versions: false,
        images: false,
        videos: false,
        aiConfig: false,
        settings: false,
        rules: false,
        skills: false,
        mcp: false,
        plugins: true,
        agents: false,
      },
      payload: {
        version: 1,
        exportedAt: "2026-08-11T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        pluginLibrary: {
          kind: "prompthub-plugin-library",
          version: 1,
          updatedAt: "2026-08-11T00:00:00.000Z",
          plugins: [
            {
              id: "custom:demo",
              name: "Demo",
              source: {
                kind: "local",
                localPackagePath: "/another-machine/package",
              },
              managedPath: "/another-machine/managed",
              localPackagePath: "/another-machine/package",
            },
          ],
        },
        pluginPackages: [
          {
            pluginId: "custom:demo",
            files: [
              {
                relativePath: ".codex-plugin/plugin.json",
                contentBase64:
                  Buffer.from('{"name":"demo"}').toString("base64"),
                size: 15,
              },
            ],
          },
        ],
      },
    });

    const result = await restorePortableLogicalSnapshot({
      logicalText,
      activeRoot: root,
      encryption,
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });
    expect(result.success).toBe(true);
    const pluginRoot = path.join(root, "data", "plugins", "custom-demo");
    expect(
      fs.readFileSync(
        path.join(pluginRoot, "package", ".codex-plugin", "plugin.json"),
        "utf8",
      ),
    ).toBe('{"name":"demo"}');
    const library = JSON.parse(
      fs.readFileSync(
        path.join(root, "data", "plugins", "library.json"),
        "utf8",
      ),
    );
    expect(library.plugins[0].managedPath).toBe(pluginRoot);
    expect(library.plugins[0].localPackagePath).toBe(
      path.join(pluginRoot, "package"),
    );
    expect(JSON.stringify(library)).not.toContain("another-machine");
  });
});
