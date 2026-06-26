import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  type NetworkProxyMode,
  type NetworkProxyProtocol,
  type NetworkProxySettings,
} from '../types/settings';

const NETWORK_PROXY_MODES = new Set<NetworkProxyMode>([
  'system',
  'direct',
  'manual',
]);

const NETWORK_PROXY_PROTOCOLS = new Set<NetworkProxyProtocol>([
  'http',
  'https',
  'socks5',
]);

function sanitizeProxyText(value: unknown, maxLength = 512): string {
  return typeof value === 'string'
    ? value.replace(/[\r\n\x00-\x1f\x7f]/g, '').trim().slice(0, maxLength)
    : '';
}

function normalizeProxyMode(value: unknown): NetworkProxyMode {
  return NETWORK_PROXY_MODES.has(value as NetworkProxyMode)
    ? (value as NetworkProxyMode)
    : DEFAULT_NETWORK_PROXY_SETTINGS.mode;
}

function normalizeProxyProtocol(value: unknown): NetworkProxyProtocol {
  return NETWORK_PROXY_PROTOCOLS.has(value as NetworkProxyProtocol)
    ? (value as NetworkProxyProtocol)
    : DEFAULT_NETWORK_PROXY_SETTINGS.protocol;
}

function normalizeProxyPort(value: unknown): number {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 65535) {
    return DEFAULT_NETWORK_PROXY_SETTINGS.port;
  }
  return numberValue;
}

function normalizeBypass(value: unknown): string {
  const sanitized =
    typeof value === 'string'
      ? value.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').trim().slice(0, 2048)
      : '';
  return sanitized
    .split(/[,;\r\n]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',');
}

function parseProxyHostUrl(
  host: string,
): Partial<Pick<NetworkProxySettings, 'protocol' | 'host' | 'port' | 'username' | 'password'>> {
  if (!host.includes('://')) {
    return { host };
  }

  try {
    const parsed = new URL(host);
    const protocol = parsed.protocol.replace(/:$/, '');
    return {
      protocol: normalizeProxyProtocol(protocol),
      host: parsed.hostname,
      port: parsed.port ? normalizeProxyPort(parsed.port) : undefined,
      username: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
    };
  } catch {
    return { host };
  }
}

export function normalizeNetworkProxySettings(
  value: unknown,
): NetworkProxySettings {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<NetworkProxySettings>)
      : {};
  const parsedHost = parseProxyHostUrl(sanitizeProxyText(record.host));

  return {
    mode: normalizeProxyMode(record.mode),
    protocol: normalizeProxyProtocol(parsedHost.protocol ?? record.protocol),
    host: sanitizeProxyText(parsedHost.host ?? record.host),
    port: normalizeProxyPort(parsedHost.port ?? record.port),
    username: sanitizeProxyText(parsedHost.username ?? record.username),
    password: sanitizeProxyText(parsedHost.password ?? record.password, 1024),
    bypass:
      normalizeBypass(record.bypass) || DEFAULT_NETWORK_PROXY_SETTINGS.bypass,
  };
}

export function buildProxyUrl(settings: NetworkProxySettings): string | null {
  const proxy = normalizeNetworkProxySettings(settings);
  if (proxy.mode !== 'manual' || !proxy.host || !proxy.port) {
    return null;
  }

  const host = proxy.host.includes(':') && !proxy.host.startsWith('[')
    ? `[${proxy.host}]`
    : proxy.host;
  const auth =
    proxy.username || proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
  return `${proxy.protocol}://${auth}${host}:${proxy.port}`;
}

export function splitProxyBypassRules(value: string): string[] {
  return normalizeBypass(value)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldBypassProxyForHostname(
  hostname: string,
  bypass: string,
): boolean {
  const normalizedHost = hostname.trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  return splitProxyBypassRules(bypass).some((rule) => {
    if (rule === '<local>') {
      return !normalizedHost.includes('.');
    }
    if (rule === normalizedHost) {
      return true;
    }
    if (rule.startsWith('*.')) {
      return normalizedHost.endsWith(rule.slice(1));
    }
    if (rule.startsWith('.')) {
      return normalizedHost.endsWith(rule);
    }
    return false;
  });
}
