import { useState, useEffect } from "react";
import {
  GithubIcon,
  MailIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ArrowUpCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";
import { Modal } from "../ui/Modal";
import appIconUrl from "../../../assets/icon.png";
import { isWebRuntime } from "../../runtime";

type UpdateCheckState = "idle" | "checking" | "latest" | "available";

export function AboutSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const webRuntime = isWebRuntime();

  // Get application version
  // 获取应用版本号
  const [appVersion, setAppVersion] = useState<string>("");
  const [webVersion, setWebVersion] = useState<string>("");
  const [updateState, setUpdateState] = useState<UpdateCheckState>("idle");
  const [latestVersion, setLatestVersion] = useState<string>("");
  const [isPreviewConfirmOpen, setIsPreviewConfirmOpen] =
    useState<boolean>(false);

  useEffect(() => {
    window.electron?.updater?.getVersion().then((v) => setAppVersion(v || ""));
  }, []);

  useEffect(() => {
    if (!webRuntime) return;
    // Fetch current deployed version from server
    fetch("/health")
      .then((r) => r.json())
      .then((data: { version?: string }) => setWebVersion(data.version || ""))
      .catch(() => {});
  }, [webRuntime]);

  const checkWebUpdate = async () => {
    setUpdateState("checking");
    try {
      const res = await fetch(
        "https://api.github.com/repos/legeling/PromptHub/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { tag_name?: string };
      const latest = (data.tag_name || "").replace(/^v/, "");
      setLatestVersion(latest);
      const isNewer =
        latest &&
        webVersion &&
        latest !== webVersion &&
        latest.localeCompare(webVersion, undefined, { numeric: true }) > 0;
      setUpdateState(isNewer ? "available" : "latest");
    } catch {
      setUpdateState("idle");
    }
  };

  const handlePreviewChannelChange = (enabled: boolean) => {
    if (!enabled) {
      settings.setUpdateChannel("stable");
      setIsPreviewConfirmOpen(false);
      return;
    }

    if (settings.updateChannel === "preview") {
      return;
    }

    setIsPreviewConfirmOpen(true);
  };

  const confirmPreviewChannel = () => {
    settings.setUpdateChannel("preview");
    setIsPreviewConfirmOpen(false);
  };

  return (
    <>
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
            {t("settings.version")} {webRuntime ? (webVersion || "...") : (appVersion || "...")}
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

        {webRuntime ? (
          <SettingSection title={t("settings.checkUpdate")}>
            <SettingItem
              label={t("settings.checkUpdate")}
              description={
                updateState === "latest"
                  ? t("settings.noUpdateDesc", { version: webVersion })
                  : updateState === "available"
                    ? t("settings.updateAvailableDesc", { version: latestVersion })
                    : t("settings.webUpdatesManagedDesc")
              }
            >
              {updateState === "available" ? (
                <a
                  href="https://github.com/legeling/PromptHub/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowUpCircleIcon className="w-4 h-4" />
                  {t("settings.newVersion", { version: latestVersion })}
                </a>
              ) : updateState === "latest" ? (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircleIcon className="w-4 h-4" />
                  {t("settings.noUpdateDesc", { version: webVersion })}
                </span>
              ) : (
                <button
                  onClick={checkWebUpdate}
                  disabled={updateState === "checking"}
                  className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <RefreshCwIcon
                    className={`w-4 h-4 ${updateState === "checking" ? "animate-spin" : ""}`}
                  />
                  {updateState === "checking"
                    ? t("common.loading", "检查中...")
                    : t("settings.checkUpdate")}
                </button>
              )}
            </SettingItem>
          </SettingSection>
        ) : (
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
              label={t("settings.joinPreviewChannel")}
              description={t("settings.joinPreviewChannelDesc")}
            >
              <ToggleSwitch
                checked={settings.updateChannel === "preview"}
                onChange={handlePreviewChannelChange}
              />
            </SettingItem>
            <SettingItem
              label={t("settings.checkUpdate")}
              description={
                settings.updateChannel === "preview"
                  ? t("settings.previewChannelActiveDesc", {
                      version: appVersion || "...",
                    })
                  : `${t("settings.version")}: ${appVersion || "..."} · ${t(
                      "settings.stableChannel",
                    )}`
              }
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
        )}

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

        {!webRuntime ? (
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
        ) : null}

        <div className="px-4 py-4 text-sm text-muted-foreground text-center">
          <div>AGPL-3.0 License &copy; 2025 PromptHub</div>
        </div>
      </div>

      <Modal
        isOpen={isPreviewConfirmOpen}
        onClose={() => setIsPreviewConfirmOpen(false)}
        title={t("settings.previewChannelConfirmTitle")}
        subtitle={t("settings.previewChannelConfirmSubtitle")}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            {t("settings.previewChannelWarning")}
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t("settings.previewChannelConfirmRisk")}</p>
            <p>{t("settings.previewChannelConfirmBackup")}</p>
            <p>{t("settings.previewChannelConfirmConsent")}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPreviewConfirmOpen(false)}
              className="rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              {t("settings.previewChannelConfirmCancel")}
            </button>
            <button
              type="button"
              onClick={confirmPreviewChannel}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              {t("settings.previewChannelConfirmEnable")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
