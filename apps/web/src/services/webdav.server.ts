import { Buffer } from 'node:buffer';
import { requestRemoteBuffered } from '../utils/remote-http.js';

export interface WebDavConfig {
  endpoint: string;
  username?: string;
  password?: string;
  remotePath?: string;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function normalizeWebDavRelativePath(value: string, label: string): string[] {
  const trimmed = trimSlashes(value.trim());
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes('\\')) {
    throw new Error(`Invalid WebDAV ${label}: path separator detected`);
  }
  if (/[\u0000-\u001F\u007F]/u.test(trimmed)) {
    throw new Error(`Invalid WebDAV ${label}: unsupported control character detected`);
  }

  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid WebDAV ${label}: path traversal detected`);
  }

  return segments.filter(Boolean);
}

export function isSafeWebDavRemotePath(value: string): boolean {
  try {
    normalizeWebDavRelativePath(value, 'remote path');
    return true;
  } catch {
    return false;
  }
}

function parseWebDavEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid WebDAV endpoint: expected an absolute URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Invalid WebDAV endpoint: must use HTTPS');
  }
  if (url.search || url.hash) {
    throw new Error('Invalid WebDAV endpoint: query or fragment is not supported');
  }

  return url;
}

export function isHttpsWebDavEndpoint(value: string): boolean {
  try {
    parseWebDavEndpoint(value);
    return true;
  } catch {
    return false;
  }
}

function encodePathSegments(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function getAuthHeader(config: WebDavConfig): Record<string, string> {
  if (!config.username) {
    return {};
  }

  const token = Buffer.from(`${config.username}:${config.password ?? ''}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
  };
}

export function buildWebDavTargetUrl(config: WebDavConfig, fileName: string): string {
  parseWebDavEndpoint(config.endpoint);
  const baseUrl = config.endpoint.replace(/\/$/, '');
  const remotePath = config.remotePath
    ? normalizeWebDavRelativePath(config.remotePath, 'remote path')
    : [];
  const filePath = normalizeWebDavRelativePath(fileName, 'file path');
  const segments = [...remotePath, ...filePath];
  return segments.length > 0 ? `${baseUrl}/${encodePathSegments(segments)}` : baseUrl;
}

export async function testWebDavConnection(config: WebDavConfig): Promise<{ ok: boolean; status: number }> {
  parseWebDavEndpoint(config.endpoint);

  const response = await requestRemoteBuffered({
    url: config.endpoint,
    method: 'PROPFIND',
    headers: {
      Depth: '0',
      ...getAuthHeader(config),
    },
    allowedProtocols: ['https:'],
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
  };
}

export async function pushWebDavFile(config: WebDavConfig, fileName: string, payload: string): Promise<{ ok: boolean; status: number }> {
  const response = await requestRemoteBuffered({
    url: buildWebDavTargetUrl(config, fileName),
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getAuthHeader(config),
    },
    body: payload,
    allowedProtocols: ['https:'],
    maxBytes: 100 * 1024 * 1024,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
  };
}

export async function pullWebDavFile(config: WebDavConfig, fileName: string): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await requestRemoteBuffered({
    url: buildWebDavTargetUrl(config, fileName),
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...getAuthHeader(config),
    },
    allowedProtocols: ['https:'],
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    body: response.body.toString('utf-8'),
  };
}

// Create a WebDAV collection (directory). Returns true if created or already exists.
export async function mkcolWebDavDirectory(config: WebDavConfig, dirName: string): Promise<boolean> {
  const response = await requestRemoteBuffered({
    url: buildWebDavTargetUrl(config, dirName),
    method: 'MKCOL',
    headers: { ...getAuthHeader(config) },
    allowedProtocols: ['https:'],
  });
  // 201 Created, 405 Method Not Allowed (already exists on most servers)
  return response.status === 201 || response.status === 405 || response.status === 200;
}
