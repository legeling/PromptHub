import type { RegistrySkill } from "@prompthub/shared/types";

export interface RemoteStoreEntryLike {
  skills?: unknown;
}

export function getRemoteStoreSkills(
  entry: RemoteStoreEntryLike | null | undefined,
): RegistrySkill[] {
  return Array.isArray(entry?.skills) ? entry.skills : [];
}

export function getRemoteStoreSkillCount(
  entry: RemoteStoreEntryLike | null | undefined,
): number {
  return getRemoteStoreSkills(entry).length;
}
