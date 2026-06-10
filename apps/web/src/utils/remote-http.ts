import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import ipaddr from 'ipaddr.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const BLOCKED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'host',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface RemoteRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  allowedProtocols?: readonly string[];
}

export interface RemoteBufferedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
}

export interface RemoteStreamResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  finalUrl: string;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'localhost.localdomain' ||
    normalized.endsWith('.localdomain')
  );
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

const BLOCKED_IPV6_SUBNETS = [
  ipaddr.parseCIDR('::/128'),
  ipaddr.parseCIDR('::1/128'),
  ipaddr.parseCIDR('fc00::/7'),
  ipaddr.parseCIDR('fe80::/10'),
  ipaddr.parseCIDR('2001:db8::/32'),
  ipaddr.parseCIDR('2002::/16'),
  ipaddr.parseCIDR('64:ff9b::/96'),
  ipaddr.parseCIDR('100::/64'),
  ipaddr.parseCIDR('ff00::/8'),
] as const;

function isIPv6Address(address: ipaddr.IPv4 | ipaddr.IPv6): address is ipaddr.IPv6 {
  return address.kind() === 'ipv6';
}

export function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a >= 224 && a <= 239) ||
    a >= 240 ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  );
}

export function isPrivateIPv6(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }

  if (isIPv6Address(parsed)) {
    const ipv6 = parsed;

    if (ipv6.isIPv4MappedAddress()) {
      return isPrivateIPv4(ipv6.toIPv4Address().toString());
    }

    return BLOCKED_IPV6_SUBNETS.some(([range, prefix]) => ipv6.match(range, prefix));
  }

  return false;
}

export function isPrivateAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  const parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv4') {
    return isPrivateIPv4(address);
  }

  if (parsed.kind() === 'ipv6') {
    return isPrivateIPv6(address);
  }

  return false;
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const normalizedHostname = normalizeHostname(hostname);

  if (isBlockedHostname(normalizedHostname)) {
    throw new Error('Access to local network addresses is not allowed');
  }

  if (ipaddr.isValid(normalizedHostname)) {
    if (isPrivateAddress(normalizedHostname)) {
      throw new Error('Access to internal network addresses is not allowed');
    }
    const parsed = ipaddr.parse(normalizedHostname);
    return { address: normalizedHostname, family: parsed.kind() === 'ipv6' ? 6 : 4 };
  }

  const addresses = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('Failed to resolve remote host');
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Access to internal network addresses is not allowed');
  }

  const first = addresses[0];
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

function toHeadersObject(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    }
  }
  return result;
}

function toUint8Array(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8');
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  return Buffer.from(String(chunk), 'utf8');
}

function toLimitedWebStream(
  response: http.IncomingMessage,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let receivedBytes = 0;
  let settled = false;

  let onData: ((chunk: unknown) => void) | undefined;
  let onEnd: (() => void) | undefined;
  let onError: ((error: Error) => void) | undefined;

  const cleanup = (): void => {
    if (onData) response.off('data', onData);
    if (onEnd) response.off('end', onEnd);
    if (onError) response.off('error', onError);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        controller.error(error);
        response.destroy();
      };

      onData = (chunk: unknown): void => {
        if (settled) {
          return;
        }

        const payload = toUint8Array(chunk);
        receivedBytes += payload.byteLength;
        if (receivedBytes > maxBytes) {
          fail(new Error('Remote response exceeds size limit'));
          return;
        }

        controller.enqueue(payload);
      };

      onEnd = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        controller.close();
      };

      onError = (error: Error): void => {
        fail(error);
      };

      response.on('data', onData);
      response.on('end', onEnd);
      response.on('error', onError);
    },
    cancel() {
      if (!settled) {
        settled = true;
        cleanup();
        response.destroy();
      }
    },
  });
}

function getRequestModule(protocol: string): typeof http | typeof https {
  return protocol === 'https:' ? https : http;
}

function toRequestPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function getPort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

function normalizeHeaders(headers: Record<string, string> | undefined, host: string): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value == null) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (BLOCKED_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }
    nextHeaders[key] = value;
  }
  nextHeaders.Host = host;
  return nextHeaders;
}

function headersForRedirect(
  headers: Record<string, string> | undefined,
  fromUrl: URL,
  toUrl: URL,
): Record<string, string> | undefined {
  if (fromUrl.origin === toUrl.origin) {
    return headers;
  }

  const nextHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey === 'proxy-authorization' || lowerKey === 'cookie') {
      continue;
    }
    nextHeaders[key] = value;
  }

  return nextHeaders;
}

function assertRedirectBodyAllowed(options: RemoteRequestOptions, fromUrl: URL, toUrl: URL): void {
  if (options.body && fromUrl.origin !== toUrl.origin) {
    throw new Error('Refusing to redirect request body across origins');
  }
}

async function openRemoteResponse(
  options: RemoteRequestOptions,
  redirectCount = 0,
): Promise<{ response: http.IncomingMessage; finalUrl: string }> {
  const allowedProtocols = options.allowedProtocols ?? ['https:', 'http:'];
  const parsedUrl = new URL(options.url);

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  if (redirectCount > (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
    throw new Error('Too many redirects');
  }

  const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname);
  const requestModule = getRequestModule(parsedUrl.protocol);

  return new Promise((resolve, reject) => {
    const request = requestModule.request(
      {
        protocol: parsedUrl.protocol,
        hostname: resolvedAddress.address,
        family: resolvedAddress.family,
        servername: parsedUrl.hostname,
        port: getPort(parsedUrl),
        path: toRequestPath(parsedUrl),
        method: options.method,
        headers: normalizeHeaders(options.headers, parsedUrl.host),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && typeof location === 'string') {
          response.resume();
          const redirectUrl = new URL(location, parsedUrl);
          try {
            assertRedirectBodyAllowed(options, parsedUrl, redirectUrl);
          } catch (redirectError) {
            reject(redirectError);
            return;
          }
          void openRemoteResponse({
            ...options,
            url: redirectUrl.toString(),
            headers: headersForRedirect(options.headers, parsedUrl, redirectUrl),
          }, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        resolve({ response, finalUrl: parsedUrl.toString() });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Remote request timed out'));
    });
    request.on('error', (requestError) => reject(requestError));

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

export async function requestRemoteBuffered(options: RemoteRequestOptions): Promise<RemoteBufferedResponse> {
  const { response, finalUrl } = await openRemoteResponse(options);
  const chunks: Buffer[] = [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let receivedBytes = 0;

  return await new Promise((resolve, reject) => {
    response.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        response.destroy(new Error('Remote response exceeds size limit'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      resolve({
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? '',
        headers: toHeadersObject(response.headers),
        body: Buffer.concat(chunks),
        finalUrl,
      });
    });
    response.on('error', (responseError) => reject(responseError));
  });
}

export async function requestRemoteStream(options: RemoteRequestOptions): Promise<RemoteStreamResponse> {
  const { response, finalUrl } = await openRemoteResponse(options);
  const body = toLimitedWebStream(response, options.maxBytes ?? DEFAULT_MAX_BYTES);

  return {
    status: response.statusCode ?? 0,
    statusText: response.statusMessage ?? '',
    headers: toHeadersObject(response.headers),
    body,
    finalUrl,
  };
}
