import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";
import { Select } from "../ui/Select";

const LANGUAGE_OPTIONS = [
  { value: "zh", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

export function GeneralSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.startup")}>
        <SettingItem
          label={t("settings.launchAtStartup")}
          description={t("settings.launchAtStartupDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.launchAtStartup")}
            checked={settings.launchAtStartup}
            onChange={settings.setLaunchAtStartup}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.minimizeOnLaunch")}
          description={t("settings.minimizeOnLaunchDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.minimizeOnLaunch")}
            checked={settings.minimizeOnLaunch}
            onChange={settings.setMinimizeOnLaunch}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.clipboardImport", "剪切板快速导入")}
          description={t(
            "settings.clipboardImportDesc",
            "获得焦点时检测剪切板代码块并提示导入",
          )}
        >
          <ToggleSwitch
            ariaLabel={t("settings.clipboardImport", "剪切板快速导入")}
            checked={settings.clipboardImportEnabled}
            onChange={settings.setClipboardImportEnabled}
          />
        </SettingItem>
        {/* Windows close behavior settings */}
        {/* Windows 关闭行为设置 */}
        {navigator.platform.toLowerCase().includes("win") && (
          <SettingItem
            label={t("settings.closeAction")}
            description={t("settings.closeActionDesc")}
          >
          <Select
            ariaLabel={t("settings.closeAction")}
            value={settings.closeAction}
            onChange={(value) =>
              settings.setCloseAction(value as "ask" | "minimize" | "exit")
              }
              options={[
                { value: "ask", label: t("settings.askEveryTime") },
                { value: "minimize", label: t("settings.closeToTray") },
                { value: "exit", label: t("settings.closeApp") },
              ]}
              className="w-40"
            />
          </SettingItem>
        )}
      </SettingSection>

      <SettingSection title={t("settings.editor")}>
        <SettingItem
          label={t("settings.autoSave")}
          description={t("settings.autoSaveDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.autoSave")}
            checked={settings.autoSave}
            onChange={settings.setAutoSave}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.showLineNumbers")}
          description={t("settings.showLineNumbersDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.showLineNumbers")}
            checked={settings.showLineNumbers}
            onChange={settings.setShowLineNumbers}
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.languageAndRegion", "语言与地区")}>
        <SettingItem
          label={t("settings.language")}
          description={t("settings.selectLanguage")}
        >
          <Select
            ariaLabel={t("settings.language")}
            value={settings.language}
            onChange={(value) => settings.setLanguage(value)}
            options={LANGUAGE_OPTIONS}
            className="w-40"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.behaviorPreferences", "行为与偏好")}>
        <SettingItem
          label={t("settings.tagFilterMode", "标签点击模式")}
          description={t(
            "settings.tagFilterModeDesc",
            "设置点击标签时是替换当前筛选，还是追加到多选筛选中",
          )}
        >
          <Select
            ariaLabel={t("settings.tagFilterMode", "标签点击模式")}
            value={settings.tagFilterMode}
            onChange={(value) =>
              settings.setTagFilterMode(value as "single" | "multi")
            }
            options={[
              { value: "single", label: t("settings.tagFilterModeSingle", "单选") },
              { value: "multi", label: t("settings.tagFilterModeMulti", "多选") },
            ]}
            className="w-40"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.notifications")}>
        <SettingItem
          label={t("settings.enableNotifications")}
          description={t("settings.enableNotificationsDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.enableNotifications")}
            checked={settings.enableNotifications}
            onChange={settings.setEnableNotifications}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.copyNotification")}
          description={t("settings.copyNotificationDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.copyNotification")}
            checked={settings.showCopyNotification}
            onChange={settings.setShowCopyNotification}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.saveNotification")}
          description={t("settings.saveNotificationDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.saveNotification")}
            checked={settings.showSaveNotification}
            onChange={settings.setShowSaveNotification}
          />
        </SettingItem>
      </SettingSection>
    </div>
  );
}
