import type {
  AITransportRequest,
  AITransportResponse,
  AgentScannedSkill,
  CreateRuleProjectInput,
  CreateFolderDTO,
  CreatePromptDTO,
  CreateSkillParams,
  Folder,
  Prompt,
  PromptVersion,
  RuleBackupRecord,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleRewriteRequest,
  RuleRewriteResult,
  RuleVersionSnapshot,
  SearchQuery,
  Settings,
  Skill,
  SkillLocalFileEntry,
  SkillPlatformScanResult,
  SkillSafetyScanInput,
  SkillSafetyReport,
  SkillVersion,
  UpdateFolderDTO,
  UpdatePromptDTO,
  UpdateSkillParams,
} from '@prompthub/shared/types';
import { SKILL_PLATFORMS } from '@prompthub/shared/constants/platforms';
import rootPackage from '../../../../../package.json';
import { fetchWithAuthRetry } from '../api/auth-session';
import i18n from '../i18n';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const WEB_APP_VERSION = `${rootPackage.version}-web`;

let installed = false;

function isOpenableWebPathTarget(targetPath: string): boolean {
  if (targetPath.trim() !== targetPath) {
    return false;
  }

  try {
    const url = new URL(targetPath);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

function buildHeaders(init?: HeadersInit): Headers {
  return new Headers(init ?? {});
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (!payload || !('data' in payload)) {
    throw new Error('Malformed API response');
  }

  return payload.data as T;
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildHeaders(init.headers);
  const response = await fetchWithAuthRetry(path, {
    ...init,
    headers,
  });
  return readJsonResponse<T>(response);
}

async function apiJsonBody<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return apiJson<T>(path, {
    method,
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function apiOk(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<boolean> {
  await apiJsonBody(path, method, body);
  return true;
}

async function apiDelete<T>(path: string): Promise<T> {
  return apiJson<T>(path, { method: 'DELETE' });
}

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName);
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function createBrowserFileId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function selectFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(files);
    };

    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.left = '-9999px';
    input.style.top = '0';

    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      finish(files);
    }, { once: true });

    input.addEventListener('cancel', () => {
      finish([]);
    }, { once: true });

    document.body.appendChild(input);
    try {
      input.click();
    } catch {
      finish([]);
    }
  });
}

async function uploadSelectedMedia(kind: 'images' | 'videos', accept: string): Promise<string[]> {
  const files = await selectFiles(accept);
  const uploadedFileNames: string[] = [];

  for (const file of files) {
    const base64Data = bufferToBase64(await file.arrayBuffer());
    const fileName = await apiJson<string>(`/api/media/${kind}/base64`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ fileName: file.name, base64Data }),
    });
    uploadedFileNames.push(fileName);
  }

  return uploadedFileNames;
}

async function requestAi(request: AITransportRequest): Promise<AITransportResponse> {
  return apiJson<AITransportResponse>('/api/ai/request', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
}

async function requestAiStream(
  request: AITransportRequest,
  handlers?: {
    onChunk?: (chunk: string) => void;
    onError?: (error: string) => void;
  },
): Promise<AITransportResponse> {
  const response = await fetchWithAuthRetry('/api/ai/stream', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });

  if (!response.ok || !response.body) {
    return readJsonResponse<AITransportResponse>(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let aggregated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      aggregated += chunk;
      handlers?.onChunk?.(chunk);
    }
  } catch (streamError) {
    const message =
      streamError instanceof Error ? streamError.message : 'AI stream failed';
    handlers?.onError?.(message);
  }

  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: aggregated,
  };
}

export function installDesktopBridge(): void {
  if (installed) {
    return;
  }

  installed = true;
  Reflect.set(window, '__PROMPTHUB_WEB__', true);

  const api = {
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    prompt: {
      create: (data: CreatePromptDTO) =>
        apiJsonBody<Prompt>('/api/prompts', 'POST', data),
      get: (id: string) => apiJson<Prompt>(`/api/prompts/${encodePathSegment(id)}`),
      getAll: () => apiJson<Prompt[]>('/api/prompts?scope=all'),
      getAllTags: () => apiJson<string[]>('/api/prompts/meta/tags'),
      renameTag: (oldTag: string, newTag: string) =>
        apiOk('/api/prompts/meta/tags/rename', 'POST', { oldTag, newTag }),
      deleteTag: (tag: string) =>
        apiOk('/api/prompts/meta/tags/delete', 'POST', { tag }),
      update: (id: string, data: UpdatePromptDTO) =>
        apiJsonBody<Prompt>(`/api/prompts/${encodePathSegment(id)}`, 'PUT', data),
      delete: (id: string) => apiOk(`/api/prompts/${encodePathSegment(id)}`, 'DELETE'),
      search: (query: SearchQuery) => {
        const params = new URLSearchParams();
        params.set('scope', query.scope ?? 'all');
        if (query.keyword) params.set('keyword', query.keyword);
        if (query.tags?.length) {
          for (const tag of query.tags) {
            params.append('tag', tag);
          }
        }
        if (query.folderId) params.set('folderId', query.folderId);
        if (typeof query.isFavorite === 'boolean') {
          params.set('isFavorite', String(query.isFavorite));
        }
        if (query.sortBy) params.set('sortBy', query.sortBy);
        if (query.sortOrder) params.set('sortOrder', query.sortOrder);
        if (typeof query.limit === 'number') params.set('limit', String(query.limit));
        if (typeof query.offset === 'number') params.set('offset', String(query.offset));
        return apiJson<Prompt[]>(`/api/prompts?${params.toString()}`);
      },
      copy: (id: string) => apiJsonBody<Prompt>(`/api/prompts/${encodePathSegment(id)}/copy`, 'POST'),
      insertDirect: (prompt: Prompt) =>
        apiJsonBody<Prompt>('/api/prompts/direct-insert', 'POST', prompt).then(() => true),
      syncWorkspace: () => apiOk('/api/prompts/workspace/sync', 'POST'),
    },
    rules: {
      list: () => apiJson<RuleFileDescriptor[]>('/api/rules'),
      scan: () => apiJson<RuleFileDescriptor[]>('/api/rules/scan', { method: 'POST' }),
      read: (ruleId: RuleFileId) =>
        apiJson<RuleFileContent>(`/api/rules/${encodeURIComponent(ruleId)}`),
      save: (ruleId: RuleFileId, content: string) =>
        apiJsonBody<RuleFileContent>(`/api/rules/${encodeURIComponent(ruleId)}`, 'PUT', {
          content,
        }),
      rewrite: (payload: RuleRewriteRequest) =>
        apiJsonBody<RuleRewriteResult>('/api/rules/rewrite', 'POST', payload),
      addProject: (input: CreateRuleProjectInput) =>
        apiJsonBody<RuleFileDescriptor>('/api/rules/projects', 'POST', input),
      removeProject: (projectId: string) =>
        apiDelete<{ success: boolean }>(`/api/rules/projects/${encodeURIComponent(projectId)}`),
      importRecords: (records: RuleBackupRecord[], options?: { replace?: boolean }) =>
        apiJsonBody<{ success: boolean }>('/api/rules/import-records', 'POST', {
          records,
          options,
        }),
      deleteVersion: (ruleId: RuleFileId, versionId: string) =>
        apiDelete<RuleVersionSnapshot[]>(
          `/api/rules/${encodeURIComponent(ruleId)}/versions/${encodeURIComponent(versionId)}`,
        ),
    },
    security: {
      status: async () => ({ configured: false, unlocked: true }),
      setMasterPassword: async (_password: string) => {},
      changeMasterPassword: async (_oldPassword: string, _newPassword: string) => {},
      unlock: async (_password: string) => ({ success: true }),
      lock: async () => {},
    },
    version: {
      getAll: (promptId: string) =>
        apiJson<PromptVersion[]>(`/api/prompts/${encodePathSegment(promptId)}/versions`),
      create: (promptId: string, note?: string) =>
        apiJsonBody<PromptVersion>(`/api/prompts/${encodePathSegment(promptId)}/versions`, 'POST', { note }),
      rollback: (promptId: string, version: number) =>
        apiJsonBody<Prompt>(`/api/prompts/${encodePathSegment(promptId)}/versions/${version}/rollback`, 'POST'),
      delete: (versionId: string) => apiOk(`/api/prompts/versions/${encodePathSegment(versionId)}`, 'DELETE'),
      insertDirect: (version: PromptVersion) =>
        apiJsonBody<PromptVersion>('/api/prompts/versions/direct-insert', 'POST', version).then(() => true),
    },
    folder: {
      create: (data: CreateFolderDTO) =>
        apiJsonBody<Folder>('/api/folders', 'POST', data),
      getAll: () => apiJson<Folder[]>('/api/folders?scope=all'),
      update: (id: string, data: UpdateFolderDTO) =>
        apiJsonBody<Folder>(`/api/folders/${encodePathSegment(id)}`, 'PUT', data),
      delete: (id: string) => apiOk(`/api/folders/${encodePathSegment(id)}`, 'DELETE'),
      reorder: (ids: string[]) =>
        apiOk('/api/folders/reorder', 'PUT', { ids }),
      insertDirect: (folder: Folder) =>
        apiJsonBody<Folder>('/api/folders/direct-insert', 'POST', folder).then(() => true),
    },
    skill: {
      getAll: () => apiJson<Skill[]>('/api/skills?scope=all'),
      get: (id: string) => apiJson<Skill>(`/api/skills/${encodePathSegment(id)}`),
      create: (data: CreateSkillParams) =>
        apiJsonBody<Skill>('/api/skills', 'POST', data),
      update: (id: string, data: UpdateSkillParams) =>
        apiJsonBody<Skill>(`/api/skills/${encodePathSegment(id)}`, 'PUT', data),
      delete: (id: string) => apiOk(`/api/skills/${encodePathSegment(id)}`, 'DELETE'),
      deleteAll: () => apiOk('/api/skills?confirm=true', 'DELETE'),
      versionGetAll: (skillId: string) =>
        apiJson<SkillVersion[]>(`/api/skills/${encodePathSegment(skillId)}/versions`),
      versionCreate: (skillId: string, note?: string) =>
        apiJsonBody<SkillVersion>(`/api/skills/${encodePathSegment(skillId)}/versions`, 'POST', { note }),
      versionRollback: (skillId: string, version: number) =>
        apiJsonBody<Skill>(`/api/skills/${encodePathSegment(skillId)}/versions/${version}/rollback`, 'POST'),
      versionDelete: (skillId: string, versionId: string) =>
        apiOk(`/api/skills/${encodePathSegment(skillId)}/versions/${encodePathSegment(versionId)}`, 'DELETE'),
      insertVersionDirect: async (_version: SkillVersion) => {},
      readLocalFiles: async (_skillId: string) => [] as SkillLocalFileEntry[],
      listLocalFiles: async (_skillId: string) => [] as SkillLocalFileEntry[],
      readLocalFile: async (_skillId: string, _path: string) => '',
      writeLocalFile: async (
        _skillId: string,
        _path: string,
        _content: string,
      ) => true,
      createLocalDir: async (_skillId: string, _path: string) => true,
      renameLocalPath: async (_skillId: string, _path: string, _nextPath: string) => true,
      deleteLocalFile: async (_skillId: string, _path: string) => true,
      readLocalFileByPath: async (_localPath: string, _path: string) => '',
      writeLocalFileByPath: async (
        _localPath: string,
        _path: string,
        _content: string,
      ) => true,
      createLocalDirByPath: async (_localPath: string, _path: string) => true,
      renameLocalPathByPath: async (
        _localPath: string,
        _path: string,
        _nextPath: string,
      ) => true,
      deleteLocalFileByPath: async (_localPath: string, _path: string) => true,
      getLocalPathStatus: async (_localPath: string) => ({ exists: false, isDirectory: false }),
      copyRepoByPathToDirectory: async (
        _localPath: string,
        _skillName: string,
        _targetRootDir: string,
        _options?: { mode?: 'copy' | 'symlink'; ifExists?: 'overwrite' | 'skip' | 'error' },
      ) => ({ success: false, skipped: true, targetPath: null }),
      getRepoPath: async (_skillId: string) => null,
      saveToRepo: async (_skillId: string) => null,
      syncFromRepo: async (id: string) => apiJson<Skill>(`/api/skills/${encodePathSegment(id)}`),
      scanLocal: async () => ({ imported: [], skipped: [], failed: [] }),
      scanLocalPreview: async (
        _customPaths?: string[],
        _aiConfig?: SkillSafetyScanInput['aiConfig'],
      ) => [],
      scanSafety: (payload: SkillSafetyScanInput) =>
        apiJsonBody<SkillSafetyReport>('/api/skills/safety-scan', 'POST', payload),
      saveSafetyReport: (skillId: string, report: SkillSafetyReport) =>
        apiJsonBody<Skill>(`/api/skills/${encodePathSegment(skillId)}/safety-report`, 'PUT', report),
      export: async (skillId: string, _format: 'skillmd' | 'json') => {
        const result = await apiJsonBody<{ name: string; content: string }>(
          `/api/skills/${encodePathSegment(skillId)}/export`,
          'POST',
        );
        return result.content;
      },
      fetchRemoteContent: async (url: string) => {
        const result = await apiJsonBody<{
          content: string;
          metadata: Record<string, unknown>;
          importedSkill?: Skill;
        }>('/api/skills/fetch-remote', 'POST', { url });
        return result.content;
      },
      installToPlatform: async (
        _platform: 'claude' | 'cursor',
        _name: string,
        _mcpConfig: unknown,
      ) => {},
      uninstallFromPlatform: async (_platform: 'claude' | 'cursor', _name: string) => {},
      getPlatformStatus: async (_name: string) => ({}),
      getSupportedPlatforms: async () => SKILL_PLATFORMS,
      detectPlatforms: async () => SKILL_PLATFORMS,
      scanPlatformSkills: async (platformId: string): Promise<SkillPlatformScanResult> => {
        const platform =
          SKILL_PLATFORMS.find((item) => item.id === platformId) ?? SKILL_PLATFORMS[0];
        return {
          platform,
          skillsDir: '',
          scannedSkills: [] as AgentScannedSkill[],
        };
      },
      uninstallPlatformSkill: async (
        _platformId: string,
        _platformSkillPath: string,
      ) => true,
      getMdInstallStatus: async (_name: string) => ({}),
      getMdInstallStatusBatch: async (names: string[]) =>
        Object.fromEntries(names.map((name) => [name, {}])),
      installMd: async (_skillName: string, _skillMdContent: string, _platformId: string) => {},
      uninstallMd: async (_skillName: string, _platformId: string) => {},
      installMdSymlink: async (
        _skillName: string,
        _localSkillMdPath: string,
        _platformId: string,
      ) => {},
    },
    settings: {
      get: () => apiJson<Settings>('/api/settings'),
      set: (settings: Partial<Settings>) =>
        apiOk('/api/settings', 'PUT', settings),
    },
    io: {},
    ai: {
      request: requestAi,
      requestStream: requestAiStream,
    },
    on: (_channel: string, _callback: (...args: unknown[]) => void) => {},
    off: (_channel: string, _callback: (...args: unknown[]) => void) => {},
  };

  const electron = {
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    toggleVisibility: () => {},
    enterFullscreen: () => document.documentElement.requestFullscreen?.(),
    exitFullscreen: () => document.exitFullscreen?.(),
    isFullscreen: async () => document.fullscreenElement !== null,
    isVisible: async () => document.visibilityState !== 'hidden',
    toggleFullscreen: () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
      } else {
        void document.documentElement.requestFullscreen?.();
      }
    },
    setAutoLaunch: (_enabled: boolean, _minimizeOnLaunch?: boolean) => {},
    setDebugMode: (_enabled: boolean) => {},
    toggleDevTools: () => {},
    setMinimizeToTray: (_enabled: boolean) => {},
    setCloseAction: (_action: 'ask' | 'minimize' | 'exit') => {},
    onShowCloseDialog: (_callback: () => void) => () => {},
    sendCloseDialogResult: (_action: 'minimize' | 'exit', _remember: boolean) => {},
    sendCloseDialogCancel: () => {},
    selectFolder: async () => null,
    openPath: async (targetPath: string) => {
      if (isOpenableWebPathTarget(targetPath)) {
        window.open(targetPath, '_blank', 'noopener,noreferrer');
        return { success: true };
      }

      return {
        success: false,
        error: 'Opening local paths is not supported in the web runtime',
      };
    },
    showNotification: async (title: string, body: string) => {
      if (!('Notification' in window)) {
        return false;
      }
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, { body });
          return true;
        }
      }
      return false;
    },
    getDataPath: async () =>
      i18n.t(
        'settings.webDataPathPlaceholder',
        'PromptHub Web Self-Hosted Data Directory',
      ),
    getDataPathStatus: async () => ({
      currentPath: i18n.t(
        'settings.webDataPathPlaceholder',
        'PromptHub Web Self-Hosted Data Directory',
      ),
      configuredPath: i18n.t(
        'settings.webDataPathPlaceholder',
        'PromptHub Web Self-Hosted Data Directory',
      ),
      needsRestart: false,
    }),
    migrateData: async (_newPath: string) => ({
      success: false,
      error: 'Data directory migration is not supported in the web runtime',
    }),
    checkRecovery: async () => [],
    performRecovery: async (_sourcePath: string) => ({ success: true }),
    dismissRecovery: async () => ({ success: true }),
    updater: {
      check: async () => ({ success: false, error: 'Updater is unavailable on web' }),
      download: async () => ({ success: false, error: 'Updater is unavailable on web' }),
      install: async () => ({ success: false, manual: true }),
      openDownloadedUpdate: async () => ({ success: false }),
      getVersion: async () => WEB_APP_VERSION,
      getPlatform: async () => getPlatform(),
      openReleases: async () => {},
      onStatus: (_callback: (status: unknown) => void) => () => {},
      offStatus: () => {},
    },
    selectImage: async () => uploadSelectedMedia('images', 'image/*'),
    saveImage: async (paths: string[]) => paths,
    saveImageBuffer: async (buffer: ArrayBuffer) => {
      const fileName = `${createBrowserFileId('image')}.png`;
      await apiOk('/api/media/images/base64', 'POST', {
        fileName,
        base64Data: bufferToBase64(buffer),
      });
      return fileName;
    },
    downloadImage: async (url: string) =>
      apiJson<string>('/api/media/images/download', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ url }),
      }),
    openImage: async (fileName: string) => {
      window.open(
        `/api/media/images/${encodeFileName(fileName)}`,
        '_blank',
        'noopener,noreferrer',
      );
      return true;
    },
    listImages: () => apiJson<string[]>('/api/media/images'),
    getImageSize: (fileName: string) =>
      apiJson<number>(`/api/media/images/${encodeFileName(fileName)}/size`),
    readImageBase64: (fileName: string) =>
      apiJson<string>(`/api/media/images/${encodeFileName(fileName)}/base64`),
    saveImageBase64: async (fileName: string, base64: string) =>
      apiOk('/api/media/images/base64', 'POST', {
        fileName,
        base64Data: base64,
      }),
    imageExists: (fileName: string) =>
      apiJson<boolean>(`/api/media/images/${encodeFileName(fileName)}/exists`),
    clearImages: async () => apiOk('/api/media/images?confirm=true', 'DELETE'),
    webdav: {
      testConnection: async (config: {
        url: string;
        username: string;
        password: string;
      }) => ({
        success: true,
        message: `Web runtime uses the server-side sync endpoints for ${config.url}`,
      }),
      ensureDirectory: async (
        _url: string,
        _config: { url: string; username: string; password: string },
      ) => ({ success: true }),
      upload: async (
        _fileUrl: string,
        _config: { url: string; username: string; password: string },
        _data: string,
      ) => ({ success: false, error: 'Direct WebDAV upload is not supported on web' }),
      download: async (
        _fileUrl: string,
        _config: { url: string; username: string; password: string },
      ) => ({ success: false, error: 'Direct WebDAV download is not supported on web' }),
      stat: async (
        _fileUrl: string,
        _config: { url: string; username: string; password: string },
      ) => ({ success: false, error: 'Direct WebDAV stat is not supported on web' }),
    },
    e2e: {
      getStats: async () => ({
        webdav: {
          testConnection: 0,
          ensureDirectory: 0,
          upload: 0,
          download: 0,
          stat: 0,
        },
      }),
      resetStats: async () => true,
    },
    getShortcuts: async () => ({}),
    setShortcuts: async (_shortcuts: Record<string, string>) => true,
    setShortcutMode: (_modes: Record<string, 'global' | 'local'>) => {},
    onShortcutTriggered: (_callback: (action: string) => void) => () => {},
    onShortcutsUpdated: (_callback: (shortcuts: Record<string, string>) => void) => () => {},
    selectVideo: async () => uploadSelectedMedia('videos', 'video/*'),
    saveVideo: async (paths: string[]) => paths,
    openVideo: async (fileName: string) => {
      window.open(
        `/api/media/videos/${encodeFileName(fileName)}`,
        '_blank',
        'noopener,noreferrer',
      );
      return true;
    },
    listVideos: () => apiJson<string[]>('/api/media/videos'),
    getVideoSize: (fileName: string) =>
      apiJson<number>(`/api/media/videos/${encodeFileName(fileName)}/size`),
    readVideoBase64: (fileName: string) =>
      apiJson<string>(`/api/media/videos/${encodeFileName(fileName)}/base64`),
    saveVideoBase64: async (fileName: string, base64: string) =>
      apiOk('/api/media/videos/base64', 'POST', {
        fileName,
        base64Data: base64,
      }),
    videoExists: (fileName: string) =>
      apiJson<boolean>(`/api/media/videos/${encodeFileName(fileName)}/exists`),
    getVideoPath: async (fileName: string) =>
      `/api/media/videos/${encodeFileName(fileName)}`,
    clearVideos: async () => apiOk('/api/media/videos?confirm=true', 'DELETE'),
  };

  Reflect.set(window, 'api', api);
  Reflect.set(window, 'electron', electron);
}
