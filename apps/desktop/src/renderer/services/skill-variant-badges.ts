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
    | "directory"
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
  return ["main", "master", "stable", "release"].includes(normalized);
}

function isDevBranch(branch?: string): boolean {
  const normalized = normalizeBranch(branch);
  return ["dev", "develop", "beta", "next", "canary", "nightly", "preview", "alpha"].includes(normalized);
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
    typeof skill.source_label === "string" &&
    skill.source_label.trim().startsWith("http") &&
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

function shortenDirectory(directory: string): string {
  const normalized = directory.replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `.../${parts.slice(-2).join("/")}`;
}

function getBranchBadge(branch: string, t: TFunction): SkillVariantBadge {
  if (isStableBranch(branch)) {
    return {
      key: `branch-${branch}`,
      tone: "stable",
      label: t("skill.variantBadgeStable", "Stable"),
      title: branch,
    };
  }

  if (isDevBranch(branch)) {
    return {
      key: `branch-${branch}`,
      tone: "dev",
      label: t("skill.variantBadgeDev", "Dev"),
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

function getDirectoryBadge(directory: string): SkillVariantBadge {
  return {
    key: `directory-${directory}`,
    tone: "directory",
    label: shortenDirectory(directory),
    title: directory,
  };
}

export function buildSkillVariantBadges(
  skill: BadgeSource,
  t: TFunction,
  options?: BuildBadgeOptions,
): SkillVariantBadge[] {
  const badges: SkillVariantBadge[] = [];
  const { branch: inferredBranch, directory: inferredDirectory } =
    extractBranchAndDirectoryFromUrl(skill.source_url);
  const branch = skill.source_branch?.trim() || inferredBranch;
  const directory = skill.source_directory?.trim() || inferredDirectory;

  badges.push(getSourceBadge(skill, t));

  if (branch) {
    badges.push(getBranchBadge(branch, t));
  }

  if (directory) {
    badges.push(getDirectoryBadge(directory));
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
