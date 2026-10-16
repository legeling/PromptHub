import path from "node:path";

export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES_PER_DOMAIN = 512;
const MAX_RECOVERY_PATHS = 128;
const MAX_TEXT_LENGTH = 4096;

export interface MarketplaceSourceRecord {
  id: string;
  name: string;
  type: "marketplace-json" | "git-repo" | "local-dir";
  url: string;
  branch?: string;
  directory?: string;
  enabled: boolean;
  order: number;
  createdAt: number;
}

export function parsePersistedState(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  const parsed =
    typeof value === "string" ? parseJson(value, "settings") : value;
  const record = asRecord(parsed);
  return asRecord(record.state ?? record);
}

export function parseSources(value: unknown): MarketplaceSourceRecord[] {
  const state = parsePersistedState(value);
  const raw = state.customStoreSources;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SOURCES_PER_DOMAIN) {
    throw new Error("Invalid renderer marketplace source collection");
  }
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    const source = asRecord(entry);
    const id = requireSafeId(source.id, "source id");
    if (seen.has(id))
      throw new Error(`Duplicate renderer marketplace source: ${id}`);
    seen.add(id);
    const type = source.type;
    if (
      type !== "marketplace-json" &&
      type !== "git-repo" &&
      type !== "local-dir"
    ) {
      throw new Error(
        `Invalid renderer marketplace source type: ${String(type)}`,
      );
    }
    const url = requireBoundedText(source.url, "source url", MAX_TEXT_LENGTH);
    validateSourceLocation(type, url);
    return {
      id,
      name: requireBoundedText(source.name, "source name", 256),
      type,
      url,
      branch: optionalBoundedText(source.branch, "source branch", 256),
      directory: optionalSafeRelativePath(source.directory),
      enabled: source.enabled !== false,
      order: normalizeInteger(source.order, index, 0, MAX_SOURCES_PER_DOMAIN),
      createdAt: normalizeInteger(
        source.createdAt,
        0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    };
  });
}

export function parseRecoveryPaths(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const parsed =
    typeof value === "string" ? parseJson(value, "recovery paths") : value;
  if (!Array.isArray(parsed) || parsed.length > MAX_RECOVERY_PATHS) {
    throw new Error("Invalid renderer recovery path registry");
  }
  return Array.from(
    new Set(
      parsed.map((entry) => {
        const candidate = requireBoundedText(
          entry,
          "recovery path",
          MAX_TEXT_LENGTH,
        );
        if (!path.isAbsolute(candidate) || candidate.includes("\0")) {
          throw new Error(`Invalid renderer recovery path: ${candidate}`);
        }
        return path.normalize(candidate);
      }),
    ),
  );
}

export function normalizeDeviceId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireSafeId(value, "device id");
}

export function validateSourceLocation(
  type: MarketplaceSourceRecord["type"],
  value: string,
): void {
  if (type === "local-dir") {
    if (!path.isAbsolute(value) || value.includes("\0")) {
      throw new Error("Invalid local marketplace source path");
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid marketplace source URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Unsafe marketplace source URL");
  }
}

export function optionalSafeRelativePath(value: unknown): string | undefined {
  const text = optionalBoundedText(value, "source directory", MAX_TEXT_LENGTH);
  if (!text) return undefined;
  const normalized = text.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe marketplace source directory");
  }
  return normalized;
}

export function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid renderer ${label}`);
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function requireJsonRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const record = asRecord(value);
  requireJsonValue(record, label);
  return record;
}

export function requireJsonValue(value: unknown, label: string): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES
    ) {
      throw new Error();
    }
    return JSON.parse(serialized);
  } catch {
    throw new Error(`Invalid renderer ${label}`);
  }
}

export function requireSafeId(value: unknown, label: string): string {
  const text = requireBoundedText(value, label, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(text)) {
    throw new Error(`Invalid renderer ${label}`);
  }
  return text;
}

export function requireBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error(`Invalid renderer ${label}`);
  }
  return value.trim();
}

export function optionalBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireBoundedText(value, label, maxLength);
}

export function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}
