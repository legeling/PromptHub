import { planSettingsSqliteUpgrade } from "@prompthub/core/migrations/settings-sqlite-v1";
import {
  rendererTestDatabase,
  closeRendererTestDatabases,
} from "../../../../../packages/core/tests/helpers/renderer-database";
/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createRendererPersistenceStore,
  type RendererPersistenceEncryption,
} from "@prompthub/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readRendererSettingsWithAIRecovery,
  repairRendererAIConfigFromUpgradeBackups,
} from "../../../src/main/services/renderer-ai-config-recovery";

const roots: string[] = [];

const encryption: RendererPersistenceEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value) => value.toString("utf8").replace(/^encrypted:/u, ""),
};

function createRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-ai-recovery-"));
  roots.push(root);
  return root;
}

function backupConfig() {
  return {
    kind: "prompthub-ai-config" as const,
    version: 1 as const,
    updatedAt: "2026-08-18T00:00:00.000Z",
    providers: [
      {
        id: "provider-backup",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiUrl: "https://api.example.test/v1",
        apiKey: "provider-backup-secret",
      },
    ],
    models: [
      {
        id: "model-chat",
        type: "chat" as const,
        providerId: "provider-backup",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiUrl: "https://api.example.test/v1",
        apiKey: "chat-backup-secret",
        model: "gpt-chat",
        isDefault: true,
      },
      {
        id: "model-image",
        type: "image" as const,
        providerId: "provider-backup",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiUrl: "https://api.example.test/v1",
        apiKey: "image-backup-secret",
        model: "gpt-image",
      },
    ],
    modelRouteDefaults: {
      mainText: "model-chat",
      imageGeneration: "model-image",
    },
  };
}

async function createAffectedRoot(
  root: string,
  modelRouteDefaults: unknown = {
    mainText: "model-chat",
    imageGeneration: "model-image",
  },
) {
  const seed = (relative: string, value: unknown): void => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  seed("data/operations/migrations/renderer-persistence-v1.json", {
    kind: "prompthub-renderer-persistence-migration",
    version: 1,
    state: "complete",
    completedAt: "2026-08-18T00:00:00.000Z",
    indexedDbMigrationDone: true,
  });
  seed("config/app.json", {
    kind: "prompthub-app-config",
    version: 1,
    settings: {},
    secretRefs: {},
  });
  seed("config/providers.json", {
    kind: "prompthub-provider-config",
    version: 1,
    settings: { modelRouteDefaults },
    providers: [],
    models: [],
    secretRefs: { aiApiKey: "renderer:aiApiKey" },
  });
  seed("config/sync-providers.json", {
    kind: "prompthub-sync-provider-config",
    version: 1,
    settings: {},
    secretRefs: {},
  });
  seed("secrets/vault.enc", {
    kind: "prompthub-device-secret-vault",
    version: 1,
    secrets: {
      "renderer:aiApiKey": Buffer.from("encrypted:legacy-flat-secret").toString(
        "base64",
      ),
    },
  });
  return {
    readHydratedStateSync: () => {
      const upgrade = planSettingsSqliteUpgrade(
        rendererTestDatabase(root),
        root,
        encryption,
      );
      return upgrade
        ? { settings: upgrade.settings }
        : createRendererPersistenceStore({
            database: rendererTestDatabase(root),
            rootPath: root,
            encryption,
          }).readHydratedStateSync();
    },
  };
}

function writeBackup(
  root: string,
  config = backupConfig(),
  name = "candidate",
): string {
  const backupPath = path.join(root, name);
  const configPath = path.join(backupPath, "config", "ai-models.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return backupPath;
}

function writeManagedBackup(root: string): string {
  const backupPath = path.join(
    root,
    "backups",
    "safety-points",
    "upgrades",
    "v0.5.9-2026-08-18T00-00-00-000Z",
  );
  const configPath = path.join(backupPath, "config", "ai-models.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(backupConfig(), null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(backupPath, "backup-manifest.json"),
    `${JSON.stringify({
      kind: "prompthub-upgrade-backup",
      schemaVersion: 3,
      createdAt: "2026-08-18T00:00:00.000Z",
      fromVersion: "0.5.9",
      toVersion: "0.6.0-beta.1",
      sourcePath: root,
      copiedItems: ["config"],
      platform: "darwin",
    })}\n`,
    "utf8",
  );
  return backupPath;
}

afterEach(() => {
  closeRendererTestDatabases();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("renderer AI config recovery", () => {
  it("atomically restores every routed model from a managed upgrade backup", async () => {
    const root = createRoot();
    const store = await createAffectedRoot(root);
    const backupPath = writeBackup(root);

    const result = await repairRendererAIConfigFromUpgradeBackups({
      database: rendererTestDatabase(root),
      activeRoot: root,
      encryption,
      listBackups: async () => [{ backupId: "candidate", backupPath }],
    });

    expect(result).toMatchObject({
      status: "recovered",
      sourceBackupId: "candidate",
      providerCount: 1,
      modelCount: 2,
    });
    const hydrated = store.readHydratedStateSync();
    expect(
      (hydrated.settings.aiModels as Array<{ id: string }>).map(
        (model) => model.id,
      ),
    ).toEqual(["model-chat", "model-image"]);
    expect(hydrated.settings.modelRouteDefaults).toEqual({
      mainText: "model-chat",
      imageGeneration: "model-image",
    });
    expect(JSON.stringify(hydrated.settings)).toContain("chat-backup-secret");

    const persisted = ["data/prompthub.db", "secrets/vault.enc"]
      .map((relativePath) => fs.readFileSync(path.join(root, relativePath)))
      .join("\n");
    expect(persisted).not.toContain("provider-backup-secret");
    expect(persisted).not.toContain("chat-backup-secret");

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        listBackups: async () => [{ backupId: "candidate", backupPath }],
      }),
    ).resolves.toMatchObject({ status: "current" });
  });

  it("repairs through the real managed-backup discovery used at startup", async () => {
    const root = createRoot();
    await createAffectedRoot(root);
    writeManagedBackup(root);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const state = await readRendererSettingsWithAIRecovery({
      database: rendererTestDatabase(root),
      activeRoot: root,
      encryption,
    });

    expect(state.settings.aiModels).toHaveLength(2);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Recovered 2 AI models"),
    );
  });

  it("preserves upgrade inputs and reports unavailable device encryption instead of committing an incomplete upgrade", async () => {
    const root = createRoot();
    await createAffectedRoot(root);
    writeManagedBackup(root);
    const before = fs.readFileSync(path.join(root, "secrets/vault.enc"));
    await expect(
      readRendererSettingsWithAIRecovery({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption: { ...encryption, isEncryptionAvailable: () => false },
      }),
    ).rejects.toThrow(/desktop.*upgrade/i);
    expect(fs.readFileSync(path.join(root, "secrets/vault.enc"))).toEqual(
      before,
    );
    expect(
      rendererTestDatabase(root)
        .prepare("SELECT name FROM schema_migrations WHERE name = ?")
        .get("settings-sqlite-v1"),
    ).toBeNull();
    expect(
      (
        await readRendererSettingsWithAIRecovery({
          database: rendererTestDatabase(root),
          activeRoot: root,
          encryption,
        })
      ).settings.aiModels,
    ).toHaveLength(2);
  });

  it.each([
    ["missing", undefined],
    ["empty", {}],
    ["scalar", "model-chat"],
    ["array", ["model-chat"]],
  ])(
    "does not resurrect an intentionally empty inventory with %s route metadata",
    async (_label, modelRouteDefaults) => {
      const root = createRoot();
      await createAffectedRoot(root, modelRouteDefaults);

      const state = await readRendererSettingsWithAIRecovery({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
      });

      expect(state.settings.aiModels).toEqual([]);
    },
  );

  it("does not inspect backups before canonical migration completes", async () => {
    const root = createRoot();
    const listBackups = vi.fn(async () => []);

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        listBackups,
      }),
    ).resolves.toMatchObject({ status: "not-migrated" });
    expect(listBackups).not.toHaveBeenCalled();
  });

  it("rejects unsafe or non-matching candidates without changing canonical files", async () => {
    const root = createRoot();
    const store = await createAffectedRoot(root);
    const unsafePath = path.join(root, "unsafe-candidate");
    const unsafeConfigPath = path.join(unsafePath, "config", "ai-models.json");
    fs.mkdirSync(path.dirname(unsafeConfigPath), { recursive: true });
    fs.symlinkSync(
      path.join(root, "config", "ai-models.json"),
      unsafeConfigPath,
    );
    const linkedConfigTarget = writeBackup(
      root,
      backupConfig(),
      "linked-config-target",
    );
    const linkedConfigPath = path.join(root, "linked-config-candidate");
    fs.mkdirSync(linkedConfigPath, { recursive: true });
    fs.symlinkSync(
      path.join(linkedConfigTarget, "config"),
      path.join(linkedConfigPath, "config"),
      "dir",
    );
    const malformedPath = path.join(root, "malformed-candidate");
    fs.mkdirSync(path.join(malformedPath, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(malformedPath, "config", "ai-models.json"),
      "{invalid",
    );
    const duplicateProvider = backupConfig();
    duplicateProvider.providers.push({ ...duplicateProvider.providers[0] });
    const duplicateProviderPath = writeBackup(
      root,
      duplicateProvider,
      "duplicate-provider",
    );
    const nonMatchingPath = writeBackup(
      root,
      {
        ...backupConfig(),
        models: backupConfig().models.slice(0, 1),
      },
      "non-matching",
    );

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        listBackups: async () => [
          { backupId: "unsafe", backupPath: unsafePath },
          { backupId: "linked-config", backupPath: linkedConfigPath },
          { backupId: "malformed", backupPath: malformedPath },
          {
            backupId: "duplicate-provider",
            backupPath: duplicateProviderPath,
          },
          { backupId: "non-matching", backupPath: nonMatchingPath },
        ],
      }),
    ).resolves.toMatchObject({ status: "unrecoverable" });
    expect(store.readHydratedStateSync().settings.aiModels).toEqual([]);
  });

  it("bounds recovery to the managed safety-point retention limit", async () => {
    const root = createRoot();
    await createAffectedRoot(root);
    const missing = Array.from({ length: 5 }, (_, index) => ({
      backupId: `missing-${index}`,
      backupPath: path.join(root, `missing-${index}`),
    }));
    const matchingPath = writeBackup(root, backupConfig(), "sixth-matching");

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        listBackups: async () => [
          ...missing,
          { backupId: "sixth-matching", backupPath: matchingPath },
        ],
      }),
    ).resolves.toMatchObject({ status: "unrecoverable" });
  });

  it("rolls back canonical publication failure and remains retryable", async () => {
    const root = createRoot();
    const store = await createAffectedRoot(root);
    const backupPath = writeBackup(root);

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        failPublicationAt: "secrets/vault.enc",
        listBackups: async () => [{ backupId: "candidate", backupPath }],
      }),
    ).rejects.toThrow(/publication failure/iu);
    expect(store.readHydratedStateSync().settings.aiModels).toEqual([]);

    await expect(
      repairRendererAIConfigFromUpgradeBackups({
        database: rendererTestDatabase(root),
        activeRoot: root,
        encryption,
        listBackups: async () => [{ backupId: "candidate", backupPath }],
      }),
    ).resolves.toMatchObject({ status: "recovered" });
  });
  it("never resurrects an intentionally cleared SQL inventory after the upgrade", async () => {
    const root = createRoot();
    await createAffectedRoot(root);
    writeManagedBackup(root);
    await readRendererSettingsWithAIRecovery({
      database: rendererTestDatabase(root),
      activeRoot: root,
      encryption,
    });
    const store = createRendererPersistenceStore({
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption,
    });
    await store.patchSettings({ aiModels: [], aiProviders: [] });
    expect(
      (
        await readRendererSettingsWithAIRecovery({
          database: rendererTestDatabase(root),
          activeRoot: root,
          encryption,
        })
      ).settings.aiModels,
    ).toEqual([]);
  });
});
