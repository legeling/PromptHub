import type {
  Folder,
  Settings,
  Skill,
  SkillSafetyReport,
  SkillSafetyScanInput,
  SkillVersion,
  SyncProviderKind,
} from '@prompthub/shared';
import { fetchWithAuthRetry } from './auth-session';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

export interface SyncStatus {
  enabled: boolean;
  provider: SyncProviderKind;
  lastSyncAt: string;
  summary: {
    prompts: number;
    folders: number;
    skills: number;
  };
  message: string;
  config: SyncConfig;
  capabilities: {
    pull: boolean;
    push: boolean;
    autoSync: boolean;
  };
}

export interface SyncConfig {
  enabled: boolean;
  provider: SyncProviderKind;
  endpoint?: string;
  username?: string;
  password?: string;
  remotePath?: string;
  autoSync?: boolean;
  lastSyncAt?: string;
}

export interface SyncOperationSummary {
  prompts: number;
  folders: number;
  rules: number;
  skills: number;
}

export interface SyncManifest {
  version: string;
  exportedAt: string;
  counts: {
    prompts: number;
    folders: number;
    skills: number;
  };
  actor: {
    userId: string;
    role: 'admin' | 'user';
  };
}

export interface SyncPushResult {
  ok: boolean;
  promptsImported: number;
  foldersImported: number;
  rulesImported: number;
  skillsImported: number;
  settingsUpdated: boolean;
  summary: SyncOperationSummary;
}

export interface SyncProviderResult {
  ok: boolean;
  provider: 'webdav';
  syncedAt: string;
  remoteFile: string;
  summary: SyncOperationSummary;
  promptsExported?: number;
  foldersExported?: number;
  rulesExported?: number;
  skillsExported?: number;
  promptsImported?: number;
  foldersImported?: number;
  rulesImported?: number;
  skillsImported?: number;
  settingsUpdated?: boolean;
}

export interface AIRequestPayload {
  requestId?: string;
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface AIResponsePayload {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string>;
  error?: string;
}

type SettingsUpdatePatch = Omit<Partial<{
  [Key in keyof Settings]: Settings[Key] | null;
}>, 'sync' | 'device'> & {
  sync?: Partial<NonNullable<Settings['sync']>> | null;
  device?: Partial<NonNullable<Settings['device']>> | null;
};

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<ApiEnvelope<T>> {
  const response = await fetchWithAuthRetry(url, options);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return (await response.json()) as ApiEnvelope<T>;
}

function getAuthHeaders(token: string, contentType?: string): HeadersInit {
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    Authorization: `Bearer ${token}`,
  };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function fetchFolders(token: string, scope: 'private' | 'shared' | 'all' = 'all'): Promise<ApiEnvelope<Folder[]>> {
  return requestJson<Folder[]>(
    `/api/folders?scope=${scope}`,
    { headers: getAuthHeaders(token) },
    'Request failed',
  );
}

export async function createFolder(
  token: string,
  data: { name: string; icon?: string; parentId?: string; visibility?: 'private' | 'shared' },
): Promise<ApiEnvelope<Folder>> {
  return requestJson<Folder>(
    '/api/folders',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchSkills(token: string, scope: 'private' | 'shared' | 'all' = 'all'): Promise<ApiEnvelope<Skill[]>> {
  return requestJson<Skill[]>(
    `/api/skills?scope=${scope}`,
    { headers: getAuthHeaders(token) },
    'Request failed',
  );
}

export async function createSkill(
  token: string,
  data: { name: string; description?: string; content?: string; visibility?: 'private' | 'shared' },
): Promise<ApiEnvelope<Skill>> {
  return requestJson<Skill>(
    '/api/skills',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify({ ...data, protocol_type: 'skill' }),
    },
    'Request failed',
  );
}

export async function fetchSkillVersions(token: string, skillId: string): Promise<ApiEnvelope<SkillVersion[]>> {
  return requestJson<SkillVersion[]>(`/api/skills/${encodePathSegment(skillId)}/versions`, { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function scanSkillSafety(
  token: string,
  payload: SkillSafetyScanInput,
): Promise<ApiEnvelope<SkillSafetyReport>> {
  return requestJson<SkillSafetyReport>(
    '/api/skills/safety-scan',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(payload),
    },
    'Request failed',
  );
}

export async function saveSkillSafetyReport(
  token: string,
  skillId: string,
  report: SkillSafetyReport,
): Promise<ApiEnvelope<Skill>> {
  return requestJson<Skill>(
    `/api/skills/${encodePathSegment(skillId)}/safety-report`,
    {
      method: 'PUT',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(report),
    },
    'Request failed',
  );
}

export async function fetchRemoteSkill(
  token: string,
  data: { url: string; importToLibrary?: boolean; name?: string; description?: string; visibility?: 'private' | 'shared' },
): Promise<ApiEnvelope<{ content: string; metadata: { name?: string; description?: string; version?: string; author?: string; tags?: string[] }; importedSkill?: Skill }>> {
  return requestJson(
    '/api/skills/fetch-remote',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchSettings(token: string): Promise<ApiEnvelope<Settings>> {
  return requestJson<Settings>('/api/settings', { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function updateSettings(token: string, data: SettingsUpdatePatch): Promise<ApiEnvelope<{ ok: true }>> {
  return requestJson<{ ok: true }>(
    '/api/settings',
    {
      method: 'PUT',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function exportData(token: string): Promise<unknown> {
  const response = await fetchWithAuthRetry('/api/export', { headers: getAuthHeaders(token) });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Request failed'));
  }
  return (await response.json()) as unknown;
}

export async function importData(token: string, data: unknown): Promise<ApiEnvelope<SyncPushResult>> {
  return requestJson<SyncPushResult>(
    '/api/import',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchSyncStatus(token: string): Promise<ApiEnvelope<SyncStatus>> {
  return requestJson<SyncStatus>('/api/sync/status', { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function fetchSyncConfig(token: string): Promise<ApiEnvelope<SyncConfig>> {
  return requestJson<SyncConfig>('/api/sync/config', { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function updateSyncConfig(token: string, data: SyncConfig): Promise<ApiEnvelope<SyncConfig>> {
  return requestJson<SyncConfig>(
    '/api/sync/config',
    {
      method: 'PUT',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchSyncManifest(token: string): Promise<ApiEnvelope<SyncManifest>> {
  return requestJson<SyncManifest>('/api/sync/manifest', { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function fetchSyncData(token: string): Promise<ApiEnvelope<unknown>> {
  return requestJson<unknown>('/api/sync/data', { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function pushSyncData(token: string, payload: unknown): Promise<ApiEnvelope<SyncPushResult>> {
  return requestJson<SyncPushResult>(
    '/api/sync/data',
    {
      method: 'PUT',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify({ payload }),
    },
    'Request failed',
  );
}

export async function pushSyncToProvider(token: string): Promise<ApiEnvelope<SyncProviderResult>> {
  return requestJson<SyncProviderResult>(
    '/api/sync/push',
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    },
    'Request failed',
  );
}

export async function pullSyncFromProvider(
  token: string,
): Promise<ApiEnvelope<SyncProviderResult & Omit<SyncPushResult, 'ok'>>> {
  return requestJson<SyncProviderResult & Omit<SyncPushResult, 'ok'>>(
    '/api/sync/pull',
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    },
    'Request failed',
  );
}

export async function sendAiRequest(token: string, data: AIRequestPayload): Promise<ApiEnvelope<AIResponsePayload>> {
  return requestJson<AIResponsePayload>(
    '/api/ai/request',
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchMediaList(token: string, kind: 'images' | 'videos'): Promise<ApiEnvelope<string[]>> {
  return requestJson<string[]>(`/api/media/${kind}`, { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function uploadMediaBase64(
  token: string,
  kind: 'images' | 'videos',
  data: { fileName: string; base64Data: string },
): Promise<ApiEnvelope<string>> {
  return requestJson<string>(
    `/api/media/${kind}/base64`,
    {
      method: 'POST',
      headers: getAuthHeaders(token, 'application/json'),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function fetchMediaBase64(token: string, kind: 'images' | 'videos', fileName: string): Promise<ApiEnvelope<string>> {
  return requestJson<string>(`/api/media/${kind}/${encodeURIComponent(fileName)}/base64`, { headers: getAuthHeaders(token) }, 'Request failed');
}

export async function deleteMedia(token: string, kind: 'images' | 'videos', fileName: string): Promise<ApiEnvelope<{ ok: true }>> {
  return requestJson<{ ok: true }>(
    `/api/media/${kind}/${encodeURIComponent(fileName)}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    },
    'Request failed',
  );
}
