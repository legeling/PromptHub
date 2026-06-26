import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  McpLibraryFile,
  PluginLibraryFile,
  PluginPackageSnapshot,
  RuleBackupRecord,
  Settings,
} from "@prompthub/shared/types";
import type { Folder } from "@prompthub/shared/types/folder";
import type { Prompt, PromptVersion } from "@prompthub/shared/types/prompt";
import type {
  Skill,
  SkillFileSnapshot,
  SkillVersion,
} from "@prompthub/shared/types/skill";
import { exportDatabase, restoreFromBackup } from "./database-backup";
import type { DatabaseBackup } from "./database-backup-format";
import {
  issueSolvedPromptHubCaptcha,
  isPromptHubCaptchaAuthBoundaryError,
  normalizePromptHubWebBaseUrl,
} from "./self-hosted-auth";
import { useSettingsStore } from "../stores/settings.store";

export interface SelfHostedSyncConfig {
  url: string;
  username: string;
  password: string;
}

export interface SelfHostedSyncSummary {
  prompts: number;
  folders: number;
  rules: number;
  skills: number;
  mcpServers?: number;
  plugins?: number;
}

export interface PullFromSelfHostedOptions {
  mode?: "merge" | "replace";
}

interface ApiEnvelope<T> {
  data: T;
}

interface LoginPayload {
  accessToken: string;
}

interface DeviceHeartbeatPayload {
  id: string;
  type: "desktop";
  name: string;
  platform: string;
  appVersion?: string;
  clientVersion?: string;
  userAgent?: string;
}

interface MediaUploadPayload {
  fileName: string;
  base64Data: string;
}

interface WebSyncPayload {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions?: PromptVersion[];
  folders: Folder[];
  rules?: RuleBackupRecord[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  skillFiles?: Record<string, SkillFileSnapshot[]>;
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
  settings: Settings;
  settingsUpdatedAt?: string;
}

interface WebSyncPushResult {
  ok: boolean;
  promptsImported: number;
  foldersImported: number;
  rulesImported?: number;
  skillsImported: number;
}

function normalizeBaseUrl(url: string): string {
  return normalizePromptHubWebBaseUrl(url);
}

function getOrCreateDesktopDeviceId(): string {
  const storageKey = "prompthub-self-hosted-device-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}

function detectDesktopPlatform(userAgent: string): string {
  if (/mac os x/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Desktop";
}

async function buildDesktopHeartbeatPayload(): Promise<DeviceHeartbeatPayload> {
  const userAgent = navigator.userAgent;
  const appVersion = await window.electron?.updater?.getVersion?.();
  return {
    id: getOrCreateDesktopDeviceId(),
    type: "desktop",
    name: "PromptHub Desktop",
    platform: detectDesktopPlatform(userAgent),
    appVersion: typeof appVersion === "string" ? appVersion : undefined,
    clientVersion: typeof appVersion === "string" ? appVersion : undefined,
    userAgent,
  };
}

async function extractErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message?.trim() || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function readJsonEnvelope<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Request failed"));
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function loginToSelfHostedWeb(
  config: SelfHostedSyncConfig,
): Promise<{ baseUrl: string; accessToken: string }> {
  const baseUrl = normalizeBaseUrl(config.url);
  let captcha: { captchaId: string; captchaAnswer: string } | undefined;
  let captchaBoundaryError: Error | undefined;

  try {
    captcha = await issueSolvedPromptHubCaptcha(baseUrl);
  } catch (error) {
    if (!isPromptHubCaptchaAuthBoundaryError(error)) {
      throw error;
    }
    captchaBoundaryError = error;
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      ...(captcha ?? {}),
    }),
  });

  if (!response.ok && captchaBoundaryError) {
    const message = await extractErrorMessage(
      response,
      captchaBoundaryError.message,
    );
    if (message.includes("captcha")) {
      throw new Error(
        `${captchaBoundaryError.message} The connected PromptHub Web server still requires captcha during login, so update the self-hosted Web deployment and try again.`,
      );
    }
    throw new Error(message);
  }

  const payload = await readJsonEnvelope<LoginPayload>(response);
  await registerDesktopHeartbeat(baseUrl, payload.accessToken);
  return { baseUrl, accessToken: payload.accessToken };
}

async function apiGet<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  return readJsonEnvelope<T>(response);
}

async function apiPut<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return readJsonEnvelope<T>(response);
}

async function apiPost<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJsonEnvelope<T>(response);
}

async function registerDesktopHeartbeat(
  baseUrl: string,
  accessToken: string,
): Promise<void> {
  const payload = await buildDesktopHeartbeatPayload();
  await apiPost(baseUrl, accessToken, "/api/devices/heartbeat", payload);
}

function toWebSettings(backup: DatabaseBackup): Settings {
  const state = backup.settings?.state || {};
  const theme =
    state.themeMode === "light" ||
    state.themeMode === "dark" ||
    state.themeMode === "system"
      ? state.themeMode
      : "system";
  const language =
    state.language === "zh" ||
    state.language === "zh-TW" ||
    state.language === "en" ||
    state.language === "ja" ||
    state.language === "fr" ||
    state.language === "de" ||
    state.language === "es"
      ? state.language
      : "zh";

  return {
    theme,
    language,
    autoSave: state.autoSave !== false,
    builtinAgentOverrides:
      state.builtinAgentOverrides &&
      typeof state.builtinAgentOverrides === "object"
        ? state.builtinAgentOverrides
        : state.customPlatformRootPaths &&
            typeof state.customPlatformRootPaths === "object"
          ? Object.fromEntries(
              Object.entries(state.customPlatformRootPaths).map(
                ([platformId, rootPath]) => [platformId, { rootPath }],
              ),
            )
          : {},
    customPlatformRootPaths:
      state.customPlatformRootPaths &&
      typeof state.customPlatformRootPaths === "object"
        ? state.customPlatformRootPaths
        : state.customSkillPlatformPaths &&
            typeof state.customSkillPlatformPaths === "object"
          ? state.customSkillPlatformPaths
          : {},
    disabledPlatformIds: Array.isArray(state.disabledPlatformIds)
      ? state.disabledPlatformIds.filter(
          (value): value is string => typeof value === "string",
        )
      : Array.isArray(
            (state as { trackedRulePlatformIds?: unknown })
              .trackedRulePlatformIds,
          )
        ? (
            state as { trackedRulePlatformIds: unknown[] }
          ).trackedRulePlatformIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    customSkillPlatformPaths:
      state.customSkillPlatformPaths &&
      typeof state.customSkillPlatformPaths === "object"
        ? state.customSkillPlatformPaths
        : {},
    sync: {
      enabled: false,
      provider: "manual",
      autoSync: false,
    },
  };
}

function remapPromptMedia(
  prompts: Prompt[],
  imageMap: Map<string, string>,
  videoMap: Map<string, string>,
): Prompt[] {
  return prompts.map((prompt) => ({
    ...prompt,
    images: prompt.images?.map(
      (fileName) => imageMap.get(fileName) || fileName,
    ),
    videos: prompt.videos?.map(
      (fileName) => videoMap.get(fileName) || fileName,
    ),
  }));
}

async function uploadMediaMap(
  baseUrl: string,
  accessToken: string,
  kind: "images" | "videos",
  files: Record<string, string> | undefined,
): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();
  if (!files) {
    return fileMap;
  }

  for (const [fileName, base64Data] of Object.entries(files)) {
    const remoteFileName = await apiPost<string>(
      baseUrl,
      accessToken,
      `/api/media/${kind}/base64`,
      { fileName, base64Data } satisfies MediaUploadPayload,
    );
    fileMap.set(fileName, remoteFileName);
  }

  return fileMap;
}

async function downloadMediaMap(
  baseUrl: string,
  accessToken: string,
  kind: "images" | "videos",
): Promise<Record<string, string> | undefined> {
  const fileNames = await apiGet<string[]>(
    baseUrl,
    accessToken,
    `/api/media/${kind}`,
  );
  if (fileNames.length === 0) {
    return undefined;
  }

  const files: Record<string, string> = {};
  for (const fileName of fileNames) {
    files[fileName] = await apiGet<string>(
      baseUrl,
      accessToken,
      `/api/media/${kind}/${encodeURIComponent(fileName)}/base64`,
    );
  }

  return files;
}

function buildDesktopSettingsSnapshot(
  webSettings: Settings,
  settingsUpdatedAt?: string,
): { state: Record<string, unknown> } | undefined {
  const currentState = useSettingsStore.getState();
  if (!currentState) {
    return undefined;
  }

  return {
    state: {
      ...currentState,
      themeMode: webSettings.theme,
      language: webSettings.language,
      autoSave: webSettings.autoSave,
      builtinAgentOverrides: webSettings.builtinAgentOverrides || {},
      customPlatformRootPaths: webSettings.customPlatformRootPaths || {},
      disabledPlatformIds: webSettings.disabledPlatformIds || [],
      customSkillPlatformPaths: webSettings.customSkillPlatformPaths || {},
      settingsUpdatedAt: settingsUpdatedAt || new Date().toISOString(),
    },
  };
}

function toTimestamp(value: string | number | undefined | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeLatestById<T>(
  left: T[],
  right: T[],
  getId: (item: T) => string,
  getUpdatedAt: (item: T) => string | number | undefined | null,
): T[] {
  const merged = new Map<string, T>();

  for (const item of [...left, ...right]) {
    const id = getId(item);
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, item);
      continue;
    }

    if (
      toTimestamp(getUpdatedAt(item)) >= toTimestamp(getUpdatedAt(existing))
    ) {
      merged.set(id, item);
    }
  }

  return Array.from(merged.values());
}

function mergePromptVersions(
  localVersions: PromptVersion[],
  remoteVersions: PromptVersion[],
): PromptVersion[] {
  return mergeLatestById(
    localVersions,
    remoteVersions,
    (version) => `${version.promptId}:${version.version}`,
    (version) => version.createdAt,
  );
}

function mergeSkillVersions(
  localVersions: SkillVersion[],
  remoteVersions: SkillVersion[],
): SkillVersion[] {
  return mergeLatestById(
    localVersions,
    remoteVersions,
    (version) => `${version.skillId}:${version.version}`,
    (version) => version.createdAt,
  );
}

function mergeMediaMaps(
  localFiles: Record<string, string> | undefined,
  remoteFiles: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!localFiles && !remoteFiles) {
    return undefined;
  }

  return {
    ...(localFiles || {}),
    ...(remoteFiles || {}),
  };
}

function mergeSkillFileMaps(
  localFiles: Record<string, SkillFileSnapshot[]> | undefined,
  remoteFiles: Record<string, SkillFileSnapshot[]> | undefined,
): Record<string, SkillFileSnapshot[]> | undefined {
  if (!localFiles && !remoteFiles) {
    return undefined;
  }

  return {
    ...(localFiles || {}),
    ...(remoteFiles || {}),
  };
}

function mergeDesktopBackupWithRemote(
  localBackup: DatabaseBackup,
  payload: WebSyncPayload,
  remoteImages: Record<string, string> | undefined,
  remoteVideos: Record<string, string> | undefined,
): DatabaseBackup {
  const remoteSettingsSnapshot = buildDesktopSettingsSnapshot(
    payload.settings,
    payload.settingsUpdatedAt || payload.exportedAt,
  );
  const remoteSettingsUpdatedAt =
    payload.settingsUpdatedAt || payload.exportedAt;
  const localSettingsUpdatedAt = localBackup.settingsUpdatedAt || 0;
  const useRemoteSettings =
    toTimestamp(remoteSettingsUpdatedAt) >= toTimestamp(localSettingsUpdatedAt);

  const mergedFolders = mergeLatestById(
    localBackup.folders,
    payload.folders,
    (folder) => folder.id,
    (folder) => folder.updatedAt,
  );
  const mergedFolderIds = new Set(mergedFolders.map((folder) => folder.id));

  const normalizedFolders = mergedFolders.map((folder) => ({
    ...folder,
    parentId:
      folder.parentId && mergedFolderIds.has(folder.parentId)
        ? folder.parentId
        : undefined,
  }));

  const normalizedPrompts = mergeLatestById(
    localBackup.prompts,
    payload.prompts,
    (prompt) => prompt.id,
    (prompt) => prompt.updatedAt,
  ).map((prompt) => ({
    ...prompt,
    folderId:
      prompt.folderId && mergedFolderIds.has(prompt.folderId)
        ? prompt.folderId
        : null,
  }));

  const mergedPromptIds = new Set(normalizedPrompts.map((prompt) => prompt.id));
  const normalizedPromptVersions = mergePromptVersions(
    localBackup.versions,
    payload.promptVersions || payload.versions || [],
  ).filter((version) => mergedPromptIds.has(version.promptId));

  const normalizedSkills = mergeLatestById(
    localBackup.skills || [],
    payload.skills,
    (skill) => skill.id,
    (skill) => skill.updated_at,
  );
  const mergedSkillIds = new Set(normalizedSkills.map((skill) => skill.id));
  const normalizedSkillVersions = mergeSkillVersions(
    localBackup.skillVersions || [],
    payload.skillVersions,
  ).filter((version) => mergedSkillIds.has(version.skillId));
  const useRemoteMcpLibrary =
    payload.mcpLibrary &&
    toTimestamp(payload.mcpLibrary.updatedAt) >=
      toTimestamp(localBackup.mcpLibrary?.updatedAt);
  const useRemotePluginLibrary =
    payload.pluginLibrary &&
    toTimestamp(payload.pluginLibrary.updatedAt) >=
      toTimestamp(localBackup.pluginLibrary?.updatedAt);

  return {
    version: localBackup.version,
    exportedAt: new Date().toISOString(),
    prompts: normalizedPrompts,
    folders: normalizedFolders,
    versions: normalizedPromptVersions,
    images: mergeMediaMaps(localBackup.images, remoteImages),
    videos: mergeMediaMaps(localBackup.videos, remoteVideos),
    aiConfig: localBackup.aiConfig,
    settings: useRemoteSettings ? remoteSettingsSnapshot : localBackup.settings,
    settingsUpdatedAt: useRemoteSettings
      ? remoteSettingsUpdatedAt
      : localBackup.settingsUpdatedAt,
    rules: mergeLatestById(
      localBackup.rules || [],
      payload.rules || [],
      (rule) => rule.id,
      (rule) => rule.versions[0]?.savedAt || 0,
    ),
    skills: normalizedSkills,
    skillVersions: normalizedSkillVersions,
    skillFiles: mergeSkillFileMaps(localBackup.skillFiles, payload.skillFiles),
    mcpLibrary: useRemoteMcpLibrary
      ? payload.mcpLibrary
      : localBackup.mcpLibrary,
    pluginLibrary: useRemotePluginLibrary
      ? payload.pluginLibrary
      : localBackup.pluginLibrary,
    pluginPackages: useRemotePluginLibrary
      ? payload.pluginPackages
      : localBackup.pluginPackages,
    storeSources: payload.storeSources ?? localBackup.storeSources,
    agentAssetFiles: payload.agentAssetFiles ?? localBackup.agentAssetFiles,
  };
}

function buildDesktopBackupFromRemote(
  localBackup: DatabaseBackup,
  payload: WebSyncPayload,
  remoteImages: Record<string, string> | undefined,
  remoteVideos: Record<string, string> | undefined,
): DatabaseBackup {
  const remoteSettingsUpdatedAt =
    payload.settingsUpdatedAt || payload.exportedAt;
  const remoteSettingsSnapshot = buildDesktopSettingsSnapshot(
    payload.settings,
    remoteSettingsUpdatedAt,
  );
  const remoteFolderIds = new Set(payload.folders.map((folder) => folder.id));
  const normalizedFolders = payload.folders.map((folder) => ({
    ...folder,
    parentId:
      folder.parentId && remoteFolderIds.has(folder.parentId)
        ? folder.parentId
        : undefined,
  }));
  const normalizedPrompts = payload.prompts.map((prompt) => ({
    ...prompt,
    folderId:
      prompt.folderId && remoteFolderIds.has(prompt.folderId)
        ? prompt.folderId
        : null,
  }));
  const remotePromptIds = new Set(normalizedPrompts.map((prompt) => prompt.id));
  const normalizedPromptVersions = (
    payload.promptVersions ||
    payload.versions ||
    []
  ).filter((version) => remotePromptIds.has(version.promptId));
  const remoteSkillIds = new Set(payload.skills.map((skill) => skill.id));
  const normalizedSkillVersions = payload.skillVersions.filter((version) =>
    remoteSkillIds.has(version.skillId),
  );

  return {
    version: localBackup.version,
    exportedAt: new Date().toISOString(),
    prompts: normalizedPrompts,
    folders: normalizedFolders,
    versions: normalizedPromptVersions,
    images: remoteImages,
    videos: remoteVideos,
    aiConfig: localBackup.aiConfig,
    settings: remoteSettingsSnapshot || localBackup.settings,
    settingsUpdatedAt: remoteSettingsUpdatedAt || localBackup.settingsUpdatedAt,
    rules: payload.rules,
    skills: payload.skills,
    skillVersions: normalizedSkillVersions,
    skillFiles: payload.skillFiles,
    mcpLibrary: payload.mcpLibrary,
    pluginLibrary: payload.pluginLibrary,
    pluginPackages: payload.pluginPackages,
    storeSources: payload.storeSources,
    agentAssetFiles: payload.agentAssetFiles,
  };
}

export async function testSelfHostedConnection(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  const { baseUrl, accessToken } = await loginToSelfHostedWeb(config);
  const manifest = await apiGet<{
    counts: SelfHostedSyncSummary;
  }>(baseUrl, accessToken, "/api/sync/manifest");

  return manifest.counts;
}

export async function pushToSelfHostedWeb(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  const { baseUrl, accessToken } = await loginToSelfHostedWeb(config);
  const backup = await exportDatabase();
  const [imageMap, videoMap] = await Promise.all([
    uploadMediaMap(baseUrl, accessToken, "images", backup.images),
    uploadMediaMap(baseUrl, accessToken, "videos", backup.videos),
  ]);

  const payload: WebSyncPayload = {
    version: "desktop-backup-v1",
    exportedAt: backup.exportedAt,
    prompts: remapPromptMedia(backup.prompts, imageMap, videoMap),
    promptVersions: backup.versions,
    versions: backup.versions,
    folders: backup.folders,
    rules: backup.rules || [],
    skills: backup.skills || [],
    skillVersions: backup.skillVersions || [],
    skillFiles: backup.skillFiles,
    mcpLibrary: backup.mcpLibrary,
    pluginLibrary: backup.pluginLibrary,
    pluginPackages: backup.pluginPackages,
    storeSources: backup.storeSources,
    agentAssetFiles: backup.agentAssetFiles,
    settings: toWebSettings(backup),
    settingsUpdatedAt: backup.settingsUpdatedAt,
  };

  const result = await apiPut<WebSyncPushResult>(
    baseUrl,
    accessToken,
    "/api/sync/data",
    { payload },
  );

  return {
    prompts: result.promptsImported,
    folders: result.foldersImported,
    rules: result.rulesImported ?? backup.rules?.length ?? 0,
    skills: result.skillsImported,
    mcpServers: backup.mcpLibrary?.servers.length ?? 0,
    plugins: backup.pluginLibrary?.plugins.length ?? 0,
  };
}

export async function pullFromSelfHostedWeb(
  config: SelfHostedSyncConfig,
  options?: PullFromSelfHostedOptions,
): Promise<SelfHostedSyncSummary> {
  const { baseUrl, accessToken } = await loginToSelfHostedWeb(config);
  const [localBackup, payload, images, videos] = await Promise.all([
    exportDatabase(),
    apiGet<WebSyncPayload>(baseUrl, accessToken, "/api/sync/data"),
    downloadMediaMap(baseUrl, accessToken, "images"),
    downloadMediaMap(baseUrl, accessToken, "videos"),
  ]);

  const backup =
    options?.mode === "replace"
      ? buildDesktopBackupFromRemote(localBackup, payload, images, videos)
      : mergeDesktopBackupWithRemote(localBackup, payload, images, videos);

  await restoreFromBackup(backup);

  return {
    prompts: payload.prompts.length,
    folders: payload.folders.length,
    rules: payload.rules?.length || 0,
    skills: payload.skills.length,
    mcpServers: payload.mcpLibrary?.servers.length ?? 0,
    plugins: payload.pluginLibrary?.plugins.length ?? 0,
  };
}
