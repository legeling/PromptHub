import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  SettingsIcon,
  PaletteIcon,
  DatabaseIcon,
  InfoIcon,
  GlobeIcon,
  ArrowLeftIcon,
  BrainIcon,
  KeyIcon,
  KeyboardIcon,
  ServerCogIcon,
  SparklesIcon,
  FolderIcon,
  SearchIcon,
  CloudIcon,
  DownloadIcon,
  TerminalSquareIcon,
  WifiIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DataSettingsSubsectionId } from "./DataSettings";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore, type SettingsSectionId } from "../../stores/ui.store";
import { isWebRuntime } from "../../runtime";
import { Spinner } from "../ui";

interface BackupImportControllerLike {
  requestFileSelection: () => void;
  beginImportFromFile: (file: File) => Promise<void>;
}

interface SettingsPageProps {
  onBack: () => void;
  backupImportController?: BackupImportControllerLike;
}

// Settings menu items - use i18n keys instead of hardcoded text
// 设置菜单项 - 使用 key 而非硬编码文本
const DESKTOP_SETTINGS_MENU = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "appearance", labelKey: "settings.appearance", icon: PaletteIcon },
  { id: "data", labelKey: "settings.data", icon: DatabaseIcon },
  { id: "network", labelKey: "settings.network", icon: WifiIcon },
  { id: "skill", labelKey: "settings.skill", icon: SparklesIcon },
  { id: "ai", labelKey: "settings.ai", icon: BrainIcon },
  { id: "shortcuts", labelKey: "settings.shortcuts", icon: KeyboardIcon },
  { id: "security", labelKey: "settings.security", icon: KeyIcon },
  { id: "cli", labelKey: "settings.cliTitle", icon: TerminalSquareIcon },
  { id: "about", labelKey: "settings.about", icon: InfoIcon },
];

const WEB_SETTINGS_MENU = [
  { id: "web", labelKey: "settings.webWorkspace", icon: ServerCogIcon },
  { id: "devices", labelKey: "settings.deviceManagement", icon: SettingsIcon },
  { id: "appearance", labelKey: "settings.appearance", icon: PaletteIcon },
  { id: "data", labelKey: "settings.data", icon: DatabaseIcon },
  { id: "ai", labelKey: "settings.ai", icon: BrainIcon },
  { id: "language", labelKey: "settings.language", icon: GlobeIcon },
  { id: "about", labelKey: "settings.about", icon: InfoIcon },
] as const;

const GeneralSettings = lazy(() =>
  import("./GeneralSettings").then((module) => ({
    default: module.GeneralSettings,
  })),
);
const AppearanceSettings = lazy(() =>
  import("./AppearanceSettings").then((module) => ({
    default: module.AppearanceSettings,
  })),
);
const LanguageSettings = lazy(() =>
  import("./LanguageSettings").then((module) => ({
    default: module.LanguageSettings,
  })),
);
const SecuritySettings = lazy(() =>
  import("./SecuritySettings").then((module) => ({
    default: module.SecuritySettings,
  })),
);
const ShortcutsSettings = lazy(() =>
  import("./ShortcutsSettings").then((module) => ({
    default: module.ShortcutsSettings,
  })),
);
const AboutSettings = lazy(() =>
  import("./AboutSettings").then((module) => ({
    default: module.AboutSettings,
  })),
);
const CLISettings = lazy(() =>
  import("./CLISettings").then((module) => ({
    default: module.CLISettings,
  })),
);
const DataSettings = lazy(() =>
  import("./DataSettings").then((module) => ({
    default: module.DataSettings,
  })),
);
const NetworkSettings = lazy(() =>
  import("./NetworkSettings").then((module) => ({
    default: module.NetworkSettings,
  })),
);
const AISettingsPrototype = lazy(() =>
  import("./AISettingsPrototype").then((module) => ({
    default: module.AISettingsPrototype,
  })),
);
const SkillSettings = lazy(() =>
  import("./SkillSettings").then((module) => ({
    default: module.SkillSettings,
  })),
);
const WebDeviceSettings = lazy(() =>
  import("./WebDeviceSettings").then((module) => ({
    default: module.WebDeviceSettings,
  })),
);
const WebWorkspaceSettings = lazy(() =>
  import("./WebWorkspaceSettings").then((module) => ({
    default: module.WebWorkspaceSettings,
  })),
);

interface SettingsSubmenuItem {
  id: string;
  labelKey: string;
  fallback: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const DATA_SETTINGS_SUBMENU_GROUPS: Array<{
  labelKey: string;
  fallback: string;
  items: Array<SettingsSubmenuItem & { id: DataSettingsSubsectionId }>;
}> = [
  {
    labelKey: "settings.dataSubmenuBasic",
    fallback: "Basic data settings",
    items: [
      {
        id: "local",
        labelKey: "settings.dataPath",
        fallback: "Data directory",
        icon: FolderIcon,
      },
      {
        id: "recovery",
        labelKey: "settings.recoveryScanner",
        fallback: "Data recovery",
        icon: SearchIcon,
      },
    ],
  },
  {
    labelKey: "settings.dataSubmenuCloudBackup",
    fallback: "Cloud backup settings",
    items: [
      {
        id: "selfHosted",
        labelKey: "settings.selfHostedSyncMenu",
        fallback: "Self-Hosted PromptHub",
        icon: ServerCogIcon,
      },
      {
        id: "webdav",
        labelKey: "settings.webdavSyncMenu",
        fallback: "WebDAV",
        icon: CloudIcon,
      },
      {
        id: "s3",
        labelKey: "settings.s3SyncMenu",
        fallback: "S3 Compatible Storage",
        icon: DatabaseIcon,
      },
    ],
  },
  {
    labelKey: "settings.dataSubmenuImportExport",
    fallback: "Import and export settings",
    items: [
      {
        id: "backup",
        labelKey: "settings.backup",
        fallback: "Backup",
        icon: DownloadIcon,
      },
    ],
  },
];

function SettingsContentFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner size="lg" tone="muted" label={label} />
    </div>
  );
}

export function SettingsPage({
  onBack,
  backupImportController,
}: SettingsPageProps) {
  const webRuntime = isWebRuntime();
  const settingsMenu = webRuntime ? WEB_SETTINGS_MENU : DESKTOP_SETTINGS_MENU;
  const pendingSettingsSection = useUIStore(
    (state) => state.pendingSettingsSection,
  );
  const consumeSettingsSectionRequest = useUIStore(
    (state) => state.consumeSettingsSectionRequest,
  );
  const syncProvider = useSettingsStore((state) => state.syncProvider);
  const webdavEnabled = useSettingsStore((state) => state.webdavEnabled);
  const selfHostedSyncEnabled = useSettingsStore(
    (state) => state.selfHostedSyncEnabled,
  );
  const s3StorageEnabled = useSettingsStore((state) => state.s3StorageEnabled);
  const [activeSection, setActiveSection] = useState(
    webRuntime ? "web" : "general",
  );
  const [activeDataSubsection, setActiveDataSubsection] =
    useState<DataSettingsSubsectionId>("local");
  const { t } = useTranslation();

  useEffect(() => {
    if (!pendingSettingsSection) {
      return;
    }

    const requestedSection = consumeSettingsSectionRequest();
    if (
      requestedSection &&
      settingsMenu.some((item) => item.id === requestedSection)
    ) {
      setActiveSection(requestedSection as SettingsSectionId);
    }
  }, [consumeSettingsSectionRequest, pendingSettingsSection, settingsMenu]);

  const renderContent = () => {
    switch (activeSection) {
      case "web":
        return <WebWorkspaceSettings onNavigate={setActiveSection} />;
      case "devices":
        return <WebDeviceSettings />;
      case "general":
        return <GeneralSettings />;
      case "appearance":
        return <AppearanceSettings />;
      case "security":
        return <SecuritySettings />;
      case "data":
        return (
          <DataSettings
            activeSubsection={activeDataSubsection}
            backupImportController={backupImportController}
          />
        );
      case "network":
        return <NetworkSettings />;
      case "skill":
        return <SkillSettings />;
      case "ai":
        return <AISettingsPrototype />;
      case "language":
        return <LanguageSettings />;
      case "shortcuts":
        return <ShortcutsSettings />;
      case "about":
        return <AboutSettings />;
      case "cli":
        return <CLISettings />;
    }
  };
  const activeSubmenu =
    !webRuntime && activeSection === "data"
      ? {
          groups: DATA_SETTINGS_SUBMENU_GROUPS,
          activeId: activeDataSubsection,
          onSelect: (id: string) =>
            setActiveDataSubsection(id as DataSettingsSubsectionId),
        }
      : null;
  const enabledSubsections = useMemo(
    () => ({
      selfHosted: selfHostedSyncEnabled,
      webdav: webdavEnabled,
      s3: s3StorageEnabled,
    }),
    [selfHostedSyncEnabled, s3StorageEnabled, webdavEnabled],
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 设置侧边栏 */}
      <div className="w-56 app-wallpaper-panel border-r border-border flex flex-col">
        {/* 返回按钮 */}
        <div className="p-3 border-b border-border">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
            <span>{t("common.back")}</span>
          </button>
        </div>

        {/* 菜单列表 */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {settingsMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              aria-pressed={activeSection === item.id}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-quick ${
                activeSection === item.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-foreground/80 hover:bg-muted/70"
              }`}
            >
              <item.icon className="w-4 h-4" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeSubmenu ? (
        <div className="w-56 app-wallpaper-panel border-r border-border flex flex-col">
          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeSubmenu.groups.map((group) => (
              <section key={group.labelKey} className="space-y-1 pb-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-muted-foreground">
                  <span className="shrink-0">
                    {String(t(group.labelKey, group.fallback))}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => activeSubmenu.onSelect(item.id)}
                    aria-pressed={activeSubmenu.activeId === item.id}
                    aria-label={`${String(t(item.labelKey, item.fallback))}${
                      item.id in enabledSubsections &&
                      enabledSubsections[
                        item.id as keyof typeof enabledSubsections
                      ]
                        ? ` ${t("common.enabled")}`
                        : ""
                    }`}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-quick ${
                      activeSubmenu.activeId === item.id
                        ? "bg-primary text-white shadow-sm"
                        : "text-foreground/80 hover:bg-muted/70"
                    }`}
                  >
                    <item.icon className="w-4 h-4" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-left">
                      {String(t(item.labelKey, item.fallback))}
                    </span>
                    {item.id in enabledSubsections &&
                    enabledSubsections[
                      item.id as keyof typeof enabledSubsections
                    ] ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          syncProvider ===
                          (item.id === "selfHosted" ? "self-hosted" : item.id)
                            ? activeSubmenu.activeId === item.id
                              ? "bg-white/20 text-white"
                              : "bg-primary/10 text-primary"
                            : activeSubmenu.activeId === item.id
                              ? "bg-white/15 text-white/90"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t("common.enabled")}
                      </span>
                    ) : null}
                  </button>
                ))}
              </section>
            ))}
          </nav>
        </div>
      ) : null}

      {/* 设置内容区 - 自适应宽度 */}
      <div
        className={
          activeSection === "ai"
            ? "flex-1 overflow-hidden app-wallpaper-section"
            : "flex-1 overflow-y-auto px-5 py-5 app-wallpaper-section sm:px-6 xl:px-8 2xl:px-10"
        }
      >
        <div
          data-testid="settings-content-shell"
          className={
            activeSection === "ai"
              ? "h-full max-w-none"
              : "w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
          }
        >
          {activeSection === "ai" ? null : (
            <h1 className="text-lg font-semibold mb-4">
              {t(
                settingsMenu.find((m) => m.id === activeSection)?.labelKey ||
                  "",
              )}
            </h1>
          )}
          <div
            key={activeSection}
            className={
              activeSection === "ai"
                ? "h-full animate-in fade-in slide-in-from-bottom-2 duration-base"
                : "animate-in fade-in slide-in-from-bottom-2 duration-base"
            }
          >
            <Suspense
              fallback={
                <SettingsContentFallback
                  label={t("common.loading", "Loading...")}
                />
              }
            >
              {renderContent()}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
