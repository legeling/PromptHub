import { getHttpRequestAgent } from "./network-proxy";
import {
  fetchRemoteText as fetchText,
  fetchRemoteBytes as fetchBytes,
  type FetchRemoteTextOptions,
  type FetchRemoteBytesOptions,
} from "@prompthub/core/skills/remote-fetch";
export {
  resolvePublicAddress,
  isBlockedHostname,
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateAddress,
  shouldAttachGithubAuth,
  getRemoteFetchMaxBytes,
} from "@prompthub/core/skills/remote-fetch";
export type {
  ResolvePublicAddressOptions,
  FetchRemoteTextOptions,
  FetchRemoteBytesOptions,
} from "@prompthub/core/skills/remote-fetch";
export function fetchRemoteText(
  url: string,
  redirects = 0,
  options: FetchRemoteTextOptions = {},
): Promise<string> {
  return fetchText(url, redirects, {
    ...options,
    requestAgent: getHttpRequestAgent,
  });
}
export function fetchRemoteBytes(
  url: string,
  redirects = 0,
  options: FetchRemoteBytesOptions = {},
): Promise<Uint8Array> {
  return fetchBytes(url, redirects, {
    ...options,
    requestAgent: getHttpRequestAgent,
  });
}
