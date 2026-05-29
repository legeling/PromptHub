import type {
  GitHubRepoMetadata,
  GitHubTreeEntry,
  GitHubTreeResponse,
  RegistrySkill,
  SkillCategory,
} from "@prompthub/shared/types";
import {
  parseGitHubTreeLocation,
  parseGitRepo,
} from "@prompthub/shared/utils/git-repo";
import {
  buildSkillSourceId,
  computeDirectoryFingerprintFromHashes,
} from "@prompthub/shared/utils/skill-identity";

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function parseFrontmatter(content: string): {
  name: string;
  description: string;
  tags: string[];
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: "", description: "", tags: [] };
  }

  const block = match[1];
  const tagsLine = block.match(/^tags:\s*\[(.+)\]$/m)?.[1] ?? "";

  return {
    name: stripQuotes(block.match(/^name:\s*(.+)$/m)?.[1] ?? ""),
    description: stripQuotes(block.match(/^description:\s*(.+)$/m)?.[1] ?? ""),
    tags: tagsLine
      .split(",")
      .map((tag) => stripQuotes(tag))
      .filter(Boolean),
  };
}

export function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferCategory(slug: string, description: string): SkillCategory {
  const text = `${slug} ${description}`.toLowerCase();
  if (/(pdf|doc|ppt|sheet|spreadsheet|word|xlsx|docx)/.test(text)) {
    return "office";
  }
  if (/(github|git|web|playwright|mcp|code|cli|dev|pr)/.test(text)) {
    return "dev";
  }
  if (/(design|figma|css|ui|frontend|canvas|brand)/.test(text)) {
    return "design";
  }
  if (/(deploy|vercel|docker|cloudflare|netlify)/.test(text)) {
    return "deploy";
  }
  if (/(secure|security|audit|auth|secret)/.test(text)) {
    return "security";
  }
  if (/(analy|data|sql|chart|research)/.test(text)) {
    return "data";
  }
  if (/(manage|project|notion|linear)/.test(text)) {
    return "management";
  }
  if (/(ai|generate|translation|speech|image|video|art)/.test(text)) {
    return "ai";
  }
  return "general";
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isGitHubTreeEntry(
  value: unknown,
): value is GitHubTreeEntry & { path: string; type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function isGitHubRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("github api rate limit reached");
}

function isGitHubNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("http 404") ||
    normalized.includes("not found") ||
    normalized.includes("repository not found")
  );
}

function isRemoteNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("network") ||
    normalized.includes("econn") ||
    normalized.includes("enotfound") ||
    normalized.includes("socket hang up") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("unable to verify") ||
    normalized.includes("certificate") ||
    normalized.includes("internal network addresses") ||
    normalized.includes("local network addresses")
  );
}

export function mapGitHubStoreError(
  error: unknown,
  messages: {
    rateLimit: string;
    network: string;
    invalidRepo: string;
  },
): Error {
  if (isGitHubRateLimitError(error)) {
    return new Error(messages.rateLimit);
  }

  if (isGitHubNotFoundError(error)) {
    return new Error(messages.invalidRepo);
  }

  if (isRemoteNetworkError(error)) {
    return new Error(messages.network);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function dedupeRegistrySkills(skills: RegistrySkill[]): RegistrySkill[] {
  const bySourceId = new Map<string, RegistrySkill>();
  for (const skill of skills) {
    if (bySourceId.has(skill.source_id)) {
      continue;
    }
    bySourceId.set(skill.source_id, skill);
  }
  return Array.from(bySourceId.values());
}

function buildRawUrl(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

function isSkillMarkdownPath(filePath: string): boolean {
  return filePath === "SKILL.md" || filePath.endsWith("/SKILL.md");
}

function isRootReadmePath(filePath: string): boolean {
  return /^[^/]+$/u.test(filePath) && /^readme\.md$/i.test(filePath);
}

function getTreeBackedDirectoryFingerprint(
  treeEntries: Array<GitHubTreeEntry & { path: string; type: string; sha?: string }>,
  skillFilePath: string,
): string | undefined {
  const normalizedSkillPath = skillFilePath.replace(/^\/+|\/+$/g, "");
  const normalizedLowerPath = normalizedSkillPath.toLowerCase();
  const skillDir =
    normalizedLowerPath === "skill.md" || normalizedLowerPath.endsWith("/skill.md")
      ? normalizedSkillPath.includes("/")
        ? normalizedSkillPath.slice(0, normalizedSkillPath.lastIndexOf("/"))
        : ""
      : normalizedSkillPath;
  const prefix = skillDir ? `${skillDir}/` : "";
  const scopedEntries = treeEntries
    .filter((entry) => entry.type === "blob")
    .filter((entry) =>
      prefix ? entry.path.startsWith(prefix) : !entry.path.includes("/"),
    )
    .filter((entry) => typeof entry.sha === "string" && entry.sha.length > 0)
    .map((entry) => ({
      path: prefix ? entry.path.slice(prefix.length) : entry.path,
      contentHash: entry.sha!,
    }));

  if (scopedEntries.length === 0) {
    return undefined;
  }

  return computeDirectoryFingerprintFromHashes(scopedEntries);
}

export async function loadGitHubSkillRepo(
  repoUrl: string,
  options: {
    branch?: string;
    directory?: string;
    fetchRemoteContent: (url: string) => Promise<string>;
    registrySkills: RegistrySkill[];
    rateLimitMessage: string;
    networkMessage: string;
    invalidRepoMessage: string;
  },
): Promise<RegistrySkill[]> {
  const parsedRepo = parseGitRepo(repoUrl);
  if (!parsedRepo) {
    throw new Error("Invalid GitHub repository URL");
  }

  let repoMetaRaw: string;
  try {
    repoMetaRaw = await options.fetchRemoteContent(
      `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`,
    );
  } catch (error) {
    throw mapGitHubStoreError(error, {
      rateLimit: options.rateLimitMessage,
      network: options.networkMessage,
      invalidRepo: options.invalidRepoMessage,
    });
  }
  const repoMeta = parseJson<GitHubRepoMetadata>(repoMetaRaw || "{}", {});
  const treeLocation = parseGitHubTreeLocation(repoUrl);
  const resolvedBranch =
    options.branch?.trim() ||
    treeLocation?.branch ||
    repoMeta.default_branch ||
    "main";
  const resolvedDirectory =
    options.directory?.trim().replace(/^\/+|\/+$/g, "") ||
    treeLocation?.directory ||
    "";

  let treeRaw: string;
  try {
    treeRaw = await options.fetchRemoteContent(
      `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/git/trees/${resolvedBranch}?recursive=1`,
    );
  } catch (error) {
    throw mapGitHubStoreError(error, {
      rateLimit: options.rateLimitMessage,
      network: options.networkMessage,
      invalidRepo: options.invalidRepoMessage,
    });
  }
  const treeData = parseJson<GitHubTreeResponse>(treeRaw || "{}", {});
  const treeEntries = Array.isArray(treeData.tree)
    ? treeData.tree.filter(isGitHubTreeEntry)
    : [];
  const directoryPrefix = resolvedDirectory ? `${resolvedDirectory}/` : "";
  const skillFiles = treeEntries.filter(
    (item) =>
      item.type === "blob" &&
      isSkillMarkdownPath(item.path) &&
      (!directoryPrefix || item.path.startsWith(directoryPrefix)),
  );

  const builtinBySlug = new Map(
    options.registrySkills.map((skill) => [skill.slug, skill]),
  );

  const remoteSkills = await Promise.all(
    skillFiles.map(async (item) => {
      const path = item.path;
      const pathParts = path.split("/");
      const directoryPath = pathParts.slice(0, -1).join("/");
      const directoryName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : "";
      const rawUrl = buildRawUrl(
        parsedRepo.owner,
        parsedRepo.repo,
        resolvedBranch,
        path,
      );
      const sourceRepoUrl = directoryPath
        ? `${parsedRepo.repositoryUrl}/tree/${resolvedBranch}/${directoryPath}`
        : `${parsedRepo.repositoryUrl}/tree/${resolvedBranch}`;

      let content: string;
      try {
        content = await options.fetchRemoteContent(rawUrl);
      } catch {
        return null;
      }
      if (!content) {
        return null;
      }

      const parsed = parseFrontmatter(content);
      const slug = slugify(directoryName || parsed.name || parsedRepo.repo);
      const builtin = builtinBySlug.get(slug);
      const description =
        parsed.description || builtin?.description || `${toTitleCase(slug)} skill`;
      const canonicalSkillPath = directoryPath || "SKILL.md";
      const sourceId = buildSkillSourceId({
        sourceType: "git-repo",
        sourceUrl: parsedRepo.repositoryUrl,
        branch: resolvedBranch,
        directory: resolvedDirectory,
        skillPath: canonicalSkillPath,
      });

      return {
        slug,
        name: builtin?.name || parsed.name || toTitleCase(slug),
        install_name: parsed.name || undefined,
        source_id: sourceId,
        source_label: `${parsedRepo.owner}/${parsedRepo.repo}`,
        source_branch: resolvedBranch,
        source_directory: directoryPath || resolvedDirectory || undefined,
        canonical_skill_path: canonicalSkillPath,
        directory_fingerprint: getTreeBackedDirectoryFingerprint(
          treeEntries,
          canonicalSkillPath,
        ),
        description,
        category: builtin?.category || inferCategory(slug, description),
        icon_url: builtin?.icon_url,
        icon_background: builtin?.icon_background,
        icon_emoji: builtin?.icon_emoji,
        author:
          builtin?.author ||
          repoMeta?.owner?.login ||
          (parsedRepo.owner === "anthropics" ? "Anthropic" : parsedRepo.owner),
        source_url: sourceRepoUrl,
        tags: builtin?.tags?.length
          ? builtin.tags
          : parsed.tags.length
            ? parsed.tags
            : slug.split(/[-_]/).filter(Boolean),
        version: builtin?.version || "1.0.0",
        content,
        content_url: rawUrl,
        prerequisites: builtin?.prerequisites,
        compatibility: builtin?.compatibility || ["claude", "cursor"],
      } satisfies RegistrySkill;
    }),
  );

  if (remoteSkills.some(isDefined)) {
    return dedupeRegistrySkills(remoteSkills.filter(isDefined));
  }

  const readmeEntry = treeEntries.find(
    (item) => item.type === "blob" && isRootReadmePath(item.path),
  );
  if (!readmeEntry) {
    return [];
  }

  const rawUrl = buildRawUrl(
      parsedRepo.owner,
      parsedRepo.repo,
      resolvedBranch,
      readmeEntry.path,
    );
  let content: string;
  try {
    content = await options.fetchRemoteContent(rawUrl);
  } catch (error) {
    throw mapGitHubStoreError(error, {
      rateLimit: options.rateLimitMessage,
      network: options.networkMessage,
      invalidRepo: options.invalidRepoMessage,
    });
  }
  const parsed = parseFrontmatter(content);
  const slug = slugify(parsed.name || parsedRepo.repo);
  const builtin = builtinBySlug.get(slug);
  const description =
    parsed.description || builtin?.description || `${toTitleCase(slug)} skill`;
  const sourceId = buildSkillSourceId({
    sourceType: "git-repo",
    sourceUrl: parsedRepo.repositoryUrl,
    branch: resolvedBranch,
    directory: resolvedDirectory,
    skillPath: readmeEntry.path,
  });

  return [
    {
      slug,
      name: builtin?.name || parsed.name || toTitleCase(parsedRepo.repo),
      install_name: parsed.name || undefined,
      source_id: sourceId,
      source_label: `${parsedRepo.owner}/${parsedRepo.repo}`,
      source_branch: resolvedBranch,
      source_directory: resolvedDirectory || undefined,
      canonical_skill_path: readmeEntry.path,
      directory_fingerprint: getTreeBackedDirectoryFingerprint(
        treeEntries,
        readmeEntry.path,
      ),
      description,
      category: builtin?.category || inferCategory(slug, description),
      icon_url: builtin?.icon_url,
      icon_background: builtin?.icon_background,
      icon_emoji: builtin?.icon_emoji,
      author:
        builtin?.author ||
        repoMeta?.owner?.login ||
        (parsedRepo.owner === "anthropics" ? "Anthropic" : parsedRepo.owner),
      source_url: resolvedDirectory
        ? `${parsedRepo.repositoryUrl}/tree/${resolvedBranch}/${resolvedDirectory}`
        : `${parsedRepo.repositoryUrl}/tree/${resolvedBranch}`,
      tags: builtin?.tags?.length
        ? builtin.tags
        : parsed.tags.length
          ? parsed.tags
          : slug.split(/[-_]/).filter(Boolean),
      version: builtin?.version || "1.0.0",
      content,
      content_url: rawUrl,
      prerequisites: builtin?.prerequisites,
      compatibility: builtin?.compatibility || ["claude", "cursor"],
    } satisfies RegistrySkill,
  ];
}
