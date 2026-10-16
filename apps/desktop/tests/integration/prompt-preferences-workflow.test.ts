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
          throw new Error("No secrets in preference tests");
        },
        decryptString: () => {
          throw new Error("No secrets in preference tests");
        },
      },
    }),
  });
}

describe("Prompt startup preferences public workflow", () => {
  it("persists through preload, SQLite and a full runtime reopen", async () => {
    runtime = await createSkillTestRuntime();
    registerSettings(runtime.profile);
    const preferences = {
      startupFolderMode: "pinned" as const,
      pinnedStartFolderId: "folder-pinned",
      lastActiveFolderId: "folder-last",
      backupGuideCollapsed: true,
    };
    await settingsApi.set(preferences);
    expect(await settingsApi.get()).toMatchObject(preferences);
    await runtime.reopen();
    registerSettings(runtime.profile);
    expect(await settingsApi.get()).toMatchObject(preferences);
    await settingsApi.set({
      pinnedStartFolderId: null,
      startupFolderMode: "default",
    });
    await runtime.reopen();
    registerSettings(runtime.profile);
    expect(await settingsApi.get()).toMatchObject({
      ...preferences,
      pinnedStartFolderId: null,
      startupFolderMode: "default",
    });
  });

  it("rejects malformed preferences before changing existing values", async () => {
    runtime = await createSkillTestRuntime();
    registerSettings(runtime.profile);
    await settingsApi.set({
      startupFolderMode: "last",
      lastActiveFolderId: "saved",
    });
    for (const invalid of [
      { startupFolderMode: "bogus" },
      { pinnedStartFolderId: 12 },
      { lastActiveFolderId: "bad\0id" },
      { backupGuideCollapsed: "true" },
    ]) {
      await expect(
        invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, invalid),
      ).rejects.toThrow(/startup|folder|backup/i);
    }
    expect(await settingsApi.get()).toMatchObject({
      startupFolderMode: "last",
      lastActiveFolderId: "saved",
    });
  });
});
