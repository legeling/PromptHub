import type { Agent } from "node:http";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  buildProxyUrl,
  normalizeNetworkProxySettings,
  shouldBypassProxyForHostname,
} from "@prompthub/shared/utils/network-proxy";
import { getDatabase } from "../database";
import { getUserDataPath } from "../runtime-paths";
import { CoreSettingsStore } from "../settings-store";
import type { FetchRemoteBytesOptions } from "./remote-fetch";

export function readSkillNetworkSettings(): Record<string, unknown> {
  return new CoreSettingsStore({
    database: getDatabase(),
    rootPath: getUserDataPath(),
  }).read();
}

export function resolveSkillProxyUrl(
  url: URL,
  input: unknown,
): string | undefined {
  const settings = normalizeNetworkProxySettings(input);
  if (settings.mode === "direct") return undefined;
  const bypass =
    settings.mode === "manual"
      ? settings.bypass
      : (process.env.no_proxy ?? process.env.NO_PROXY ?? "");
  if (shouldBypassProxyForHostname(url.hostname, bypass)) return undefined;
  if (settings.mode === "manual") return buildProxyUrl(settings) ?? undefined;
  return (
    (url.protocol === "https:"
      ? (process.env.https_proxy ?? process.env.HTTPS_PROXY)
      : (process.env.http_proxy ?? process.env.HTTP_PROXY)) ??
    process.env.all_proxy ??
    process.env.ALL_PROXY
  );
}

function requestAgent(url: URL, proxy: unknown): Agent | undefined {
  const value = resolveSkillProxyUrl(url, proxy);
  if (!value) return undefined;
  // socks-proxy-agent 7 uses older Node Agent declarations, but implements the request agent interface.
  if (new URL(value).protocol.startsWith("socks"))
    return new SocksProxyAgent(value) as unknown as Agent;
  return url.protocol === "https:"
    ? new HttpsProxyAgent(value)
    : new HttpProxyAgent(value);
}

export function skillFetchOptions(
  settings: Record<string, unknown>,
): FetchRemoteBytesOptions {
  return {
    githubToken:
      typeof settings.githubToken === "string"
        ? settings.githubToken
        : undefined,
    requestAgent: (url) => requestAgent(url, settings.networkProxy),
  };
}

/** Per-child configuration: secrets never enter command arguments, remotes or Git config files. */
export function skillGitEnvironment(
  source: string,
  settings: Record<string, unknown>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["GIT_TRACE", "GIT_TRACE_CURL", "GIT_CURL_VERBOSE"])
    delete env[key];
  if (!source.startsWith("https://") && !source.startsWith("http://"))
    return env;
  const url = new URL(source);
  const config: Array<[string, string]> = [];
  const proxy = resolveSkillProxyUrl(url, settings.networkProxy);
  if (
    normalizeNetworkProxySettings(settings.networkProxy).mode !== "system" ||
    proxy
  )
    config.push(["http.proxy", proxy ?? ""]);
  if (
    url.hostname === "github.com" &&
    typeof settings.githubToken === "string" &&
    settings.githubToken
  ) {
    config.push([
      "http.https://github.com/.extraHeader",
      `Authorization: Basic ${Buffer.from(`x-access-token:${settings.githubToken}`).toString("base64")}`,
    ]);
  }
  const inherited = Number.parseInt(env.GIT_CONFIG_COUNT ?? "0", 10);
  const offset =
    Number.isSafeInteger(inherited) && inherited >= 0 ? inherited : 0;
  for (const [index, [key, value]] of config.entries()) {
    env[`GIT_CONFIG_KEY_${offset + index}`] = key;
    env[`GIT_CONFIG_VALUE_${offset + index}`] = value;
  }
  env.GIT_CONFIG_COUNT = String(offset + config.length);
  return env;
}
