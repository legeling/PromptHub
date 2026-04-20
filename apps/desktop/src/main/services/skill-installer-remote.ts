/**
 * Remote fetching and SSRF protection for skill installation.
 *
 * Contains network-level utilities (DNS resolution, private IP detection,
 * HTTP(S) fetching) and the high-level install-from-remote methods.
 */
import * as dns from "dns/promises";
import * as http from "http";
import * as https from "https";
import * as nodeNet from "net";

// ==================== Constants ====================

const REMOTE_FETCH_TIMEOUT_MS = 30_000;
/** Total time allowed for reading the response body (protects against slowloris) */
const REMOTE_FETCH_TRANSFER_TIMEOUT_MS = 60_000;
const REMOTE_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const REMOTE_FETCH_MAX_REDIRECTS = 5;
const REMOTE_FETCH_TRUSTED_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "raw.githubusercontent.com",
  "skills.sh",
  "www.skills.sh",
]);

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

// ==================== SSRF protection ====================

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "localhost.localdomain" ||
    normalized.endsWith(".localdomain")
  );
}

export function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
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
    // CGNAT (Carrier-grade NAT)
    (a === 100 && b >= 64 && b <= 127) ||
    // Multicast
    (a >= 224 && a <= 239) ||
    // Reserved for future use
    a >= 240 ||
    // Benchmark testing
    (a === 198 && (b === 18 || b === 19)) ||
    // Documentation ranges (TEST-NET-1, TEST-NET-2, TEST-NET-3)
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  );
}

export function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedAddress = normalized.slice("::ffff:".length);
    return nodeNet.isIP(mappedAddress) === 4 && isPrivateIPv4(mappedAddress);
  }

  // Expand :: into the correct number of zero groups to get all 8 hextets
  const halves = normalized.split("::");
  let segments: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    segments = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    segments = normalized.split(":");
  }

  if (segments.length < 2) {
    return false;
  }

  const firstHextet = Number.parseInt(segments[0], 16);
  if (Number.isNaN(firstHextet)) {
    return false;
  }
  const secondHextet = Number.parseInt(segments[1], 16) || 0;

  return (
    // ULA (Unique Local Address)
    (firstHextet & 0xfe00) === 0xfc00 ||
    // Link-local
    (firstHextet & 0xffc0) === 0xfe80 ||
    // 6to4 relay
    firstHextet === 0x2002 ||
    // Teredo tunneling
    (firstHextet === 0x2001 && secondHextet === 0x0000) ||
    // Documentation
    (firstHextet === 0x2001 && secondHextet === 0x0db8) ||
    // Discard prefix
    firstHextet === 0x0100 ||
    // NAT64
    (firstHextet === 0x0064 && secondHextet === 0xff9b)
  );
}

export function isPrivateAddress(address: string): boolean {
  const family = nodeNet.isIP(address);
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return isPrivateIPv6(address);
  }
  return false;
}

function isTrustedRemoteHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return REMOTE_FETCH_TRUSTED_HOSTS.has(normalized);
}

function expandIPv6Segments(address: string): string[] | null {
  const normalized = address.toLowerCase().split("%")[0];
  if (nodeNet.isIP(normalized) !== 6) {
    return null;
  }

  const halves = normalized.split("::");
  let segments: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    segments = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    segments = normalized.split(":");
  }

  if (segments.length !== 8) {
    return null;
  }

  return segments.map((segment) => segment.padStart(4, "0"));
}

function decodeTrustedCompatibilityIPv6(address: string): string | null {
  const segments = expandIPv6Segments(address);
  if (!segments) {
    return null;
  }

  const standardMappedPrefix = ["0000", "0000", "0000", "0000", "0000", "ffff"];
  const translatedPrefix = ["0000", "0000", "0000", "0000", "ffff", "0000"];
  const prefix = segments.slice(0, 6);
  const hasSupportedPrefix =
    prefix.every((segment, index) => segment === standardMappedPrefix[index]) ||
    prefix.every((segment, index) => segment === translatedPrefix[index]);
  if (!hasSupportedPrefix) {
    return null;
  }

  const high = Number.parseInt(segments[6], 16);
  const low = Number.parseInt(segments[7], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) {
    return null;
  }

  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isTrustedRemoteCompatibilityAddress(address: string): boolean {
  if (address.startsWith("198.18.") || address.startsWith("198.19.")) {
    return true;
  }

  const decodedIPv4 = decodeTrustedCompatibilityIPv6(address);
  return decodedIPv4 !== null && isTrustedRemoteCompatibilityAddress(decodedIPv4);
}

// ==================== HTTP helpers ====================

function toRequestPath(parsedUrl: URL): string {
  return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function getRequestModule(protocol: string): typeof http | typeof https {
  return protocol === "https:" ? https : http;
}

function getSingleHeaderValue(
  header: string | string[] | undefined,
): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

export async function resolvePublicAddress(
  hostname: string,
): Promise<ResolvedAddress> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Access to local network addresses is not allowed");
  }

  if (nodeNet.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      if (
        isTrustedRemoteHostname(hostname) &&
        isTrustedRemoteCompatibilityAddress(hostname)
      ) {
        return { address: hostname, family: nodeNet.isIP(hostname) as 4 | 6 };
      }
      throw new Error("Access to internal network addresses is not allowed");
    }
    return { address: hostname, family: nodeNet.isIP(hostname) as 4 | 6 }; // Safe: isIP returns 0|4|6, and 0 is caught above
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Failed to resolve remote host");
  }

  const trustedCompatibilityAddresses = addresses.filter((entry) =>
    isTrustedRemoteCompatibilityAddress(entry.address),
  );
  if (
    trustedCompatibilityAddresses.length > 0 &&
    trustedCompatibilityAddresses.length === addresses.length &&
    isTrustedRemoteHostname(hostname)
  ) {
    const firstTrustedAddress = trustedCompatibilityAddresses[0];
    return {
      address: firstTrustedAddress.address,
      family: firstTrustedAddress.family === 6 ? 6 : 4,
    };
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Access to internal network addresses is not allowed");
  }

  const firstAddress = addresses[0];
  return {
    address: firstAddress.address,
    family: firstAddress.family === 6 ? 6 : 4,
  };
}

export async function fetchRemoteText(
  targetUrl: string,
  redirectCount = 0,
): Promise<string> {
  if (redirectCount > REMOTE_FETCH_MAX_REDIRECTS) {
    throw new Error("Too many redirects while fetching remote content");
  }

  const parsedUrl = new URL(targetUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
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
        port: parsedUrl.port
          ? Number(parsedUrl.port)
          : parsedUrl.protocol === "https:"
            ? 443
            : 80,
        path: toRequestPath(parsedUrl),
        method: "GET",
        headers: {
          Host: parsedUrl.host,
          "User-Agent": "PromptHub/remote-skill-fetch",
          Accept: "text/plain, application/json;q=0.9, */*;q=0.1",
        },
        timeout: REMOTE_FETCH_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          typeof location === "string"
        ) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          void fetchRemoteText(nextUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          const rateLimitRemaining = getSingleHeaderValue(
            response.headers["x-ratelimit-remaining"],
          );
          if (
            parsedUrl.hostname === "api.github.com" &&
            (statusCode === 403 || statusCode === 429) &&
            rateLimitRemaining === "0"
          ) {
            response.resume();
            reject(new Error("GitHub API rate limit reached"));
            return;
          }
          response.resume();
          reject(new Error(`HTTP ${statusCode} fetching remote content`));
          return;
        }

        const contentLengthHeader = response.headers["content-length"];
        const contentLength = Array.isArray(contentLengthHeader)
          ? Number.parseInt(contentLengthHeader[0], 10)
          : Number.parseInt(contentLengthHeader ?? "", 10);
        if (
          Number.isFinite(contentLength) &&
          contentLength > REMOTE_FETCH_MAX_BYTES
        ) {
          response.resume();
          reject(new Error("Remote content exceeds size limit"));
          return;
        }

        let receivedBytes = 0;
        const chunks: Buffer[] = [];

        // Guard against slowloris: cap total time spent reading the body
        const transferTimer = setTimeout(() => {
          response.destroy(
            new Error(
              "Remote content transfer timed out (slowloris protection)",
            ),
          );
        }, REMOTE_FETCH_TRANSFER_TIMEOUT_MS);

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > REMOTE_FETCH_MAX_BYTES) {
            response.destroy(new Error("Remote content exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          clearTimeout(transferTimer);
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        response.on("error", (error) => {
          clearTimeout(transferTimer);
          reject(error);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Remote content request timed out"));
    });
    request.on("error", (error) => reject(error));
    request.end();
  });
}
