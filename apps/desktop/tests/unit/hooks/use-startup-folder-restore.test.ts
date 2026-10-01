import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useStartupFolderRestore } from "../../../src/renderer/hooks/useStartupFolderRestore";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

function seedFolderStore(ids: string[]) {
  useFolderStore.setState({
    folders: ids.map((id, index) => ({
      id,
      name: `Folder ${id}`,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      order: index,
      icon: "folder",
    })),
    selectedFolderId: null,
    expandedIds: new Set<string>(),
    unlockedFolderIds: new Set<string>(),
  } as Partial<ReturnType<typeof useFolderStore.getState>>);
}

describe("useStartupFolderRestore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      startupFolderMode: "default",
      pinnedStartFolderId: null,
      lastActiveFolderId: null,
    });
    seedFolderStore([]);
  });

  it("does nothing in default mode", () => {
    seedFolderStore(["a", "b"]);
    useSettingsStore.setState({ lastActiveFolderId: "b" });

    renderHook(() => useStartupFolderRestore());
    act(() => undefined);

    expect(useFolderStore.getState().selectedFolderId).toBeNull();
  });

  it("restores the last active folder once folders are loaded", () => {
    useSettingsStore.setState({
      startupFolderMode: "last",
      lastActiveFolderId: "b",
    });

    const { rerender } = renderHook(() => useStartupFolderRestore());

    // folders not loaded yet
    expect(useFolderStore.getState().selectedFolderId).toBeNull();

    seedFolderStore(["a", "b"]);
    rerender();
    act(() => undefined);

    expect(useFolderStore.getState().selectedFolderId).toBe("b");
  });

  it("restores the pinned folder", () => {
    useSettingsStore.setState({
      startupFolderMode: "pinned",
      pinnedStartFolderId: "a",
    });
    seedFolderStore(["a", "b"]);

    renderHook(() => useStartupFolderRestore());
    act(() => undefined);

    expect(useFolderStore.getState().selectedFolderId).toBe("a");
  });

  it("falls back silently when the saved folder no longer exists", () => {
    useSettingsStore.setState({
      startupFolderMode: "last",
      lastActiveFolderId: "gone",
    });
    seedFolderStore(["a", "b"]);

    renderHook(() => useStartupFolderRestore());
    act(() => undefined);

    expect(useFolderStore.getState().selectedFolderId).toBeNull();
  });

  it("applies at most once per mount", () => {
    useSettingsStore.setState({
      startupFolderMode: "last",
      lastActiveFolderId: "a",
    });
    seedFolderStore(["a", "b"]);

    const { rerender } = renderHook(() => useStartupFolderRestore());
    act(() => undefined);
    expect(useFolderStore.getState().selectedFolderId).toBe("a");

    // user switches away; a later re-render must not snap the selection back.
    useFolderStore.setState({ selectedFolderId: "b" });
    rerender();
    act(() => undefined);
    expect(useFolderStore.getState().selectedFolderId).toBe("b");
  });
});
