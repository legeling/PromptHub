// @vitest-environment jsdom
// Install transport/home isolation before importing main-process services.
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRendererPersistenceStore } from "@prompthub/core";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { settingsApi } from "../../src/preload/api/settings";
import { installWindowMocks } from "../helpers/window";

vi.mock("../../src/renderer/i18n", () => ({
  default: { language: "en" },
  changeLanguage: vi.fn(),
}));
// Renderer cache is disposable; SQLite below is the persistence authority.
const cache = new Map<string, string>();
const storage: Storage = {
  get length() {
    return cache.size;
  },
  clear: () => cache.clear(),
  getItem: (key) => cache.get(key) ?? null,
  key: (index) => Array.from(cache.keys())[index] ?? null,
  removeItem: (key) => {
    cache.delete(key);
  },
  setItem: (key, value) => {
    cache.set(key, String(value));
  },
};
vi.stubGlobal("localStorage", storage);
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: storage,
});
const { useSettingsStore, loadSettingsFromMainProcess } =
  await import("../../src/renderer/stores/settings.store");

let runtime: SkillTestRuntime;
function registerSettings(): void {
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      database: getDatabase(),
      rootPath: runtime.profile,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error("No secrets in fixture");
        },
        decryptString: () => {
          throw new Error("No secrets in fixture");
        },
      },
    }),
  });
  installWindowMocks({ api: { settings: settingsApi } });
}
beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  runtime = await createSkillTestRuntime();
  registerSettings();
  await settingsApi.set({
    launchAtStartup: false,
    minimizeOnLaunch: false,
    sync: { enabled: false, provider: "webdav" },
  });
});
afterEach(() => {
  runtime?.dispose();
  localStorage.clear();
  Reflect.deleteProperty(window, "api");
});

async function createProvider(name: string): Promise<string> {
  useSettingsStore.getState().addAiProvider({
    name,
    provider: "custom",
    apiProtocol: "openai",
    apiUrl: "https://example.invalid/v1",
    apiKey: "",
  });
  const id = useSettingsStore.getState().aiProviders.at(-1)!.id;
  await vi.waitFor(async () =>
    expect((await settingsApi.get()).aiProviders).toContainEqual(
      expect.objectContaining({
        id,
        name,
        provider: "custom",
        apiProtocol: "openai",
        apiUrl: "https://example.invalid/v1",
      }),
    ),
  );
  return id;
}
async function addModel(providerId: string): Promise<string> {
  useSettingsStore.getState().addAiModel({
    providerId,
    name: "Keep model label",
    provider: "custom",
    apiProtocol: "openai",
    apiKey: "",
    apiUrl: "https://example.invalid/v1",
    model: "fixture-model",
    type: "chat",
  });
  const id = useSettingsStore.getState().aiModels.at(-1)!.id;
  await vi.waitFor(async () =>
    expect((await settingsApi.get()).aiModels).toContainEqual(
      expect.objectContaining({
        id,
        providerId,
        name: "Keep model label",
        model: "fixture-model",
        apiUrl: "https://example.invalid/v1",
        type: "chat",
      }),
    ),
  );
  return id;
}
async function reopen(): Promise<void> {
  await runtime.reopen();
  registerSettings();
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  await loadSettingsFromMainProcess();
}

it("persists provider create/read/edit/delete, model routes and final empty state across reopen (#245)", async () => {
  const removed = await createProvider("Extra gateway");
  const kept = await createProvider("Other gateway");
  const removedModel = await addModel(removed);
  const keptModel = await addModel(kept);
  useSettingsStore.getState().updateAiProvider(removed, {
    name: "Renamed gateway",
    apiUrl: "https://changed.invalid/v1",
  });
  useSettingsStore.getState().setModelRouteDefault("mainText", removedModel);
  useSettingsStore.getState().setModelRouteDefault("fastText", keptModel);
  await vi.waitFor(async () =>
    expect((await settingsApi.get()).modelRouteDefaults).toEqual({
      mainText: removedModel,
      fastText: keptModel,
    }),
  );
  await reopen();
  expect(useSettingsStore.getState().aiApiUrl).toBe(
    "https://changed.invalid/v1",
  );
  expect(
    useSettingsStore.getState().aiProviders.find((p) => p.id === removed),
  ).toMatchObject({
    name: "Renamed gateway",
    apiUrl: "https://changed.invalid/v1",
  });
  expect(
    useSettingsStore.getState().aiModels.find((m) => m.id === removedModel),
  ).toMatchObject({
    name: "Keep model label",
    apiUrl: "https://changed.invalid/v1",
  });
  await useSettingsStore.getState().deleteAiProvider(removed);
  await reopen();
  expect(useSettingsStore.getState().aiProviders.map((p) => p.id)).toEqual([
    kept,
  ]);
  expect(useSettingsStore.getState().aiModels.map((m) => m.id)).toEqual([
    keptModel,
  ]);
  expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
    fastText: keptModel,
  });
  await useSettingsStore.getState().deleteAiProvider(kept);
  await reopen();
  expect(useSettingsStore.getState()).toMatchObject({
    aiProviders: [],
    aiModels: [],
    modelRouteDefaults: {},
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
  });
});

it("preserves persisted and visible state on deletion failure and supports retry (#245)", async () => {
  const id = await createProvider("Keep on failure");
  await addModel(id);
  const before = await settingsApi.get();
  const write = vi
    .spyOn(window.api.settings, "set")
    .mockRejectedValueOnce(new Error("fixture write failure"));
  await expect(
    useSettingsStore.getState().deleteAiProvider(id),
  ).rejects.toThrow("fixture write failure");
  expect(useSettingsStore.getState().aiProviders.map((p) => p.id)).toEqual([
    id,
  ]);
  expect(await settingsApi.get()).toEqual(before);
  write.mockRestore();
  await reopen();
  expect(useSettingsStore.getState().aiProviders.map((p) => p.id)).toEqual([
    id,
  ]);
  await useSettingsStore.getState().deleteAiProvider(id);
  await reopen();
  expect(useSettingsStore.getState().aiModels).toEqual([]);
  expect(useSettingsStore.getState().aiProviders).toEqual([]);
});

it("removes model-derived groups and their routes in one persisted write (#245)", async () => {
  const id = await addModel("");
  useSettingsStore.getState().setScenarioModelDefault("promptTest", id);
  await vi.waitFor(async () =>
    expect((await settingsApi.get()).modelRouteDefaults).toEqual({
      mainText: id,
    }),
  );
  const write = vi.spyOn(window.api.settings, "set");
  await useSettingsStore.getState().deleteAiModels([id]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(useSettingsStore.getState().scenarioModelDefaults).toEqual({});
  write.mockRestore();
  await reopen();
  expect(useSettingsStore.getState()).toMatchObject({
    aiProviders: [],
    aiModels: [],
    modelRouteDefaults: {},
    aiApiKey: "",
    aiModel: "",
  });
});
