import path from "node:path";
import { SettingsDB } from "@prompthub/db";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRendererPersistenceStore,
  type MarketplaceSourceRecord,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  createSkillTestRuntime,
  fileInventory,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { settingsApi } from "../../src/preload/api/settings";
import { SETTINGS_CREDENTIALS_MIGRATION } from "@prompthub/core/migrations/settings-credentials-v1";

let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

function registerSettings(profile: string): void {
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      database: getDatabase(),
      rootPath: profile,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error("Settings validation fixture contains no secrets");
        },
        decryptString: () => {
          throw new Error("Settings validation fixture contains no secrets");
        },
      },
    }),
  });
}

function source(root: string): MarketplaceSourceRecord {
  return {
    id: "settings-validation-source",
    name: "Local source",
    type: "local-dir",
    url: root,
    enabled: true,
    order: 0,
    createdAt: 1,
  };
}

async function openSettings(): Promise<SkillTestRuntime> {
  runtime = await createSkillTestRuntime();
  registerSettings(runtime.profile);
  const api = settingsApi.rendererPersistence;
  await api.replaceSettings({ language: "fr", closeAction: "minimize" });
  await api.replaceSources("skill", [source(runtime.source)]);
  await api.replaceSources("mcp", [source(runtime.source)]);
  await api.replaceSources("plugin", [source(runtime.source)]);
  await api.replaceRecoveryPaths([path.join(runtime.root, "recovery")]);
  return runtime;
}

describe("settings replacement validation through registered IPC", () => {
  it.each(["", "fixture-legacy-secret"])("upgrades inline AI and flat credentials (%j) through preload, saves and reopens", async (secret) => {
    const current = await openSettings();
    await settingsApi.rendererPersistence.migrate({});
    const oldSettings = {
      githubToken: secret,
      webdavPassword: secret,
      s3SecretAccessKey: secret,
      aiProviders: [{ id: "legacy-provider", name: "Local provider", apiKey: secret }],
      aiModels: [{ id: "legacy-model", model: "local-model", apiKey: secret }],
      sync: { enabled: false, username: secret, password: secret },
    };
    new SettingsDB(getDatabase()).set(oldSettings);
    getDatabase().prepare("DELETE FROM schema_migrations WHERE name = ?").run(SETTINGS_CREDENTIALS_MIGRATION);
    const launchCount = 2;
    for (let launch = 0; launch < launchCount; launch += 1) {
      await current.reopen();
      registerSettings(current.profile);
      const hydrated = await settingsApi.rendererPersistence.get();
      expect(hydrated.migrationComplete).toBe(true);
      expect(hydrated.settings.aiModels).toEqual([{ id: "legacy-model", model: "local-model", ...(secret ? { apiKey: secret } : {}) }]);
      expect(hydrated.settings.githubToken).toBe(secret || undefined);
      expect(hydrated.settings.s3SecretAccessKey).toBe(secret || undefined);
      expect(hydrated.marketplaceSources.skill).toEqual([source(current.source)]);
      expect((await settingsApi.get()).aiProviders).toEqual([{ id: "legacy-provider", name: "Local provider", ...(secret ? { apiKey: secret } : {}) }]);
      await settingsApi.rendererPersistence.replaceSettings({ ...hydrated.settings, language: "en" });
      expect(new SettingsDB(getDatabase()).get("aiModels")).toEqual([{ id: "legacy-model", model: "local-model", ...(secret ? { apiKeyRef: "renderer:ai-model:legacy-model:api-key" } : {}) }]);
    }
    expect((await settingsApi.get()).language).toBe("en");
  });

  it("hydrates an already-migrated profile with legacy empty proxy fields through preload after two reopens", async () => {
    const current = await openSettings();
    await settingsApi.rendererPersistence.migrate({});
    getDatabase().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run("networkProxy", JSON.stringify({ mode: "direct", username: "", password: "" }));
    getDatabase().prepare("DELETE FROM schema_migrations WHERE name = ?").run(SETTINGS_CREDENTIALS_MIGRATION);
    const launchCount = 2;
    for (let launch = 0; launch < launchCount; launch += 1) {
      await current.reopen();
      registerSettings(current.profile);
      expect(await settingsApi.rendererPersistence.migrate({})).toMatchObject({ status: "already-complete" });
      expect(await settingsApi.rendererPersistence.get()).toMatchObject({
        migrationComplete: true, settings: { language: "fr", networkProxy: { mode: "direct" } },
        marketplaceSources: { skill: [source(current.source)] },
      });
      expect(await settingsApi.get()).toMatchObject({ language: "fr", networkProxy: { mode: "direct" } });
    }
  });

  it("keeps auxiliary state behind its dedicated entrypoints", async () => {
    const current = await openSettings();
    expect(await settingsApi.get()).not.toHaveProperty("recoveryPaths");
    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
        recoveryPaths: ["/wrong-owner"],
      }),
    ).rejects.toThrow(/renderer persistence endpoint/);
    expect((await settingsApi.rendererPersistence.get()).recoveryPaths).toEqual(
      [path.join(current.root, "recovery")],
    );
  });

  it("persists replacements and explicit clears through preload and reopen", async () => {
    const current = await openSettings();
    await current.reopen();
    registerSettings(current.profile);
    const api = settingsApi.rendererPersistence;
    const saved = await api.get();
    expect(saved).toMatchObject({
      settings: { language: "fr", closeAction: "minimize" },
      marketplaceSources: {
        skill: [source(current.source)],
        mcp: [source(current.source)],
        plugin: [source(current.source)],
      },
      recoveryPaths: [path.join(current.root, "recovery")],
    });
    await api.replaceSettings({});
    await api.replaceSources("skill", []);
    await api.replaceRecoveryPaths([]);
    await current.reopen();
    registerSettings(current.profile);
    const cleared = await api.get();
    expect(cleared.settings).not.toHaveProperty("language");
    expect(cleared.settings).not.toHaveProperty("closeAction");
    expect(cleared.marketplaceSources).toEqual({
      skill: [],
      mcp: [source(current.source)],
      plugin: [source(current.source)],
    });
    expect(cleared.recoveryPaths).toEqual([]);
  });

  const malformed: unknown[] = [undefined, null, "", false, 0];
  const requests = [
    ...[...malformed, []].map((input) => ({
      name: "settings",
      channel: IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SETTINGS,
      args: [input],
    })),
    ...["skill", "mcp", "plugin"].flatMap((domain) =>
      [...malformed, {}, [null]].map((input) => ({
        name: `${domain} sources`,
        channel: IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
        args: [domain, input],
      })),
    ),
    ...[...malformed, {}, [null], ["relative/path"]].map((input) => ({
      name: "recovery paths",
      channel:
        IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_RECOVERY_PATHS,
      args: [input],
    })),
  ];

  it.each(requests)(
    "rejects malformed $name input $args without changing saved data",
    async ({ channel, args }) => {
      const current = await openSettings();
      const before = await settingsApi.rendererPersistence.get();
      const filesBefore = fileInventory(path.join(current.profile, "config"));
      await expect(invokeSkillIPC(channel, ...args)).rejects.toThrow();
      expect(fileInventory(path.join(current.profile, "config"))).toEqual(
        filesBefore,
      );
      expect(await settingsApi.rendererPersistence.get()).toEqual(before);
      await current.reopen();
      registerSettings(current.profile);
      expect(await settingsApi.rendererPersistence.get()).toEqual(before);
    },
  );
});
