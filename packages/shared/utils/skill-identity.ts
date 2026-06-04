import type {
  SkillLocalFileBufferEntry,
  SkillLocalFileEntry,
} from "../types/skill";

const DIRECTORY_FINGERPRINT_EXCLUDES = [
  ".git/",
  ".prompthub/",
  "node_modules/",
];

const GENERATED_DIRECTORY_NAMES = new Set([
  "__pycache__",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".vitest",
  ".vite",
  ".parcel-cache",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "coverage",
  ".nyc_output",
  ".tox",
  ".nox",
  ".npm",
  ".pnpm-store",
  ".sass-cache",
  ".tmp",
  "tmp",
  "temp",
]);

const GENERATED_PATH_PREFIXES = [".yarn/cache/"];

const GENERATED_FILE_SUFFIXES = [
  ".pyc",
  ".pyo",
  ".log",
  ".tmp",
  ".temp",
  ".swp",
  ".swo",
  ".tsbuildinfo",
];

const GENERATED_FILE_PREFIXES = [
  "npm-debug.log",
  "yarn-debug.log",
  "yarn-error.log",
  "pnpm-debug.log",
];

const GENERATED_FILE_NAMES = new Set([
  ".coverage",
  ".eslintcache",
  "Thumbs.db",
  "desktop.ini",
]);

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function stripTrailingWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function normalizeTextContent(content: string): string {
  return stripTrailingWhitespace(normalizeLineEndings(content)).trimEnd();
}

function fallbackHashHex(content: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= code + index;
    hash2 = Math.imul(hash2, 0x811c9dc5);
  }
  const fragment = [hash1, hash2, hash1 ^ hash2, Math.imul(hash1, hash2)]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${fragment}${fragment}`.slice(0, 64);
}

export function computeStableTextHash(content: string): string {
  return fallbackHashHex(normalizeTextContent(content));
}

export function computeStableBinaryHash(data: Uint8Array): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    hash1 ^= value;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= value + index;
    hash2 = Math.imul(hash2, 0x811c9dc5);
  }
  const fragment = [hash1, hash2, hash1 ^ hash2, Math.imul(hash1, hash2)]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${fragment}${fragment}`.slice(0, 64);
}

export function shouldIgnoreSkillDirectoryEntry(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) {
    return true;
  }
  const pathParts = normalized.split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] ?? "";
  if (
    fileName === ".DS_Store" ||
    GENERATED_FILE_NAMES.has(fileName) ||
    fileName.startsWith(".coverage.") ||
    fileName.endsWith("~")
  ) {
    return true;
  }
  if (
    GENERATED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    pathParts.some((part) => GENERATED_DIRECTORY_NAMES.has(part)) ||
    GENERATED_FILE_PREFIXES.some((prefix) => fileName.startsWith(prefix)) ||
    GENERATED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  ) {
    return true;
  }
  return DIRECTORY_FINGERPRINT_EXCLUDES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

type TextDirectoryFingerprintEntry = Pick<
  SkillLocalFileEntry,
  "path" | "content" | "isDirectory"
>;

type BinaryDirectoryFingerprintEntry = Pick<SkillLocalFileBufferEntry, "path" | "data"> & {
  isDirectory?: false;
};

type DirectoryFingerprintEntry =
  | TextDirectoryFingerprintEntry
  | BinaryDirectoryFingerprintEntry;

function isBinaryDirectoryFingerprintEntry(
  entry: DirectoryFingerprintEntry,
): entry is BinaryDirectoryFingerprintEntry {
  return "data" in entry;
}

function isTextDirectoryFingerprintEntry(
  entry: DirectoryFingerprintEntry,
): entry is TextDirectoryFingerprintEntry {
  return "content" in entry;
}

function getEntryContentHash(entry: DirectoryFingerprintEntry): string {
  if (isBinaryDirectoryFingerprintEntry(entry) && entry.data instanceof Uint8Array) {
    return computeStableBinaryHash(entry.data);
  }
  if (!isTextDirectoryFingerprintEntry(entry)) {
    return computeStableTextHash("");
  }
  return computeStableTextHash(entry.content);
}

export function computeDirectoryFingerprint(
  entries: DirectoryFingerprintEntry[],
): string {
  const manifest = entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      path: entry.path.replace(/\\/g, "/").replace(/^\.\//, ""),
      contentHash: getEntryContentHash(entry),
    }))
    .filter((entry) => !shouldIgnoreSkillDirectoryEntry(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}:${entry.contentHash}`)
    .join("\n");

  return computeStableTextHash(manifest);
}

export function computeDirectoryFingerprintFromHashes(
  entries: Array<{ path: string; contentHash: string; isDirectory?: boolean }>,
): string {
  const manifest = entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      path: entry.path.replace(/\\/g, "/").replace(/^\.\//, ""),
      contentHash: entry.contentHash,
    }))
    .filter((entry) => !shouldIgnoreSkillDirectoryEntry(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}:${entry.contentHash}`)
    .join("\n");

  return computeStableTextHash(manifest);
}

export interface SkillSourceIdentityInput {
  sourceType: string;
  sourceUrl?: string;
  branch?: string;
  directory?: string;
  skillPath?: string;
}

function normalizeIdentityField(value?: string): string {
  return (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

export function buildSkillSourceId(input: SkillSourceIdentityInput): string {
  const key = [
    normalizeIdentityField(input.sourceType),
    normalizeIdentityField(input.sourceUrl),
    normalizeIdentityField(input.branch),
    normalizeIdentityField(input.directory),
    normalizeIdentityField(input.skillPath),
  ].join("|");

  return computeStableTextHash(key);
}
