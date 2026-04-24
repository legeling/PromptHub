import type { RegistrySkill, Skill } from "@prompthub/shared/types";

export type RegistrySkillUpdateStatus =
  | "not-installed"
  | "up-to-date"
  | "update-available"
  | "local-modified"
  | "conflict";

export interface RegistrySkillUpdateCheck {
  status: RegistrySkillUpdateStatus;
  installedSkill?: Skill;
  registrySkill: RegistrySkill;
  localHash?: string;
  installedHash?: string;
  remoteHash: string;
  remoteContent: string;
  localModified: boolean;
  remoteChanged: boolean;
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function stripTrailingWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function normalizeFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) {
    return content;
  }

  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) {
    return content;
  }

  const frontmatter = content.slice(4, endIndex).trim();
  const bodyStart = content.startsWith("\n", endIndex + 4)
    ? endIndex + 5
    : endIndex + 4;
  const body = content.slice(bodyStart);
  const sortedLines = frontmatter
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return `---\n${sortedLines.join("\n")}\n---\n${body}`;
}

export function normalizeSkillContentForHash(content: string): string {
  const normalized = stripTrailingWhitespace(normalizeLineEndings(content));
  return normalizeFrontmatter(normalized).trimEnd();
}

async function sha256Hex(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(content);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

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

export async function computeSkillContentHash(content: string): Promise<string> {
  return sha256Hex(normalizeSkillContentForHash(content));
}

export function findInstalledRegistrySkill(
  skills: Skill[],
  registrySkill: RegistrySkill,
): Skill | null {
  const slug = registrySkill.slug.toLowerCase();
  const contentUrl = registrySkill.content_url?.toLowerCase();
  const sourceUrl = registrySkill.source_url?.toLowerCase();
  const installName = (registrySkill.install_name || registrySkill.slug).toLowerCase();

  return (
    skills.find((skill) => skill.registry_slug?.toLowerCase() === slug) ||
    (contentUrl
      ? skills.find((skill) => skill.content_url?.toLowerCase() === contentUrl)
      : undefined) ||
    (sourceUrl
      ? skills.find(
          (skill) =>
            skill.source_url?.toLowerCase() === sourceUrl &&
            skill.name.toLowerCase() === installName,
        )
      : undefined) ||
    null
  );
}

export async function getRegistrySkillUpdateStatus(
  installedSkill: Skill | null,
  registrySkill: RegistrySkill,
  remoteContent = registrySkill.content,
): Promise<RegistrySkillUpdateCheck> {
  const remoteHash = await computeSkillContentHash(remoteContent);
  if (!installedSkill) {
    return {
      status: "not-installed",
      registrySkill,
      remoteHash,
      remoteContent,
      localModified: false,
      remoteChanged: true,
    };
  }

  const localContent = installedSkill.content ?? installedSkill.instructions ?? "";
  const localHash = await computeSkillContentHash(localContent);
  const installedHash = installedSkill.installed_content_hash;
  const localModified = Boolean(installedHash && localHash !== installedHash);
  const remoteChanged = installedHash
    ? remoteHash !== installedHash
    : remoteHash !== localHash || registrySkill.version !== installedSkill.version;

  let status: RegistrySkillUpdateStatus = "up-to-date";
  if (localModified && remoteChanged) {
    status = "conflict";
  } else if (localModified) {
    status = "local-modified";
  } else if (remoteChanged) {
    status = "update-available";
  }

  return {
    status,
    installedSkill,
    registrySkill,
    localHash,
    installedHash,
    remoteHash,
    remoteContent,
    localModified,
    remoteChanged,
  };
}
