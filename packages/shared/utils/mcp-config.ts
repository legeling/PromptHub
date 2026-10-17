import { sha256HexSync } from "./mcp-entry-sha256";
import type {
  McpEnvRequirement,
  McpMarketTemplate,
  McpLibraryFile,
  McpPlaceholderRequirement,
  McpRuntimeDetails,
  McpServerConfig,
  McpServerDraft,
  McpTargetEntryDigest,
  McpTargetKind,
  McpTransport,
} from "../types/mcp";
import { redactMcpTomlConfigContent } from "./mcp-config-redaction";
import { normalizeMcpNativeOptions } from "./mcp-native-options";
import { parseMcpJsonConfigContent } from "./mcp-jsonc";
export { parseMcpJsonConfigContent } from "./mcp-jsonc";

export class McpConfigError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpConfigError";
    this.code = code;
  }
}

export const MCP_JSON_TARGETS: McpTargetKind[] = [
  "copilot",
  "claude",
  "claude-desktop",
  "cursor",
  "cline",
  "gemini",
  "windsurf",
  "kiro",
  "kilo",
  "workbuddy",
  "codebuddy",
  "kimi",
  "augment",
  "amp",
  "qwen",
  "qwen-work",
  "pi",
  "oh-my-pi",
  "zcode",
  "openclaw",
  "qoder",
  "antigravity",
  "reasonix",
  "custom-json",
];

export const MCP_REDACTED_VALUE = "[REDACTED]";

export type McpEnvReferenceSyntax = "braced" | "env-prefix";

export interface McpEnvReference {
  name: string;
  hasDefault: boolean;
}

const MCP_ENV_REFERENCE_PATTERN =
  /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}|\$env:([A-Za-z_][A-Za-z0-9_]*)|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const MCP_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Return the syntax understood by the target for environment references.
 * The table is deliberately explicit so adding a target cannot silently turn
 * a reference into a literal secret.
 */
export function getMcpEnvReferenceSyntax(
  target: McpTargetKind,
): McpEnvReferenceSyntax {
  return target === "cursor" || target === "vscode" || target === "windsurf"
    ? "env-prefix"
    : "braced";
}

function hasMcpEnvReference(value: string): boolean {
  return getMcpEnvReferences(value).length > 0;
}

export function getMcpEnvReferences(value: string): McpEnvReference[] {
  const references: McpEnvReference[] = [];
  MCP_ENV_REFERENCE_PATTERN.lastIndex = 0;
  let match = MCP_ENV_REFERENCE_PATTERN.exec(value);
  while (match) {
    const name = match[1] ?? match[3] ?? match[4];
    if (name) {
      references.push({ name, hasDefault: match[2] !== undefined });
    }
    match = MCP_ENV_REFERENCE_PATTERN.exec(value);
  }
  return references;
}

/** Normalize `${env:VAR}`, `$VAR`, and `${VAR}` to canonical templates. */
export function normalizeMcpReferenceTemplate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new McpConfigError("INVALID_ENV_REFERENCE", "环境变量引用不能为空");
  }

  let found = false;
  MCP_ENV_REFERENCE_PATTERN.lastIndex = 0;
  const normalized = trimmed.replace(
    MCP_ENV_REFERENCE_PATTERN,
    (
      _match,
      bracedName: string | undefined,
      defaultValue: string | undefined,
      envDollarName: string | undefined,
      dollarName: string | undefined,
    ) => {
      found = true;
      const name = bracedName ?? envDollarName ?? dollarName ?? "";
      if (!MCP_ENV_NAME_PATTERN.test(name)) {
        throw new McpConfigError(
          "INVALID_ENV_REFERENCE",
          `环境变量名无效: ${name}`,
        );
      }
      return defaultValue === undefined
        ? `\${${name}}`
        : `\${${name}:-${defaultValue}}`;
    },
  );

  if (!found) {
    if (!MCP_ENV_NAME_PATTERN.test(trimmed)) {
      throw new McpConfigError(
        "INVALID_ENV_REFERENCE",
        `环境变量引用无效: ${trimmed}`,
      );
    }
    return `\${${trimmed}}`;
  }
  return normalized;
}

function renderMcpReferenceTemplate(
  value: string,
  target: McpTargetKind,
): string {
  const syntax = getMcpEnvReferenceSyntax(target);
  MCP_ENV_REFERENCE_PATTERN.lastIndex = 0;
  return value.replace(
    MCP_ENV_REFERENCE_PATTERN,
    (
      _match,
      bracedName: string | undefined,
      defaultValue: string | undefined,
      envDollarName: string | undefined,
      dollarName: string | undefined,
    ) => {
      const name = bracedName ?? envDollarName ?? dollarName ?? "";
      if (syntax === "env-prefix") {
        if (defaultValue !== undefined) {
          throw new McpConfigError(
            "UNSUPPORTED_ENV_REFERENCE",
            `目标 ${target} 不支持带默认值的环境变量引用: ${name}`,
          );
        }
        return `\${env:${name}}`;
      }
      return defaultValue === undefined
        ? `\${${name}}`
        : `\${${name}:-${defaultValue}}`;
    },
  );
}

function parseMcpReferenceMap(
  value: string | Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const source =
    typeof value === "string" ? parseMcpKeyValueLines(value) : value;
  if (!source) return undefined;
  const entries = Object.entries(source).flatMap(([key, entryValue]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return [];
    return [
      [normalizedKey, normalizeMcpReferenceTemplate(String(entryValue))],
    ] as const;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function splitMcpValueMaps(
  literalValue: string | Record<string, string> | undefined,
  referenceValue: string | Record<string, string> | undefined,
): { literal?: Record<string, string>; references?: Record<string, string> } {
  const literalSource = parseMcpKeyValueLines(literalValue) ?? {};
  const references: Record<string, string> = {};
  const literal: Record<string, string> = {};

  for (const [key, value] of Object.entries(literalSource)) {
    if (hasMcpEnvReference(value)) {
      Object.defineProperty(references, key, {
        value: normalizeMcpReferenceTemplate(value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else if (value !== MCP_REDACTED_VALUE) {
      Object.defineProperty(literal, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      Object.defineProperty(literal, key, {
        value: "",
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  for (const [key, value] of Object.entries(
    parseMcpReferenceMap(referenceValue) ?? {},
  )) {
    delete literal[key];
    Object.defineProperty(references, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return {
    literal: Object.keys(literal).length > 0 ? literal : undefined,
    references: Object.keys(references).length > 0 ? references : undefined,
  };
}

function projectMcpValues(
  server: McpServerConfig,
  target: McpTargetKind,
  field: "env" | "headers",
  redactValues = false,
): Record<string, string> | undefined {
  const literal = server[field] === undefined ? {} : { ...server[field] };
  const references = field === "env" ? server.envRefs : server.headerRefs;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(literal)) {
    values[key] = hasMcpEnvReference(value)
      ? renderMcpReferenceTemplate(value, target)
      : redactValues
        ? MCP_REDACTED_VALUE
        : value;
  }
  for (const [key, value] of Object.entries(references ?? {})) {
    values[key] = renderMcpReferenceTemplate(value, target);
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

/**
 * Resolve the JSON root key holding server entries for a target.
 * 解析目标配置文件中存放 MCP 服务条目的根级 key。
 */
export function getMcpServersJsonKey(
  target: McpTargetKind,
): "mcpServers" | "servers" | "mcp" | "amp.mcpServers" {
  if (target === "vscode") {
    return "servers";
  }
  if (target === "amp") {
    return "amp.mcpServers";
  }
  if (target === "opencode" || target === "kilo") {
    return "mcp";
  }
  if (target === "zcode" || target === "openclaw") {
    return "servers";
  }
  return "mcpServers";
}

type McpJsonEntries = Record<string, Record<string, unknown>>;

/**
 * Read a target's MCP entry map without flattening agent-specific nesting.
 * ZCode stores entries below `mcp.servers`; other JSON targets retain their
 * existing top-level key.
 */
export function getMcpJsonServerEntries(
  existing: unknown,
  target: McpTargetKind,
): McpJsonEntries | undefined {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return undefined;
  }

  const root = existing as Record<string, unknown>;
  const container =
    target === "zcode" || target === "openclaw"
      ? root.mcp && typeof root.mcp === "object" && !Array.isArray(root.mcp)
        ? (root.mcp as Record<string, unknown>)
        : undefined
      : root;
  const entries = container?.[getMcpServersJsonKey(target)];
  return entries && typeof entries === "object" && !Array.isArray(entries)
    ? (entries as McpJsonEntries)
    : undefined;
}

/**
 * Write a target's MCP entry map while preserving unrelated JSON settings.
 */
export function setMcpJsonServerEntries(
  existing: unknown,
  target: McpTargetKind,
  entries: McpJsonEntries,
): Record<string, unknown> {
  const root =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  if (target === "zcode" || target === "openclaw") {
    const mcp =
      root.mcp && typeof root.mcp === "object" && !Array.isArray(root.mcp)
        ? { ...(root.mcp as Record<string, unknown>) }
        : {};
    root.mcp = { ...mcp, servers: entries };
    return root;
  }

  root[getMcpServersJsonKey(target)] = entries;
  return root;
}

const HTTP_TRANSPORTS: McpTransport[] = ["streamable-http", "sse"];

export const MCP_TARGET_ENTRY_DIGEST_ALGORITHM =
  "mcp-target-entry-sha256-v1" as const;

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
    // Array entries are positional process arguments, including empty strings.
    return [...value];
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
  config: Pick<
    McpServerConfig,
    "env" | "envRefs" | "args" | "url" | "headers" | "headerRefs"
  >,
): McpEnvRequirement[] {
  const requirements = new Map<string, McpEnvRequirement>();

  for (const [name, value] of Object.entries(config.env ?? {})) {
    if (hasMcpEnvReference(value)) {
      addVariableReferences(requirements, value, "env");
    } else {
      requirements.set(name, {
        name,
        required: value.trim() === "" || isPlaceholder(value),
        placeholder: isPlaceholder(value) ? value : undefined,
        source: "env",
      });
    }
  }
  for (const value of Object.values(config.envRefs ?? {})) {
    addVariableReferences(requirements, value, "env");
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
  for (const value of Object.values(config.headerRefs ?? {})) {
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
  for (const reference of getMcpEnvReferences(value)) {
    const current = requirements.get(reference.name);
    requirements.set(reference.name, {
      name: reference.name,
      required: current?.required === true ? true : !reference.hasDefault,
      source: current?.source ?? source,
    });
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
  // Imported names are target entry keys; rewriting them changes server identity.
  const name =
    draft.source?.type === "import" && draft.name
      ? draft.name
      : sanitizeMcpServerName(draft.name || draft.displayName || "mcp-server");
  const transport = draft.transport || "stdio";
  const displayName = (draft.displayName || name).trim();
  const command = draft.command?.trim();
  const url = draft.url?.trim();
  const envValues = splitMcpValueMaps(draft.env, draft.envRefs);
  const headerValues = splitMcpValueMaps(draft.headers, draft.headerRefs);
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
    ...normalizeMcpNativeOptions(draft),
    name,
    displayName,
    description: draft.description?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    transport,
    command,
    args: args.length > 0 ? args : undefined,
    cwd: draft.cwd?.trim() || undefined,
    env: envValues.literal,
    envRefs: envValues.references,
    url,
    headers: headerValues.literal,
    headerRefs: headerValues.references,
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

export function redactMcpServerConfig(
  server: McpServerConfig,
): McpServerConfig {
  return {
    ...server,
    env: redactMcpValueMap(server.env),
    headers: redactMcpValueMap(server.headers),
    ...(server.oauth && {
      oauth: {
        ...server.oauth,
        ...(server.oauth.clientSecret !== undefined && {
          clientSecret: MCP_REDACTED_VALUE,
        }),
      },
    }),
  };
}

export function redactMcpLibraryForTransport(
  library: McpLibraryFile,
): McpLibraryFile {
  return {
    ...library,
    servers: library.servers.map(redactMcpServerConfig),
    bindings: library.bindings.map((binding) => ({ ...binding })),
  };
}

/**
 * Merge a redacted snapshot without replacing a locally retained literal.
 * A snapshot with no local value becomes an empty value so health checks can
 * report it as missing instead of treating the marker as a credential.
 */
export function mergeMcpLibraryFromTransport(
  local: McpLibraryFile,
  incoming: McpLibraryFile,
): McpLibraryFile {
  const localByIdentity = new Map(
    local.servers.map((server) => [`${server.id}\0${server.name}`, server]),
  );
  const localByName = new Map(
    local.servers.map((server) => [server.name, server]),
  );
  return {
    ...incoming,
    servers: incoming.servers.map((server) => {
      const existing =
        localByIdentity.get(`${server.id}\0${server.name}`) ??
        localByName.get(server.name);
      return {
        ...server,
        env: restoreMcpValueMap(existing?.env, server.env),
        headers: restoreMcpValueMap(existing?.headers, server.headers),
        ...(server.oauth && {
          oauth: {
            ...server.oauth,
            ...(server.oauth.clientSecret === MCP_REDACTED_VALUE && {
              clientSecret: existing?.oauth?.clientSecret ?? "",
            }),
          },
        }),
      };
    }),
  };
}

function redactMcpValueMap(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value || Object.keys(value).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      hasMcpEnvReference(entryValue) ? entryValue : MCP_REDACTED_VALUE,
    ]),
  );
}

function restoreMcpValueMap(
  local: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return undefined;
  const restored = Object.fromEntries(
    Object.entries(incoming).map(([key, value]) => [
      key,
      value === MCP_REDACTED_VALUE ? (local?.[key] ?? "") : value,
    ]),
  );
  return Object.keys(restored).length > 0 ? restored : undefined;
}

export function installMcpTemplate(
  template: McpMarketTemplate,
  now = Date.now(),
): McpServerConfig {
  return normalizeMcpServerDraft(
    {
      ...template,
      // Registry identity is provenance, not a filesystem-safe local resource id.
      id: createId("mcp"),
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
  target: McpTargetKind = "custom-json",
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  if (server.transport === "stdio") {
    return stripUndefined({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: projectMcpValues(server, target, "env", options.redactValues),
    });
  }

  return stripUndefined({
    type: server.transport === "sse" ? "sse" : "http",
    url: server.url,
    headers: projectMcpValues(server, target, "headers", options.redactValues),
    ...(target === "claude" && { headersHelper: server.headersHelper }),
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
  target: McpTargetKind = "opencode",
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  if (server.transport === "stdio") {
    return stripUndefined({
      type: "local",
      command: [server.command ?? "", ...(server.args ?? [])].filter(Boolean),
      environment: projectMcpValues(
        server,
        target,
        "env",
        options.redactValues,
      ),
      enabled: true,
    });
  }

  return stripUndefined({
    type: "remote",
    url: server.url,
    headers: projectMcpValues(server, target, "headers", options.redactValues),
    enabled: true,
  });
}

function toCodexTomlMcpEntry(
  server: McpServerConfig,
  target: McpTargetKind,
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  const native =
    target === "codex"
      ? {
          ...(server.enabled === false && { enabled: false }),
          enabled_tools: server.enabledTools,
          disabled_tools: server.disabledTools,
          startup_timeout_sec: server.startupTimeoutSec,
          tool_timeout_sec: server.toolTimeoutSec,
          required: server.required,
          env_vars: server.envVars,
        }
      : {};
  if (server.transport === "stdio") {
    return stripUndefined({
      ...native,
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: projectMcpValues(server, target, "env", options.redactValues),
    });
  }

  return stripUndefined({
    ...native,
    url: server.url,
    ...(target === "codex" && {
      bearer_token_env_var: server.bearerTokenEnvVar,
      http_headers_helper: server.httpHeadersHelper,
      env_http_headers: codexHeaderEnvironment(server.headerRefs),
    }),
    [target === "grok" ? "headers" : "http_headers"]: projectMcpValues(
      target === "codex" ? { ...server, headerRefs: undefined } : server,
      target,
      "headers",
      options.redactValues,
    ),
  });
}

function codexHeaderEnvironment(
  references: McpServerConfig["headerRefs"],
): Record<string, string> | undefined {
  if (!references) return undefined;
  return Object.fromEntries(
    Object.entries(references).map(([key, value]) => {
      const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
      if (!match)
        throw new McpConfigError(
          "UNSUPPORTED_ENV_REFERENCE",
          `Codex header ${key} requires a single environment variable`,
        );
      return [key, match[1]];
    }),
  );
}

function toOpenClawMcpEntry(
  server: McpServerConfig,
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  if (server.transport === "stdio") {
    return toMcpServerEntry(server, "openclaw", options);
  }

  return stripUndefined({
    url: server.url,
    transport:
      server.transport === "streamable-http" ? "streamable-http" : undefined,
    headers: projectMcpValues(
      server,
      "openclaw",
      "headers",
      options.redactValues,
    ),
  });
}

function toAntigravityMcpEntry(
  server: McpServerConfig,
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  const transport =
    server.transport === "stdio"
      ? toMcpServerEntry(server, "antigravity", options)
      : stripUndefined({
          serverUrl: server.url,
          headers: projectMcpValues(
            server,
            "antigravity",
            "headers",
            options.redactValues,
          ),
        });
  return stripUndefined({
    ...transport,
    authProviderType: server.authProviderType,
    oauth: options.redactValues
      ? redactMcpServerConfig(server).oauth
      : server.oauth,
    disabledTools: server.disabledTools,
    disabled: server.enabled ? undefined : true,
  });
}

export function getMcpTargetEntryObject(
  target: McpTargetKind,
  server: McpServerConfig,
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  if (target === "copilot") {
    return {
      ...toMcpServerEntry(server, target, options),
      type:
        server.transport === "stdio"
          ? "local"
          : server.transport === "sse"
            ? "sse"
            : "http",
      tools: server.enabledTools ?? ["*"],
    };
  }
  if (target === "qwen-work") {
    return {
      ...toMcpServerEntry(server, target, options),
      type: server.transport,
    };
  }
  if (target === "opencode" || target === "kilo") {
    return toOpenCodeMcpEntry(server, target, options);
  }
  if (target === "openclaw") {
    return toOpenClawMcpEntry(server, options);
  }
  if (target === "antigravity") {
    return toAntigravityMcpEntry(server, options);
  }
  if (target === "codex" || target === "custom-toml" || target === "grok") {
    return toCodexTomlMcpEntry(server, target, options);
  }
  return toMcpServerEntry(server, target, options);
}

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function canonicalizeJsonValue(value: unknown): CanonicalJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const canonical = canonicalizeJsonValue(item);
      return canonical === undefined ? null : canonical;
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .flatMap(([key, entryValue]) => {
          const canonical = canonicalizeJsonValue(entryValue);
          return canonical === undefined ? [] : [[key, canonical]];
        }),
    );
  }
  return String(value);
}

export function canonicalizeMcpTargetEntry(entry: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(entry) ?? null);
}

export function computeMcpTargetEntryDigest(
  target: McpTargetKind,
  entry: Record<string, unknown>,
  recordedAt = Date.now(),
  serverName = "",
): McpTargetEntryDigest {
  void target;
  return {
    algorithm: MCP_TARGET_ENTRY_DIGEST_ALGORITHM,
    digest: sha256HexSync(canonicalizeMcpTargetEntry(entry)),
    serverName,
    recordedAt,
  };
}

export function buildMcpServersJson(servers: McpServerConfig[]): {
  mcpServers: Record<string, Record<string, unknown>>;
} {
  return {
    mcpServers: Object.fromEntries(
      servers
        .filter((server) => server.enabled)
        .map((server) => [server.name, toMcpServerEntry(server, "claude")]),
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
        .map((server) => [server.name, toMcpServerEntry(server, "vscode")]),
    ),
  };
}

export function buildMcpTargetJson(
  target: McpTargetKind,
  servers: McpServerConfig[],
  options: { redactValues?: boolean } = {},
): Record<string, unknown> {
  return setMcpJsonServerEntries(
    {},
    target,
    Object.fromEntries(
      servers
        .filter((server) => server.enabled)
        .map((server) => [
          server.name,
          getMcpTargetEntryObject(target, server, options),
        ]),
    ),
  );
}

export function buildMcpToml(
  target: "codex" | "custom-toml" | "grok",
  servers: McpServerConfig[],
  options: { redactValues?: boolean } = {},
): string {
  return servers
    .filter((server) => server.enabled)
    .map((server) => {
      const lines = [`[mcp_servers.${tomlBareKey(server.name)}]`];
      for (const [key, value] of Object.entries(
        toCodexTomlMcpEntry(server, target, options),
      ))
        lines.push(`${tomlBareKey(key)} = ${tomlValue(value)}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value)
      .map(([key, entry]) => `${tomlBareKey(key)} = ${tomlValue(entry)}`)
      .join(", ")} }`;
  throw new McpConfigError("INVALID_SERVER", "Invalid MCP TOML value");
}

export function buildCodexMcpToml(
  servers: McpServerConfig[],
  options: { redactValues?: boolean } = {},
): string {
  return buildMcpToml("codex", servers, options);
}

export function buildMcpConfigPreview(
  target: McpTargetKind,
  servers: McpServerConfig[],
): string {
  if (target === "codex" || target === "custom-toml" || target === "grok") {
    return `${buildMcpToml(target, servers, { redactValues: true })}\n`;
  }
  return `${JSON.stringify(
    buildMcpTargetJson(target, servers, { redactValues: true }),
    null,
    2,
  )}\n`;
}

/** Redact literal values from a target file before returning it to a caller. */
export function redactMcpConfigContent(
  target: McpTargetKind,
  content: string,
): string {
  if (!content.trim()) return content;
  if (target === "codex" || target === "custom-toml" || target === "grok") {
    return redactMcpTomlConfigContent(content, {
      redactedValue: MCP_REDACTED_VALUE,
      isReference: hasMcpEnvReference,
    });
  }

  try {
    const parsed = parseMcpJsonConfigContent(content);
    return `${JSON.stringify(redactMcpJsonValue(parsed), null, 2)}\n`;
  } catch {
    return "[MCP content redacted]";
  }
}

function redactMcpJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactMcpJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (key === "clientSecret" && typeof entry === "string")
        return [key, MCP_REDACTED_VALUE];
      if (
        key === "env" ||
        key === "environment" ||
        key === "headers" ||
        key === "http_headers"
      ) {
        return [
          key,
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.fromEntries(
                Object.entries(entry as Record<string, unknown>).map(
                  ([name, value]) => [
                    name,
                    typeof value === "string" &&
                    getMcpEnvReferences(value).length > 0
                      ? value
                      : MCP_REDACTED_VALUE,
                  ],
                ),
              )
            : entry,
        ];
      }
      return [key, redactMcpJsonValue(entry)];
    }),
  );
}

export function mergeMcpServersJson(
  existing: unknown,
  target: McpTargetKind,
  servers: McpServerConfig[],
): Record<string, unknown> {
  const existingServers = {
    ...(getMcpJsonServerEntries(existing, target) ?? {}),
  };

  for (const server of servers.filter((item) => item.enabled)) {
    existingServers[server.name] = getMcpTargetEntryObject(target, server);
  }

  return setMcpJsonServerEntries(existing, target, existingServers);
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
  const entries = getMcpJsonServerEntries(existing, target);
  if (!entries) {
    return existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  }
  const names = new Set(serverNames);
  return setMcpJsonServerEntries(
    existing,
    target,
    Object.fromEntries(
      Object.entries(entries).filter(([name]) => !names.has(name)),
    ),
  );
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
    if (line === MANAGED_BLOCK_START || line === MANAGED_BLOCK_END) {
      if (line === MANAGED_BLOCK_END) skipping = false;
      kept.push(line);
      continue;
    }
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
    if (!skipping || /^\s*#/.test(line)) {
      kept.push(line);
    }
  }

  return kept
    .join("\n")
    .replace(
      new RegExp(
        `${escapeRegExp(MANAGED_BLOCK_START)}\\n\\s*${escapeRegExp(MANAGED_BLOCK_END)}\\n?`,
        "g",
      ),
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * List MCP server names present in a JSON target config.
 * 列出 JSON 目标配置中已存在的 MCP 服务名称。
 */
export function listMcpServerNamesInJson(
  existing: unknown,
  target: McpTargetKind,
): string[] {
  return Object.keys(getMcpJsonServerEntries(existing, target) ?? {});
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
  return mergeMcpToml(existingContent, "codex", servers);
}

export function mergeMcpToml(
  existingContent: string,
  target: "codex" | "custom-toml" | "grok",
  servers: McpServerConfig[],
): string {
  const retained: string[] = [];
  const names = servers.map((server) => server.name);
  const withoutManaged = existingContent
    .replace(
      new RegExp(
        `\\n?${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?`,
        "g",
      ),
      (managed: string) => {
        const lines = managed.split(/\r?\n/);
        const firstServer = lines.findIndex((line) =>
          parseCodexMcpTomlSection(line),
        );
        if (firstServer >= 0) {
          const remaining = removeCodexMcpTomlServers(
            lines
              .slice(firstServer)
              .filter((line) => line !== MANAGED_BLOCK_END)
              .join("\n"),
            names,
          ).trim();
          if (listMcpServerNamesInToml(remaining).length > 0)
            retained.push(remaining);
        }
        return "\n";
      },
    )
    .trimEnd();
  const block = [
    MANAGED_BLOCK_START,
    ...retained,
    buildMcpToml(target, servers).trim(),
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
