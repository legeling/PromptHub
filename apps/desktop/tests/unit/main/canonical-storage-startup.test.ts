/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RENDERER_PERSISTENCE_MARKER,
  configureRuntimePaths,
  deriveLocalResourceDeviceId,
  getRuntimeStorageContext,
  materializePromptCanonicalGraph,
  resetRuntimePaths,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { closeDatabase, initDatabase } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureCanonicalStorageAuthorityOnStartup,
  relocateTrashedPromptWorkspaceFromCanonicalRoot,
} from "../../../src/main/services/canonical-storage-startup";

describe("prompt workspace trash relocation from the canonical root", () => {
  let activeRoot2: string;
  let dataRoot2: string;

  beforeEach(() => {
    activeRoot2 = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-trash-relocate-"),
    );
    dataRoot2 = path.join(activeRoot2, "data");
    fs.mkdirSync(dataRoot2, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(activeRoot2, { recursive: true, force: true });
  });

  function canonicalTrashSnapshot(): string {
    return path.join(dataRoot2, ".trash", "cache", "prompt-workspace");
  }

  it("relocates an old prompt-workspace leftover without deleting its content", () => {
    const source = canonicalTrashSnapshot();
    fs.mkdirSync(path.join(source, "123"), { recursive: true });
    fs.writeFileSync(path.join(source, "123", "123.md"), "keep me", "utf8");

    relocateTrashedPromptWorkspaceFromCanonicalRoot(dataRoot2, activeRoot2);

    expect(fs.existsSync(source)).toBe(false);
    const recoveryRoot = path.join(
      activeRoot2,
      "recovery",
      "canonical-prompt-trash",
    );
    const dirs = fs
      .readdirSync(recoveryRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    expect(dirs.length).toBe(1);
    const movedFile = path.join(
      recoveryRoot,
      dirs[0].name,
      "123",
      "123.md",
    );
    expect(fs.readFileSync(movedFile, "utf8")).toBe("keep me");
  });

  it("leaves other trash directories under the canonical root untouched", () => {
    const conflicts = path.join(dataRoot2, ".trash", "conflicts");
    fs.mkdirSync(conflicts, { recursive: true });
    fs.writeFileSync(path.join(conflicts, "note.txt"), "keep", "utf8");

    relocateTrashedPromptWorkspaceFromCanonicalRoot(dataRoot2, activeRoot2);

    expect(fs.readFileSync(path.join(conflicts, "note.txt"), "utf8")).toBe(
      "keep",
    );
  });

  it("does nothing when no stale prompt-workspace snapshot exists", () => {
    relocateTrashedPromptWorkspaceFromCanonicalRoot(dataRoot2, activeRoot2);
    expect(fs.existsSync(canonicalTrashSnapshot())).toBe(false);
  });

  it("does not throw when relocation fails and keeps the snapshot in place", () => {
    const source = canonicalTrashSnapshot();
    fs.mkdirSync(path.join(source, "keep"), { recursive: true });
    fs.writeFileSync(path.join(source, "keep", "note.txt"), "preserve me");

    // Make the recovery target unusable so mkdir/rename raises (e.g. EACCES/EXDEV).
    const recoveryRoot = path.join(
      activeRoot2,
      "recovery",
      "canonical-prompt-trash",
    );
    fs.mkdirSync(path.dirname(recoveryRoot), { recursive: true });
    fs.writeFileSync(recoveryRoot, "not-a-directory", "utf8");

    expect(() =>
      relocateTrashedPromptWorkspaceFromCanonicalRoot(dataRoot2, activeRoot2),
    ).not.toThrow();

    // Stale snapshot is preserved; startup can continue without this heal.
    expect(fs.existsSync(path.join(source, "keep", "note.txt"))).toBe(true);
  });
});

describe("canonical storage startup", () => {
  const roots: string[] = [];

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture() {
    const activeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-startup-"),
    );
    roots.push(activeRoot);
    writeRuntimeLayoutState(activeRoot);
    const sourceDatabasePath = path.join(activeRoot, "data", "prompthub.db");
    fs.mkdirSync(path.dirname(sourceDatabasePath), { recursive: true });
    fs.writeFileSync(sourceDatabasePath, "database");
    return {
      activeRoot,
      sourceDatabasePath,
      prepareSourceDatabase: vi.fn(),
    };
  }

  function completeRendererMigration(activeRoot: string): void {
    const markerPath = path.join(activeRoot, RENDERER_PERSISTENCE_MARKER);
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(
      markerPath,
      `${JSON.stringify({
        kind: "prompthub-renderer-persistence-migration",
        version: 1,
        state: "complete",
        completedAt: "2026-08-12T00:00:00.000Z",
        indexedDbMigrationDone: true,
      })}\n`,
    );
  }

  function materializeEmptyPromptGraph(activeRoot: string): void {
    const stagePath = path.join(activeRoot, "prompt-graph-fixture");
    materializePromptCanonicalGraph(stagePath, {
      prompts: [],
      promptVersions: [],
      folders: [],
      promptRelations: [],
      outputFormatItems: [],
    });
    const dataPath = path.join(activeRoot, "data");
    for (const entry of fs.readdirSync(stagePath)) {
      fs.renameSync(path.join(stagePath, entry), path.join(dataPath, entry));
    }
    fs.rmdirSync(stagePath);
  }

  it("waits until renderer persistence has been durably migrated", async () => {
    const input = fixture();
    const publish = vi.fn();

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({ ...input, publish }),
    ).resolves.toEqual({ status: "waiting-renderer-migration" });
    expect(publish).not.toHaveBeenCalled();
    expect(input.prepareSourceDatabase).not.toHaveBeenCalled();
  });

  it("does not republish an existing canonical authority", async () => {
    const input = fixture();
    writeCanonicalStorageAuthority(input.activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "existing-authority",
    });
    materializeEmptyPromptGraph(input.activeRoot);
    const publish = vi.fn();
    const reconcileCatalog = vi.fn().mockReturnValue({ status: "current" });

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        publish,
        reconcileCatalog,
      }),
    ).resolves.toEqual({ status: "already-canonical" });
    expect(publish).not.toHaveBeenCalled();
    expect(reconcileCatalog).toHaveBeenCalledWith({
      activeRoot: input.activeRoot,
      databasePath: input.sourceDatabasePath,
    });
    expect(input.prepareSourceDatabase).not.toHaveBeenCalled();
  });

  it("rebuilds a stale SQLite projection without showing recovery", async () => {
    const input = fixture();
    writeCanonicalStorageAuthority(input.activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "existing-authority",
    });
    materializeEmptyPromptGraph(input.activeRoot);

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        reconcileCatalog: vi.fn().mockReturnValue({ status: "rebuilt" }),
      }),
    ).resolves.toEqual({ status: "catalog-rebuilt" });
  });

  it("requests recovery instead of aborting startup when other canonical files are invalid", async () => {
    const input = fixture();
    writeCanonicalStorageAuthority(input.activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "existing-authority",
    });
    materializeEmptyPromptGraph(input.activeRoot);

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        reconcileCatalog: vi.fn(() => {
          throw new Error("canonical Skill bundle is incomplete");
        }),
      }),
    ).resolves.toEqual({
      status: "recovery-required",
      reason: "invalid-canonical-storage",
      error: "canonical Skill bundle is incomplete",
    });
  });

  it("requires recovery when the authority Prompt graph is incomplete", async () => {
    const input = fixture();
    writeCanonicalStorageAuthority(input.activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "invalid-authority",
    });
    materializeEmptyPromptGraph(input.activeRoot);
    const catalogPath = path.join(input.activeRoot, "data", "catalog.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    catalog.files.push({
      path: "prompts/missing/manifest.json",
      size: 1,
      sha256: "f".repeat(64),
    });
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    const publish = vi.fn();
    const repairInvalidAuthority = vi
      .fn()
      .mockRejectedValue(new Error("duplicate Markdown Prompt id"));

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        publish,
        repairInvalidAuthority,
      }),
    ).resolves.toMatchObject({
      status: "recovery-required",
      reason: "invalid-canonical-prompt-graph",
      error: expect.stringContaining("duplicate Markdown Prompt id"),
    });
    expect(publish).not.toHaveBeenCalled();
    expect(repairInvalidAuthority).toHaveBeenCalledOnce();
    expect(input.prepareSourceDatabase).not.toHaveBeenCalled();
  });

  it("self-heals an invalid Prompt graph from deterministic files", async () => {
    const input = fixture();
    writeCanonicalStorageAuthority(input.activeRoot, {
      consistencyId: "a".repeat(64),
      operationId: "invalid-authority",
    });
    materializeEmptyPromptGraph(input.activeRoot);
    const catalogPath = path.join(input.activeRoot, "data", "catalog.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    catalog.files.push({
      path: "prompts/missing/manifest.json",
      size: 1,
      sha256: "f".repeat(64),
    });
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    const refreshRuntimeContext = vi.fn();

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        repairInvalidAuthority: vi.fn().mockResolvedValue({
          recoveryArtifactPath: "/recovery/prior",
        }),
        refreshRuntimeContext,
      }),
    ).resolves.toEqual({
      status: "self-healed",
      recoveryArtifactPath: "/recovery/prior",
    });
    expect(refreshRuntimeContext).toHaveBeenCalledOnce();
  });

  it("publishes once and refreshes runtime paths only after commit", async () => {
    const input = fixture();
    completeRendererMigration(input.activeRoot);
    const publish = vi.fn().mockResolvedValue({
      status: "committed",
      operationId: "authority-startup",
      consistencyId: "b".repeat(64),
      recoveryArtifactPath: path.join(input.activeRoot, "backups", "recovery"),
    });
    const refreshRuntimeContext = vi.fn();

    const result = await ensureCanonicalStorageAuthorityOnStartup({
      ...input,
      publish,
      refreshRuntimeContext,
      now: new Date("2026-08-12T01:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "published",
      operationId: "authority-startup",
      consistencyId: "b".repeat(64),
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(input.prepareSourceDatabase).toHaveBeenCalledOnce();
    expect(
      input.prepareSourceDatabase.mock.invocationCallOrder[0],
    ).toBeLessThan(publish.mock.invocationCallOrder[0] ?? 0);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      activeRoot: input.activeRoot,
      sourceDatabasePath: input.sourceDatabasePath,
      deviceId: deriveLocalResourceDeviceId(input.activeRoot),
      now: new Date("2026-08-12T01:00:00.000Z"),
    });
    expect(publish.mock.calls[0]?.[0].checkpointPath).toMatch(
      /cache[/\\]\.canonical-checkpoint-[0-9a-f-]{36}$/u,
    );
    expect(refreshRuntimeContext).toHaveBeenCalledOnce();
  });

  it("preserves the old runtime context when publication fails", async () => {
    const input = fixture();
    completeRendererMigration(input.activeRoot);
    const refreshRuntimeContext = vi.fn();

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({
        ...input,
        publish: vi.fn().mockRejectedValue(new Error("publication failed")),
        refreshRuntimeContext,
      }),
    ).rejects.toThrow("publication failed");
    expect(refreshRuntimeContext).not.toHaveBeenCalled();
  });

  it("does not publish when source database preparation fails", async () => {
    const input = fixture();
    completeRendererMigration(input.activeRoot);
    input.prepareSourceDatabase.mockImplementation(() => {
      throw new Error("migration failed");
    });
    const publish = vi.fn();

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({ ...input, publish }),
    ).rejects.toThrow("migration failed");
    expect(publish).not.toHaveBeenCalled();
  });

  it("defers a missing source database instead of creating a partial root", async () => {
    const input = fixture();
    completeRendererMigration(input.activeRoot);
    fs.rmSync(input.sourceDatabasePath);
    const publish = vi.fn();

    await expect(
      ensureCanonicalStorageAuthorityOnStartup({ ...input, publish }),
    ).resolves.toEqual({ status: "source-database-missing" });
    expect(publish).not.toHaveBeenCalled();
    expect(input.prepareSourceDatabase).not.toHaveBeenCalled();
  });

  it("switches the live runtime context to canonical file authority", async () => {
    const input = fixture();
    fs.rmSync(input.sourceDatabasePath);
    initDatabase(input.sourceDatabasePath);
    closeDatabase();
    completeRendererMigration(input.activeRoot);
    configureRuntimePaths({ userDataPath: input.activeRoot });
    expect(getRuntimeStorageContext().localAuthority).toBe("database-catalog");

    const result = await ensureCanonicalStorageAuthorityOnStartup({
      ...input,
      readRules: async () => [],
      mcpLibrary: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-08-12T00:00:00.000Z",
        servers: [
          {
            id: "mcp-1",
            name: "filesystem",
            displayName: "Filesystem",
            transport: "stdio",
            command: "npx",
            args: ["server-filesystem"],
            enabled: true,
            source: { type: "manual" },
            createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
            updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
          },
        ],
        bindings: [
          {
            id: "binding-1",
            serverIds: ["mcp-1"],
            target: "codex",
            scope: "global",
            path: "/Users/example/.codex/config.toml",
            enabled: true,
            createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
            updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
          },
        ],
      },
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    });

    expect(result.status).toBe("published");
    expect(getRuntimeStorageContext().localAuthority).toBe("canonical-files");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(input.activeRoot, "config", "devices", "mcp-bindings.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      deviceId: deriveLocalResourceDeviceId(input.activeRoot),
      bindings: [{ id: "binding-1" }],
    });
    expect(
      fs.existsSync(
        path.join(input.activeRoot, "config", "devices", "renderer.json"),
      ),
    ).toBe(false);
    expect(
      await ensureCanonicalStorageAuthorityOnStartup({ ...input }),
    ).toEqual({ status: "already-canonical" });
  });
});
