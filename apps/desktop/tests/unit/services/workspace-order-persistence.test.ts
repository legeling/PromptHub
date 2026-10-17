import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createRendererPersistenceStore } from "@prompthub/core/renderer-persistence-migration";
import {
  rendererTestDatabase,
  closeRendererTestDatabases,
} from "../../../../../packages/core/tests/helpers/renderer-database";
import {
  useSettingsStore,
  DESKTOP_HOME_MODULES,
} from "../../../src/renderer/stores/settings.store";
import {
  flushRendererPersistence,
  migrateRendererPersistence,
  resetRendererPersistenceForTests,
} from "../../../src/renderer/services/renderer-persistence";
import { installWindowMocks } from "../../helpers/window";

let root: string | undefined;
const initial = useSettingsStore.getState();
afterEach(() => {
  resetRendererPersistenceForTests();
  closeRendererTestDatabases();
  useSettingsStore.setState(initial);
  localStorage.clear();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("keeps hidden module slots through the renderer bridge and SQLite close/reopen", async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-workspace-order-"));
  const directory = root;
  const openStore = () =>
    createRendererPersistenceStore({
      database: rendererTestDatabase(directory),
      rootPath: directory,
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
  let store = openStore();
  installWindowMocks({
    api: {
      settings: {
        rendererPersistence: {
          migrate: (input) => store.migrate(input),
          get: () => store.readHydratedState(),
          replaceSettings: async (input) => {
            await store.replaceSettings(input);
            return true;
          },
        },
      },
    },
  });
  const order = ["rules", "prompt", "agents", "skill", "mcp", "plugin"];
  localStorage.setItem(
    "prompthub-settings",
    JSON.stringify({
      state: { desktopHomeModules: order, language: "en" },
      version: 20,
    }),
  );
  await migrateRendererPersistence();
  expect(useSettingsStore.getState().desktopHomeModuleOrder).toEqual(order);
  useSettingsStore.getState().toggleDesktopHomeModule("prompt");
  useSettingsStore.getState().toggleDesktopHomeModule("skill");
  await flushRendererPersistence();
  expect((await store.readHydratedState()).settings).toMatchObject({
    desktopHomeModuleOrder: order,
    desktopHomeModules: ["rules", "agents", "mcp", "plugin"],
  });

  resetRendererPersistenceForTests();
  closeRendererTestDatabases();
  store = openStore();
  useSettingsStore.setState({
    desktopHomeModules: [...DESKTOP_HOME_MODULES],
    desktopHomeModuleOrder: [...DESKTOP_HOME_MODULES],
  });
  localStorage.clear();
  await migrateRendererPersistence();
  expect(useSettingsStore.getState().desktopHomeModuleOrder).toEqual(order);
  expect(useSettingsStore.getState().desktopHomeModules).toEqual([
    "rules",
    "agents",
    "mcp",
    "plugin",
  ]);
  useSettingsStore.getState().toggleDesktopHomeModule("skill");
  useSettingsStore.getState().toggleDesktopHomeModule("prompt");
  expect(useSettingsStore.getState().desktopHomeModules).toEqual(order);
  await flushRendererPersistence();
  expect((await store.readHydratedState()).settings.desktopHomeModules).toEqual(
    order,
  );
});
