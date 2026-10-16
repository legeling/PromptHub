/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AgentProviderProfileDB,
  closeDatabase,
  initDatabase,
} from "@prompthub/db";
import { writeCanonicalStorageAuthority } from "@prompthub/core";
import type { CreateAgentProviderProfileInput } from "@prompthub/shared";
import Database from "../../../src/main/database/sqlite";
import { createAgentProviderRuntime } from "../../../src/main/services/agent-provider-runtime";
import {
  getDatabasePath,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { initializeAgentSettingsFixture } from "../../helpers/agent-settings";

describe("agent provider runtime", () => {
  let database: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-agent-provider-runtime-"),
    );
    database = initializeAgentSettingsFixture(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists profiles in SQLite without publishing a second JSON authority", async () => {
    writeCanonicalStorageAuthority(tempDir, {
      consistencyId: "a".repeat(64),
      operationId: "provider-sqlite-test",
    });
    const runtime = createAgentProviderRuntime({
      database,
      userDataPath: tempDir,
      encryption: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value, "utf8"),
        decryptString: (value) => value.toString("utf8"),
      },
    });
    const created = await runtime.profileService.create({
      profile: {
        platformId: "codex",
        name: "SQL provider",
        providerKind: "openai",
        protocol: "openai-responses",
        config: {},
        source: "manual",
      },
      modelMappings: [
        { routeKey: "primary", modelId: "fixture", parameters: {} },
      ],
    });
    expect(fs.existsSync(path.join(tempDir, "data", "agents"))).toBe(false);
    closeDatabase();
    database = initDatabase(getDatabasePath());
    const stored = new AgentProviderProfileDB(database);
    expect(stored.listProfiles()).toMatchObject([{ name: "SQL provider" }]);
    expect(stored.listModelMappings(stored.listProfiles()[0].id)).toMatchObject(
      [{ modelId: "fixture" }],
    );
    expect(created).toBeDefined();
  });

  it("preserves historical unsupported profiles while refusing new writes and activation", async () => {
    const runtime = createAgentProviderRuntime({
      database,
      userDataPath: tempDir,
      encryption: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value, "utf8"),
        decryptString: (value) => value.toString("utf8"),
      },
    });
    const input: Omit<CreateAgentProviderProfileInput, "secretRef"> = {
      platformId: "qwen",
      name: "Existing Qwen",
      providerKind: "openai-compatible",
      protocol: "openai-chat",
      endpoint: "https://example.com",
      config: {},
      source: "manual",
    };
    const existing = runtime.profileDb.createProfileWithMappings(
      { ...input, secretRef: null },
      [],
    );
    await expect(
      runtime.profileService.create({ profile: input, modelMappings: [] }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    await expect(
      runtime.profileService.update({
        id: existing.id,
        expectedUpdatedAt: existing.updatedAt,
        profile: { name: "Changed" },
        secretAction: "preserve",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    await expect(
      runtime.activationService.importCurrent({
        context: { agentId: "qwen", platformId: "qwen", rootPath: tempDir },
      }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    expect(runtime.profileDb.getProfileById(existing.id)).toEqual(existing);
    await expect(runtime.trayService.listGroups()).resolves.toEqual([]);
    expect(
      (await runtime.profileService.list({ platformId: "qwen" })).map(
        ({ name }) => name,
      ),
    ).toEqual(["Existing Qwen"]);
    expect(runtime.profileService.export(existing.id).profile).toMatchObject({
      platformId: "qwen",
      name: "Existing Qwen",
    });
  });

  it("shares one profile and activation runtime with the tray projection", async () => {
    const runtime = createAgentProviderRuntime({
      database,
      encryption: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value, "utf8"),
        decryptString: (value) => value.toString("utf8"),
      },
      userDataPath: tempDir,
    });

    await runtime.profileService.create({
      profile: {
        platformId: "opencode",
        name: "OpenCode Primary",
        providerKind: "openai-compatible",
        protocol: "openai-chat",
        endpoint: "https://example.com",
        config: {},
        source: "manual",
      },
      modelMappings: [
        {
          routeKey: "primary",
          modelId: "qwen3-coder",
          parameters: {},
        },
      ],
    });

    await expect(runtime.trayService.listGroups()).resolves.toEqual([
      expect.objectContaining({
        agentId: "opencode",
        currentProfileId: null,
        name: "OpenCode",
        profiles: [
          expect.objectContaining({
            model: "qwen3-coder",
            name: "OpenCode Primary",
          }),
        ],
      }),
    ]);
    expect(runtime.activationService).toBeDefined();
    expect(runtime.legacyProviderService).toBeDefined();
    expect(runtime.sessionIndexDb).toBeDefined();
    expect(runtime.secretStore).toBeDefined();

    runtime.sessionIndexDb.registerSource({
      platformId: "claude",
      rootPath: path.join(tempDir, "source-device", "projects"),
      adapterId: "claude-jsonl-v1",
      adapterVersion: "1",
      enabled: true,
    });
    await expect(runtime.backupService.exportBackup()).resolves.toMatchObject({
      sessionSourcePreferences: [
        {
          platformId: "claude",
          adapterId: "claude-jsonl-v1",
          enabled: true,
        },
      ],
    });
  });
});
