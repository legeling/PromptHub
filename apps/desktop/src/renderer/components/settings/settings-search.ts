import type { TFunction } from "i18next";
import type { DataSettingsSubsectionId } from "./DataSettings";

export interface SettingsSearchResult {
  section: string;
  labelKey: string;
  sectionKey: string;
  dataSubsection?: DataSettingsSubsectionId;
}

// Index static product labels only, never user settings values or credentials.
const SECTION_KEYS: Record<string, string[]> = {
  general: [
    "launchAtStartup",
    "minimizeOnLaunch",
    "startupFolder",
    "clipboardImport",
    "closeAction",
    "autoSave",
    "showLineNumbers",
    "language",
    "agentHistoryAcceleration",
    "tagFilterMode",
  ],
  appearance: [
    "themeMode",
    "themeColor",
    "fontSize",
    "motion.title",
    "desktopWorkspace",
    "backgroundImage",
  ],
  network: [
    "networkProxy",
    "networkProxyMode",
    "networkMirrorSource",
    "tryMirrorSource",
  ],
  language: ["language"],
  about: ["checkUpdate", "autoCheckUpdate", "projectInfo", "projectRepository"],
  cli: ["cliInstallStatus", "cliPackageManagerLabel", "cliActionsTitle"],
};
const NOTIFICATION_KEYS = [
  "enabled",
  "onlyWhenAway",
  "sound",
  "appUpdate",
  "syncSuccess",
  "syncFailure",
  "promptTest",
  "generation",
  "resourceTask",
  "resourceUpdate",
  "copy",
  "save",
];
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  security: ["settings.setMaster"],
  ai: ["settings.apiKey", "settings.model"],
};

function isVisibleKey(key: string, webRuntime: boolean): boolean {
  if (key === "settings.closeAction")
    return navigator.platform.toLowerCase().includes("win");
  if (
    [
      "settings.desktopWorkspace",
      "settings.checkUpdate",
      "settings.autoCheckUpdate",
    ].includes(key)
  )
    return !webRuntime;
  return true;
}
const DATA_TARGETS: Array<{
  labelKey: string;
  dataSubsection: DataSettingsSubsectionId;
}> = [
  { labelKey: "settings.dataPath", dataSubsection: "local" },
  { labelKey: "settings.recoveryScanner", dataSubsection: "recovery" },
  { labelKey: "settings.selfHostedSyncMenu", dataSubsection: "selfHosted" },
  { labelKey: "settings.webdavSyncMenu", dataSubsection: "webdav" },
  { labelKey: "settings.s3SyncMenu", dataSubsection: "s3" },
  { labelKey: "settings.backup", dataSubsection: "backup" },
];

export function searchSettings(
  query: string,
  menu: readonly { id: string; labelKey: string }[],
  t: TFunction,
  webRuntime: boolean,
): SettingsSearchResult[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const entries = menu.flatMap(({ id, labelKey }) => {
    const category = { section: id, labelKey, sectionKey: labelKey };
    const keys =
      id === "notifications"
        ? NOTIFICATION_KEYS.map((key) => `notificationSettings.${key}`)
        : (SECTION_KEYS[id] ?? []).map((key) => `settings.${key}`);
    return [
      category,
      ...keys
        .filter((key) => key !== labelKey && isVisibleKey(key, webRuntime))
        .map((key) => ({ ...category, labelKey: key })),
      ...(id === "data" && !webRuntime
        ? DATA_TARGETS.map((target) => ({ ...category, ...target }))
        : []),
    ];
  });
  return entries.filter((entry) => {
    const keywords =
      entry.labelKey === entry.sectionKey
        ? (CATEGORY_KEYWORDS[entry.section] ?? [])
            .map((key) => `${t(key)} ${t(key, { lng: "en" })}`)
            .join(" ")
        : "";
    const label =
      `${t(entry.labelKey)} ${t(entry.sectionKey)} ${t(entry.labelKey, { lng: "en" })} ${keywords}`.toLocaleLowerCase();
    return terms.every((term) => label.includes(term));
  });
}
