import type { Agent as HttpAgent } from "http";
import http from "http";
import type { Agent as HttpsAgent } from "https";
import https from "https";
import { Readable } from "stream";
import { session } from "electron";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  ProxyAgent as UndiciProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";
import type { NetworkProxySettings } from "@prompthub/shared/types";
import {
  buildProxyUrl,
  normalizeNetworkProxySettings,
  shouldBypassProxyForHostname,
} from "@prompthub/shared/utils/network-proxy";

type RequestAgent = HttpAgent | HttpsAgent;
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
] as const;

const originalProxyEnv = new Map(
  PROXY_ENV_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch?.bind(globalThis);

let activeNetworkProxy = normalizeNetworkProxySettings(undefined);
let cachedProxyUrl: string | null = null;
let cachedHttpAgent: RequestAgent | undefined;
let cachedHttpsAgent: RequestAgent | undefined;
let cachedSocksAgent: RequestAgent | undefined;
let cachedFetchDispatcher: Dispatcher | undefined;

function resetAgentCache(): void {
  cachedProxyUrl = null;
  cachedHttpAgent = undefined;
  cachedHttpsAgent = undefined;
  cachedSocksAgent = undefined;
  cachedFetchDispatcher = undefined;
}

function setOrRestoreEnv(
  key: (typeof PROXY_ENV_KEYS)[number],
  value?: string,
): void {
  if (value === undefined) {
    const original = originalProxyEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
    return;
  }

  process.env[key] = value;
}

function applyProxyEnvironment(settings: NetworkProxySettings): void {
  const proxyUrl = buildProxyUrl(settings);
  if (settings.mode === "direct") {
    for (const key of PROXY_ENV_KEYS) delete process.env[key];
    return;
  }
  if (settings.mode === "system") {
    for (const key of PROXY_ENV_KEYS) {
      setOrRestoreEnv(key);
    }
    return;
  }
  if (!proxyUrl) {
    for (const key of PROXY_ENV_KEYS) delete process.env[key];
    return;
  }

  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"] as const) {
    setOrRestoreEnv(key, proxyUrl);
  }
  for (const key of ["http_proxy", "https_proxy", "all_proxy"] as const) {
    setOrRestoreEnv(key, proxyUrl);
  }
  setOrRestoreEnv("NO_PROXY", settings.bypass);
  setOrRestoreEnv("no_proxy", settings.bypass);
}

function getManualProxyUrlForTarget(targetUrl: URL): string | null {
  if (activeNetworkProxy.mode !== "manual") {
    return null;
  }
  if (
    shouldBypassProxyForHostname(targetUrl.hostname, activeNetworkProxy.bypass)
  ) {
    return null;
  }
  return buildProxyUrl(activeNetworkProxy);
}

function getCachedAgent<T extends RequestAgent>(
  proxyUrl: string,
  current: T | undefined,
  create: () => T,
): T {
  if (cachedProxyUrl !== proxyUrl) {
    resetAgentCache();
    cachedProxyUrl = proxyUrl;
  }
  return current ?? create();
}

export function getHttpRequestAgent(
  targetUrl: string | URL,
): RequestAgent | undefined {
  const parsedUrl =
    typeof targetUrl === "string" ? new URL(targetUrl) : targetUrl;
  const proxyUrl = getManualProxyUrlForTarget(parsedUrl);
  if (!proxyUrl) {
    return undefined;
  }

  if (activeNetworkProxy.protocol === "socks5") {
    cachedSocksAgent = getCachedAgent(
      proxyUrl,
      cachedSocksAgent,
      () => new SocksProxyAgent(proxyUrl) as unknown as RequestAgent,
    );
    return cachedSocksAgent;
  }

  if (parsedUrl.protocol === "https:") {
    cachedHttpsAgent = getCachedAgent(
      proxyUrl,
      cachedHttpsAgent,
      () => new HttpsProxyAgent(proxyUrl) as unknown as RequestAgent,
    );
    return cachedHttpsAgent;
  }

  cachedHttpAgent = getCachedAgent(
    proxyUrl,
    cachedHttpAgent,
    () => new HttpProxyAgent(proxyUrl) as unknown as RequestAgent,
  );
  return cachedHttpAgent;
}

function getFetchDispatcher(targetUrl: URL): Dispatcher | undefined {
  const proxyUrl = getManualProxyUrlForTarget(targetUrl);
  if (!proxyUrl || activeNetworkProxy.protocol === "socks5") {
    return undefined;
  }
  if (cachedProxyUrl !== proxyUrl) {
    resetAgentCache();
    cachedProxyUrl = proxyUrl;
  }
  cachedFetchDispatcher =
    cachedFetchDispatcher ?? new UndiciProxyAgent(proxyUrl);
  return cachedFetchDispatcher;
}

function getFetchUrl(input: FetchInput): URL | null {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(input);
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url);
    }
  } catch {
    return null;
  }
  return null;
}

function getFetchMethod(input: FetchInput, init?: FetchInit): string {
  if (init?.method) {
    return init.method;
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method;
  }
  return "GET";
}

function getFetchHeaders(input: FetchInput, init?: FetchInit): Headers {
  const headers =
    typeof Request !== "undefined" && input instanceof Request
      ? new Headers(input.headers)
      : new Headers();
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function headersToRequestObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function headersToResponseObject(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      result.set(key, value);
    }
  }
  return result;
}

async function normalizeFetchBody(
  body: unknown,
): Promise<Buffer | string | null> {
  if (body == null) {
    return null;
  }
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return Buffer.from(await new Response(body).arrayBuffer());
  }
  throw new Error("Unsupported fetch body for SOCKS5 proxy request");
}

async function getFetchBody(
  input: FetchInput,
  init?: FetchInit,
): Promise<Buffer | string | null> {
  if (init?.body != null) {
    return normalizeFetchBody(init.body);
  }
  if (
    typeof Request !== "undefined" &&
    input instanceof Request &&
    input.body
  ) {
    return Buffer.from(await input.clone().arrayBuffer());
  }
  return null;
}

function createAbortError(): Error {
  return new Error("The operation was aborted");
}

function createResponseFromIncomingMessage(
  response: http.IncomingMessage,
): Response {
  const status = response.statusCode ?? 200;
  const bodyAllowed = status !== 204 && status !== 304;
  if (!bodyAllowed) {
    response.resume();
  }
  const body = bodyAllowed
    ? (Readable.toWeb(response) as ReadableStream)
    : null;
  return new Response(body, {
    status,
    statusText: response.statusMessage,
    headers: headersToResponseObject(response.headers),
  });
}

async function fetchWithHttpRequestAgent(
  input: FetchInput,
  init?: FetchInit,
  redirectCount = 0,
): Promise<Response> {
  const targetUrl = getFetchUrl(input);
  if (!targetUrl) {
    throw new Error("Unsupported fetch input for proxy request");
  }

  const agent = getHttpRequestAgent(targetUrl);
  if (!agent) {
    if (!originalFetch) {
      throw new Error("fetch is not available in this runtime");
    }
    return originalFetch(input, init);
  }

  const method = getFetchMethod(input, init).toUpperCase();
  const body = await getFetchBody(input, init);
  const headers = getFetchHeaders(input, init);
  const client = targetUrl.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const request = client.request(
      targetUrl,
      {
        method,
        headers: headersToRequestObject(headers),
        agent,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        const redirectMode = init?.redirect ?? "follow";
        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          typeof location === "string" &&
          redirectMode !== "manual"
        ) {
          response.resume();
          if (redirectMode === "error") {
            reject(new Error(`Redirect blocked for ${targetUrl.href}`));
            return;
          }
          if (redirectCount >= 20) {
            reject(new Error("Too many redirects"));
            return;
          }
          const nextUrl = new URL(location, targetUrl).href;
          const nextInit = { ...init };
          if (
            statusCode === 303 ||
            ((statusCode === 301 || statusCode === 302) && method === "POST")
          ) {
            nextInit.method = "GET";
            nextInit.body = undefined;
          }
          void fetchWithHttpRequestAgent(nextUrl, nextInit, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        resolve(createResponseFromIncomingMessage(response));
      },
    );

    const abort = () => {
      request.destroy(createAbortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    request.on("close", () => {
      signal?.removeEventListener("abort", abort);
    });
    if (body != null) {
      request.write(body);
    }
    request.end();
  });
}

export async function fetchWithNetworkProxy(
  input: FetchInput,
  init?: FetchInit,
): Promise<Response> {
  // Node fetch does not consult the OS proxy/PAC configuration. Use the same
  // Chromium session that receives the application's system proxy settings.
  if (activeNetworkProxy.mode === "system") {
    return session.defaultSession.fetch(
      input instanceof URL ? input.href : input,
      init,
    );
  }
  const targetUrl = getFetchUrl(input);
  const dispatcher = targetUrl ? getFetchDispatcher(targetUrl) : undefined;
  if (
    targetUrl &&
    activeNetworkProxy.mode === "manual" &&
    activeNetworkProxy.protocol === "socks5"
  ) {
    return fetchWithHttpRequestAgent(input, init);
  }
  if (!dispatcher) {
    if (!originalFetch) {
      throw new Error("fetch is not available in this runtime");
    }
    return originalFetch(input, init);
  }

  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher,
  }) as unknown as Promise<Response>;
}

function applyGlobalFetch(settings: NetworkProxySettings): void {
  if (settings.mode === "manual") {
    globalThis.fetch = fetchWithNetworkProxy as typeof fetch;
    return;
  }
  if (originalFetch) {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

function buildElectronProxyRules(
  settings: NetworkProxySettings,
): string | undefined {
  const proxyUrl = buildProxyUrl(settings);
  if (!proxyUrl) {
    return undefined;
  }
  return proxyUrl;
}

export async function applyElectronSessionProxy(
  settings: NetworkProxySettings,
  targetSession = session.defaultSession,
): Promise<void> {
  if (settings.mode === "direct") {
    await targetSession.setProxy({ mode: "direct" });
    return;
  }

  if (settings.mode === "system") {
    await targetSession.setProxy({ mode: "system" });
    return;
  }

  const proxyRules = buildElectronProxyRules(settings);
  if (!proxyRules) {
    await targetSession.setProxy({ mode: "direct" });
    return;
  }

  await targetSession.setProxy({
    mode: "fixed_servers",
    proxyRules,
    proxyBypassRules: settings.bypass,
  });
}

export async function applyNetworkProxySettings(
  value: unknown,
): Promise<NetworkProxySettings> {
  const settings = normalizeNetworkProxySettings(value);
  activeNetworkProxy = settings;
  resetAgentCache();
  applyProxyEnvironment(settings);
  applyGlobalFetch(settings);

  try {
    await applyElectronSessionProxy(settings);
  } catch (error) {
    console.warn("Failed to apply Electron proxy settings:", error);
  }

  return settings;
}

export function getActiveNetworkProxySettings(): NetworkProxySettings {
  return activeNetworkProxy;
}
