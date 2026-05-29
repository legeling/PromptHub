import type { SkillLocalFileEntry } from "../types/skill";

const DIRECTORY_FINGERPRINT_EXCLUDES = [
  ".git/",
  ".prompthub/",
  "node_modules/",
];

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

function shouldIgnoreEntry(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized === ".DS_Store") {
    return true;
  }
  return DIRECTORY_FINGERPRINT_EXCLUDES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

export function computeDirectoryFingerprint(
  entries: Array<Pick<SkillLocalFileEntry, "path" | "content" | "isDirectory">>,
): string {
  const manifest = entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      path: entry.path.replace(/\\/g, "/").replace(/^\.\//, ""),
      content: entry.content,
    }))
    .filter((entry) => !shouldIgnoreEntry(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}:${computeStableTextHash(entry.content)}`)
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
