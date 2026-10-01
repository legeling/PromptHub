import { useEffect, useRef } from "react";
import { useFolderStore } from "../stores/folder.store";
import { useSettingsStore } from "../stores/settings.store";

/**
 * v0.6.2 #74: enter the configured / last-used folder once after startup.
 * 冷启动文件夹恢复：folders 首次加载完成后按设置进入目标文件夹，仅执行一次。
 *
 * - `default` mode keeps the historical behavior (no-op).
 * - Missing target folders fall back to the default view silently.
 * - The restore runs through the same `selectFolder` action as a manual
 *   sidebar click so unlock-state and list refresh semantics stay identical.
 *   与手动点击侧栏走同一条 action，解锁状态与列表刷新语义完全一致。
 */
export function useStartupFolderRestore(): void {
  const folders = useFolderStore((state) => state.folders);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || folders.length === 0) {
      return;
    }

    const {
      startupFolderMode,
      pinnedStartFolderId,
      lastActiveFolderId,
    } = useSettingsStore.getState();

    if (startupFolderMode === "default") {
      appliedRef.current = true;
      return;
    }

    const targetId =
      startupFolderMode === "pinned" ? pinnedStartFolderId : lastActiveFolderId;

    appliedRef.current = true;

    if (!targetId) return;
    if (!folders.some((folder) => folder.id === targetId)) return;

    const { selectedFolderId } = useFolderStore.getState();
    if (selectedFolderId === targetId) return;

    useFolderStore.getState().selectFolder(targetId);
  }, [folders]);
}
