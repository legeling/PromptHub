import { useState, useEffect, type SVGProps } from "react";
import {
  GithubIcon,
  MailIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ArrowUpCircleIcon,
  CopyIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import appIconUrl from "../../../assets/icon.png";
import { isWebRuntime } from "../../runtime";

type UpdateCheckState = "idle" | "checking" | "latest" | "available";

function DiscordBrandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M20.317 4.3698A19.7913 19.7913 0 0 0 15.8851 3a13.081 13.081 0 0 0-.6983 1.4186 18.27 18.27 0 0 0-5.4741 0A13.096 13.096 0 0 0 9.0149 3a19.7363 19.7363 0 0 0-4.435 1.3729C1.5331 8.9822.7058 13.4788 1.111 17.9423a19.944 19.944 0 0 0 5.9722 3.0306 14.093 14.093 0 0 0 1.2746-2.0671 12.42 12.42 0 0 1-1.9953-1.0287c.1663-.1205.3298-.2461.4882-.3767 3.8446 1.8025 8.0226 1.8025 11.8267 0 .1597.1306.3232.2562.4882.3767a12.298 12.298 0 0 1-2.0006 1.0304 14.078 14.078 0 0 0 1.2746 2.0654 19.902 19.902 0 0 0 5.9742-3.029c.4722-5.1774-.8109-9.6328-3.1222-13.5725ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.4195 0-1.3338.9555-2.4195 2.1569-2.4195 1.2105 0 2.1758 1.0952 2.1569 2.4195 0 1.3338-.9555 2.4195-2.1569 2.4195Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.4195 0-1.3338.9555-2.4195 2.1569-2.4195 1.2105 0 2.1758 1.0952 2.1569 2.4195 0 1.3338-.9464 2.4195-2.1569 2.4195Z"
      />
    </svg>
  );
}

function QQBrandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"
      />
    </svg>
  );
}

export function AboutSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const { showToast } = useToast();
  const webRuntime = isWebRuntime();
  const qqGroupNumber = "704298939";
  const qqGroupLink = "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=704298939&card_type=group&source=qrcode";

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

  const handleCopyQQGroup = async () => {
    try {
      await navigator.clipboard.writeText(qqGroupNumber);
      showToast(t("settings.communityQQCopied", { group: qqGroupNumber }), "success");
    } catch (error) {
      console.error("Failed to copy QQ group number:", error);
      showToast(t("common.error", "Error"), "error");
    }
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
                    ? t("settings.checking")
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

        <div
          data-testid="about-support-grid"
          className="grid grid-cols-1 gap-6"
        >
          <SettingSection title={t("settings.openSource")}>
            <SettingItem
              label={t("settings.projectRepository")}
              description={t("settings.projectRepositoryDesc")}
            >
              <a
                href="https://github.com/legeling/PromptHub"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <GithubIcon className="h-4 w-4" />
                github.com/legeling/PromptHub
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

          <SettingSection title={t("settings.communityTitle")}>
            <SettingItem
              label={t("settings.communityDiscord")}
              description={t("settings.communityDiscordDesc")}
            >
              <a
                href="https://discord.gg/zmfWguWFB"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#5865F2] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#4752C4]"
              >
                <DiscordBrandIcon className="h-4 w-4" />
                Discord
              </a>
            </SettingItem>
            <SettingItem
              label={t("settings.communityQQ")}
              description={t("settings.communityQQDesc", { group: qqGroupNumber })}
            >
              <div className="flex items-center gap-2">
                <a
                  href={qqGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#12B7F5] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0ea5e9]"
                >
                  <QQBrandIcon className="h-4 w-4" />
                  QQ
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyQQGroup()}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <CopyIcon className="w-4 h-4" />
                  {t("settings.communityQQCopy")}
                </button>
              </div>
            </SettingItem>
          </SettingSection>

          <SettingSection title={t("settings.contactAuthor")}>
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
                <div className="min-w-0 flex-1">
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
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">legeling567@gmail.com</div>
                  <div className="text-xs text-muted-foreground">Email</div>
                </div>
              </a>
            </div>
          </SettingSection>

          {!webRuntime ? (
            <SettingSection title={t("settings.developer")}>
              <SettingItem
                label={t("settings.debugMode")}
                description={t("settings.debugModeDesc")}
              >
                <ToggleSwitch
                  checked={settings.debugMode}
                  onChange={settings.setDebugMode}
                />
              </SettingItem>
            </SettingSection>
          ) : null}
        </div>

        <div className="px-4 py-4 text-sm text-muted-foreground text-center">
          <div>AGPL-3.0 License &copy; 2026 PromptHub</div>
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
