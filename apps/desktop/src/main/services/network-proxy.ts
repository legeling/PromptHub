import type { Agent as HttpAgent } from "http";
import type { Agent as HttpsAgent } from "https";
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

function setOrRestoreEnv(key: (typeof PROXY_ENV_KEYS)[number], value?: string): void {
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
  if (settings.mode !== "manual" || !proxyUrl) {
    for (const key of PROXY_ENV_KEYS) {
      setOrRestoreEnv(key);
    }
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
  if (shouldBypassProxyForHostname(targetUrl.hostname, activeNetworkProxy.bypass)) {
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

export function getHttpRequestAgent(targetUrl: string | URL): RequestAgent | undefined {
  const parsedUrl = typeof targetUrl === "string" ? new URL(targetUrl) : targetUrl;
  const proxyUrl = getManualProxyUrlForTarget(parsedUrl);
  if (!proxyUrl) {
    return undefined;
  }

  if (activeNetworkProxy.protocol === "socks5") {
    cachedSocksAgent = getCachedAgent(proxyUrl, cachedSocksAgent, () =>
      new SocksProxyAgent(proxyUrl) as unknown as RequestAgent,
    );
    return cachedSocksAgent;
  }

  if (parsedUrl.protocol === "https:") {
    cachedHttpsAgent = getCachedAgent(proxyUrl, cachedHttpsAgent, () =>
      new HttpsProxyAgent(proxyUrl) as unknown as RequestAgent,
    );
    return cachedHttpsAgent;
  }

  cachedHttpAgent = getCachedAgent(proxyUrl, cachedHttpAgent, () =>
    new HttpProxyAgent(proxyUrl) as unknown as RequestAgent,
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

export async function fetchWithNetworkProxy(
  input: FetchInput,
  init?: FetchInit,
): Promise<Response> {
  const targetUrl = getFetchUrl(input);
  const dispatcher = targetUrl ? getFetchDispatcher(targetUrl) : undefined;
  if (!dispatcher) {
    if (!originalFetch) {
      throw new Error("fetch is not available in this runtime");
    }
    return originalFetch(input, init);
  }

  return (undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher,
  }) as unknown) as Promise<Response>;
}

function applyGlobalFetch(settings: NetworkProxySettings): void {
  if (settings.mode === "manual" && settings.protocol !== "socks5") {
    globalThis.fetch = fetchWithNetworkProxy as typeof fetch;
    return;
  }
  if (originalFetch) {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

function buildElectronProxyRules(settings: NetworkProxySettings): string | undefined {
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
