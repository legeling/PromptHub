/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RENDERER_PERSISTENCE_MARKER,
  readCanonicalStorageAuthority,
  readCanonicalStorageShadow,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import {
  closeDatabase,
  DatabaseAdapter,
  initDatabase,
  PromptDB,
} from "@prompthub/db";
import { afterEach, describe, expect, it } from "vitest";

import {
  publishCanonicalStorageAuthority,
  recoverCanonicalStorageAuthorityFromDatabase,
} from "../../../src/main/services/canonical-storage-authority";

describe("canonical storage authority publication", () => {
  const roots: string[] = [];

  afterEach(() => {
    closeDatabase();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture() {
    const activeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-authority-publication-"),
    );
    roots.push(activeRoot);
    writeRuntimeLayoutState(activeRoot);
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
      "utf8",
    );
    fs.mkdirSync(path.join(activeRoot, "config"), { recursive: true });
    fs.mkdirSync(path.join(activeRoot, "secrets"), { recursive: true });
    fs.writeFileSync(path.join(activeRoot, "config", "app.json"), "{}\n");
    fs.writeFileSync(
      path.join(activeRoot, "secrets", "vault.enc"),
      "encrypted\n",
    );
    const sourceDatabasePath = path.join(activeRoot, "data", "prompthub.db");
    const database = initDatabase(sourceDatabasePath);
    const prompt = new PromptDB(database).create({
      title: "Authority prompt",
      userPrompt: "Persist me",
    });
    closeDatabase();
    return {
      activeRoot,
      sourceDatabasePath,
      prompt,
      checkpointPath: path.join(activeRoot, "cache", "authority-checkpoint"),
    };
  }

  function options(input: ReturnType<typeof fixture>) {
    return {
      ...input,
      readRules: () => [],
      mcpLibrary: {
        kind: "prompthub-mcp-library" as const,
        version: 1 as const,
        updatedAt: "2026-08-12T00:00:00.000Z",
        servers: [
          {
            id: "mcp-1",
            name: "filesystem",
            displayName: "Filesystem",
            transport: "stdio" as const,
            command: "npx",
            args: ["server-filesystem"],
            enabled: true,
            source: { type: "manual" as const },
            createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
            updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
          },
        ],
        bindings: [
          {
            id: "codex:global:/Users/example/.codex/config.toml",
            serverIds: ["mcp-1"],
            target: "codex" as const,
            scope: "global" as const,
            path: "/Users/example/.codex/config.toml",
            enabled: true,
            createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
            updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
          },
        ],
      },
      deviceId: "device-1",
      plugins: [],
      pluginVersions: new Map(),
      generations: [],
      getAvailableBytes: () => Number.MAX_SAFE_INTEGER,
      operationId: "canonical-authority-test",
      now: new Date("2026-08-12T01:00:00.000Z"),
    };
  }

  it("atomically publishes canonical files and a rebuildable catalog", async () => {
    const input = fixture();
    const result = await publishCanonicalStorageAuthority(options(input));

    expect(result.status).toBe("committed");
    expect(readCanonicalStorageAuthority(input.activeRoot)).toMatchObject({
      authority: "canonical-files",
      catalogRole: "rebuildable",
      consistencyId: result.consistencyId,
    });
    expect(
      readCanonicalStorageShadow(path.join(input.activeRoot, "data"))
        .promptGraph.snapshot.prompts,
    ).toEqual([expect.objectContaining({ id: input.prompt.id })]);
    expect(
      fs.existsSync(path.join(input.activeRoot, RENDERER_PERSISTENCE_MARKER)),
    ).toBe(true);
    expect(fs.existsSync(input.checkpointPath)).toBe(false);
    const database = new DatabaseAdapter(input.sourceDatabasePath, {
      readOnly: true,
    });
    try {
      expect(new PromptDB(database).getById(input.prompt.id)?.title).toBe(
        "Authority prompt",
      );
    } finally {
      database.close();
    }
    expect(
      fs.existsSync(
        path.join(result.recoveryArtifactPath, "root", "data", "prompthub.db"),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(input.activeRoot, "config", "app.json"),
        "utf8",
      ),
    ).toBe("{}\n");
    expect(
      fs.readFileSync(
        path.join(input.activeRoot, "secrets", "vault.enc"),
        "utf8",
      ),
    ).toBe("encrypted\n");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(input.activeRoot, "config", "devices", "mcp-bindings.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      deviceId: "device-1",
      bindings: [{ id: "codex:global:/Users/example/.codex/config.toml" }],
    });
  });

  it("rolls back the whole data tree when post-publication verification fails", async () => {
    const input = fixture();
    const before = fs.readFileSync(input.sourceDatabasePath);

    await expect(
      publishCanonicalStorageAuthority({
        ...options(input),
        injectFailure: (stage) => {
          if (stage === "verified") throw new Error("verification interrupted");
        },
      }),
    ).rejects.toThrow("verification interrupted");

    expect(readCanonicalStorageAuthority(input.activeRoot)).toBeNull();
    expect(fs.readFileSync(input.sourceDatabasePath)).toEqual(before);
    expect(fs.existsSync(input.checkpointPath)).toBe(false);
  });

  it("never removes a checkpoint path it did not create", async () => {
    const input = fixture();
    fs.mkdirSync(input.checkpointPath, { recursive: true });
    fs.writeFileSync(path.join(input.checkpointPath, "owned.txt"), "keep");

    await expect(
      publishCanonicalStorageAuthority(options(input)),
    ).rejects.toThrow("target already exists");

    expect(
      fs.readFileSync(path.join(input.checkpointPath, "owned.txt"), "utf8"),
    ).toBe("keep");
    expect(readCanonicalStorageAuthority(input.activeRoot)).toBeNull();
  });

  it("atomically recovers an invalid authority from an explicitly selected SQLite catalog", async () => {
    const input = fixture();
    await publishCanonicalStorageAuthority(options(input));
    const originalPromptManifest = path.join(
      input.activeRoot,
      "data",
      "prompts",
      input.prompt.id,
      "manifest.json",
    );
    fs.rmSync(originalPromptManifest);

    const database = new DatabaseAdapter(input.sourceDatabasePath);
    const recoveredPrompt = new PromptDB(database).create({
      title: "Recovered from SQLite",
      userPrompt: "Selected explicitly",
    });
    database.close();

    const result = await recoverCanonicalStorageAuthorityFromDatabase({
      ...options(input),
      operationId: "canonical-authority-recovery-test",
    });

    expect(result.status).toBe("committed");
    expect(
      readCanonicalStorageShadow(path.join(input.activeRoot, "data"))
        .promptGraph.snapshot.prompts,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: input.prompt.id }),
        expect.objectContaining({ id: recoveredPrompt.id }),
      ]),
    );
    expect(
      fs.existsSync(
        path.join(result.recoveryArtifactPath, "root", "data", "catalog.json"),
      ),
    ).toBe(true);
  });

  it("refuses recovery while the existing canonical authority is valid", async () => {
    const input = fixture();
    await publishCanonicalStorageAuthority(options(input));

    await expect(
      recoverCanonicalStorageAuthorityFromDatabase(options(input)),
    ).rejects.toThrow("does not require recovery");
  });

  it("rebuilds a valid Prompt graph only for an explicitly scoped canonical-storage recovery", async () => {
    const input = fixture();
    await publishCanonicalStorageAuthority(options(input));

    const database = new DatabaseAdapter(input.sourceDatabasePath);
    const recoveredPrompt = new PromptDB(database).create({
      title: "Recovered canonical storage",
      userPrompt: "Selected from the current SQLite catalog",
    });
    database.close();

    const result = await recoverCanonicalStorageAuthorityFromDatabase({
      ...options(input),
      recoveryScope: "canonical-storage",
      operationId: "canonical-storage-recovery-test",
    });

    expect(result.status).toBe("committed");
    expect(
      readCanonicalStorageShadow(path.join(input.activeRoot, "data"))
        .promptGraph.snapshot.prompts,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: input.prompt.id }),
        expect.objectContaining({ id: recoveredPrompt.id }),
      ]),
    );
  });

  it("refuses recovery without a published authority marker", async () => {
    const input = fixture();

    await expect(
      recoverCanonicalStorageAuthorityFromDatabase(options(input)),
    ).rejects.toThrow("requires an authority marker");
  });

  it("rolls back to the invalid pre-recovery graph when recovery verification fails", async () => {
    const input = fixture();
    await publishCanonicalStorageAuthority(options(input));
    const promptManifestPath = path.join(
      input.activeRoot,
      "data",
      "prompts",
      input.prompt.id,
      "manifest.json",
    );
    fs.rmSync(promptManifestPath);
    const databaseBeforeRecovery = fs.readFileSync(input.sourceDatabasePath);

    await expect(
      recoverCanonicalStorageAuthorityFromDatabase({
        ...options(input),
        operationId: "canonical-authority-recovery-rollback-test",
        injectFailure: (stage) => {
          if (stage === "verified") throw new Error("recovery interrupted");
        },
      }),
    ).rejects.toThrow("recovery interrupted");

    expect(fs.existsSync(promptManifestPath)).toBe(false);
    expect(fs.readFileSync(input.sourceDatabasePath)).toEqual(
      databaseBeforeRecovery,
    );
  });

  it("rejects an unsafe existing device binding target during recovery", async () => {
    const input = fixture();
    await publishCanonicalStorageAuthority(options(input));
    fs.rmSync(
      path.join(
        input.activeRoot,
        "data",
        "prompts",
        input.prompt.id,
        "manifest.json",
      ),
    );
    const bindingPath = path.join(
      input.activeRoot,
      "config",
      "devices",
      "mcp-bindings.json",
    );
    fs.rmSync(bindingPath);
    fs.mkdirSync(bindingPath);

    await expect(
      recoverCanonicalStorageAuthorityFromDatabase({
        ...options(input),
        operationId: "canonical-authority-recovery-unsafe-binding-test",
      }),
    ).rejects.toThrow("MCP binding target is unsafe");

    expect(fs.statSync(bindingPath).isDirectory()).toBe(true);
  });
});
