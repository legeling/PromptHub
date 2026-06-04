import type { RegistrySkill } from "@prompthub/shared/types";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";

export const CLAWHUB_BASE_URL = "https://clawhub.ai";
export const CLAWHUB_BROWSE_SORT = "recommended";

const DEFAULT_COMPATIBILITY = ["claude", "codex", "cursor", "opencode"];

type ClawHubRecord = Record<string, unknown>;

function getString(record: ClawHubRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function getNestedString(
  record: ClawHubRecord,
  key: string,
  nestedKeys: string[],
): string | undefined {
  const nested = record[key];
  if (typeof nested !== "object" || nested === null) {
    return undefined;
  }
  return getString(nested as ClawHubRecord, nestedKeys);
}

function normalizeListPayload(payload: unknown): ClawHubRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["skills", "items", "data", "results"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function getNextCursor(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  return (
    getString(payload, ["nextCursor", "next_cursor", "cursor"]) ||
    getNestedString(payload, "pagination", [
      "nextCursor",
      "next_cursor",
      "cursor",
    ]) ||
    getNestedString(payload, "pageInfo", [
      "nextCursor",
      "next_cursor",
      "endCursor",
    ]) ||
    getNestedString(payload, "meta", ["nextCursor", "next_cursor", "cursor"])
  );
}

function isRecord(value: unknown): value is ClawHubRecord {
  return typeof value === "object" && value !== null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  tags: string[];
  version?: string;
  author?: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { tags: [] };
  }

  const block = match[1];
  const tagsLine = block.match(/^tags:\s*\[(.+)\]$/m)?.[1] ?? "";

  return {
    name: block
      .match(/^name:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, ""),
    description: block
      .match(/^description:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, ""),
    author: block
      .match(/^author:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, ""),
    version: block
      .match(/^version:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, ""),
    tags: tagsLine
      .split(",")
      .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean),
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildSkillMdFallback(name: string, description: string): string {
  return `# ${name}\n\n${description}`;
}

function buildClawHubSkill(
  item: ClawHubRecord,
  skillMdContent: string,
): RegistrySkill | null {
  const slug = getString(item, ["slug", "id", "skillSlug", "name"]);
  if (!slug) {
    return null;
  }

  const owner =
    getString(item, ["owner", "author", "username", "namespace"]) ||
    getNestedString(item, "owner", ["username", "handle", "name", "id"]) ||
    getNestedString(item, "user", ["username", "handle", "name", "id"]);
  const frontmatter = parseFrontmatter(skillMdContent);
  const displayName =
    frontmatter.name ||
    getString(item, ["displayName", "title", "name"]) ||
    humanize(slug);
  const description =
    frontmatter.description ||
    getString(item, ["description", "summary", "shortDescription"]) ||
    `${displayName} ClawHub skill`;
  const tags = frontmatter.tags.length
    ? frontmatter.tags
    : [...(owner ? [owner] : []), ...slug.split(/[-_]+/)]
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
  const canonicalUrl =
    getString(item, ["url", "canonicalUrl", "pageUrl", "storeUrl"]) ||
    (owner
      ? `${CLAWHUB_BASE_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`
      : `${CLAWHUB_BASE_URL}/skills/${encodeURIComponent(slug)}`);
  const contentUrl = `${CLAWHUB_BASE_URL}/api/v1/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`;
  const packageUrl = `${CLAWHUB_BASE_URL}/api/v1/download?slug=${encodeURIComponent(slug)}`;
  const safeContent = skillMdContent.trim()
    ? skillMdContent
    : buildSkillMdFallback(displayName, description);

  return {
    slug: slugify(`clawhub-${owner || "public"}-${slug}`),
    name: displayName,
    install_name: frontmatter.name || getString(item, ["installName"]),
    source_id: buildSkillSourceId({
      sourceType: "clawhub",
      sourceUrl: canonicalUrl,
      skillPath: slug,
    }),
    source_label: "ClawHub",
    canonical_skill_path: "SKILL.md",
    description,
    category: "general",
    author: frontmatter.author || owner || "ClawHub",
    source_url: canonicalUrl,
    store_url: canonicalUrl,
    tags,
    version:
      frontmatter.version ||
      getString(item, ["version", "latestVersion", "currentVersion"]) ||
      "1.0.0",
    content: safeContent,
    content_url: contentUrl,
    package_url: packageUrl,
    compatibility: DEFAULT_COMPATIBILITY,
    weekly_installs: getString(item, ["weeklyInstalls", "weekly_installs"]),
    github_stars: getString(item, ["stars", "githubStars", "github_stars"]),
    security_audits: getString(item, ["safety", "safetyStatus", "riskLevel"])
      ? [getString(item, ["safety", "safetyStatus", "riskLevel"]) as string]
      : undefined,
  };
}

export async function loadClawHubSkills(options: {
  fetchRemoteContent: (url: string) => Promise<string>;
  limit?: number;
}): Promise<RegistrySkill[]> {
  return (
    await loadClawHubSkillsPage({
      fetchRemoteContent: options.fetchRemoteContent,
      limit: options.limit,
    })
  ).skills;
}

export async function loadClawHubSkillsPage(options: {
  cursor?: string | null;
  fetchRemoteContent: (url: string) => Promise<string>;
  limit?: number;
  searchQuery?: string;
}): Promise<{ skills: RegistrySkill[]; nextCursor?: string }> {
  const limit = options.limit ?? 24;
  const normalizedSearchQuery = options.searchQuery?.trim() ?? "";
  const searchParams = new URLSearchParams(
    normalizedSearchQuery
      ? {
          q: normalizedSearchQuery,
          limit: String(limit),
        }
      : {
          sort: CLAWHUB_BROWSE_SORT,
          limit: String(limit),
        },
  );
  if (!normalizedSearchQuery && options.cursor) {
    searchParams.set("cursor", options.cursor);
  }
  const listUrl = normalizedSearchQuery
    ? `${CLAWHUB_BASE_URL}/api/v1/search?${searchParams.toString()}`
    : `${CLAWHUB_BASE_URL}/api/v1/skills?${searchParams.toString()}`;
  const rawList = await options.fetchRemoteContent(listUrl);
  const payload = parseJson(rawList);
  const records = normalizeListPayload(payload).slice(0, limit);

  const skills = await Promise.all(
    records.map(async (item) => {
      const slug = getString(item, ["slug", "id", "skillSlug", "name"]);
      const contentUrl = slug
        ? `${CLAWHUB_BASE_URL}/api/v1/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`
        : "";
      const content = contentUrl
        ? await options.fetchRemoteContent(contentUrl).catch(() => "")
        : "";
      return buildClawHubSkill(item, content);
    }),
  );

  return {
    skills: skills.filter((skill): skill is RegistrySkill => skill !== null),
    nextCursor: normalizedSearchQuery ? undefined : getNextCursor(payload),
  };
}
