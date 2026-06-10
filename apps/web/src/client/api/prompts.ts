import type { Prompt, PromptVersion, UpdatePromptDTO } from '@prompthub/shared';
import { fetchWithAuthRetry } from './auth-session';

export interface PromptData extends Prompt {}

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

export interface PromptDiffField {
  field: 'systemPrompt' | 'systemPromptEn' | 'userPrompt' | 'userPromptEn' | 'variables' | 'aiResponse';
  from: string;
  to: string;
}

export interface PromptDiffResult {
  from: PromptVersion;
  to: PromptVersion;
  fields: PromptDiffField[];
}

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function getHeaders(token: string, includeJson = false): HeadersInit {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

async function requestJson<T>(url: string, options: RequestInit, fallbackMessage: string): Promise<ApiEnvelope<T>> {
  const response = await fetchWithAuthRetry(url, options);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return (await response.json()) as ApiEnvelope<T>;
}

export interface PromptListQuery {
  scope?: 'private' | 'shared' | 'all';
  keyword?: string;
  tags?: string[];
  folderId?: string;
  isFavorite?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'usageCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

function buildQueryString(query: PromptListQuery): string {
  const params = new URLSearchParams();
  if (query.scope) params.set('scope', query.scope);
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.tags?.length) {
    for (const tag of query.tags) {
      params.append('tag', tag);
    }
  }
  if (query.folderId) params.set('folderId', query.folderId);
  if (query.isFavorite !== undefined) params.set('isFavorite', String(query.isFavorite));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const result = params.toString();
  return result ? `?${result}` : '';
}

export async function getPrompts(token: string, query: PromptListQuery = {}): Promise<ApiEnvelope<PromptData[]>> {
  return requestJson<PromptData[]>(
    `/api/prompts${buildQueryString(query)}`,
    { headers: getHeaders(token) },
    'Request failed',
  );
}

export interface CreatePromptDto {
  title: string;
  userPrompt: string;
  visibility?: 'private' | 'shared';
  description?: string;
  systemPrompt?: string;
  tags?: string[];
  folderId?: string;
}

export async function createPrompt(token: string, data: CreatePromptDto): Promise<ApiEnvelope<PromptData>> {
  return requestJson<PromptData>(
    '/api/prompts',
    {
      method: 'POST',
      headers: getHeaders(token, true),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function updatePrompt(token: string, id: string, data: UpdatePromptDTO): Promise<ApiEnvelope<PromptData>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptData>(
    `/api/prompts/${promptId}`,
    {
      method: 'PUT',
      headers: getHeaders(token, true),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function deletePrompt(token: string, id: string): Promise<ApiEnvelope<{ ok: true }>> {
  const promptId = encodePathSegment(id);
  return requestJson<{ ok: true }>(
    `/api/prompts/${promptId}`,
    {
      method: 'DELETE',
      headers: getHeaders(token),
    },
    'Request failed',
  );
}

export async function copyPrompt(token: string, id: string): Promise<ApiEnvelope<PromptData>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptData>(
    `/api/prompts/${promptId}/copy`,
    {
      method: 'POST',
      headers: getHeaders(token),
    },
    'Request failed',
  );
}

export async function getPromptVersions(token: string, id: string): Promise<ApiEnvelope<PromptVersion[]>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptVersion[]>(
    `/api/prompts/${promptId}/versions`,
    { headers: getHeaders(token) },
    'Request failed',
  );
}

export async function createPromptVersion(token: string, id: string, note?: string): Promise<ApiEnvelope<PromptVersion>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptVersion>(
    `/api/prompts/${promptId}/versions`,
    {
      method: 'POST',
      headers: getHeaders(token, true),
      body: JSON.stringify(note ? { note } : {}),
    },
    'Request failed',
  );
}

export async function rollbackPromptVersion(token: string, id: string, version: number): Promise<ApiEnvelope<PromptData>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptData>(
    `/api/prompts/${promptId}/versions/${version}/rollback`,
    {
      method: 'POST',
      headers: getHeaders(token),
    },
    'Request failed',
  );
}

export async function getPromptVersionDiff(
  token: string,
  id: string,
  fromVersion: number,
  toVersion: number,
): Promise<ApiEnvelope<PromptDiffResult>> {
  const promptId = encodePathSegment(id);
  return requestJson<PromptDiffResult>(
    `/api/prompts/${promptId}/versions/diff?from=${fromVersion}&to=${toVersion}`,
    { headers: getHeaders(token) },
    'Request failed',
  );
}
