import path from "node:path";
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
