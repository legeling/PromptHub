import type {
  McpEnvRequirement,
  McpMarketTemplate,
  McpPlaceholderRequirement,
  McpRuntimeDetails,
  McpServerConfig,
  McpServerDraft,
  McpTargetKind,
  McpTransport,
} from "../types/mcp";

export class McpConfigError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpConfigError";
    this.code = code;
  }
}

export const MCP_JSON_TARGETS: McpTargetKind[] = [
  "claude",
  "claude-desktop",
  "cursor",
  "cline",
  "gemini",
  "windsurf",
  "kiro",
  "kilo",
  "custom-json",
];

/**
 * Resolve the JSON root key holding server entries for a target.
 * 解析目标配置文件中存放 MCP 服务条目的根级 key。
 */
export function getMcpServersJsonKey(
  target: McpTargetKind,
): "mcpServers" | "servers" | "mcp" {
  if (target === "vscode") {
    return "servers";
  }
  if (target === "opencode" || target === "kilo") {
    return "mcp";
  }
  return "mcpServers";
}

const HTTP_TRANSPORTS: McpTransport[] = ["streamable-http", "sse"];

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export function sanitizeMcpServerName(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "mcp-server";
}

export function parseMcpArgs(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseMcpKeyValueLines(
  value: string | Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  if (
    typeof value !== "string" &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => [key.trim(), String(entryValue)] as const)
      .filter(([key]) => key.length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  const entries = String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return [line, ""] as const;
      }
      return [
        line.slice(0, separatorIndex).trim(),
        line.slice(separatorIndex + 1).trim(),
      ] as const;
    })
    .filter(([key]) => key.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function parseMcpDotEnv(content: string): Record<string, string> {
  const entries: Array<[string, string]> = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    entries.push([key, parseDotEnvValue(normalized.slice(separatorIndex + 1))]);
  }

  return Object.fromEntries(entries);
}

function parseDotEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const commentIndex = trimmed.search(/\s#/);
  return (
    commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex)
  ).trim();
}

export function inferMcpRuntimeDetails(
  server: Pick<McpServerConfig, "transport" | "command" | "args" | "url">,
): McpRuntimeDetails {
  if (server.transport !== "stdio") {
    return {
      runtime: server.transport.toUpperCase(),
      packageOrScript: server.url,
    };
  }

  return {
    runtime: getExecutableName(server.command),
    packageOrScript: inferPackageOrScript(server.args),
  };
}

function getExecutableName(command?: string): string | undefined {
  const name = command?.split(/[\\/]/).pop()?.trim();
  return name || undefined;
}

function inferPackageOrScript(args?: string[]): string | undefined {
  return (args ?? []).find((value) => {
    if (!value || value.startsWith("-") || isPlaceholder(value)) {
      return false;
    }
    return (
      value.startsWith("@") ||
      /\.(cjs|js|mjs|ts|py)$/i.test(value) ||
      /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?$/i.test(value)
    );
  });
}

export function inferMcpEnvRequirements(
  config: Pick<McpServerConfig, "env" | "args" | "url" | "headers">,
): McpEnvRequirement[] {
  const requirements = new Map<string, McpEnvRequirement>();

  for (const [name, value] of Object.entries(config.env ?? {})) {
    requirements.set(name, {
      name,
      required: value.trim() === "" || isPlaceholder(value),
      placeholder: isPlaceholder(value) ? value : undefined,
      source: "env",
    });
  }

  for (const value of config.args ?? []) {
    addVariableReferences(requirements, value, "args");
  }
  if (config.url) {
    addVariableReferences(requirements, config.url, "url");
  }
  for (const value of Object.values(config.headers ?? {})) {
    addVariableReferences(requirements, value, "headers");
  }

  return Array.from(requirements.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function inferMcpPlaceholderRequirements(
  config: Pick<McpServerConfig, "args" | "url" | "headers">,
): McpPlaceholderRequirement[] {
  const placeholders: McpPlaceholderRequirement[] = [];
  for (const value of config.args ?? []) {
    addPlaceholder(placeholders, value, "args");
  }
  if (config.url) {
    addPlaceholder(placeholders, config.url, "url");
  }
  for (const value of Object.values(config.headers ?? {})) {
    addPlaceholder(placeholders, value, "headers");
  }
  return placeholders;
}

function addVariableReferences(
  requirements: Map<string, McpEnvRequirement>,
  value: string,
  source: McpEnvRequirement["source"],
): void {
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match = pattern.exec(value);
  while (match) {
    const name = match[1];
    if (!requirements.has(name)) {
      requirements.set(name, { name, required: true, source });
    }
    match = pattern.exec(value);
  }
}

function addPlaceholder(
  placeholders: McpPlaceholderRequirement[],
  value: string,
  source: McpPlaceholderRequirement["source"],
): void {
  if (isPlaceholder(value)) {
    placeholders.push({ value, source });
  }
}

function isPlaceholder(value: string): boolean {
  return /^<[^>]+>$/.test(value.trim());
}

export function normalizeMcpServerDraft(
  draft: McpServerDraft,
  now = Date.now(),
): McpServerConfig {
  const name = sanitizeMcpServerName(
    draft.name || draft.displayName || "mcp-server",
  );
  const transport = draft.transport || "stdio";
  const displayName = (draft.displayName || name).trim();
  const command = draft.command?.trim();
  const url = draft.url?.trim();
  const env = parseMcpKeyValueLines(draft.env);
  const headers = parseMcpKeyValueLines(draft.headers);
  const args = parseMcpArgs(draft.args);

  if (transport === "stdio" && !command) {
    throw new McpConfigError(
      "INVALID_SERVER",
      "stdio MCP 服务必须填写 command",
    );
  }
  if (HTTP_TRANSPORTS.includes(transport) && !url) {
    throw new McpConfigError("INVALID_SERVER", "远程 MCP 服务必须填写 url");
  }

  return {
    id: draft.id || createId("mcp"),
    name,
    displayName,
    description: draft.description?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    transport,
    command,
    args: args.length > 0 ? args : undefined,
    cwd: draft.cwd?.trim() || undefined,
    env,
    url,
    headers,
    enabled: draft.enabled !== false,
    isFavorite: draft.isFavorite === true,
    tags: Array.from(
      new Set((draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
    ),
    source: draft.source ?? { type: "manual" },
    createdAt: draft.createdAt ?? now,
    updatedAt: draft.updatedAt ?? now,
  };
}

export function installMcpTemplate(
  template: McpMarketTemplate,
  now = Date.now(),
): McpServerConfig {
  return normalizeMcpServerDraft(
    {
      ...template,
      source: {
        type: "market",
        id: template.id,
        label: template.source?.label || template.displayName,
        url:
          template.documentationUrl ||
          template.homepage ||
          template.source?.url,
      },
      enabled: true,
    },
    now,
  );
}

export function toMcpServerEntry(
  server: McpServerConfig,
): Record<string, unknown> {
  if (server.transport === "stdio") {
    return stripUndefined({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
    });
  }

  return stripUndefined({
    type: server.transport === "sse" ? "sse" : "http",
    url: server.url,
    headers: server.headers,
  });
}

/**
 * OpenCode and Kilo Code use an MCP entry shape where local stdio
 * servers store a combined command array and remote servers store url/headers.
 * OpenCode uses its own MCP entry shape:
 * local servers use `type: "local"` with a combined command array,
 * remote servers use `type: "remote"` with url/headers.
 * OpenCode 使用专有的 MCP 配置结构：本地服务为 type:"local" + 合并的
 * command 数组，远程服务为 type:"remote" + url/headers。
 */
export function toOpenCodeMcpEntry(
  server: McpServerConfig,
): Record<string, unknown> {
  if (server.transport === "stdio") {
    return stripUndefined({
      type: "local",
      command: [server.command ?? "", ...(server.args ?? [])].filter(Boolean),
      environment:
        server.env && Object.keys(server.env).length > 0
          ? server.env
          : undefined,
      enabled: true,
    });
  }

  return stripUndefined({
    type: "remote",
    url: server.url,
    headers:
      server.headers && Object.keys(server.headers).length > 0
        ? server.headers
        : undefined,
    enabled: true,
  });
}

function buildMcpTargetEntry(
  target: McpTargetKind,
  server: McpServerConfig,
): Record<string, unknown> {
  return target === "opencode" || target === "kilo"
    ? toOpenCodeMcpEntry(server)
    : toMcpServerEntry(server);
}

export function parseMcpJsonConfigContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }
  return JSON.parse(stripJsoncSyntax(trimmed));
}

function stripJsoncSyntax(content: string): string {
  return stripTrailingJsonCommas(stripJsonComments(content));
}

function stripJsonComments(content: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < content.length && !/[\r\n]/.test(content[index])) {
        index += 1;
      }
      output += content[index] ?? "";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === "*" && content[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingJsonCommas(content: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ",") {
      let lookahead = index + 1;
      while (/\s/.test(content[lookahead] ?? "")) {
        lookahead += 1;
      }
      if (content[lookahead] === "}" || content[lookahead] === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}

export function buildMcpServersJson(servers: McpServerConfig[]): {
  mcpServers: Record<string, Record<string, unknown>>;
} {
  return {
    mcpServers: Object.fromEntries(
      servers
        .filter((server) => server.enabled)
        .map((server) => [server.name, toMcpServerEntry(server)]),
    ),
  };
}

export function buildVsCodeMcpJson(servers: McpServerConfig[]): {
  servers: Record<string, Record<string, unknown>>;
} {
  return {
    servers: Object.fromEntries(
      servers
        .filter((server) => server.enabled)
        .map((server) => [server.name, toMcpServerEntry(server)]),
    ),
  };
}

export function buildMcpTargetJson(
  target: McpTargetKind,
  servers: McpServerConfig[],
): Record<string, unknown> {
  const key = getMcpServersJsonKey(target);
  return {
    [key]: Object.fromEntries(
      servers
        .filter((server) => server.enabled)
        .map((server) => [server.name, buildMcpTargetEntry(target, server)]),
    ),
  };
}

export function buildCodexMcpToml(servers: McpServerConfig[]): string {
  return servers
    .filter((server) => server.enabled)
    .map((server) => {
      const lines = [`[mcp_servers.${tomlBareKey(server.name)}]`];
      if (server.transport === "stdio") {
        lines.push(`command = ${tomlString(server.command || "")}`);
        if (server.args?.length) {
          lines.push(`args = [${server.args.map(tomlString).join(", ")}]`);
        }
        if (server.cwd) {
          lines.push(`cwd = ${tomlString(server.cwd)}`);
        }
        if (server.env && Object.keys(server.env).length > 0) {
          lines.push(`env = ${tomlInlineTable(server.env)}`);
        }
      } else if (server.url) {
        lines.push(`url = ${tomlString(server.url)}`);
        if (server.headers && Object.keys(server.headers).length > 0) {
          lines.push(`http_headers = ${tomlInlineTable(server.headers)}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildMcpConfigPreview(
  target: McpTargetKind,
  servers: McpServerConfig[],
): string {
  if (target === "codex" || target === "custom-toml") {
    return `${buildCodexMcpToml(servers)}\n`;
  }
  return `${JSON.stringify(buildMcpTargetJson(target, servers), null, 2)}\n`;
}

export function mergeMcpServersJson(
  existing: unknown,
  target: McpTargetKind,
  servers: McpServerConfig[],
): Record<string, unknown> {
  const root =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const key = getMcpServersJsonKey(target);
  const existingServers =
    root[key] && typeof root[key] === "object" && !Array.isArray(root[key])
      ? { ...(root[key] as Record<string, unknown>) }
      : {};

  for (const server of servers.filter((item) => item.enabled)) {
    existingServers[server.name] = buildMcpTargetEntry(target, server);
  }

  root[key] = existingServers;
  return root;
}

/**
 * Remove named MCP server entries from a JSON target config while keeping
 * every unrelated key untouched.
 * 从 JSON 目标配置中删除指定名称的 MCP 服务条目，保持其他配置不变。
 */
export function removeMcpServersFromJson(
  existing: unknown,
  target: McpTargetKind,
  serverNames: string[],
): Record<string, unknown> {
  const root =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const key = getMcpServersJsonKey(target);
  if (!root[key] || typeof root[key] !== "object" || Array.isArray(root[key])) {
    return root;
  }
  const names = new Set(serverNames);
  root[key] = Object.fromEntries(
    Object.entries(root[key] as Record<string, unknown>).filter(
      ([name]) => !names.has(name),
    ),
  );
  return root;
}

/**
 * Remove `[mcp_servers.<name>]` sections from a Codex-style TOML config.
 * Sections end at the next top-level table header. Quoted section names are
 * supported. Unrelated content is preserved byte-for-byte.
 * 从 Codex 风格 TOML 配置中删除指定 server 的配置段，其余内容原样保留。
 */
export function removeCodexMcpTomlServers(
  existingContent: string,
  serverNames: string[],
): string {
  const names = new Set(serverNames);
  const lines = existingContent.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const section = parseCodexMcpTomlSection(line);
    if (section) {
      skipping = names.has(section.serverName);
      if (skipping) {
        continue;
      }
    } else if (skipping && /^\s*\[/.test(line)) {
      // A new table header ends the skipped section.
      skipping = false;
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * List MCP server names present in a JSON target config.
 * 列出 JSON 目标配置中已存在的 MCP 服务名称。
 */
export function listMcpServerNamesInJson(
  existing: unknown,
  target: McpTargetKind,
): string[] {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return [];
  }
  const root = existing as Record<string, unknown>;
  const key = getMcpServersJsonKey(target);
  const entries = root[key];
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return [];
  }
  return Object.keys(entries as Record<string, unknown>);
}

/**
 * List MCP server names present in a Codex-style TOML config.
 * 列出 Codex 风格 TOML 配置中已存在的 MCP 服务名称。
 */
export function listMcpServerNamesInToml(content: string): string[] {
  const names: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const section = parseCodexMcpTomlSection(rawLine);
    if (section?.isServerRoot) {
      names.push(section.serverName);
    }
  }
  return names;
}

function parseCodexMcpTomlSection(
  line: string,
): { serverName: string; isServerRoot: boolean } | null {
  const trimmed = line.trim();
  const prefix = "[mcp_servers.";

  if (!trimmed.startsWith(prefix) || !trimmed.endsWith("]")) {
    return null;
  }

  const sectionPath = trimmed.slice(prefix.length, -1);
  const serverKey = parseTomlDottedKeySegment(sectionPath);
  if (!serverKey) {
    return null;
  }

  const remainingPath = sectionPath.slice(serverKey.endIndex);
  if (remainingPath.length > 0 && !remainingPath.startsWith(".")) {
    return null;
  }

  return {
    serverName: serverKey.value,
    isServerRoot: remainingPath.length === 0,
  };
}

function parseTomlDottedKeySegment(
  value: string,
): { value: string; endIndex: number } | null {
  if (value.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char !== '"') {
        continue;
      }

      const rawSegment = value.slice(0, index + 1);
      try {
        const parsed = JSON.parse(rawSegment) as unknown;
        return typeof parsed === "string"
          ? { value: parsed, endIndex: index + 1 }
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  const bareMatch = value.match(/^[A-Za-z0-9_-]+/);
  return bareMatch
    ? { value: bareMatch[0], endIndex: bareMatch[0].length }
    : null;
}

const MANAGED_BLOCK_START = "# >>> PromptHub MCP managed block >>>";
const MANAGED_BLOCK_END = "# <<< PromptHub MCP managed block <<<";

export function mergeCodexMcpToml(
  existingContent: string,
  servers: McpServerConfig[],
): string {
  const withoutManaged = existingContent
    .replace(
      new RegExp(
        `\\n?${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?`,
        "g",
      ),
      "\n",
    )
    .trimEnd();
  const block = [
    MANAGED_BLOCK_START,
    buildCodexMcpToml(servers).trim(),
    MANAGED_BLOCK_END,
  ]
    .filter(Boolean)
    .join("\n");
  return `${withoutManaged ? `${withoutManaged}\n\n` : ""}${block}\n`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlBareKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function tomlInlineTable(value: Record<string, string>): string {
  return `{ ${Object.entries(value)
    .map(
      ([key, entryValue]) => `${tomlBareKey(key)} = ${tomlString(entryValue)}`,
    )
    .join(", ")} }`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
