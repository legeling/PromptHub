import { SELF_HOSTED_BACKUP_PROTOCOL_VERSION } from "@prompthub/shared/types";
import { SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_CAPABILITY, SKILL_SNAPSHOT_SYNC_VERSION, hasEncodedSkillSnapshots } from "@prompthub/shared/utils/skill-file-snapshot";
import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  McpLibraryFile,
  OutputFormatItem,
  PluginLibraryFile,
  PluginPackageSnapshot,
  PromptRelation,
  RuleBackupRecord,
  SelfHostedBackupCapabilities,
  SelfHostedBackupEnvelope,
  SelfHostedBackupMetadata,
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
  mergeSkillSnapshots,
  normalizeSkillsForWebSync,
} from "./self-hosted-skill-sync";
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
  promptRelations?: number;
  promptRelationsSkipped?: number;
  outputFormatItems?: number;
  outputFormatItemsSkipped?: number;
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
  promptRelations?: PromptRelation[];
  outputFormatItems?: OutputFormatItem[];
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
  settings: Settings;
  settingsUpdatedAt?: string;
  images?: Record<string, string>;
  videos?: Record<string, string>;
  desktopSettings?: DatabaseBackup["settings"];
  desktopAiConfig?: DatabaseBackup["aiConfig"];
}

export interface SelfHostedRemoteBackupResult extends SelfHostedSyncSummary {
  id: string;
  createdAt: string;
  clientVersion: string;
  serverVersion: string;
}

export class SelfHostedBackupCompatibilityError extends Error {
  readonly code = "SELF_HOSTED_VERSION_MISMATCH";

  constructor(message: string) {
    super(message);
    this.name = "SelfHostedBackupCompatibilityError";
  }
}

interface WebSyncPushResult {
  ok: boolean;
  promptsImported: number;
  foldersImported: number;
  rulesImported?: number;
  skillsImported: number;
  promptRelationsImported?: number;
  promptRelationsSkipped?: number;
  outputFormatItemsImported?: number;
  outputFormatItemsSkipped?: number;
}

const SELF_HOSTED_REQUEST_TIMEOUT_MS = 15_000;
const SELF_HOSTED_READ_RETRY_DELAY_MS = 250;

async function waitForRetry(): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, SELF_HOSTED_READ_RETRY_DELAY_MS);
  });
}

async function fetchSelfHosted(
  input: string,
  init: RequestInit,
  options: { retries?: number } = {},
): Promise<Response> {
  const retries = Math.max(0, Math.floor(options.retries ?? 0));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      SELF_HOSTED_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      if (response.status < 500 || attempt === retries) {
        return response;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Self-hosted PromptHub request timed out after ${SELF_HOSTED_REQUEST_TIMEOUT_MS / 1000} seconds`,
        );
      }
      if (attempt === retries) {
        throw error;
      }
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    await waitForRetry();
  }

  throw new Error("Self-hosted PromptHub request failed");
}

function normalizeBaseUrl(url: string): string {
  return normalizePromptHubWebBaseUrl(url);
}

async function getOrCreateDesktopDeviceId(): Promise<string> {
  const canonicalDeviceId =
    window.api?.settings?.rendererPersistence?.getOrCreateDeviceId;
  if (canonicalDeviceId) {
    const value = await canonicalDeviceId();
    window.localStorage.removeItem("prompthub-self-hosted-device-id");
    return value;
  }
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
    id: await getOrCreateDesktopDeviceId(),
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

async function readHealthVersion(baseUrl: string): Promise<string> {
  const response = await fetchSelfHosted(
    `${baseUrl}/health`,
    { cache: "no-store" },
    { retries: 1 },
  );
  if (!response.ok) {
    throw new SelfHostedBackupCompatibilityError(
      `Unable to verify the self-hosted Web version (HTTP ${response.status}). Backup was not started.`,
    );
  }
  const payload = (await response.json()) as { version?: unknown };
  if (typeof payload.version !== "string" || !payload.version.trim()) {
    throw new SelfHostedBackupCompatibilityError(
      "The self-hosted Web server did not report a version. Backup was not started.",
    );
  }
  return payload.version;
}

async function readDesktopVersion(): Promise<string> {
  const version = await window.electron?.updater?.getVersion?.();
  if (typeof version !== "string" || !version.trim()) {
    throw new SelfHostedBackupCompatibilityError(
      "PromptHub could not determine the installed desktop version. Backup was not started.",
    );
  }
  return version;
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

  const response = await fetchSelfHosted(`${baseUrl}/api/auth/login`, {
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
  const response = await fetchSelfHosted(
    `${baseUrl}${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        [SKILL_SNAPSHOT_CAPABILITY_HEADER]: SKILL_SNAPSHOT_CAPABILITY,
      },
      cache: "no-store",
    },
    { retries: 1 },
  );
  return readJsonEnvelope<T>(response);
}

async function apiPut<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetchSelfHosted(`${baseUrl}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      [SKILL_SNAPSHOT_CAPABILITY_HEADER]: SKILL_SNAPSHOT_CAPABILITY,
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
  const response = await fetchSelfHosted(`${baseUrl}${path}`, {
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

async function openCompatibleBackupSession(config: SelfHostedSyncConfig) {
  const baseUrl = normalizeBaseUrl(config.url);
  const clientVersion = await readDesktopVersion();
  const healthVersion = await readHealthVersion(baseUrl);
  if (clientVersion !== healthVersion) {
    throw new SelfHostedBackupCompatibilityError(
      `Desktop/Web version mismatch: desktop ${clientVersion}, Web ${healthVersion}. Backup was skipped until both deployments use the same version.`,
    );
  }

  const session = await loginToSelfHostedWeb(config);
  let capabilities: SelfHostedBackupCapabilities;
  try {
    capabilities = await apiGet<SelfHostedBackupCapabilities>(
      session.baseUrl,
      session.accessToken,
      "/api/backups/desktop/capabilities",
    );
  } catch (error) {
    throw new SelfHostedBackupCompatibilityError(
      `The self-hosted Web deployment does not support safe desktop backups. ${error instanceof Error ? error.message : "Update the Web deployment and try again."}`,
    );
  }
  if (
    capabilities.serverVersion !== clientVersion ||
    capabilities.protocolVersion !== SELF_HOSTED_BACKUP_PROTOCOL_VERSION
  ) {
    throw new SelfHostedBackupCompatibilityError(
      `Desktop/Web backup compatibility check failed: desktop ${clientVersion}, Web ${capabilities.serverVersion}. Backup was not written.`,
    );
  }
  return { ...session, clientVersion, capabilities };
}

const REMOTE_BACKUP_LOCAL_ONLY_SETTINGS_FIELDS = new Set([
  "webdavUsername",
  "webdavPassword",
  "webdavEncryptionPassword",
  "selfHostedSyncUsername",
  "selfHostedSyncPassword",
  "s3AccessKeyId",
  "s3SecretAccessKey",
  "s3EncryptionPassword",
  "aiApiKey",
  "githubToken",
  "networkProxy",
]);

const REMOTE_BACKUP_CREDENTIAL_KEY_PATTERN =
  /(?:password|secret|token|api[_-]?key|access[_-]?key(?:id)?)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeCredentialFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeCredentialFields(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !REMOTE_BACKUP_CREDENTIAL_KEY_PATTERN.test(key) &&
          !REMOTE_BACKUP_LOCAL_ONLY_SETTINGS_FIELDS.has(key),
      )
      .map(([key, nestedValue]) => [key, removeCredentialFields(nestedValue)]),
  );
}

function sanitizeDesktopSettingsForRemoteBackup(
  settings: DatabaseBackup["settings"],
): DatabaseBackup["settings"] {
  if (!isRecord(settings?.state)) {
    return undefined;
  }
  return {
    state: removeCredentialFields(settings.state),
  };
}

function sanitizeDesktopAiConfigForRemoteBackup(
  aiConfig: DatabaseBackup["aiConfig"],
): DatabaseBackup["aiConfig"] {
  if (!isRecord(aiConfig)) {
    return undefined;
  }
  return removeCredentialFields(aiConfig) as DatabaseBackup["aiConfig"];
}

function mergeArrayItemCredentials(
  remoteItems: unknown,
  localItems: unknown,
): unknown {
  if (!Array.isArray(remoteItems) || !Array.isArray(localItems)) {
    return remoteItems;
  }

  return remoteItems.map((remoteItem) => {
    if (!isRecord(remoteItem) || typeof remoteItem.id !== "string") {
      return remoteItem;
    }
    const localItem = localItems.find(
      (candidate) => isRecord(candidate) && candidate.id === remoteItem.id,
    );
    if (!isRecord(localItem)) {
      return remoteItem;
    }

    const credentials = Object.fromEntries(
      Object.entries(localItem).filter(([key]) =>
        REMOTE_BACKUP_CREDENTIAL_KEY_PATTERN.test(key),
      ),
    );
    return { ...remoteItem, ...credentials };
  });
}

function mergeDesktopSettingsForRestore(
  localSettings: DatabaseBackup["settings"],
  remoteSettings: DatabaseBackup["settings"],
): DatabaseBackup["settings"] {
  if (!isRecord(remoteSettings?.state)) {
    return localSettings;
  }
  const localState = isRecord(localSettings?.state) ? localSettings.state : {};
  const nextState: Record<string, unknown> = { ...remoteSettings.state };

  for (const field of REMOTE_BACKUP_LOCAL_ONLY_SETTINGS_FIELDS) {
    if (localState[field] !== undefined) {
      nextState[field] = localState[field];
    }
  }
  for (const field of ["aiProviders", "aiModels"] as const) {
    if (nextState[field] !== undefined) {
      nextState[field] = mergeArrayItemCredentials(
        nextState[field],
        localState[field],
      );
    }
  }

  return { state: nextState };
}

function mergeDesktopAiConfigForRestore(
  localAiConfig: DatabaseBackup["aiConfig"],
  remoteAiConfig: DatabaseBackup["aiConfig"],
): DatabaseBackup["aiConfig"] {
  if (!isRecord(remoteAiConfig)) {
    return localAiConfig;
  }
  const localConfig = isRecord(localAiConfig) ? localAiConfig : {};
  const nextConfig: Record<string, unknown> = { ...remoteAiConfig };

  if (localConfig.aiApiKey !== undefined) {
    nextConfig.aiApiKey = localConfig.aiApiKey;
  }
  for (const field of ["aiProviders", "aiModels"] as const) {
    if (nextConfig[field] !== undefined) {
      nextConfig[field] = mergeArrayItemCredentials(
        nextConfig[field],
        localConfig[field],
      );
    }
  }

  return nextConfig as DatabaseBackup["aiConfig"];
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

function filterPromptRelations(
  relations: PromptRelation[] | undefined,
  promptIds: Set<string>,
): PromptRelation[] | undefined {
  const valid = (relations ?? []).filter(
    (relation) =>
      relation.sourcePromptId !== relation.targetPromptId &&
      promptIds.has(relation.sourcePromptId) &&
      promptIds.has(relation.targetPromptId),
  );
  return valid.length > 0 ? valid : undefined;
}

function filterOutputFormatItems(
  items: OutputFormatItem[] | undefined,
  promptIds: Set<string>,
): OutputFormatItem[] | undefined {
  const valid = (items ?? []).filter(
    (item) =>
      promptIds.has(item.sourcePromptId) &&
      (item.targetPromptId === null || promptIds.has(item.targetPromptId)),
  );
  return valid.length > 0 ? valid : undefined;
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
  const mergedPromptRelations = mergeLatestById(
    localBackup.promptRelations ?? [],
    payload.promptRelations ?? [],
    (relation) => relation.id,
    (relation) => relation.updatedAt,
  );
  const mergedOutputFormatItems = mergeLatestById(
    localBackup.outputFormatItems ?? [],
    payload.outputFormatItems ?? [],
    (item) => item.id,
    (item) => item.updatedAt,
  );

  const mergedSkills = mergeSkillSnapshots(
    localBackup.skills || [],
    payload.skills,
    localBackup.skillVersions || [],
    payload.skillVersions,
    localBackup.skillFiles,
    payload.skillFiles,
  );
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
    promptRelations: filterPromptRelations(
      mergedPromptRelations,
      mergedPromptIds,
    ),
    outputFormatItems: filterOutputFormatItems(
      mergedOutputFormatItems,
      mergedPromptIds,
    ),
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
    skills: mergedSkills.skills,
    skillVersions: mergedSkills.skillVersions,
    skillFiles: mergedSkills.skillFiles,
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
  const restoredSettings = mergeDesktopSettingsForRestore(
    localBackup.settings,
    payload.desktopSettings ?? remoteSettingsSnapshot,
  );
  const restoredAiConfig = mergeDesktopAiConfigForRestore(
    localBackup.aiConfig,
    payload.desktopAiConfig,
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
  const normalizedPromptRelations = filterPromptRelations(
    payload.promptRelations,
    remotePromptIds,
  );
  const normalizedOutputFormatItems = filterOutputFormatItems(
    payload.outputFormatItems,
    remotePromptIds,
  );
  const normalizedSkills = mergeSkillSnapshots(
    [],
    payload.skills,
    [],
    payload.skillVersions,
    undefined,
    payload.skillFiles,
  );

  return {
    version: localBackup.version,
    exportedAt: new Date().toISOString(),
    prompts: normalizedPrompts,
    folders: normalizedFolders,
    versions: normalizedPromptVersions,
    promptRelations: normalizedPromptRelations,
    outputFormatItems: normalizedOutputFormatItems,
    images: remoteImages,
    videos: remoteVideos,
    aiConfig: restoredAiConfig,
    settings: restoredSettings,
    settingsUpdatedAt: remoteSettingsUpdatedAt || localBackup.settingsUpdatedAt,
    rules: payload.rules,
    skills: normalizedSkills.skills,
    skillVersions: normalizedSkills.skillVersions,
    skillFiles: normalizedSkills.skillFiles,
    mcpLibrary: payload.mcpLibrary,
    pluginLibrary: payload.pluginLibrary,
    pluginPackages: payload.pluginPackages,
    storeSources: payload.storeSources,
    agentAssetFiles: payload.agentAssetFiles,
  };
}

function buildRemoteBackupSnapshot(backup: DatabaseBackup): WebSyncPayload {
  return {
    version: hasEncodedSkillSnapshots(backup) ? SKILL_SNAPSHOT_SYNC_VERSION : "desktop-backup-v1",
    exportedAt: backup.exportedAt,
    prompts: backup.prompts,
    promptVersions: backup.versions,
    versions: backup.versions,
    folders: backup.folders,
    promptRelations: backup.promptRelations,
    outputFormatItems: backup.outputFormatItems,
    rules: backup.rules || [],
    skills: normalizeSkillsForWebSync(backup.skills || []),
    skillVersions: backup.skillVersions || [],
    skillFiles: backup.skillFiles,
    mcpLibrary: backup.mcpLibrary,
    pluginLibrary: backup.pluginLibrary,
    pluginPackages: backup.pluginPackages,
    storeSources: backup.storeSources,
    agentAssetFiles: backup.agentAssetFiles,
    settings: toWebSettings(backup),
    settingsUpdatedAt: backup.settingsUpdatedAt,
    desktopSettings: sanitizeDesktopSettingsForRemoteBackup(backup.settings),
    desktopAiConfig: sanitizeDesktopAiConfigForRemoteBackup(backup.aiConfig),
    images: backup.images,
    videos: backup.videos,
  };
}

function metadataToBackupResult(
  metadata: SelfHostedBackupMetadata,
): SelfHostedRemoteBackupResult {
  return {
    id: metadata.id,
    createdAt: metadata.createdAt,
    clientVersion: metadata.clientVersion,
    serverVersion: metadata.serverVersion,
    prompts: metadata.summary.prompts,
    folders: metadata.summary.folders,
    rules: metadata.summary.rules,
    skills: metadata.summary.skills,
    promptRelations: metadata.summary.promptRelations,
    outputFormatItems: metadata.summary.outputFormatItems,
    mcpServers: metadata.summary.mcpServers,
    plugins: metadata.summary.plugins,
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

export async function testSelfHostedBackupConnection(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedBackupCapabilities> {
  const { capabilities } = await openCompatibleBackupSession(config);
  return capabilities;
}

export async function createSelfHostedRemoteBackup(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedRemoteBackupResult> {
  const { baseUrl, accessToken, clientVersion } =
    await openCompatibleBackupSession(config);
  const backup = await exportDatabase();
  const metadata = await apiPost<SelfHostedBackupMetadata>(
    baseUrl,
    accessToken,
    "/api/backups/desktop",
    {
      clientVersion,
      payload: buildRemoteBackupSnapshot(backup),
    },
  );
  return metadataToBackupResult(metadata);
}

export async function restoreLatestSelfHostedRemoteBackup(
  config: SelfHostedSyncConfig,
  safety?: {
    beforeRestore?: () => Promise<void>;
    rollbackRestore?: () => Promise<void>;
  },
): Promise<SelfHostedSyncSummary> {
  const { baseUrl, accessToken, clientVersion } =
    await openCompatibleBackupSession(config);
  const envelope = await apiGet<SelfHostedBackupEnvelope>(
    baseUrl,
    accessToken,
    "/api/backups/desktop/latest",
  );
  if (
    envelope.clientVersion !== clientVersion ||
    envelope.serverVersion !== clientVersion ||
    envelope.protocolVersion !== SELF_HOSTED_BACKUP_PROTOCOL_VERSION ||
    !envelope.snapshot.settings
  ) {
    throw new SelfHostedBackupCompatibilityError(
      "The latest self-hosted backup is not compatible with this desktop version. Local data was not changed.",
    );
  }

  const localBackup = await exportDatabase();
  const backup = buildDesktopBackupFromRemote(
    localBackup,
    envelope.snapshot as WebSyncPayload,
    envelope.snapshot.images,
    envelope.snapshot.videos,
  );
  await safety?.beforeRestore?.();
  try {
    await restoreFromBackup(backup);
  } catch (error) {
    if (safety?.rollbackRestore) {
      try {
        await safety.rollbackRestore();
      } catch (rollbackError) {
        const restoreMessage =
          error instanceof Error ? error.message : "unknown restore error";
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : "unknown rollback error";
        throw new Error(
          `Self-hosted restore failed (${restoreMessage}) and rollback failed (${rollbackMessage})`,
        );
      }
    }
    throw error;
  }
  return {
    prompts: envelope.summary.prompts,
    folders: envelope.summary.folders,
    rules: envelope.summary.rules,
    skills: envelope.summary.skills,
    promptRelations: envelope.summary.promptRelations,
    outputFormatItems: envelope.summary.outputFormatItems,
    mcpServers: envelope.summary.mcpServers,
    plugins: envelope.summary.plugins,
  };
}

export async function pushToSelfHostedWeb(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  const { baseUrl, accessToken } = await loginToSelfHostedWeb(config);
  const backup = await exportDatabase();
  if (hasEncodedSkillSnapshots(backup)) {
    const manifest = await apiGet<{ skillSnapshotCapability?: string }>(
      baseUrl, accessToken, "/api/sync/manifest",
    );
    if (manifest.skillSnapshotCapability !== SKILL_SNAPSHOT_CAPABILITY) {
      throw new SelfHostedBackupCompatibilityError("Remote sync server does not support lossless Skill snapshots; upgrade the server before syncing binary Skill files");
    }
  }
  const [imageMap, videoMap] = await Promise.all([
    uploadMediaMap(baseUrl, accessToken, "images", backup.images),
    uploadMediaMap(baseUrl, accessToken, "videos", backup.videos),
  ]);

  const payload: WebSyncPayload = {
    version: hasEncodedSkillSnapshots(backup) ? SKILL_SNAPSHOT_SYNC_VERSION : "desktop-backup-v1",
    exportedAt: backup.exportedAt,
    prompts: remapPromptMedia(backup.prompts, imageMap, videoMap),
    promptVersions: backup.versions,
    versions: backup.versions,
    folders: backup.folders,
    promptRelations: backup.promptRelations,
    outputFormatItems: backup.outputFormatItems,
    rules: backup.rules || [],
    skills: normalizeSkillsForWebSync(backup.skills || []),
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

  const dependencySummary =
    result.promptRelationsImported !== undefined ||
    result.promptRelationsSkipped !== undefined ||
    result.outputFormatItemsImported !== undefined ||
    result.outputFormatItemsSkipped !== undefined
      ? {
          promptRelations: result.promptRelationsImported ?? 0,
          promptRelationsSkipped: result.promptRelationsSkipped ?? 0,
          outputFormatItems: result.outputFormatItemsImported ?? 0,
          outputFormatItemsSkipped: result.outputFormatItemsSkipped ?? 0,
        }
      : {};

  return {
    prompts: result.promptsImported,
    folders: result.foldersImported,
    rules: result.rulesImported ?? backup.rules?.length ?? 0,
    skills: result.skillsImported,
    mcpServers: backup.mcpLibrary?.servers.length ?? 0,
    plugins: backup.pluginLibrary?.plugins.length ?? 0,
    ...dependencySummary,
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
