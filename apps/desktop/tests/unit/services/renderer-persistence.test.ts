import { notifyTaskResult } from "../../../src/renderer/services/application-notifications";
import { installWindowMocks } from "../../helpers/window";
import {
  rendererTestDatabase,
  closeRendererTestDatabases,
} from "../../../../../packages/core/tests/helpers/renderer-database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRendererPersistenceStore } from "@prompthub/core/renderer-persistence-migration";
import type {
  RendererHydratedState,
  RendererPersistenceMigrationInput,
} from "@prompthub/core";
import {
  collectLegacyRendererPersistence,
  flushRendererPersistence,
  migrateRendererPersistence,
  resetRendererPersistenceForTests,
} from "../../../src/renderer/services/renderer-persistence";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";

const canonical: RendererHydratedState = {
  migrationComplete: true,
  settings: { language: "fr" },
  marketplaceSources: {
    skill: [
      {
        id: "skill-source",
        name: "Skill Source",
        type: "git-repo",
        url: "https://github.com/example/skills.git",
        enabled: true,
        order: 0,
        createdAt: 1,
      },
    ],
    mcp: [],
    plugin: [],
  },
  recoveryPaths: ["/safe/recovery"],
  selfHostedDeviceId: "desktop-device-1",
  indexedDbMigrationDone: true,
};

function installApi(status: "migrated" | "already-complete") {
  const rendererPersistence = {
    migrate: vi.fn(async (_input: RendererPersistenceMigrationInput) => ({
      status,
      redactLegacyKeys:
        status === "migrated"
          ? [
              "prompthub-settings",
              "skill-store",
              "prompthub-self-hosted-device-id",
            ]
          : [],
    })),
    get: vi.fn(async () => canonical),
    replaceSettings: vi.fn(async (_settings: Record<string, unknown>) => true),
    replaceSources: vi.fn(async () => true),
    replaceRecoveryPaths: vi.fn(async () => true),
    getOrCreateDeviceId: vi.fn(async () => "desktop-device-1"),
    isIndexedDbMigrationDone: vi.fn(async () => true),
    markIndexedDbMigrationDone: vi.fn(async () => true),
  };
  window.api.settings = {
    ...window.api.settings,
    rendererPersistence,
  };
  return rendererPersistence;
}

function expectNoDurableSkillSourcesInRendererStorage(): void {
  const raw = localStorage.getItem("skill-store");
  if (!raw) return;
  expect(JSON.parse(raw).state.customStoreSources).toBeUndefined();
}

const roots: string[] = [];

beforeEach(() => {
  localStorage.clear();
  resetRendererPersistenceForTests();
});

afterEach(() => {
  closeRendererTestDatabases();
  resetRendererPersistenceForTests();
  if (window.api.settings) delete window.api.settings.rendererPersistence;
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("renderer persistence bridge", () => {
  it("persists optional default settings through the real SQL owner before sync", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "ph-renderer-settings-"),
    );
    roots.push(root);
    const options = {
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: (): Buffer => {
          throw new Error("No fixture secrets");
        },
        decryptString: (): string => {
          throw new Error("No fixture secrets");
        },
      },
    };
    const store = createRendererPersistenceStore(options);
    const api = installApi("already-complete");
    api.replaceSettings.mockImplementation(async (input) => {
      await store.replaceSettings(input);
      return true;
    });
    await migrateRendererPersistence();
    useSettingsStore.setState({
      language: "de",
      backgroundImageFileName: undefined,
    });
    await flushRendererPersistence();
    const reopened = createRendererPersistenceStore(options);
    const state = await reopened.readHydratedState();
    expect(state.settings.language).toBe("de");
    expect(state.settings).not.toHaveProperty("backgroundImageFileName");
  });
  it("saves a just-disabled category to SQLite before publishing the same-turn task result", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "ph-notification-policy-"),
    );
    roots.push(root);
    const store = createRendererPersistenceStore({
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: (): Buffer => {
          throw new Error("No fixture secrets");
        },
        decryptString: (): string => {
          throw new Error("No fixture secrets");
        },
      },
    });
    const publish = vi.fn(async () => {
      const state = await store.readHydratedState();
      expect(state.settings.notificationPreferences).toMatchObject({
        delivery: { promptTest: "off" },
      });
      return { success: true };
    });
    installWindowMocks({
      electron: {
        applicationNotifications: {
          publish,
          onFeedback: vi.fn(() => () => undefined),
        },
      },
    });
    const api = installApi("already-complete");
    api.replaceSettings.mockImplementation(async (input) => {
      await store.replaceSettings(input);
      return true;
    });
    await migrateRendererPersistence();
    const prefs = useSettingsStore.getState().notificationPreferences;
    useSettingsStore
      .getState()
      .setNotificationPreferences({
        ...prefs,
        delivery: { ...prefs.delivery, promptTest: "off" },
      });
    notifyTaskResult("promptTest", "success");
    await vi.waitFor(() =>
      expect(publish).toHaveResolvedWith({ success: true }),
    );
  });

  it("waits for queued settings persistence before synchronization reads SQL", async () => {
    const api = installApi("already-complete");
    await migrateRendererPersistence();
    let finish: (() => void) | undefined;
    api.replaceSettings.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(true);
        }),
    );
    useSettingsStore.setState({ language: "es" });
    let settled = false;
    const flushed = flushRendererPersistence().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(finish).toBeDefined();
    finish?.();
    await flushed;
    expect(settled).toBe(true);
  });
  it("does not duplicate SQLite-owned prompt preferences in renderer settings", async () => {
    const api = installApi("already-complete");
    await migrateRendererPersistence();
    useSettingsStore.setState({
      startupFolderMode: "pinned",
      pinnedStartFolderId: "folder-pinned",
      lastActiveFolderId: "folder-last",
      backupGuideCollapsed: true,
      language: "ja",
    });
    await Promise.resolve();
    expect(api.replaceSettings).toHaveBeenCalledOnce();
    const [settings] = api.replaceSettings.mock.calls[0];
    expect(settings).toMatchObject({ language: "ja" });
    for (const key of [
      "startupFolderMode",
      "pinnedStartFolderId",
      "lastActiveFolderId",
      "backupGuideCollapsed",
    ]) {
      expect(settings).not.toHaveProperty(key);
    }
  });

  it("collects only the explicitly routed legacy keys", () => {
    localStorage.setItem("prompthub-settings", "settings");
    localStorage.setItem(
      "skill-store",
      JSON.stringify({ state: { customStoreSources: [] } }),
    );
    localStorage.setItem("unrelated", "keep");
    expect(collectLegacyRendererPersistence(localStorage)).toMatchObject({
      settings: "settings",
      skillStore: { customStoreSources: [] },
    });
    expect(
      Object.values(collectLegacyRendererPersistence(localStorage)),
    ).not.toContain("keep");
  });

  it("redacts migrated copies, restores canonical sources, and persists later changes", async () => {
    localStorage.setItem("prompthub-settings", "legacy-settings");
    localStorage.setItem(
      "skill-store",
      JSON.stringify({ state: { customStoreSources: [] } }),
    );
    localStorage.setItem("prompthub-self-hosted-device-id", "legacy-device");
    const api = installApi("migrated");

    await migrateRendererPersistence();

    expect(api.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: "legacy-settings",
        skillStore: { customStoreSources: [] },
        selfHostedDeviceId: "legacy-device",
      }),
    );
    expect(localStorage.getItem("prompthub-settings")).toBeNull();
    expectNoDurableSkillSourcesInRendererStorage();
    expect(useSkillStore.getState().customStoreSources).toEqual(
      canonical.marketplaceSources.skill,
    );

    useSkillStore.setState({
      customStoreSources: [
        ...canonical.marketplaceSources.skill,
        {
          id: "second-source",
          name: "Second",
          type: "marketplace-json",
          url: "https://example.test/marketplace.json",
          enabled: true,
          order: 1,
          createdAt: 2,
        },
      ],
    });
    useSettingsStore.setState({ language: "de" });
    await Promise.resolve();

    expect(api.replaceSources).toHaveBeenCalledWith(
      "skill",
      expect.arrayContaining([
        expect.objectContaining({ id: "second-source" }),
      ]),
    );
    expect(api.replaceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ language: "de" }),
    );
  });

  it("restores canonical sources after browser storage is cleared", async () => {
    installApi("already-complete");
    localStorage.clear();
    useSkillStore.setState({ customStoreSources: [] });

    await migrateRendererPersistence();

    expect(useSkillStore.getState().customStoreSources).toEqual(
      canonical.marketplaceSources.skill,
    );
    expectNoDurableSkillSourcesInRendererStorage();
  });

  it("migrates source configuration beside large legacy caches and reopens it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-issue-216-"));
    roots.push(root);
    const options = {
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: (): Buffer => {
          throw new Error("No fixture secrets");
        },
        decryptString: (): string => {
          throw new Error("No fixture secrets");
        },
      },
    };
    const store = createRendererPersistenceStore(options);
    const cacheCharacterCount = 2 * 1024 * 1024;
    const raw = JSON.stringify({
      state: {
        customStoreSources: canonical.marketplaceSources.skill,
        remoteStoreEntries: { cached: "界".repeat(cacheCharacterCount) },
      },
    });
    localStorage.setItem("skill-store", raw);
    localStorage.setItem("mcp-store", raw);
    await expect(
      store.migrate({ skillStore: raw, mcpStore: raw }),
    ).rejects.toThrow("snapshot exceeds byte limit");
    const api = installApi("migrated");
    api.migrate.mockImplementation((input) => store.migrate(input));
    api.get.mockImplementation(() => store.readHydratedState());

    await migrateRendererPersistence();

    const reopened = createRendererPersistenceStore(options);
    expect((await reopened.readHydratedState()).marketplaceSources).toEqual({
      skill: canonical.marketplaceSources.skill,
      mcp: canonical.marketplaceSources.skill,
      plugin: [],
    });
    expectNoDurableSkillSourcesInRendererStorage();
    await expect(reopened.migrate({})).resolves.toMatchObject({
      status: "already-complete",
    });
  });

  it.each(["skill-store", "mcp-store", "plugin-store"])(
    "retains malformed %s data without publishing migration",
    async (key) => {
      const raw = "{broken";
      localStorage.setItem(key, raw);
      const api = installApi("migrated");
      await expect(migrateRendererPersistence()).rejects.toThrow(key);
      expect(api.migrate).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBe(raw);
    },
  );

  it.each(["null", "[]", '{"state":null}', '{"state":[]}'])(
    "rejects an invalid legacy store shape (%s) without clearing it",
    async (raw) => {
      localStorage.setItem("skill-store", raw);
      const api = installApi("migrated");
      await expect(migrateRendererPersistence()).rejects.toThrow("skill-store");
      expect(api.migrate).not.toHaveBeenCalled();
      expect(localStorage.getItem("skill-store")).toBe(raw);
    },
  );

  it("keeps legacy source data when publication fails and permits retry", async () => {
    const raw = JSON.stringify({
      state: { customStoreSources: canonical.marketplaceSources.skill },
    });
    localStorage.setItem("skill-store", raw);
    const api = installApi("migrated");
    api.migrate.mockRejectedValueOnce(new Error("publication failed"));
    await expect(migrateRendererPersistence()).rejects.toThrow(
      "publication failed",
    );
    expect(localStorage.getItem("skill-store")).toBe(raw);
    await migrateRendererPersistence();
    expect(api.migrate).toHaveBeenCalledTimes(2);
  });
});
