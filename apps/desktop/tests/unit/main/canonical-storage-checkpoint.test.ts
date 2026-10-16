/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";

import { closeDatabase, DatabaseAdapter, initDatabase } from "@prompthub/db";
import { writeRuntimeLayoutState } from "@prompthub/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCanonicalStorageCheckpoint,
  createCanonicalCheckpointFromClosedDatabase,
  verifyCanonicalStorageCheckpointContent,
  verifyCanonicalStorageCheckpoint,
} from "../../../src/main/services/canonical-storage-checkpoint";

describe("canonical storage checkpoint", () => {
  const roots: string[] = [];

  afterEach(() => {
    closeDatabase();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture() {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-checkpoint-"),
    );
    roots.push(root);
    return {
      root,
      database: initDatabase(path.join(root, "source.db")),
      targetPath: path.join(root, "checkpoint"),
    };
  }

  function mcpLibrary(secret: string) {
    const now = Date.parse("2026-08-11T01:00:00.000Z");
    return {
      kind: "prompthub-mcp-library" as const,
      version: 1 as const,
      updatedAt: new Date(now).toISOString(),
      servers: [
        {
          id: "mcp-1",
          name: "local-mcp",
          displayName: "Local MCP",
          transport: "stdio" as const,
          command: "npx",
          args: ["local-mcp"],
          env: { TOKEN: secret },
          enabled: true,
          source: { type: "manual" as const },
          createdAt: now,
          updatedAt: now,
        },
      ],
      bindings: [
        {
          id: "binding-1",
          serverIds: ["mcp-1"],
          target: "codex" as const,
          scope: "global" as const,
          path: "/Users/example/.codex/config.toml",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  }

  function checkpointFiles(rootPath: string): string[] {
    const files: string[] = [];
    const queue = [rootPath];
    while (queue.length > 0) {
      const directory = queue.shift();
      if (!directory) break;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(entryPath);
        else if (entry.isFile()) files.push(entryPath);
      }
    }
    return files;
  }

  it("publishes a verified syncable tree, rebuildable catalog, and local binding state", async () => {
    const { database, targetPath } = fixture();
    const migratedSecrets: string[] = [];
    const result = await createCanonicalStorageCheckpoint({
      database,
      targetPath,
      readRules: () => [],
      mcpLibrary: mcpLibrary("secret-value"),
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
      deviceId: "device-1",
      persistExtractedMcpSecrets: (secrets) => {
        migratedSecrets.push(...secrets.map((secret) => secret.value));
      },
    });

    expect(migratedSecrets).toEqual(["secret-value"]);
    expect(verifyCanonicalStorageCheckpoint(targetPath)).toEqual(
      result.manifest,
    );
    expect(
      verifyCanonicalStorageCheckpointContent(
        path.join(targetPath, "canonical"),
        JSON.parse(
          fs.readFileSync(path.join(targetPath, "checkpoint.json"), "utf8"),
        ),
      ),
    ).toEqual(result.manifest);
    expect(
      fs.existsSync(path.join(targetPath, "device", "mcp-bindings.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(targetPath, "catalog", "prompthub.db")),
    ).toBe(true);
    for (const filePath of checkpointFiles(targetPath)) {
      expect(
        fs.readFileSync(filePath).includes(Buffer.from("secret-value")),
      ).toBe(false);
    }
    fs.writeFileSync(
      path.join(targetPath, "catalog", "prompthub.db"),
      "tampered",
    );
    expect(() => verifyCanonicalStorageCheckpoint(targetPath)).toThrow(
      "catalog digest mismatch",
    );
  });

  it("does not publish when extracted credentials have no secure sink", async () => {
    const { database, targetPath } = fixture();
    await expect(
      createCanonicalStorageCheckpoint({
        database,
        targetPath,
        readRules: () => [],
        mcpLibrary: mcpLibrary("unmigrated-secret"),
        plugins: [],
        pluginVersions: new Map(),
        generations: [],
        deviceId: "device-1",
      }),
    ).rejects.toThrow("secure MCP secret migration sink");
    expect(fs.existsSync(targetPath)).toBe(false);
    fs.mkdirSync(targetPath);
    await expect(
      createCanonicalStorageCheckpoint({
        database,
        targetPath,
        readRules: () => [],
        mcpLibrary: { ...mcpLibrary("ignored"), servers: [] },
        plugins: [],
        pluginVersions: new Map(),
        generations: [],
        deviceId: "device-1",
      }),
    ).rejects.toThrow("target already exists");
  });

  it("requires closed clients and builds from a consistent database image", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-closed-db-"),
    );
    roots.push(root);
    writeRuntimeLayoutState(root, { identityRoot: root });
    const sourceDatabasePath = path.join(root, "data", "prompthub.db");
    fs.mkdirSync(path.dirname(sourceDatabasePath), { recursive: true });
    const sourceDatabase = initDatabase(sourceDatabasePath);
    sourceDatabase.run(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      "checkpoint-setting",
      "preserved",
    );
    const targetPath = path.join(root, "backups", "canonical", "checkpoint-1");
    const input = {
      activeRoot: root,
      sourceDatabasePath,
      targetPath,
      readRules: () => [],
      mcpLibrary: {
        kind: "prompthub-mcp-library" as const,
        version: 1 as const,
        updatedAt: "2026-08-11T01:00:00.000Z",
        servers: [],
        bindings: [],
      },
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
    };

    await expect(
      createCanonicalCheckpointFromClosedDatabase(input),
    ).rejects.toThrow("database clients to be closed");
    closeDatabase();
    await expect(
      createCanonicalCheckpointFromClosedDatabase({
        ...input,
        getAvailableBytes: () => 0,
      }),
    ).rejects.toThrow("Insufficient space for canonical checkpoint");
    expect(fs.existsSync(targetPath)).toBe(false);
    await expect(
      createCanonicalCheckpointFromClosedDatabase({
        ...input,
        maintenanceOperationId: "not-held",
      }),
    ).rejects.toThrow("ownership could not be verified");
    await expect(
      createCanonicalCheckpointFromClosedDatabase(input),
    ).resolves.toMatchObject({ targetPath });
    const catalog = new DatabaseAdapter(
      path.join(targetPath, "catalog", "prompthub.db"),
      { readOnly: true },
    );
    try {
      expect(
        catalog.get(
          "SELECT value FROM settings WHERE key = ?",
          "checkpoint-setting",
        ),
      ).toEqual({ value: "preserved" });
    } finally {
      catalog.close();
    }
    expect(
      fs
        .readdirSync(path.dirname(targetPath))
        .some((name) => name.startsWith(".canonical-source-")),
    ).toBe(false);
  });

  it("uses a bounded sibling directory stage for a long checkpoint target", async () => {
    const input = fixture();
    const longTargetPath = path.join(
      input.root,
      `checkpoint-${"a".repeat(100)}-123e4567-e89b-12d3-a456-426614174000`,
    );
    const originalRename = fs.renameSync.bind(fs);
    let stagePath: string | undefined;
    vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
      if (path.resolve(String(target)) === path.resolve(longTargetPath)) {
        stagePath = String(source);
      }
      return originalRename(source, target);
    });

    await createCanonicalStorageCheckpoint({
      ...input,
      targetPath: longTargetPath,
      readRules: () => [],
      mcpLibrary: mcpLibrary("secret-value"),
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
      deviceId: "device-1",
      persistExtractedMcpSecrets: () => undefined,
    });

    expect(stagePath).toBeDefined();
    expect(path.dirname(stagePath!)).toBe(path.dirname(longTargetPath));
    expect(path.basename(stagePath!).length).toBeLessThanOrEqual(64);
    expect(path.basename(stagePath!)).not.toContain(
      path.basename(longTargetPath),
    );
  });
});
