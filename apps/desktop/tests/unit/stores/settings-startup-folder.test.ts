import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSettingsFromMainProcess,
  useSettingsStore,
} from "../../../src/renderer/stores/settings.store";
import { stripEphemeralSettings } from "../../../src/renderer/stores/settings/settings-persistence";
import { normalizeStartupFolderSettings } from "../../../src/renderer/stores/settings/settings-normalizers";
import { installWindowMocks } from "../../helpers/window";

function baseFolder(id: string, name: string) {
  return {
    id,
    name,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    order: 0,
    icon: "folder",
  } as const;
}

describe("normalizeStartupFolderSettings", () => {
  it("keeps valid values", () => {
    const state = {
      startupFolderMode: "pinned",
      pinnedStartFolderId: "f-1",
      lastActiveFolderId: "f-2",
    };
    normalizeStartupFolderSettings(state);
    expect(state.startupFolderMode).toBe("pinned");
    expect(state.pinnedStartFolderId).toBe("f-1");
    expect(state.lastActiveFolderId).toBe("f-2");
  });

  it("falls back to defaults on malformed same-version snapshots", () => {
    const state = {
      startupFolderMode: "whatever",
      pinnedStartFolderId: 123,
      lastActiveFolderId: "   ",
    } as Record<string, unknown>;
    normalizeStartupFolderSettings(state);
    expect(state.startupFolderMode).toBe("default");
    expect(state.pinnedStartFolderId).toBeNull();
    expect(state.lastActiveFolderId).toBeNull();
  });

  it("treats missing keys as defaults", () => {
    const state: Record<string, unknown> = {};
    normalizeStartupFolderSettings(state);
    expect(state.startupFolderMode).toBe("default");
    expect(state.pinnedStartFolderId).toBeNull();
    expect(state.lastActiveFolderId).toBeNull();
  });
});

describe("settings startup-folder actions", () => {
  beforeEach(() => {
    installWindowMocks({ api: { settings: {
      set: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue({}),
      rendererPersistence: {},
    } } });
    useSettingsStore.setState({
      startupFolderMode: "default",
      pinnedStartFolderId: null,
      lastActiveFolderId: null,
    });
  });

  it("defaults start at mode default", () => {
    const state = useSettingsStore.getState();
    expect(state.startupFolderMode).toBe("default");
    expect(state.pinnedStartFolderId).toBeNull();
    expect(state.lastActiveFolderId).toBeNull();
  });

  it("setStartupFolderMode stores valid modes and rejects garbage", () => {
    useSettingsStore.getState().setStartupFolderMode("last");
    expect(useSettingsStore.getState().startupFolderMode).toBe("last");

    useSettingsStore
      .getState()
      .setStartupFolderMode("bogus" as "last" | "pinned" | "default");
    expect(useSettingsStore.getState().startupFolderMode).toBe("default");
  });

  it("pinning a folder switches to pinned mode; clearing returns to default", () => {
    useSettingsStore
      .getState()
      .setPinnedStartFolder(baseFolder("f-9", "Ops").id);
    let state = useSettingsStore.getState();
    expect(state.pinnedStartFolderId).toBe("f-9");
    expect(state.startupFolderMode).toBe("pinned");

    useSettingsStore.getState().setPinnedStartFolder(null);
    state = useSettingsStore.getState();
    expect(state.pinnedStartFolderId).toBeNull();
    expect(state.startupFolderMode).toBe("default");

    useSettingsStore.getState().setPinnedStartFolder("  ");
    state = useSettingsStore.getState();
    expect(state.pinnedStartFolderId).toBeNull();
  });

  it("recordLastActiveFolder ignores blank and repeated values", () => {
    const { recordLastActiveFolder } = useSettingsStore.getState();

    recordLastActiveFolder(null);
    recordLastActiveFolder("");
    recordLastActiveFolder("   ");
    expect(useSettingsStore.getState().lastActiveFolderId).toBeNull();

    recordLastActiveFolder("f-1");
    expect(useSettingsStore.getState().lastActiveFolderId).toBe("f-1");

    const touchedAt = useSettingsStore.getState().settingsUpdatedAt;
    recordLastActiveFolder("f-1");
    expect(useSettingsStore.getState().settingsUpdatedAt).toBe(touchedAt);

    useSettingsStore.getState().recordLastActiveFolder("f-2");
    expect(useSettingsStore.getState().lastActiveFolderId).toBe("f-2");
  });

  it("persists startup preferences through main settings and reloads them without a renderer copy", async () => {
    const set = vi.spyOn(window.api.settings, "set").mockResolvedValue(true);
    useSettingsStore.getState().setPinnedStartFolder("f-9");
    useSettingsStore.getState().recordLastActiveFolder("f-2");
    useSettingsStore.getState().setBackupGuideCollapsed(true);
    expect(set).toHaveBeenCalledWith({
      pinnedStartFolderId: "f-9",
      startupFolderMode: "pinned",
    });
    expect(set).toHaveBeenCalledWith({ lastActiveFolderId: "f-2" });
    expect(set).toHaveBeenCalledWith({ backupGuideCollapsed: true });
    const persisted = stripEphemeralSettings(useSettingsStore.getState());
    expect(persisted).not.toHaveProperty("startupFolderMode");
    expect(persisted).not.toHaveProperty("pinnedStartFolderId");
    expect(persisted).not.toHaveProperty("lastActiveFolderId");
    expect(persisted).not.toHaveProperty("backupGuideCollapsed");
    vi.spyOn(window.api.settings, "get").mockResolvedValue({
      theme: "system",
      language: "en",
      autoSave: true,
      startupFolderMode: "pinned",
      pinnedStartFolderId: "f-9",
      lastActiveFolderId: "f-2",
      backupGuideCollapsed: true,
    });
    useSettingsStore.setState({
      startupFolderMode: "default",
      pinnedStartFolderId: null,
      lastActiveFolderId: null,
      backupGuideCollapsed: false,
    });
    await loadSettingsFromMainProcess();
    expect(useSettingsStore.getState()).toMatchObject({
      startupFolderMode: "pinned",
      pinnedStartFolderId: "f-9",
      lastActiveFolderId: "f-2",
      backupGuideCollapsed: true,
    });
    vi.restoreAllMocks();
  });
});
