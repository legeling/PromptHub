import { useState, useEffect } from "react";
import {
  GithubIcon,
  MailIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";
import appIconUrl from "../../../assets/icon.png";

export function AboutSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  // Get application version
  // 获取应用版本号
  const [appVersion, setAppVersion] = useState<string>("");
  useEffect(() => {
    window.electron?.updater?.getVersion().then((v) => setAppVersion(v || ""));
  }, []);

  return (
    <div className="space-y-6">
      {/* 应用信息卡片 */}
      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl overflow-hidden">
          <img
            src={appIconUrl}
            alt="PromptHub"
            className="w-full h-full object-cover"
          />
        </div>
        <h2 className="text-lg font-semibold">PromptHub</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.version")} {appVersion || "..."}
        </p>
      </div>

      <SettingSection title={t("settings.projectInfo")}>
        <div className="px-4 py-3 text-sm text-muted-foreground space-y-1">
          <p>
            {"\u2022"} {t("settings.projectInfoDesc1")}
          </p>
          <p>
            {"\u2022"} {t("settings.projectInfoDesc2")}
          </p>
          <p>
            {"\u2022"} {t("settings.projectInfoDesc3")}
          </p>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.checkUpdate")}>
        <SettingItem
          label={t("settings.autoCheckUpdate")}
          description={t("settings.autoCheckUpdateDesc")}
        >
          <ToggleSwitch
            checked={settings.autoCheckUpdate}
            onChange={settings.setAutoCheckUpdate}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.tryMirrorSource")}
          description={t("settings.mirrorSourceRisk")}
        >
          <ToggleSwitch
            checked={settings.useUpdateMirror}
            onChange={settings.setUseUpdateMirror}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.checkUpdate")}
          description={`${t("settings.version")}: ${appVersion || "..."}`}
        >
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("open-update-dialog"))
            }
            className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
          >
            {t("settings.checkUpdate")}
          </button>
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.openSource")}>
        <SettingItem label="GitHub" description={t("settings.viewOnGithub")}>
          <a
            href="https://github.com/legeling/PromptHub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm hover:underline"
          >
            GitHub
          </a>
        </SettingItem>
        <SettingItem
          label={t("settings.reportIssue")}
          description={t("settings.reportIssueDesc")}
        >
          <a
            href="https://github.com/legeling/PromptHub/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-4 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 transition-colors inline-flex items-center gap-1.5"
          >
            <MessageSquareIcon className="w-4 h-4" />
            Issue
          </a>
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.author")}>
        <div className="px-4 py-3 space-y-3">
          <a
            href="https://github.com/legeling"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <GithubIcon className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">@legeling</div>
              <div className="text-xs text-muted-foreground">GitHub</div>
            </div>
            <ExternalLinkIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
          <a
            href="mailto:legeling567@gmail.com"
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MailIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">legeling567@gmail.com</div>
              <div className="text-xs text-muted-foreground">Email</div>
            </div>
          </a>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.developer", "开发者选项")}>
        <SettingItem
          label={t("settings.debugMode", "调试模式")}
          description={t(
            "settings.debugModeDesc",
            "启用控制台调试 (支持 Ctrl+Shift+I / Cmd+Option+I 唤起)",
          )}
        >
          <ToggleSwitch
            checked={settings.debugMode}
            onChange={settings.setDebugMode}
          />
        </SettingItem>
      </SettingSection>

      <div className="px-4 py-4 text-sm text-muted-foreground text-center">
        <div>AGPL-3.0 License &copy; 2025 PromptHub</div>
      </div>
    </div>
  );
}
