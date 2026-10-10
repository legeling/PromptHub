import { requestConfirmation } from "../../ui/confirmation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../../stores/settings.store";
import type {
  DataPathChangeAction,
  DataPathChangePreview,
} from "./data-settings-controller-utils";
import { useToast } from "../../ui/Toast";

type DataPathChangeResult =
  | {
      success: boolean;
      newPath?: string;
      needsRestart?: boolean;
      backupPath?: string;
      error?: string;
    }
  | undefined;

function useDataPathState() {
  const [currentDataPath, setCurrentDataPath] = useState("");
  const [pendingDataPath, setPendingDataPath] = useState<string | null>(null);
  const [pendingDataPathChange, setPendingDataPathChange] =
    useState<DataPathChangePreview | null>(null);
  const [dataPathActionLoading, setDataPathActionLoading] = useState(false);

  return {
    currentDataPath,
    setCurrentDataPath,
    pendingDataPath,
    setPendingDataPath,
    pendingDataPathChange,
    setPendingDataPathChange,
    dataPathActionLoading,
    setDataPathActionLoading,
  };
}

function getChangeMessage(
  action: DataPathChangeAction,
): [messageKey: string, fallback: string] {
  if (action === "switch") {
    return ["settings.dataPathSwitchSuccess", "Data directory switched"];
  }
  if (action === "overwrite") {
    return [
      "settings.dataPathOverwriteSuccess",
      "Data migrated and target backup created",
    ];
  }
  return ["toast.dataPathChanged", "Data path changed"];
}

async function confirmMigration(translate: ReturnType<typeof useTranslation>["t"]) {
  return (await requestConfirmation({
    message: translate(
      "settings.confirmDataMigration",
      "Are you sure you want to migrate data to the new directory?\n\nRestart is required after migration.",
    ),
  }));
}

export function useDataPathController() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const settings = useSettingsStore();
  const { dataPath: persistedDataPath, setDataPath } = settings;
  const state = useDataPathState();
  const {
    currentDataPath,
    setCurrentDataPath,
    setPendingDataPath,
    setPendingDataPathChange,
    setDataPathActionLoading,
  } = state;

  const restartApp = useCallback(async () => {
    if (window.electron?.relaunchApp) {
      await window.electron.relaunchApp();
      return;
    }
    window.location.reload();
  }, []);

  const refreshDataPathStatus = useCallback(async () => {
    const status = await window.electron?.getDataPathStatus?.();
    if (status?.currentPath) {
      setCurrentDataPath(status.currentPath);
      setPendingDataPath(
        status.needsRestart ? status.configuredPath || null : null,
      );
      if (
        status.configuredPath &&
        status.configuredPath !== persistedDataPath
      ) {
        setDataPath(status.configuredPath);
      }
      return;
    }

    const resolvedPath = await window.electron?.getDataPath?.();
    if (!resolvedPath) return;
    setCurrentDataPath(resolvedPath);
    setPendingDataPath(null);
    if (resolvedPath !== persistedDataPath) setDataPath(resolvedPath);
  }, [persistedDataPath, setCurrentDataPath, setDataPath, setPendingDataPath]);

  useEffect(() => {
    let mounted = true;
    void refreshDataPathStatus().catch((error) => {
      if (mounted) console.error("Failed to load data path status:", error);
    });
    return () => {
      mounted = false;
    };
  }, [refreshDataPathStatus]);

  const finishDataPathChange = useCallback(
    async (
      result: DataPathChangeResult,
      action: DataPathChangeAction,
      fallbackPath: string,
    ) => {
      if (!result?.success) {
        showToast(
          `${t("toast.dataPathChangeFailed", "Data migration failed")}: ${result?.error || ""}`,
          "error",
        );
        return;
      }

      const resolvedPath = result.newPath || fallbackPath;
      setDataPath(resolvedPath);
      setPendingDataPathChange(null);
      await refreshDataPathStatus();
      const [messageKey, fallback] = getChangeMessage(action);
      const requiresRestart = result.needsRestart !== false;
      showToast(
        requiresRestart
          ? `${t(messageKey, fallback)} ${t("settings.restartRequired", "Please restart app")}`
          : t(messageKey, fallback),
        "success",
      );
      if (requiresRestart) {
        if (await requestConfirmation({ message: t("settings.restartNow") })) {
          await restartApp();
        }
      }
    },
    [
      refreshDataPathStatus,
      restartApp,
      setDataPath,
      setPendingDataPathChange,
      showToast,
      t,
    ],
  );

  const applyDataPathChange = useCallback(
    async (targetPath: string, action: DataPathChangeAction) => {
      setDataPathActionLoading(true);
      try {
        const result = window.electron?.applyDataPathChange
          ? await window.electron.applyDataPathChange(targetPath, action)
          : await window.electron?.migrateData?.(targetPath);
        await finishDataPathChange(result, action, targetPath);
      } finally {
        setDataPathActionLoading(false);
      }
    },
    [finishDataPathChange, setDataPathActionLoading],
  );

  const handleChangeDataPath = useCallback(async () => {
    const selectedPath = await window.electron?.selectFolder?.();
    if (!selectedPath) return;
    if (!window.electron?.previewDataPathChange) {
      if (await confirmMigration(t))
        await applyDataPathChange(selectedPath, "migrate");
      return;
    }

    const preview = await window.electron.previewDataPathChange(selectedPath);
    if (!preview?.success) {
      showToast(
        `${t("toast.dataPathChangeFailed", "Data migration failed")}: ${preview?.error || ""}`,
        "error",
      );
      return;
    }
    if (preview.isCurrentPath) {
      await finishDataPathChange(
        {
          success: true,
          newPath: preview.targetPath || selectedPath,
          needsRestart: false,
        },
        "switch",
        selectedPath,
      );
      return;
    }
    if (preview.hasPromptHubData) {
      setPendingDataPathChange(preview);
    } else if (await confirmMigration(t)) {
      await applyDataPathChange(preview.targetPath || selectedPath, "migrate");
    }
  }, [
    applyDataPathChange,
    finishDataPathChange,
    setPendingDataPathChange,
    showToast,
    t,
  ]);

  return {
    persistedDataPath,
    setDataPath,
    ...state,
    restartApp,
    refreshDataPathStatus,
    finishDataPathChange,
    applyDataPathChange,
    handleChangeDataPath,
    normalizedDataPath: currentDataPath.replace(/[\\/]+$/, ""),
  };
}
