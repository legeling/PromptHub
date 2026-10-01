import { useEffect, useRef } from "react";
import i18n from "../i18n";
import { useFolderStore } from "../stores/folder.store";
import { useSettingsStore } from "../stores/settings.store";

type StartupNotify = (message: string, tone: "info" | "warning") => void;

/**
 * v0.6.2 #74: enter the configured / last-used folder once after startup.
 * 冷启动文件夹恢复：folders 首次加载完成后按设置进入目标文件夹，仅执行一次。
 *
 * - `default` mode keeps the historical behavior (no-op, no feedback).
 * - Missing target folders fall back to the default view with a warning
 *   notification (v0.6.3 FR-STARTUP-005); successful restores notify once.
 * - The restore runs through the same `selectFolder` action as a manual
 *   sidebar click so unlock-state and list refresh semantics stay identical.
 *   与手动点击侧栏走同一条 action，解锁状态与列表刷新语义完全一致。
 *
 * `notify` is injected (usually App's showToast) so the hook stays free of
 * provider coupling and is directly unit-testable.
 * notify 由调用方注入（App 的 showToast），hook 无 provider 依赖、可直接单测。
 */
export function useStartupFolderRestore(notify?: StartupNotify): void {
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

    const target = folders.find((folder) => folder.id === targetId);
    if (!target) {
      notify?.(i18n.t("settings.startupFolderMissing"), "warning");
      return;
    }

    const { selectedFolderId } = useFolderStore.getState();
    if (selectedFolderId === targetId) return;

    useFolderStore.getState().selectFolder(targetId);
    notify?.(i18n.t("settings.startupFolderRestored", { name: target.name }), "info");
  }, [folders, notify]);
}
