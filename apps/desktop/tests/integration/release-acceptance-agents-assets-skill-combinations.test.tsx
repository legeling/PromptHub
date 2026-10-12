/** @vitest-environment jsdom */
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { safeStorage } from "electron";
import { createRendererPersistenceStore } from "@prompthub/core";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { registerPluginIPC } from "../../src/main/ipc/plugin.ipc";
import { pluginApi } from "../../src/preload/api/plugin";
import { settingsApi } from "../../src/preload/api/settings";

// Browser cache replacement only; durable source configuration uses SQLite IPC.
const cacheValues = new Map<string, string>();
const cache: Storage = {
  get length() {
    return cacheValues.size;
  },
  clear: () => cacheValues.clear(),
  getItem: (key) => cacheValues.get(key) ?? null,
  key: (index) => [...cacheValues.keys()][index] ?? null,
  removeItem: (key) => {
    cacheValues.delete(key);
  },
  setItem: (key, value) => {
    cacheValues.set(key, String(value));
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: cache,
  configurable: true,
});
Object.defineProperty(window, "localStorage", {
  value: cache,
  configurable: true,
});

const electronTransport =
  await vi.importMock<typeof import("electron")>("electron");
// The real preload builds the complete API; only native exposure is replaced.
vi.doMock("electron", () => ({
  ...electronTransport,
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) =>
      Object.defineProperty(window, name, { value, configurable: true }),
  },
  webUtils: {
    getPathForFile: () => {
      throw new Error("Native files are outside this fixture");
    },
  },
}));
await import("../../src/preload/index");
const { useSkillStore } = await import("../../src/renderer/stores/skill.store");
const { usePluginStore } =
  await import("../../src/renderer/stores/plugin.store");
const { useMcpStore } = await import("../../src/renderer/stores/mcp.store");
const { useUIStore } = await import("../../src/renderer/stores/ui.store");
const { useSettingsStore } =
  await import("../../src/renderer/stores/settings.store");
const { migrateRendererPersistence, resetRendererPersistenceForTests } =
  await import("../../src/renderer/services/renderer-persistence");
const { usePluginManagerBindings } =
  await import("../../src/renderer/components/plugin/usePluginManagerBindings");
const { usePluginManagerState } =
  await import("../../src/renderer/components/plugin/usePluginManagerState");
const { usePluginManagerChildAssetActions } =
  await import("../../src/renderer/components/plugin/usePluginManagerChildAssetActions");
const { useSkillStoreRemoteSync } =
  await import("../../src/renderer/components/skill/store-remote-sync");
const { useSkillPackageInstall } =
  await import("../../src/renderer/components/skill/useSkillPackageInstall");
const { default: i18next } = await import("i18next");
const { SkillStore } =
  await import("../../src/renderer/components/skill/SkillStore");
const { ToastProvider } =
  await import("../../src/renderer/components/ui/Toast");
const { I18nextProvider } = await import("react-i18next");
const translations = i18next.createInstance();
await translations.init({ lng: "en", resources: {}, fallbackLng: "en" });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={translations}>{children}</I18nextProvider>
);
let runtime: SkillTestRuntime;
function register(): void {
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      rootPath: runtime.profile,
      encryption: safeStorage,
    }),
  });
  registerPluginIPC();
}
function resetStores(): void {
  resetRendererPersistenceForTests();
  window.localStorage.clear();
  useSkillStore.setState(useSkillStore.getInitialState(), true);
  usePluginStore.setState(usePluginStore.getInitialState(), true);
  useMcpStore.setState(useMcpStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  window.localStorage.clear();
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  register();
  resetStores();
  await settingsApi.set({ device: { storeAutoSync: false } });
  await migrateRendererPersistence();
});
afterEach(() => {
  cleanup();
  try {
    resetStores();
  } finally {
    runtime?.dispose();
  }
});
function writePackage(root: string, name: string): void {
  fs.mkdirSync(path.join(root, "assets/nested"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: Local fixture\nversion: 1.0.0\n---\n# ${name}\nUse the local fixture.\n`,
  );
  fs.writeFileSync(
    path.join(root, "assets/nested/data.bin"),
    Buffer.from([0, 1, 128, 255]),
  );
}
async function reopen(): Promise<void> {
  cleanup();
  resetStores();
  await runtime.reopen();
  register();
  await migrateRendererPersistence();
  await useSkillStore.getState().loadSkills();
}
function usePluginActions() {
  const bindings = usePluginManagerBindings();
  const state = usePluginManagerState();
  return {
    state,
    actions: usePluginManagerChildAssetActions({
      bindings,
      state,
      showToast: () => undefined,
      t: translations.t,
    }),
  };
}
async function preparePlugin() {
  fs.mkdirSync(path.join(runtime.source, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(runtime.source, ".codex-plugin/plugin.json"),
    JSON.stringify({
      name: "child-skill-fixture",
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
  );
  writePackage(path.join(runtime.source, "skills/writer"), "child-writer");
  fs.mkdirSync(path.join(runtime.source, "commands"));
  fs.writeFileSync(
    path.join(runtime.source, "commands/review.md"),
    "Review the fixture package.\n",
  );
  return (
    await pluginApi.importLocalPluginPackage({ sourcePath: runtime.source })
  ).plugin;
}
it("imports Plugin child Skills through the real renderer action into an independent library and preserves nested package bytes after reopen", async () => {
  const plugin = await preparePlugin();
  const inventory = fileInventory(plugin.localPackagePath);
  const hook = renderHook(usePluginActions, { wrapper });
  await act(async () =>
    hook.result.current.actions.handleImportChildSkills(plugin),
  );
  expect(hook.result.current.state.childSkillScanResults).toHaveLength(1);
  let importedCount = 0;
  await act(async () => {
    importedCount =
      await hook.result.current.actions.handleImportScannedChildSkills(
        hook.result.current.state.childSkillScanResults,
      );
  });
  expect(importedCount).toBe(1);
  const skills = useSkillStore.getState().skills;
  expect(skills).toHaveLength(1);
  const skill = skills[0];
  if (!skill.local_repo_path) throw new Error("Missing managed package");
  expect(fileInventory(skill.local_repo_path)).toEqual(
    fileInventory(path.join(plugin.localPackagePath, "skills/writer")),
  );
  expect(
    skill.local_repo_path.startsWith(plugin.localPackagePath + path.sep),
  ).toBe(false);
  expect(useSkillStore.getState()).toMatchObject({
    selectedSkillId: skill.id,
    storeView: "my-skills",
    pendingPluginChildDeploySkillIds: [skill.id],
  });
  expect(useUIStore.getState().appModule).toBe("skill");
  await pluginApi.deletePlugin(plugin.id);
  await reopen();
  expect(useSkillStore.getState().skills).toEqual([
    expect.objectContaining({ id: skill.id, name: "child-writer" }),
  ]);
  expect(fileInventory(skill.local_repo_path)).toEqual(
    fileInventory(path.join(runtime.source, "skills/writer")),
  );
  expect((await pluginApi.getLibrary()).plugins).toEqual([]);
  expect(fileInventory(runtime.source)).toEqual(inventory);
});
it("rejects content-only creation of a Plugin child package and preserves existing library records and package bytes after reopen", async () => {
  const plugin = await preparePlugin();
  const sourceBefore = fileInventory(runtime.source);
  const pluginBefore = fileInventory(plugin.localPackagePath);
  const existing = await skillApi.create({
    name: "existing-authored-skill",
    content: "# Existing\n",
    protocol_type: "skill",
    is_favorite: false,
  });
  const existingBefore = fileInventory(existing.local_repo_path);
  await expect(
    skillApi.create({
      name: "child-writer",
      content: "# Child\n",
      protocol_type: "skill",
      is_favorite: false,
      local_repo_path: path.join(plugin.localPackagePath, "skills/writer"),
    }),
  ).rejects.toThrow("Package imports must use the package lifecycle");
  expect(await skillApi.getAll()).toEqual([
    expect.objectContaining({ id: existing.id }),
  ]);
  expect(fileInventory(plugin.localPackagePath)).toEqual(pluginBefore);
  expect(fileInventory(existing.local_repo_path)).toEqual(existingBefore);
  await reopen();
  expect(useSkillStore.getState().skills).toEqual([
    expect.objectContaining({ id: existing.id }),
  ]);
  expect((await pluginApi.getLibrary()).plugins.map((item) => item.id)).toEqual(
    [plugin.id],
  );
  expect(fileInventory(runtime.source)).toEqual(sourceBefore);
  expect(fileInventory(plugin.localPackagePath)).toEqual(pluginBefore);
  expect(fileInventory(existing.local_repo_path)).toEqual(existingBefore);
});
it("persists local store source configuration, refreshes its real catalog, installs two complete packages and rehydrates without legacy storage", async () => {
  writePackage(path.join(runtime.source, "first"), "store-first");
  writePackage(path.join(runtime.source, "second"), "store-second");
  const sourceBefore = fileInventory(runtime.source);
  act(() =>
    useSkillStore
      .getState()
      .addCustomStoreSource("Local catalog", runtime.source, "local-dir"),
  );
  const source = useSkillStore.getState().customStoreSources[0];
  const hook = renderHook(
    () => ({
      remote: useSkillStoreRemoteSync({
        eagerRemoteSources: "selected",
        selectedStoreSourceId: source.id,
      }),
      install: useSkillPackageInstall(),
    }),
    { wrapper },
  );
  await act(async () =>
    hook.result.current.remote.loadStoreSource(source.id, true),
  );
  const entries = useSkillStore.getState().remoteStoreEntries[source.id].skills;
  expect(entries.map((entry) => entry.name).sort()).toEqual([
    "store-first",
    "store-second",
  ]);
  hook.unmount();
  act(() => useSkillStore.getState().selectStoreSource(source.id));
  render(
    <ToastProvider>
      <SkillStore />
    </ToastProvider>,
    { wrapper },
  );
  fireEvent.click(screen.getByRole("button", { name: "Batch manage store" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select visible store skills" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Install selected" }));
  await waitFor(() => expect(useSkillStore.getState().skills).toHaveLength(2));
  await screen.findByText(
    "Batch install finished: 2 succeeded, 0 awaiting review, 0 skipped, 0 failed",
  );
  const beforeReopen = useSkillStore.getState().skills;
  expect(beforeReopen).toHaveLength(2);
  for (const skill of beforeReopen) {
    if (!skill.local_repo_path) throw new Error("Missing managed package");
    const directory = skill.name === "store-first" ? "first" : "second";
    const managed = fileInventory(skill.local_repo_path);
    expect(
      fs.readFileSync(
        path.join(skill.local_repo_path, ".canonical-bundle-hash"),
        "utf8",
      ),
    ).toMatch(/^[a-f0-9]{64}$/);
    delete managed[".canonical-bundle-hash"];
    expect(managed).toEqual(
      fileInventory(path.join(runtime.source, directory)),
    );
  }
  await waitFor(async () =>
    expect(
      (await settingsApi.rendererPersistence.get()).marketplaceSources.skill,
    ).toEqual([
      expect.objectContaining({
        id: source.id,
        name: "Local catalog",
        url: runtime.source,
      }),
    ]),
  );
  await reopen();
  expect(useSkillStore.getState().customStoreSources).toEqual([
    expect.objectContaining({
      id: source.id,
      name: "Local catalog",
      url: runtime.source,
    }),
  ]);
  expect(
    useSkillStore
      .getState()
      .skills.map((skill) => skill.id)
      .sort(),
  ).toEqual(beforeReopen.map((skill) => skill.id).sort());
  expect(fileInventory(runtime.source)).toEqual(sourceBefore);
});
it("keeps installed library data and source configuration when a refreshed store package becomes unavailable", async () => {
  writePackage(path.join(runtime.source, "first"), "store-first");
  writePackage(path.join(runtime.source, "second"), "store-second");
  const sourceBefore = fileInventory(runtime.source);
  act(() =>
    useSkillStore
      .getState()
      .addCustomStoreSource("Local catalog", runtime.source, "local-dir"),
  );
  const source = useSkillStore.getState().customStoreSources[0];
  const hook = renderHook(
    () => ({
      remote: useSkillStoreRemoteSync({
        eagerRemoteSources: "selected",
        selectedStoreSourceId: source.id,
      }),
      install: useSkillPackageInstall(),
    }),
    { wrapper },
  );
  await act(async () =>
    hook.result.current.remote.loadStoreSource(source.id, true),
  );
  const entries = useSkillStore.getState().remoteStoreEntries[source.id].skills;
  const first = entries.find((entry) => entry.name === "store-first");
  const second = entries.find((entry) => entry.name === "store-second");
  if (!first || !second) throw new Error("Missing source entries");
  await act(async () => {
    expect((await hook.result.current.install.install(first))?.status).toBe(
      "installed",
    );
  });
  const installed = useSkillStore.getState().skills[0];
  if (!installed.local_repo_path) throw new Error("Missing managed package");
  const installedBefore = fileInventory(installed.local_repo_path);
  const unavailablePath = path.join(runtime.root, "offline-source");
  fs.renameSync(runtime.source, unavailablePath);
  await act(async () => {
    await expect(hook.result.current.install.install(second)).rejects.toThrow();
  });
  expect(await skillApi.getAll()).toEqual([
    expect.objectContaining({ id: installed.id }),
  ]);
  expect(fileInventory(installed.local_repo_path)).toEqual(installedBefore);
  await reopen();
  expect(useSkillStore.getState().skills).toEqual([
    expect.objectContaining({ id: installed.id }),
  ]);
  expect(useSkillStore.getState().customStoreSources).toEqual([
    expect.objectContaining({ id: source.id, url: runtime.source }),
  ]);
  expect(fileInventory(installed.local_repo_path)).toEqual(installedBefore);
  expect(fileInventory(unavailablePath)).toEqual(sourceBefore);
});
