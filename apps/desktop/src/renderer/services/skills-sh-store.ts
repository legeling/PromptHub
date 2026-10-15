import { parseSkillMd } from "@prompthub/core/skills/skill-frontmatter";
import type { RegistrySkill } from "@prompthub/shared/types";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";

export const SKILLS_SH_BASE_URL = "https://skills.sh";

export const SKILLS_SH_FILTERS = [
  { key: "all", label: "All", path: "/" },
  { key: "trending", label: "Trending", path: "/trending" },
  { key: "hot", label: "Hot", path: "/hot" },
  { key: "official", label: "Official", path: "/official" },
  { key: "audits", label: "Audits", path: "/audits" },
  { key: "topic:react", label: "React", path: "/topic/react" },
  { key: "topic:nextjs", label: "Next.js", path: "/topic/nextjs" },
  { key: "topic:design", label: "Design & UI", path: "/topic/design" },
  { key: "topic:mobile", label: "Mobile", path: "/topic/mobile" },
  {
    key: "topic:agent-workflows",
    label: "Agent Workflows",
    path: "/topic/agent-workflows",
  },
  { key: "topic:databases", label: "Databases", path: "/topic/databases" },
  { key: "topic:testing", label: "Testing", path: "/topic/testing" },
  { key: "topic:marketing", label: "Marketing", path: "/topic/marketing" },
] as const;

export type SkillsShFilterKey = (typeof SKILLS_SH_FILTERS)[number]["key"];

const DEFAULT_COMPATIBILITY = [
  "claude",
  "codex",
  "cursor",
  "opencode",
  "zcode",
  "antigravity",
];
const DETAIL_PATH_PATTERN = /^\/([^/]+)\/([^/]+)\/([^/?#]+)\/?$/;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export interface SkillsShLeaderboardEntry {
  owner: string;
  repo: string;
  skillName: string;
  detailPath: string;
  detailUrl: string;
  rank?: number;
  weeklyInstalls?: string;
}

export function getSkillsShSearchUrl(query: string, limit: number): string {
  const url = new URL("/api/search", SKILLS_SH_BASE_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

function parseSearchEntry(value: unknown): SkillsShLeaderboardEntry | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("source" in value) ||
    !("skillId" in value)
  ) {
    throw new Error("Invalid skills.sh search entry");
  }
  const { source, skillId } = value;
  const safeSegment = (segment: string): boolean =>
    Boolean(segment.trim()) &&
    segment !== "." &&
    segment !== ".." &&
    !/[\\/\x00-\x1f?#%]/.test(segment);
  if (
    typeof source !== "string" ||
    typeof skillId !== "string" ||
    !safeSegment(skillId)
  ) {
    throw new Error("Invalid skills.sh search identity");
  }
  const segments = source.split("/");
  // Hosted catalogs have no repository package contract in the current installer.
  if (
    segments.length === 1 &&
    safeSegment(source) &&
    source.includes(".") &&
    new URL(`https://${source}`).hostname === source.toLowerCase()
  )
    return null;
  if (segments.length !== 2 || !segments.every(safeSegment)) {
    throw new Error("Invalid skills.sh search repository");
  }
  const [owner, repo] = segments;
  const detailPath = `/${[owner, repo, skillId].map(encodeURIComponent).join("/")}`;
  return {
    owner,
    repo,
    skillName: skillId,
    detailPath,
    detailUrl: new URL(detailPath, SKILLS_SH_BASE_URL).toString(),
  };
}

export function parseSkillsShSearch(
  content: string,
): SkillsShLeaderboardEntry[] {
  const payload: unknown = JSON.parse(content);
  if (
    !payload ||
    typeof payload !== "object" ||
    !("skills" in payload) ||
    !Array.isArray(payload.skills)
  ) {
    throw new Error("Invalid skills.sh search response");
  }
  const entries = new Map<string, SkillsShLeaderboardEntry>();
  let hostedCount = 0;
  for (const value of payload.skills) {
    const entry = parseSearchEntry(value);
    if (!entry) {
      hostedCount += 1;
      continue;
    }
    entries.set(entry.detailPath, entry);
  }
  if (hostedCount > 0) {
    if (entries.size === 0)
      throw new Error("Unsupported skills.sh hosted-source results");
    console.warn(
      "Skipped skills.sh hosted-source results without a package adapter",
      { count: hostedCount },
    );
  }
  return Array.from(entries.values());
}

export function normalizeSkillsShFilterKey(
  value?: string | null,
): SkillsShFilterKey {
  return SKILLS_SH_FILTERS.some((filter) => filter.key === value)
    ? (value as SkillsShFilterKey)
    : "all";
}

export function getSkillsShIndexUrl(filterKey?: string | null): string {
  const normalizedFilterKey = normalizeSkillsShFilterKey(filterKey);
  if (normalizedFilterKey === "all") {
    return SKILLS_SH_BASE_URL;
  }
  const filter =
    SKILLS_SH_FILTERS.find((item) => item.key === normalizedFilterKey) ??
    SKILLS_SH_FILTERS[0];
  return new URL(filter.path, SKILLS_SH_BASE_URL).toString();
}

function normalizeHtmlInput(html: string | null | undefined): string {
  return html ?? "";
}

export function parseSkillsShTotalCount(
  html: string | null | undefined,
): number | undefined {
  const match = normalizeHtmlInput(html).match(
    /(?:\\?"totalSkills\\?")\s*:\s*(\d+)/,
  );
  if (!match) {
    return undefined;
  }
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : undefined;
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, rawValue) => {
    const value = String(rawValue).toLowerCase();
    if (value.startsWith("#x")) {
      const code = Number.parseInt(value.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (value.startsWith("#")) {
      const code = Number.parseInt(value.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return HTML_ENTITY_MAP[value] ?? entity;
  });
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripTags(input: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      input
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(
          /<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|pre|code)>/gi,
          "\n",
        )
        .replace(/<[^>]+>/g, " "),
    ).replace(/[ \t]{2,}/g, " "),
  );
}

function htmlToText(html: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(
          /<\/(p|div|section|article|header|footer|aside|main|nav|li|ul|ol|h1|h2|h3|h4|h5|h6|pre|code|blockquote|table|thead|tbody|tr)>/gi,
          "\n",
        )
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n"),
  );
}

function humanizeSkillName(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  tags: string[];
} {
  const frontmatter = parseSkillMd(content)?.frontmatter;

  return {
    name: frontmatter?.name || undefined,
    description: frontmatter?.description,
    tags: frontmatter?.tags ?? [],
  };
}

function getSectionLines(
  text: string,
  heading: string,
  stopHeadings: string[],
  preserveIndentation = false,
): string[] {
  const lines = text.split("\n");
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === heading.toLowerCase(),
  );
  if (startIndex === -1) {
    return [];
  }

  const stopSet = new Set(stopHeadings.map((line) => line.toLowerCase()));
  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const current = lines[index];
    const normalized = current.trim();
    if (stopSet.has(normalized.toLowerCase())) {
      break;
    }
    collected.push(preserveIndentation ? current : normalized);
  }

  return collected;
}

function normalizeSectionContent(lines: string[]): string {
  return normalizeWhitespace(lines.join("\n"));
}

function extractInstalledOnAgents(lines: string[]): string[] {
  return lines
    .map(
      (line) => line.match(/^([a-z0-9-]+)\s+\d+/i)?.[1]?.toLowerCase() ?? null,
    )
    .filter((value): value is string => Boolean(value));
}

function extractSimpleMetric(
  text: string,
  heading: string,
): string | undefined {
  const lines = getSectionLines(text, heading, [
    "Summary",
    "SKILL.md",
    "Weekly Installs",
    "Repository",
    "GitHub Stars",
    "Installed on",
    "Security audits",
  ]);
  return normalizeSectionContent(lines) || undefined;
}

export function parseSkillsShLeaderboard(
  html: string | null | undefined,
  options?: { limit?: number },
): SkillsShLeaderboardEntry[] {
  const entries: SkillsShLeaderboardEntry[] = [];
  const seen = new Set<string>();
  const limit = options?.limit ?? 24;
  const normalizedHtml = normalizeHtmlInput(html).replace(/\\"/g, '"');
  const linkPattern =
    /<a[^>]+href="(\/[^"/?#]+\/[^"/?#]+\/[^"/?#]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;

  const addEntry = (entry: SkillsShLeaderboardEntry) => {
    if (seen.has(entry.detailPath) || entries.length >= limit) {
      return;
    }
    seen.add(entry.detailPath);
    entries.push(entry);
  };

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(normalizedHtml)) !== null) {
    const detailPath = match[1];
    if (seen.has(detailPath)) {
      continue;
    }

    const parsed = detailPath.match(DETAIL_PATH_PATTERN);
    if (!parsed) {
      continue;
    }

    const [, owner, repo, skillName] = parsed;
    const anchorText = stripTags(match[2]);
    const rank = Number.parseInt(anchorText.match(/^(\d+)\b/)?.[1] ?? "", 10);
    const weeklyInstalls = anchorText.match(/(\d+(?:\.\d+)?[KMB]?)\s*$/i)?.[1];

    addEntry({
      owner,
      repo,
      skillName: decodeURIComponent(skillName),
      detailPath,
      detailUrl: new URL(detailPath, SKILLS_SH_BASE_URL).toString(),
      rank: Number.isFinite(rank) ? rank : undefined,
      weeklyInstalls,
    });

    if (entries.length >= limit) {
      break;
    }
  }

  const dataPattern =
    /"source":"([^"]+\/[^"]+)","skillId":"([^"]+)","name":"([^"]+)"/g;
  while (
    entries.length < limit &&
    (match = dataPattern.exec(normalizedHtml)) !== null
  ) {
    const [, source, skillId] = match;
    const [owner, repo] = source.split("/");
    if (!owner || !repo || !skillId) {
      continue;
    }
    const detailPath = `/${owner}/${repo}/${skillId}`;
    if (!DETAIL_PATH_PATTERN.test(detailPath)) {
      continue;
    }
    addEntry({
      owner,
      repo,
      skillName: decodeURIComponent(skillId),
      detailPath,
      detailUrl: new URL(detailPath, SKILLS_SH_BASE_URL).toString(),
      weeklyInstalls: undefined,
    });
  }

  return entries;
}

export function filterSkillsShLeaderboardEntries(
  entries: readonly SkillsShLeaderboardEntry[],
  query: string,
): SkillsShLeaderboardEntry[] {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) {
    return entries.slice();
  }
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return entries.filter((entry) => {
    const haystack = normalizeSearchTerm(
      [
        entry.owner,
        entry.repo,
        entry.skillName,
        entry.detailPath,
        entry.detailUrl,
      ].join(" "),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}

export function parseSkillsShDetail(
  html: string | null | undefined,
  entry: SkillsShLeaderboardEntry,
): RegistrySkill | null {
  const text = htmlToText(normalizeHtmlInput(html));
  const summary = normalizeSectionContent(
    getSectionLines(text, "Summary", [
      "SKILL.md",
      "Weekly Installs",
      "Repository",
      "GitHub Stars",
      "Installed on",
      "Security audits",
    ]),
  );
  const skillMd = normalizeSectionContent(
    getSectionLines(
      text,
      "SKILL.md",
      [
        "Weekly Installs",
        "Repository",
        "GitHub Stars",
        "Installed on",
        "Security audits",
      ],
      true,
    ),
  );

  if (!summary && !skillMd) {
    return null;
  }

  const repositoryLabel = extractSimpleMetric(text, "Repository");
  const repository = repositoryLabel?.match(
    /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/,
  )
    ? repositoryLabel
    : `${entry.owner}/${entry.repo}`;
  const weeklyInstalls =
    extractSimpleMetric(text, "Weekly Installs") || entry.weeklyInstalls;
  const githubStars = extractSimpleMetric(text, "GitHub Stars");
  const installedOn = extractInstalledOnAgents(
    getSectionLines(text, "Installed on", ["Security audits"]),
  );
  const securityAudits = getSectionLines(text, "Security audits", [])
    .map((line) => line.trim())
    .filter(Boolean);

  const frontmatter = parseFrontmatter(skillMd);
  const displayName =
    frontmatter.name?.trim() || humanizeSkillName(entry.skillName);
  const description =
    summary ||
    frontmatter.description?.trim() ||
    `${displayName} community skill`;
  const compatibility =
    installedOn.length > 0
      ? Array.from(new Set(installedOn))
      : DEFAULT_COMPATIBILITY;
  const sourceUrl = repository.match(/^[^/\s]+\/[^/\s]+$/)
    ? `https://github.com/${repository}`
    : new URL(entry.detailPath, SKILLS_SH_BASE_URL).toString();
  const tags =
    frontmatter.tags.length > 0
      ? frontmatter.tags
      : Array.from(
          new Set(
            [entry.owner, entry.repo, ...entry.skillName.split(/[-_]+/)]
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean),
          ),
        );
  return {
    slug: slugify(`${entry.owner}-${entry.repo}-${entry.skillName}`),
    name: displayName,
    install_name: entry.skillName,
    source_id: buildSkillSourceId({
      sourceType: "skills-sh",
      sourceUrl: SKILLS_SH_BASE_URL,
      skillPath: entry.detailPath,
    }),
    source_label: "skills.sh",
    description,
    category: "general",
    author: entry.owner,
    source_url: sourceUrl,
    store_url: entry.detailUrl,
    tags,
    version: "1.0.0",
    content: skillMd || `# ${displayName}\n\n${description}`,
    compatibility,
    weekly_installs: weeklyInstalls,
    github_stars: githubStars,
    installed_on: installedOn.length > 0 ? installedOn : undefined,
    security_audits: securityAudits.length > 0 ? securityAudits : undefined,
  };
}
