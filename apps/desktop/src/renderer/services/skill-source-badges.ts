import type { TFunction } from "i18next";
import type { Skill } from "@prompthub/shared/types";
import type { SkillVariantBadge } from "./skill-variant-badges";
import { detectAgentPlatformSkillSource } from "./skill-agent-source";
import { isLikelyLocalSource } from "./skill-store-source";
import { detectRemoteSourceChannel } from "./skill-source-channel";

type SkillSourceBadgeInput = Pick<
  Skill,
  | "source_id"
  | "source_label"
  | "source_url"
  | "local_repo_path"
  | "source_branch"
  | "registry_slug"
  | "is_builtin"
  | "installed_at"
>;

function normalizeSourceText(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeReadableLabel(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.includes("/") ||
    isLikelyLocalSource(trimmed)
  ) {
    return null;
  }

  if (/^[a-f0-9]{32,}$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function isStoreLabel(value: string): boolean {
  return (
    /\bstore\b/i.test(value) ||
    /商店|ストア|boutique|tienda|geschäft|store/i.test(value)
  );
}

function getStoreSourceBadge(
  skill: SkillSourceBadgeInput,
  t: TFunction,
): SkillVariantBadge | null {
  const sourceText = [
    skill.source_id,
    skill.source_label,
    skill.source_url,
    skill.registry_slug,
  ]
    .map(normalizeSourceText)
    .join(" ");

  if (
    sourceText.includes("anthropics/skills") ||
    sourceText.includes("anthropic/skills")
  ) {
    return {
      key: "source-claude-code-store",
      label: t("skill.sourceBadgeClaudeCodeStore", "Claude Code Store"),
      tone: "official",
    };
  }

  if (sourceText.includes("openai/skills")) {
    return {
      key: "source-openai-codex-store",
      label: t("skill.sourceBadgeOpenAICodexStore", "OpenAI Codex Store"),
      tone: "official",
    };
  }

  if (sourceText.includes("skills.sh")) {
    return {
      key: "source-community-store",
      label: t("skill.sourceBadgeCommunityStore", "Community Store"),
      tone: "community",
    };
  }

  const readableLabel = normalizeReadableLabel(skill.source_label);
  if (
    readableLabel &&
    (isStoreLabel(readableLabel) ||
      skill.registry_slug ||
      skill.installed_at ||
      skill.is_builtin)
  ) {
    return {
      key: "source-custom-store",
      label: readableLabel,
      tone: "community",
    };
  }

  return null;
}

function isProjectSkillSourcePath(sourceUrl?: string): boolean {
  const normalized = sourceUrl?.replace(/\\/g, "/").toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }

  return /(^|\/)(\.agents|\.claude|\.gemini|\.kiro|\.cursor|\.windsurf)\/skills\//.test(
    normalized,
  );
}

function extractBranchFromSourceUrl(sourceUrl?: string): string | null {
  if (!sourceUrl || isLikelyLocalSource(sourceUrl)) {
    return null;
  }

  const treeMatch = sourceUrl.match(/\/tree\/([^/]+)(?:\/|$)/i);
  const branch = decodeURIComponent(treeMatch?.[1] || "").trim();
  return branch || null;
}

function getNonDefaultBranchBadge(
  skill: SkillSourceBadgeInput,
): SkillVariantBadge | null {
  const branch =
    skill.source_branch?.trim() || extractBranchFromSourceUrl(skill.source_url);
  if (!branch) {
    return null;
  }

  const normalized = branch.toLowerCase();
  if (normalized === "main" || normalized === "master") {
    return null;
  }

  return {
    key: `source-branch-${branch}`,
    label: branch,
    title: branch,
    tone: "branch",
  };
}

function withBranchBadge(
  badges: SkillVariantBadge[],
  skill: SkillSourceBadgeInput,
): SkillVariantBadge[] {
  const branchBadge = getNonDefaultBranchBadge(skill);
  return branchBadge ? [...badges, branchBadge] : badges;
}

export function buildMySkillSourceBadges(
  skill: SkillSourceBadgeInput,
  t: TFunction,
): SkillVariantBadge[] {
  const storeBadge = getStoreSourceBadge(skill, t);
  if (storeBadge) {
    return withBranchBadge([storeBadge], skill);
  }

  const agentSource = detectAgentPlatformSkillSource({
    sourceLabel: skill.source_label,
    sourceUrl: skill.source_url,
    localRepoPath: skill.local_repo_path,
  });
  if (agentSource) {
    return withBranchBadge(
      [
        {
          key: `source-agent-${agentSource.platformId}`,
          label: t("skill.sourceBadgeAgentPlatformImport", {
            platform: agentSource.platformName,
            defaultValue: "{{platform}} Import",
          }),
          tone: "local",
        },
      ],
      skill,
    );
  }

  if (isProjectSkillSourcePath(skill.source_url)) {
    return withBranchBadge(
      [
        {
          key: "source-project-import",
          label: t("skill.sourceBadgeProjectImport", "Project Import"),
          tone: "local",
        },
      ],
      skill,
    );
  }

  if (skill.source_url && isLikelyLocalSource(skill.source_url)) {
    return withBranchBadge(
      [
        {
          key: "source-local-import",
          label: t("skill.sourceBadgeLocalImport", "Local Import"),
          tone: "local",
        },
      ],
      skill,
    );
  }

  if (skill.source_url) {
    const remoteChannel = detectRemoteSourceChannel({
      sourceUrl: skill.source_url,
      sourceLabel: skill.source_label,
    });
    if (remoteChannel === "github") {
      return withBranchBadge(
        [
          {
            key: "source-github-import",
            label: t("skill.sourceBadgeGithubImport", "GitHub Import"),
            tone: "git",
          },
        ],
        skill,
      );
    }
    if (remoteChannel === "gitee") {
      return withBranchBadge(
        [
          {
            key: "source-gitee-import",
            label: t("skill.sourceBadgeGiteeImport", "Gitee Import"),
            tone: "git",
          },
        ],
        skill,
      );
    }
    if (remoteChannel === "gitea") {
      return withBranchBadge(
        [
          {
            key: "source-gitea-import",
            label: t("skill.sourceBadgeGiteaImport", "Gitea Import"),
            tone: "git",
          },
        ],
        skill,
      );
    }
    if (remoteChannel === "git") {
      return withBranchBadge(
        [
          {
            key: "source-git-import",
            label: t("skill.sourceBadgeGitImport", "Git Import"),
            tone: "git",
          },
        ],
        skill,
      );
    }

    return withBranchBadge(
      [
        {
          key: "source-remote-link-import",
          label: t("skill.sourceBadgeRemoteLinkImport", "Remote Link Import"),
          tone: "git",
        },
      ],
      skill,
    );
  }

  return [
    {
      key: "source-local-created",
      label: t("skill.sourceBadgeLocalCreated", "Local Created"),
      tone: "local",
    },
  ];
}
