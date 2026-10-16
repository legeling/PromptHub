import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRendererPersistenceStore } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  createSkillTestRuntime,
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
          throw new Error("Settings acceptance contains no credentials");
        },
        decryptString: () => {
          throw new Error("Settings acceptance contains no credentials");
        },
      },
    }),
  });
}

const shellPreferences = {
  language: "fr",
  themeMode: "dark",
  desktopHomeModules: ["rules", "prompt", "agents"],
  closeAction: "ask",
};

async function openSettings(): Promise<SkillTestRuntime> {
  runtime = await createSkillTestRuntime();
  registerSettings(runtime.profile);
  await settingsApi.rendererPersistence.replaceSettings(shellPreferences);
  return runtime;
}

describe("release acceptance: persisted desktop settings through preload", () => {
  it("keeps shell preferences and remembered close choice after closing and reopening storage", async () => {
    const current = await openSettings();
    await settingsApi.set({
      closeAction: "minimize",
      minimizeOnLaunch: true,
      startupFolderMode: "last",
      lastActiveFolderId: "acceptance-folder",
    });
    const expected = {
      ...shellPreferences,
      closeAction: "minimize",
      minimizeOnLaunch: true,
      startupFolderMode: "last",
      lastActiveFolderId: "acceptance-folder",
    };
    expect(await settingsApi.get()).toMatchObject(expected);
    expect(
      getDatabase()
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("closeAction"),
    ).toEqual({ value: JSON.stringify("minimize") });
    expect(
      fs.statSync(path.join(current.profile, "data/prompthub.db")).size,
    ).toBeGreaterThan(0);

    await current.reopen();
    registerSettings(current.profile);

    expect(await settingsApi.get()).toMatchObject(expected);
    expect(
      (await settingsApi.rendererPersistence.get()).settings,
    ).toMatchObject({
      ...shellPreferences,
      closeAction: "minimize",
    });
  });

  it("rejects malformed startup input without saving a valid sibling preference", async () => {
    const current = await openSettings();
    await settingsApi.set({ minimizeOnLaunch: true });

    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
        minimizeOnLaunch: false,
        startupFolderMode: "not-a-mode",
      }),
    ).rejects.toThrow("Invalid startup folder mode");

    expect(await settingsApi.get()).toMatchObject({
      ...shellPreferences,
      minimizeOnLaunch: true,
    });
    await current.reopen();
    registerSettings(current.profile);
    expect(await settingsApi.get()).toMatchObject({
      ...shellPreferences,
      minimizeOnLaunch: true,
    });
  });

  it("restores the canonical close choice when SQLite rejects a settings write and permits retry", async () => {
    const current = await openSettings();
    await settingsApi.set({ minimizeOnLaunch: false });
    // A real SQLite rejection occurs after the canonical close-choice write.
    getDatabase().exec(`
      CREATE TRIGGER acceptance_settings_write_failure
      BEFORE INSERT ON settings WHEN NEW.key = 'minimizeOnLaunch'
      BEGIN SELECT RAISE(ABORT, 'acceptance settings write failure'); END;
    `);

    await expect(
      settingsApi.set({ closeAction: "exit", minimizeOnLaunch: true }),
    ).rejects.toThrow("acceptance settings write failure");
    expect(await settingsApi.get()).toMatchObject({
      ...shellPreferences,
      minimizeOnLaunch: false,
    });
    expect(
      (await settingsApi.rendererPersistence.get()).settings,
    ).toMatchObject(shellPreferences);

    await current.reopen();
    registerSettings(current.profile);
    expect(await settingsApi.get()).toMatchObject({
      ...shellPreferences,
      minimizeOnLaunch: false,
    });
    getDatabase().exec("DROP TRIGGER acceptance_settings_write_failure");
    await settingsApi.set({ closeAction: "exit", minimizeOnLaunch: true });
    await current.reopen();
    registerSettings(current.profile);
    expect(await settingsApi.get()).toMatchObject({
      ...shellPreferences,
      closeAction: "exit",
      minimizeOnLaunch: true,
    });
  });
});
