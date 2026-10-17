import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET } from "../../services/shared-skill-distribution-target";

export const SHARED_TARGET_ID = SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET.id;

/** Selection stores pending toggles; installed state remains authoritative. */
export function isDistributionTargetSelected(
  id: string,
  installed: Record<string, boolean>,
  changes: Set<string>,
): boolean {
  return Boolean(installed[id]) !== changes.has(id);
}

export function selectNativeDistributionTargets(
  platforms: SkillPlatform[],
  installed: Record<string, boolean>,
  changes: Set<string>,
): Set<string> {
  const next = new Set(changes.has(SHARED_TARGET_ID) ? [SHARED_TARGET_ID] : []);
  for (const platform of platforms) {
    if (platform.id !== SHARED_TARGET_ID && !installed[platform.id])
      next.add(platform.id);
  }
  return next;
}

export function summarizeDistributionSelection(
  platforms: SkillPlatform[],
  installed: Record<string, boolean>,
  changes: Set<string>,
): {
  platformCount: number;
  sharedSelected: boolean;
  installs: number;
  removals: number;
  duplicateDiscovery: boolean;
} {
  const selected = platforms.filter((p) =>
    isDistributionTargetSelected(p.id, installed, changes),
  );
  const sharedSelected = selected.some((p) => p.id === SHARED_TARGET_ID);
  return {
    platformCount: selected.filter((p) => p.id !== SHARED_TARGET_ID).length,
    sharedSelected,
    installs: platforms.filter((p) => changes.has(p.id) && !installed[p.id])
      .length,
    removals: platforms.filter((p) => changes.has(p.id) && installed[p.id])
      .length,
    duplicateDiscovery:
      sharedSelected &&
      selected.some((p) =>
        ["gemini", "augment", "windsurf", "opencode"].includes(p.id),
      ),
  };
}
