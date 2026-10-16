import {
  clearSkillIPC,
  createSkillTestRuntime,
  invokeSkillIPC,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { afterEach, expect, it } from "vitest";
import {
  createRendererPersistenceStore,
  getRuntimeStorageContext,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { getDatabase, SkillDB } from "../../src/main/database";
import { getDatabasePath } from "../../src/main/runtime-paths";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { registerSkillIPC } from "../../src/main/ipc/skill.ipc";
import { resumeCanonicalStorageAfterRendererMigration } from "../../src/main/services/renderer-storage-startup";

let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

function registerSettings(failPublication = false): void {
  if (!runtime) throw new Error("Missing test runtime");
  const profile = runtime.profile;
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      database: getDatabase(),
      rootPath: profile,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error("No test secrets");
        },
        decryptString: () => {
          throw new Error("No test secrets");
        },
      },
    }),
    onRendererPersistenceMigration: () =>
      resumeCanonicalStorageAfterRendererMigration({
        activeRoot: profile,
        sourceDatabasePath: getDatabasePath(),
        ...(failPublication
          ? {
              publish: async () => {
                throw new Error("Publication fixture failure");
              },
            }
          : {}),
        registerDatabase: async (database) => {
          clearSkillIPC();
          registerSettings();
          await registerSkillIPC(new SkillDB(database));
        },
      }),
  });
}

it("makes a fresh profile writable before renderer migration returns, without restart", async () => {
  runtime = await createSkillTestRuntime({ freshStartup: true });
  registerSettings();
  const created = await skillApi.create({
    name: "first-launch",
    protocol_type: "skill",
    instructions: "# First",
    is_favorite: false,
  });
  await invokeSkillIPC(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE, {
    indexedDbMigrationDone: true,
  });
  expect(getRuntimeStorageContext().localAuthority).toBe("canonical-files");
  expect(await skillApi.getAll()).toEqual([
    expect.objectContaining({ id: created.id, name: "first-launch" }),
  ]);
  await invokeSkillIPC(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE, {
    indexedDbMigrationDone: true,
  });
  expect(await skillApi.get(created.id)).toMatchObject({
    name: "first-launch",
  });
  await runtime.reopen();
  expect(await skillApi.get(created.id)).toMatchObject({
    name: "first-launch",
  });
});

it("reports deferred publication failure and allows migration to retry with a live database", async () => {
  runtime = await createSkillTestRuntime({ freshStartup: true });
  registerSettings(true);
  await expect(
    invokeSkillIPC(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE, {
      indexedDbMigrationDone: true,
    }),
  ).rejects.toThrow("Publication fixture failure");
  expect(await skillApi.getAll()).toEqual([]);
  await invokeSkillIPC(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE, {
    indexedDbMigrationDone: true,
  });
  const created = await skillApi.create({
    name: "retried-launch",
    protocol_type: "skill",
    instructions: "# Retry",
    is_favorite: false,
  });
  await runtime.reopen();
  expect(await skillApi.get(created.id)).toMatchObject({
    name: "retried-launch",
  });
});
