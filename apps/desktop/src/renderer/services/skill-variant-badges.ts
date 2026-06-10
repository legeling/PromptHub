import type { TFunction } from "i18next";
import type { RegistrySkill, Skill } from "@prompthub/shared/types";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { isLikelyLocalSource } from "./skill-store-source";

type BadgeSource = Partial<
  Pick<
    RegistrySkill,
    "source_url" | "store_url" | "source_label" | "source_branch" | "source_directory"
  >
> &
  Partial<Pick<Skill, "is_builtin">>;

export interface SkillVariantBadge {
  key: string;
  label: string;
  title?: string;
  tone:
    | "official"
    | "community"
    | "local"
    | "git"
    | "stable"
    | "dev"
    | "branch"
    | "installed"
    | "update";
}

interface BuildBadgeOptions {
  hasUpdate?: boolean;
  isInstalled?: boolean;
}

function normalizeBranch(branch?: string): string {
  return branch?.trim().toLowerCase() ?? "";
}

function isStableBranch(branch?: string): boolean {
  const normalized = normalizeBranch(branch);
  return ["stable", "release"].includes(normalized);
}

function isDefaultBranch(branch?: string): boolean {
  const normalized = normalizeBranch(branch);
  return normalized === "main" || normalized === "master";
}

function isDevBranch(branch?: string): boolean {
  const normalized = normalizeBranch(branch);
  return [
    "dev",
    "develop",
    "beta",
    "next",
    "canary",
    "nightly",
    "preview",
    "alpha",
  ].includes(normalized);
}

function isHttpUrl(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getOfficialRepoLabel(skill: BadgeSource): string | null {
  const candidates = [skill.source_label, skill.source_url]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());

  for (const candidate of candidates) {
    if (
      candidate.includes("anthropics/skills") ||
      candidate.includes("anthropic/skills") ||
      candidate.includes("openai/skills")
    ) {
      return candidate;
    }
  }

  return null;
}

function inferSourceTone(skill: BadgeSource): SkillVariantBadge["tone"] {
  if (getOfficialRepoLabel(skill)) {
    return "official";
  }

  if (typeof skill.store_url === "string" && skill.store_url.includes("skills.sh")) {
    return "community";
  }

  if (
    isHttpUrl(skill.source_label) &&
    !skill.source_branch
  ) {
    return "community";
  }

  if (
    (typeof skill.source_url === "string" && isLikelyLocalSource(skill.source_url)) ||
    (typeof skill.source_label === "string" && isLikelyLocalSource(skill.source_label))
  ) {
    return "local";
  }

  return "git";
}

function getSourceBadge(skill: BadgeSource, t: TFunction): SkillVariantBadge {
  const tone = inferSourceTone(skill);

  return {
    key: `source-${tone}`,
    tone,
    label:
      tone === "official"
        ? t("skill.sourceBadgeOfficial", "Official")
        : tone === "community"
          ? t("skill.sourceBadgeCommunity", "Community")
          : tone === "local"
            ? t("skill.sourceBadgeLocal", "Local")
            : t("skill.sourceBadgeGit", "Git"),
  };
}

function extractBranchAndDirectoryFromUrl(
  sourceUrl?: string,
): { branch?: string; directory?: string } {
  if (!sourceUrl || isLikelyLocalSource(sourceUrl)) {
    return {};
  }

  const treeMatch = sourceUrl.match(/\/tree\/([^/]+)(?:\/(.*))?$/i);
  if (!treeMatch) {
    return {};
  }

  return {
    branch: decodeURIComponent(treeMatch[1] || "").trim() || undefined,
    directory: decodeURIComponent(treeMatch[2] || "")
      .trim()
      .replace(/^\/+|\/+$/g, "") || undefined,
  };
}

function getBranchBadge(branch: string): SkillVariantBadge {
  if (isStableBranch(branch)) {
    return {
      key: `branch-${branch}`,
      tone: "stable",
      label: branch,
      title: branch,
    };
  }

  if (isDevBranch(branch)) {
    return {
      key: `branch-${branch}`,
      tone: "dev",
      label: branch,
      title: branch,
    };
  }

  return {
    key: `branch-${branch}`,
    tone: "branch",
    label: branch,
    title: branch,
  };
}

export function buildSkillVariantBadges(
  skill: BadgeSource,
  t: TFunction,
  options?: BuildBadgeOptions,
): SkillVariantBadge[] {
  const badges: SkillVariantBadge[] = [];
  const { branch: inferredBranch } =
    extractBranchAndDirectoryFromUrl(skill.source_url);
  const branch = skill.source_branch?.trim() || inferredBranch;

  badges.push(getSourceBadge(skill, t));

  if (branch && !isDefaultBranch(branch)) {
    badges.push(getBranchBadge(branch));
  }

  if (options?.hasUpdate) {
    badges.push({
      key: "status-update",
      tone: "update",
      label: t("skill.updateAvailable", "Update available"),
    });
  } else if (options?.isInstalled) {
    badges.push({
      key: "status-installed",
      tone: "installed",
      label: t("skill.imported", "Imported"),
    });
  }

  return badges;
}

export function inferSkillVariantSourceDebugLabel(skill: BadgeSource): string | null {
  if (skill.source_label?.trim()) {
    return skill.source_label.trim();
  }

  if (skill.source_url?.trim()) {
    const parsed = parseGitRepo(skill.source_url);
    if (parsed) {
      return `${parsed.owner}/${parsed.repo}`;
    }
  }

  return null;
}
