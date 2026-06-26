import type {
  McpEnvRequirement,
  McpMarketSource,
  McpMarketTemplate,
  McpTransport,
} from "@prompthub/shared/types/mcp";

export interface McpRemoteStoreResult {
  nextCursor?: string | null;
  pageCount?: number;
  query?: string;
  templates: McpMarketTemplate[];
  totalCount?: number;
  totalCountIsLowerBound?: boolean;
}

export interface LoadMcpRemoteStoreOptions {
  cursor?: string | null;
  fetchRemoteContent: (url: string) => Promise<string>;
  query?: string;
  source: McpMarketSource;
}

interface OfficialPackage {
  identifier?: string;
  registryType?: string;
  transport?: { type?: string };
  environmentVariables?: Array<{
    description?: string;
    isRequired?: boolean;
    name?: string;
  }>;
}

interface OfficialRemote {
  headers?: Array<{
    description?: string;
    isRequired?: boolean;
    isSecret?: boolean;
    name?: string;
  }>;
  type?: string;
  url?: string;
}

interface OfficialRegistryEntry {
  _meta?: Record<string, { isLatest?: boolean; status?: string }>;
  server?: {
    description?: string;
    name?: string;
    packages?: OfficialPackage[];
    remotes?: OfficialRemote[];
    repository?: string | { url?: string };
    title?: string;
    websiteUrl?: string;
  };
}

interface GenericRemoteServer {
  args?: string[];
  command?: string;
  description?: string;
  detailUrl?: string;
  displayName?: string;
  documentationUrl?: string;
  homepage?: string;
  installCommand?: string;
  name?: string;
  packageName?: string;
  qualifiedName?: string;
  remoteUrl?: string;
  repository?: string | { url?: string };
  slug?: string;
  tags?: string[];
  title?: string;
  url?: string;
}

const DEFAULT_REMOTE_PAGE_SIZE = 48;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string): string {
  return slugify(value.replace(/^@/, "").replace(/\//g, "-")) || "mcp-server";
}

function humanizeName(value: string): string {
  const normalized = value.replace(/^@/, "").split("/").pop() ?? value;
  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueTemplates(templates: McpMarketTemplate[]): McpMarketTemplate[] {
  const seen = new Set<string>();
  const output: McpMarketTemplate[] = [];
  for (const template of templates) {
    const key = template.id;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(template);
  }
  return output;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function looksLikeOfficialRegistryCatalog(raw: string): boolean {
  const data = safeJsonParse<{
    servers?: Array<{ server?: { name?: string } }>;
  }>(raw);
  return Array.isArray(data?.servers)
    ? data.servers.some(
        (entry) =>
          Boolean(entry?.server) &&
          typeof entry.server?.name === "string" &&
          entry.server.name.trim().length > 0,
      )
    : false;
}

function getRepositoryUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  }
  return undefined;
}

function toSource(source: McpMarketSource): McpMarketTemplate["source"] {
  return {
    id: source.id,
    label: source.label,
    trustLevel: source.trustLevel,
    url: source.url,
  };
}

function normalizeTransport(value?: string): McpTransport {
  if (value === "sse") return "sse";
  if (value === "streamable-http" || value === "http") {
    return "streamable-http";
  }
  return "stdio";
}

function parseInstallCommand(commandLine?: string): {
  args?: string[];
  command?: string;
} {
  const tokens =
    commandLine
      ?.match(/"([^"]*)"|'([^']*)'|[^\s]+/g)
      ?.map((token) => token.replace(/^['"]|['"]$/g, "")) ?? [];
  const [command, ...args] = tokens;
  return { command, args: args.length > 0 ? args : undefined };
}

function getPackageCommand(
  item: Pick<OfficialPackage, "identifier" | "registryType">,
): { args: string[]; command: string; runtime: string } {
  const identifier = item.identifier ?? "";
  if (item.registryType === "pypi") {
    return { command: "uvx", args: [identifier], runtime: "uvx" };
  }
  if (item.registryType === "oci") {
    return {
      command: "docker",
      args: ["run", "--rm", "-i", identifier],
      runtime: "docker",
    };
  }
  return { command: "npx", args: ["-y", identifier], runtime: "npx" };
}

function requirementsToEnv(
  requirements: Array<{
    description?: string;
    isRequired?: boolean;
    name?: string;
  }>,
): {
  env?: Record<string, string>;
  requiredEnv?: McpEnvRequirement[];
} {
  const valid = requirements.filter(
    (
      item,
    ): item is { description?: string; isRequired?: boolean; name: string } =>
      typeof item.name === "string" && item.name.trim().length > 0,
  );
  if (valid.length === 0) {
    return {};
  }
  return {
    env: Object.fromEntries(valid.map((item) => [item.name, ""])),
    requiredEnv: valid.map((item) => ({
      name: item.name,
      required: item.isRequired !== false,
      description: item.description,
      source: "env",
    })),
  };
}

function applyQueryFilter(
  templates: McpMarketTemplate[],
  query?: string,
): McpMarketTemplate[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return templates;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return templates.filter((template) => {
    const haystack = [
      template.displayName,
      template.name,
      template.description,
      template.packageName,
      template.repository,
      template.homepage,
      ...template.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function isLatestActive(entry: OfficialRegistryEntry): boolean {
  const meta = entry._meta?.["io.modelcontextprotocol.registry/official"];
  if (!meta) return true;
  return meta.status !== "deprecated" && meta.isLatest !== false;
}

export function parseOfficialMcpRegistryCatalog(
  raw: string,
  source: McpMarketSource,
  query = "",
): McpRemoteStoreResult {
  const data = safeJsonParse<{
    metadata?: { count?: number; nextCursor?: string | null };
    servers?: OfficialRegistryEntry[];
  }>(raw);
  const entries = Array.isArray(data?.servers) ? data.servers : [];
  const templates = entries
    .filter((entry) => entry.server?.name && isLatestActive(entry))
    .flatMap((entry): McpMarketTemplate[] => {
      const server = entry.server;
      if (!server?.name) return [];
      const displayName = server.title || server.name;
      const name = normalizeName(server.name);
      const repository = getRepositoryUrl(server.repository);
      const tags = Array.from(
        new Set(
          server.name
            .split(/[/.:-]+/)
            .map((tag) => tag.toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, 5);

      if (Array.isArray(server.packages) && server.packages.length > 0) {
        return server.packages
          .filter((item) => item.identifier)
          .map((item): McpMarketTemplate => {
            const command = getPackageCommand(item);
            const env = requirementsToEnv(item.environmentVariables ?? []);
            return {
              id: `${source.id}:${name}`,
              name,
              displayName,
              description: server.description || `${displayName} MCP server`,
              transport: normalizeTransport(item.transport?.type),
              command: command.command,
              args: command.args,
              runtime: command.runtime,
              packageName: item.identifier,
              tags,
              homepage: server.websiteUrl || repository,
              repository,
              documentationUrl: server.websiteUrl || repository,
              source: toSource(source),
              ...env,
            };
          });
      }

      return (server.remotes ?? [])
        .filter((remote) => remote.url)
        .map((remote): McpMarketTemplate => {
          const headers = requirementsToEnv(remote.headers ?? []);
          return {
            id: `${source.id}:${name}`,
            name,
            displayName,
            description: server.description || `${displayName} MCP server`,
            transport: normalizeTransport(remote.type),
            url: remote.url,
            headers: headers.env,
            requiredEnv: headers.requiredEnv?.map((item) => ({
              ...item,
              source: "headers",
            })),
            tags,
            homepage: server.websiteUrl || repository,
            repository,
            documentationUrl: server.websiteUrl || repository,
            source: toSource(source),
          };
        });
    });

  const pageCount = data?.metadata?.count;
  const nextCursor = data?.metadata?.nextCursor ?? null;
  return {
    templates: uniqueTemplates(templates),
    nextCursor,
    pageCount,
    totalCount: pageCount,
    totalCountIsLowerBound: Boolean(nextCursor),
    query,
  };
}

function collectJsonObjects(
  value: unknown,
  output: GenericRemoteServer[],
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonObjects(item, output));
    return;
  }
  const record = value as Record<string, unknown>;
  const name =
    record.name ?? record.slug ?? record.qualifiedName ?? record.title;
  const description = record.description;
  if (typeof name === "string" && typeof description === "string") {
    output.push(record as GenericRemoteServer);
  }
  Object.values(record).forEach((item) => collectJsonObjects(item, output));
}

function extractJsonCandidates(html: string): unknown[] {
  const candidates: unknown[] = [];
  const nextDataMatch = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch) {
    const parsed = safeJsonParse<unknown>(nextDataMatch[1]);
    if (parsed) candidates.push(parsed);
  }

  const jsonScriptPattern =
    /<script[^>]+type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = jsonScriptPattern.exec(html)) !== null) {
    const parsed = safeJsonParse<unknown>(scriptMatch[1]);
    if (parsed) candidates.push(parsed);
  }

  const jsonPattern =
    /\{(?=[\s\S]{0,1200}?(?:servers|qualifiedName|installCommand|remoteUrl))[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  while ((match = jsonPattern.exec(html)) !== null) {
    const parsed = safeJsonParse<unknown>(match[0].replace(/\\"/g, '"'));
    if (parsed) candidates.push(parsed);
  }

  const escapedJsonPattern =
    /"((?:\\.|[^"\\])*(?:servers|qualifiedName|remoteUrl)(?:\\.|[^"\\])*)"/g;
  while ((match = escapedJsonPattern.exec(html)) !== null) {
    const unescaped = safeJsonParse<string>(match[0]);
    const parsed =
      unescaped && unescaped.trim().startsWith("{")
        ? safeJsonParse<unknown>(unescaped)
        : null;
    if (parsed) candidates.push(parsed);
  }

  return candidates;
}

function isDirectoryDetailUrl(value: string, source: McpMarketSource): boolean {
  try {
    const url = new URL(value, source.url);
    const sourceUrl = new URL(source.url);
    if (url.hostname !== sourceUrl.hostname) {
      return false;
    }
    return /^\/mcp\/(?:servers|tools|connectors|categories)(?:\/|$)|\/server\//i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

function extractLinkServers(
  html: string,
  source: McpMarketSource,
): GenericRemoteServer[] {
  const servers: GenericRemoteServer[] = [];
  const seen = new Set<string>();
  const sourceHost = (() => {
    try {
      return new URL(source.url).origin;
    } catch {
      return source.url;
    }
  })();
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    if (!/(mcp|server)/i.test(href)) continue;
    const url = href.startsWith("http")
      ? href
      : new URL(href, sourceHost).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const name = text || url.split("/").filter(Boolean).pop() || "MCP Server";
    servers.push({
      name,
      description: `${name} MCP server from ${source.label}.`,
      homepage: url,
      url,
      slug: slugify(name),
    });
  }
  return servers;
}

function genericServerToTemplate(
  item: GenericRemoteServer,
  source: McpMarketSource,
): McpMarketTemplate | null {
  const rawName = item.slug || item.qualifiedName || item.name || item.title;
  if (!rawName) return null;
  const name = normalizeName(rawName);
  const displayName =
    item.displayName || item.title || item.name || humanizeName(rawName);
  const repository = getRepositoryUrl(item.repository);
  const installCommand =
    item.installCommand ||
    (item.packageName ? `npx -y ${item.packageName}` : undefined);
  const parsedCommand = parseInstallCommand(installCommand);
  const remoteUrl = item.remoteUrl || item.url;
  const hasInstallCommand =
    Boolean(installCommand || item.command || item.packageName) ||
    Boolean(item.args && item.args.length > 0);
  const hasRemoteEndpoint =
    Boolean(remoteUrl) &&
    /^https?:\/\//.test(remoteUrl ?? "") &&
    !isDirectoryDetailUrl(remoteUrl ?? "", source);
  if (!hasInstallCommand && !hasRemoteEndpoint) {
    return null;
  }
  const shouldUseRemote = Boolean(hasRemoteEndpoint && !hasInstallCommand);
  const tags = Array.from(
    new Set(
      [
        ...(Array.isArray(item.tags) ? item.tags : []),
        ...name.split("-").filter(Boolean),
      ]
        .map((tag) => tag.toLowerCase())
        .slice(0, 6),
    ),
  );

  return {
    id: `${source.id}:${name}`,
    name,
    displayName,
    description: item.description || `${displayName} MCP server`,
    transport: shouldUseRemote ? "streamable-http" : "stdio",
    command: shouldUseRemote
      ? undefined
      : parsedCommand.command || item.command || "npx",
    args: shouldUseRemote
      ? undefined
      : parsedCommand.args ||
        item.args ||
        (item.packageName ? ["-y", item.packageName] : undefined),
    url: shouldUseRemote ? remoteUrl : undefined,
    tags,
    homepage:
      item.homepage || (shouldUseRemote ? undefined : remoteUrl) || repository,
    repository,
    documentationUrl:
      item.documentationUrl ||
      item.homepage ||
      (shouldUseRemote ? undefined : remoteUrl) ||
      repository,
    packageName:
      item.packageName ||
      parsedCommand.args?.find((arg) =>
        /^@?[\w.-]+\/?[\w.-]*(@.+)?$/.test(arg),
      ),
    runtime: shouldUseRemote
      ? "streamable-http"
      : parsedCommand.command || item.command || "npx",
    source: toSource(source),
  };
}

function parseGenericCatalog(
  raw: string,
  source: McpMarketSource,
  query = "",
): McpRemoteStoreResult {
  const found: GenericRemoteServer[] = [];
  for (const candidate of extractJsonCandidates(raw)) {
    collectJsonObjects(candidate, found);
  }
  found.push(...extractLinkServers(raw, source));
  const totalCountMatch = raw.match(
    /(?:totalCount|totalServers|serverCount)["']?\s*[:=]\s*(\d+)/i,
  );
  const templates = uniqueTemplates(
    found
      .map((item) => genericServerToTemplate(item, source))
      .filter((item): item is McpMarketTemplate => Boolean(item)),
  );
  return {
    templates: applyQueryFilter(templates, query),
    totalCount: totalCountMatch
      ? Number.parseInt(totalCountMatch[1], 10)
      : undefined,
    query,
  };
}

export function parseSmitheryMcpCatalog(
  raw: string,
  source: McpMarketSource,
  query = "",
): McpRemoteStoreResult {
  if (looksLikeOfficialRegistryCatalog(raw)) {
    return parseOfficialMcpRegistryCatalog(raw, source, query);
  }
  return parseGenericCatalog(raw, source, query);
}

export function buildMcpRemoteStoreUrl(
  source: McpMarketSource,
  options: { cursor?: string | null; query?: string } = {},
): string {
  if (source.id === "modelcontextprotocol") {
    const url = new URL("/v0/servers", source.url);
    if (options.cursor) url.searchParams.set("cursor", options.cursor);
    if (options.query?.trim())
      url.searchParams.set("search", options.query.trim());
    return url.toString();
  }

  const url = new URL(source.url);
  if (options.query?.trim()) {
    url.searchParams.set("q", options.query.trim());
  }
  return url.toString();
}

export async function loadMcpRemoteStore({
  cursor,
  fetchRemoteContent,
  query = "",
  source,
}: LoadMcpRemoteStoreOptions): Promise<McpRemoteStoreResult> {
  const raw = await fetchRemoteContent(
    buildMcpRemoteStoreUrl(source, { cursor, query }),
  );
  const result =
    source.id === "modelcontextprotocol"
      ? parseOfficialMcpRegistryCatalog(raw, source, query)
      : source.id === "smithery"
        ? parseSmitheryMcpCatalog(raw, source, query)
        : parseGenericCatalog(raw, source, query);

  return {
    ...result,
    templates: result.templates.slice(0, DEFAULT_REMOTE_PAGE_SIZE),
  };
}
