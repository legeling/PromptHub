import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { SettingSection, ShortcutItem } from "./shared";

export function ShortcutsSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const settings = useSettingsStore();

  // Shortcut state
  // 快捷键状态
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({
    showApp: "CommandOrControl+Shift+P",
    newPrompt: "CommandOrControl+N",
    search: "CommandOrControl+F",
    settings: "CommandOrControl+,",
  });
  const [shortcutConflicts, setShortcutConflicts] = useState<
    Record<string, string | undefined>
  >({});

  // Load shortcut settings
  // 加载快捷键设置
  useEffect(() => {
    window.electron?.getShortcuts?.().then((savedShortcuts) => {
      if (savedShortcuts) {
        setShortcuts(savedShortcuts);
      }
    });
  }, []);

  // Check shortcut conflicts
  // 检查快捷键冲突
  const checkShortcutConflict = (
    key: string,
    shortcut: string,
  ): string | undefined => {
    for (const [k, v] of Object.entries(shortcuts)) {
      if (k !== key && v === shortcut) {
        return k;
      }
    }
    return undefined;
  };

  // Handle shortcut change
  // 处理快捷键更改
  const handleShortcutChange = async (key: string, shortcut: string) => {
    const conflict = checkShortcutConflict(key, shortcut);
    if (conflict) {
      setShortcutConflicts({ ...shortcutConflicts, [key]: conflict });
      showToast(
        t("settings.shortcutConflict", {
          key: t(
            `settings.shortcut${conflict.charAt(0).toUpperCase() + conflict.slice(1)}`,
          ),
        }),
        "error",
      );
      return;
    }
    setShortcutConflicts({ ...shortcutConflicts, [key]: undefined });
    const newShortcuts = { ...shortcuts, [key]: shortcut };
    setShortcuts(newShortcuts);
    await window.electron?.setShortcuts?.(newShortcuts);
    showToast(t("settings.shortcutUpdated"), "success");
  };

  // Clear shortcut
  // 清除快捷键
  const handleShortcutClear = async (key: string) => {
    const newShortcuts = { ...shortcuts, [key]: "" };
    setShortcuts(newShortcuts);
    setShortcutConflicts({ ...shortcutConflicts, [key]: undefined });
    await window.electron?.setShortcuts?.(newShortcuts);
    showToast(t("settings.shortcutCleared"), "success");
  };

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.shortcutOptions")}>
        <div>
          <ShortcutItem
            label={t("settings.shortcutShowApp")}
            description={t("settings.shortcutShowAppDesc")}
            shortcut={shortcuts.showApp || ""}
            onShortcutChange={(shortcut) =>
              handleShortcutChange("showApp", shortcut)
            }
            onClear={() => handleShortcutClear("showApp")}
            conflict={shortcutConflicts.showApp}
            mode={settings.shortcutModes?.showApp || "global"}
            onModeChange={(mode) => settings.setShortcutMode?.("showApp", mode)}
          />
          <ShortcutItem
            label={t("settings.shortcutNewPrompt")}
            description={t("settings.shortcutNewPromptDesc")}
            shortcut={shortcuts.newPrompt || ""}
            onShortcutChange={(shortcut) =>
              handleShortcutChange("newPrompt", shortcut)
            }
            onClear={() => handleShortcutClear("newPrompt")}
            conflict={shortcutConflicts.newPrompt}
            mode={settings.shortcutModes?.newPrompt || "local"}
            onModeChange={(mode) =>
              settings.setShortcutMode?.("newPrompt", mode)
            }
          />
          <ShortcutItem
            label={t("settings.shortcutSearch")}
            description={t("settings.shortcutSearchDesc")}
            shortcut={shortcuts.search || ""}
            onShortcutChange={(shortcut) =>
              handleShortcutChange("search", shortcut)
            }
            onClear={() => handleShortcutClear("search")}
            conflict={shortcutConflicts.search}
            mode={settings.shortcutModes?.search || "local"}
            onModeChange={(mode) => settings.setShortcutMode?.("search", mode)}
          />
          <ShortcutItem
            label={t("settings.shortcutSettings")}
            description={t("settings.shortcutSettingsDesc")}
            shortcut={shortcuts.settings || ""}
            onShortcutChange={(shortcut) =>
              handleShortcutChange("settings", shortcut)
            }
            onClear={() => handleShortcutClear("settings")}
            conflict={shortcutConflicts.settings}
            mode={settings.shortcutModes?.settings || "local"}
            onModeChange={(mode) =>
              settings.setShortcutMode?.("settings", mode)
            }
          />
        </div>
      </SettingSection>

      <SettingSection title={t("settings.shortcutTips")}>
        <div className="p-4 text-sm text-muted-foreground space-y-2">
          <p>• {t("settings.shortcutTip1")}</p>
          <p>• {t("settings.shortcutTip2")}</p>
          <p>• {t("settings.shortcutTip3")}</p>
          <p>• {t("settings.shortcutModeDesc")}</p>
        </div>
      </SettingSection>
    </div>
  );
}
