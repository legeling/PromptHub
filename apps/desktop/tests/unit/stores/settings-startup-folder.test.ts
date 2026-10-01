import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { normalizeStartupFolderSettings } from "../../../src/renderer/stores/settings/settings-normalizers";

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
    useSettingsStore.getState().setPinnedStartFolder(baseFolder("f-9", "Ops").id);
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
});
