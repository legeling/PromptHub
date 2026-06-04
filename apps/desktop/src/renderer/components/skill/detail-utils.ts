import type { TFunction } from "i18next";
import type {
  SafetyScanAIConfig,
  Skill,
  SkillSafetyFinding,
  SkillVersion,
} from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type { AIModelConfig } from "../../stores/settings.store";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import { detectAgentPlatformSkillSource } from "../../services/skill-agent-source";
import { detectRemoteSourceChannel } from "../../services/skill-source-channel";

export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface ImmersiveSegment {
  type: "original" | "translation";
  text: string;
}

/**
 * Strip YAML frontmatter from SKILL.md content.
 * 从 SKILL.md 内容中剥离 YAML frontmatter。
 */
export function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return trimmed;

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return trimmed;
  return trimmed.slice(endIdx + 3).trim();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSkillTranslationError(
  error: unknown,
  t: TFunction,
): string {
  const rawMessage = getErrorMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (rawMessage === "AI_NOT_CONFIGURED") {
    return t(
      "skill.aiNotConfiguredDetailed",
      "No usable AI translation model is configured. Please configure a chat model in Settings, or fix the selected translation model.",
    );
  }

  if (
    normalized.includes("(504)") ||
    normalized.includes(" 504") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("网关超时")
  ) {
    return t(
      "skill.translateGatewayTimeout",
      "The AI service timed out while translating. Please try again in a moment, or switch to a faster / more stable model endpoint.",
    );
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network request failed") ||
    normalized.includes("network timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("网络请求失败")
  ) {
    return t(
      "skill.translateNetworkError",
      "The translation request could not reach the AI service. Please check your network and API endpoint, then try again.",
    );
  }

  return `${t("skill.translateFailed", "Translation failed")}: ${rawMessage}`;
}

export function formatSkillSafetyScanError(
  error: unknown,
  t: TFunction,
): string {
  const rawMessage = getErrorMessage(error);

  if (rawMessage === "AI_NOT_CONFIGURED") {
    return t(
      "skill.configureAiFirst",
      "Please configure an AI model in settings first",
    );
  }

  if (rawMessage === "SAFETY_SCAN_BLOCKED_SOURCE") {
    return t(
      "skill.safetyScanBlockedSource",
      "Safety scan blocked this source because it resolves to an internal or restricted address.",
    );
  }

  return `${t("skill.safetyScanFailed", "Safety scan failed")}: ${rawMessage}`;
}

export function formatSkillInstallError(error: unknown, t: TFunction): string {
  const rawMessage = getErrorMessage(error);
  return `${t("skill.storeInstallFailed", "Install failed")}: ${rawMessage}`;
}

export interface SkillSourceMeta {
  kind: "github" | "remote" | "local";
  value: string;
  displayValue: string;
  shortValue: string;
  sourceLabel: string;
}

function normalizeRemoteDisplayValue(value: string): string {
  return value.replace(/^https?:\/\/(www\.)?/i, "").replace(/^git@/i, "");
}

function isLikelyRemoteGitUrl(value: string): boolean {
  return /^(?:https?:\/\/|git@).+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/tree\/.*)?$/i.test(
    value.trim(),
  );
}

export interface GitHubMarkdownBase {
  hrefBase: string;
  imageBase: string;
}

export interface DiffLine {
  type: "add" | "remove" | "unchanged";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface GroupedSkillSafetyFinding {
  code: string;
  severity: SkillSafetyFinding["severity"];
  title: string;
  detail: string;
  count: number;
  filePaths: string[];
  evidences: string[];
  findings: SkillSafetyFinding[];
}

export function getProtocolDisplayLabel(
  protocolType: Skill["protocol_type"],
): string {
  switch (protocolType) {
    case "skill":
      return "SKILL.md";
    case "mcp":
      return "MCP";
    case "claude-code":
      return "Claude Code";
    default:
      return protocolType;
  }
}

export function getSkillSourceMeta(
  skill: Skill,
  t?: TFunction,
): SkillSourceMeta | null {
  const sourceValue = skill.source_url || skill.local_repo_path;
  if (!sourceValue) {
    return null;
  }

  if (/^https?:\/\/github\.com\//i.test(sourceValue)) {
    return {
      kind: "github",
      value: sourceValue,
      displayValue: sourceValue.replace(
        /^https?:\/\/(www\.)?github\.com\//i,
        "",
      ),
      shortValue: sourceValue.replace(/^https?:\/\/(www\.)?github\.com\//i, ""),
      sourceLabel:
        t?.(
          skill.registry_slug
            ? "skill.sourceGithubStore"
            : "skill.sourceGithubRepo",
          skill.registry_slug
            ? "Imported from GitHub / Skill Store"
            : "Imported from GitHub",
        ) ||
        (skill.registry_slug
          ? "Imported from GitHub / Skill Store"
          : "Imported from GitHub"),
    };
  }

  const remoteChannel = detectRemoteSourceChannel({
    sourceUrl: sourceValue,
    sourceLabel: skill.source_label,
  });
  const isRemoteGitSource =
    isLikelyRemoteGitUrl(sourceValue) ||
    remoteChannel === "github" ||
    remoteChannel === "gitee" ||
    remoteChannel === "gitea" ||
    remoteChannel === "git";

  if (isRemoteGitSource) {
    const displayValue = normalizeRemoteDisplayValue(sourceValue);
    const sourceLabelKey =
      remoteChannel === "gitee"
        ? "skill.sourceGiteeRepo"
        : remoteChannel === "gitea"
          ? "skill.sourceGiteaRepo"
          : remoteChannel === "github"
            ? skill.registry_slug
              ? "skill.sourceGithubStore"
              : "skill.sourceGithubRepo"
            : "skill.sourceGitRepo";
    const sourceLabelFallback =
      remoteChannel === "gitee"
        ? "Imported from Gitee"
        : remoteChannel === "gitea"
          ? "Imported from Gitea"
          : remoteChannel === "github"
            ? skill.registry_slug
              ? "Imported from GitHub / Skill Store"
              : "Imported from GitHub"
            : "Imported from Git Repository";

    return {
      kind: "remote",
      value: sourceValue,
      displayValue,
      shortValue: displayValue,
      sourceLabel:
        t?.(sourceLabelKey, sourceLabelFallback) || sourceLabelFallback,
    };
  }

  if (/^https?:\/\//i.test(sourceValue)) {
    const displayValue = normalizeRemoteDisplayValue(sourceValue);
    return {
      kind: "remote",
      value: sourceValue,
      displayValue,
      shortValue: displayValue,
      sourceLabel:
        t?.(
          skill.registry_slug
            ? "skill.sourceRemoteStore"
            : "skill.sourceRemoteLink",
          skill.registry_slug
            ? "Imported from Remote Skill Store"
            : "Imported from Remote Link",
        ) ||
        (skill.registry_slug
          ? "Imported from Remote Skill Store"
          : "Imported from Remote Link"),
    };
  }

  const normalized = sourceValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const shortValue =
    parts.length >= 2
      ? `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
      : sourceValue;
  const lowerPath = normalized.toLowerCase();
  const agentSource = detectAgentPlatformSkillSource({
    sourceLabel: skill.source_label,
    sourceUrl: skill.source_url,
    localRepoPath: skill.local_repo_path,
  });
  let sourceLabel =
    t?.("skill.sourceLocalFolder", "Imported from Local Folder") ||
    "Imported from Local Folder";
  if (agentSource) {
    const fallback = `Imported from ${agentSource.platformName} Agent Skills`;
    sourceLabel =
      t?.("skill.sourceAgentPlatformFolder", fallback, {
        platform: agentSource.platformName,
      }) || fallback;
  } else if (lowerPath.includes("/.claude/skills/")) {
    sourceLabel =
      t?.(
        "skill.sourceClaudeLocalFolder",
        "Imported from Claude Code Local Skills Folder",
      ) || "Imported from Claude Code Local Skills Folder";
  } else if (
    lowerPath.includes("/cursor/") ||
    lowerPath.includes("/.cursor/")
  ) {
    sourceLabel =
      t?.(
        "skill.sourceCursorLocalFolder",
        "Imported from Cursor Local Skills Folder",
      ) || "Imported from Cursor Local Skills Folder";
  }

  return {
    kind: "local",
    value: sourceValue,
    displayValue: sourceValue,
    shortValue,
    sourceLabel,
  };
}

export function resolveGitHubMarkdownBase(
  sourceUrl?: string,
  contentUrl?: string,
): GitHubMarkdownBase | null {
  const parseTreeUrl = (url: string): GitHubMarkdownBase | null => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== "github.com") {
        return null;
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 4 && parts[2] === "tree") {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const directoryPath = parts.slice(4).join("/");
        const normalizedDirectory = directoryPath ? `${directoryPath}/` : "";
        return {
          hrefBase: `https://github.com/${owner}/${repo}/blob/${branch}/${normalizedDirectory}`,
          imageBase: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedDirectory}`,
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  const parseRawUrl = (url: string): GitHubMarkdownBase | null => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== "raw.githubusercontent.com") {
        return null;
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 4) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[2];
        const directoryPath = parts.slice(3, -1).join("/");
        const normalizedDirectory = directoryPath ? `${directoryPath}/` : "";
        return {
          hrefBase: `https://github.com/${owner}/${repo}/blob/${branch}/${normalizedDirectory}`,
          imageBase: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedDirectory}`,
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  if (sourceUrl) {
    const parsed = parseTreeUrl(sourceUrl);
    if (parsed) {
      return parsed;
    }
  }

  if (contentUrl) {
    const parsed = parseRawUrl(contentUrl);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function resolveGitHubMarkdownUrl(
  rawUrl: string,
  base: GitHubMarkdownBase | null,
  kind: "link" | "image",
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || !base) {
    return trimmed;
  }
  if (
    /^(https?:|data:|mailto:|tel:|#)/i.test(trimmed) ||
    trimmed.startsWith("local-image://")
  ) {
    return trimmed;
  }

  const normalized = trimmed.replace(/^\.\//, "");
  const baseUrl = kind === "image" ? base.imageBase : base.hrefBase;
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

export function groupSkillSafetyFindings(
  findings: SkillSafetyFinding[],
): GroupedSkillSafetyFinding[] {
  const grouped = new Map<string, GroupedSkillSafetyFinding>();

  for (const finding of findings) {
    const key = `${finding.code}::${finding.severity}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        code: finding.code,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        count: 1,
        filePaths: finding.filePath ? [finding.filePath] : [],
        evidences: finding.evidence ? [finding.evidence] : [],
        findings: [finding],
      });
      continue;
    }

    existing.count += 1;
    existing.findings.push(finding);
    if (finding.filePath && !existing.filePaths.includes(finding.filePath)) {
      existing.filePaths.push(finding.filePath);
    }
    if (finding.evidence && !existing.evidences.includes(finding.evidence)) {
      existing.evidences.push(finding.evidence);
    }
  }

  const severityOrder: Record<SkillSafetyFinding["severity"], number> = {
    high: 0,
    warn: 1,
    info: 2,
  };

  return Array.from(grouped.values()).sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.title.localeCompare(b.title);
  });
}

export function renderImmersiveSegments(raw: string): ImmersiveSegment[] {
  const lines = raw.split("\n");
  const segments: ImmersiveSegment[] = [];
  let buffer: string[] = [];
  let currentType: ImmersiveSegment["type"] = "original";

  const flush = () => {
    const joined = buffer.join("\n");
    if (joined.trim()) {
      segments.push({ type: currentType, text: joined });
    }
    buffer = [];
  };

  for (const line of lines) {
    const translationMatch = line.match(/^<t>(.*)<\/t>$/);
    if (translationMatch) {
      flush();
      currentType = "translation";
      buffer.push(translationMatch[1]);
      flush();
      currentType = "original";
      continue;
    }
    buffer.push(line);
  }

  flush();
  return segments;
}

export function downloadSkillExport(
  content: string,
  skillName: string,
  format: "skillmd" | "json",
): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    format === "skillmd" ? `${skillName}-SKILL.md` : `${skillName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadSkillZipExport(result: {
  fileName: string;
  base64: string;
}): void {
  const binary = atob(result.base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function restoreSkillVersion(
  skillId: string,
  version: SkillVersion,
  reloadSkills: () => Promise<void>,
): Promise<void> {
  await window.api.skill.versionRollback(skillId, version.version);
  scheduleAllSaveSync("skill:restore-version");
  await reloadSkills();
}

function computeLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

export function generateTextDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  if (oldText === newText) {
    return oldLines.map((line, index) => ({
      type: "unchanged",
      content: line,
      oldLineNum: index + 1,
      newLineNum: index + 1,
    }));
  }

  const dp = computeLcs(oldLines, newLines);
  const stack: DiffLine[] = [];
  const diff: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: "add",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j -= 1;
    } else if (i > 0) {
      stack.push({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i -= 1;
    }
  }

  while (stack.length > 0) {
    diff.push(stack.pop()!);
  }

  return diff;
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFrontmatterValue(content: string, key: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return null;

  const frontmatterMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return null;

  const lines = frontmatterMatch[1].split("\n");
  const lineIndex = lines.findIndex((entry) =>
    entry.trim().startsWith(`${key}:`),
  );

  if (lineIndex === -1) return null;

  let value = lines[lineIndex]
    .trim()
    .slice(key.length + 1)
    .trim();

  if (/^[|>][-+]?$/u.test(value)) {
    const blockLines: string[] = [];
    for (let i = lineIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/^\s+/.test(line)) {
        break;
      }
      blockLines.push(line.replace(/^\s+/, "").trimEnd());
    }
    value = blockLines.join("\n").trim();
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return normalizeInlineText(value) || null;
}

function extractBodySummary(content: string): string | null {
  const stripped = stripFrontmatter(content);
  if (!stripped) return null;

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeInlineText(paragraph))
    .filter((paragraph) => {
      if (!paragraph) return false;
      if (paragraph.startsWith("#")) return false;
      if (paragraph.startsWith("|")) return false;
      if (paragraph.startsWith("```")) return false;
      if (
        /^(quick reference|reading content|editing content|create from scratch)$/i.test(
          paragraph,
        )
      ) {
        return false;
      }
      return paragraph.length >= 24;
    });

  return paragraphs[0] || null;
}

export function resolveSkillDescription(instructions?: string): string {
  if (!instructions?.trim()) {
    return "";
  }

  const frontmatterDescription = extractFrontmatterValue(
    instructions,
    "description",
  );
  if (frontmatterDescription) {
    return frontmatterDescription;
  }

  const bodySummary = extractBodySummary(instructions);
  if (bodySummary) {
    return bodySummary;
  }

  return "";
}

/**
 * Extract a SafetyScanAIConfig from the user's configured AI models.
 * Returns the default chat model config, or undefined if none is available.
 */
export function getSafetyScanAIConfig(
  aiModels: AIModelConfig[],
): SafetyScanAIConfig | undefined {
  const chatModels = aiModels.filter((m) => (m.type ?? "chat") === "chat");
  const model = chatModels.find((m) => m.isDefault) ?? chatModels[0];
  if (!model?.apiKey || !model?.apiUrl || !model?.model) {
    return undefined;
  }
  return {
    provider: model.provider,
    apiProtocol: model.apiProtocol,
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.model,
  };
}
