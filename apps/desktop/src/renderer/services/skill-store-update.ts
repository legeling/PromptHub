import type { RegistrySkill, Skill } from "@prompthub/shared/types";
import { computeStableTextHash } from "@prompthub/shared/utils/skill-identity";

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
  const normalized = content.replace(/\r\n?/g, "\n");
  return normalizeFrontmatter(normalized).trimEnd();
}

export function computeSkillContentFingerprint(content: string): string {
  return computeStableTextHash(normalizeSkillContentForHash(content));
}

export async function computeSkillContentHash(content: string): Promise<string> {
  const normalized = normalizeSkillContentForHash(content);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const bytes = new TextEncoder().encode(normalized);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return computeStableTextHash(normalized);
}

export function findInstalledRegistrySkill(
  skills: Skill[],
  registrySkill: RegistrySkill,
): Skill | null {
  const slug = registrySkill.slug.toLowerCase();
  const sourceId = registrySkill.source_id?.toLowerCase();
  const contentUrl = registrySkill.content_url?.toLowerCase();
  const sourceUrl = registrySkill.source_url?.toLowerCase();
  const installName = (registrySkill.install_name || registrySkill.slug).toLowerCase();
  const hasInstalledSourceIdentity = (skill: Skill) =>
    Boolean(skill.source_id || skill.content_url || skill.source_url);

  return (
    (sourceId
      ? skills.find((skill) => skill.source_id?.toLowerCase() === sourceId)
      : undefined) ||
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
    skills.find(
      (skill) =>
        skill.registry_slug?.toLowerCase() === slug &&
        !hasInstalledSourceIdentity(skill),
    ) ||
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
  const localMatchesRemote = localHash === remoteHash;
  const localModified = localMatchesRemote
    ? false
    : Boolean(installedHash && localHash !== installedHash);
  const remoteChanged = localMatchesRemote
    ? false
    : installedHash
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
