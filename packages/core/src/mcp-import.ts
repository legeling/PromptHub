import fs from "fs";
import path from "path";
import { parse as parseToml } from "smol-toml";
import { normalizeMcpNativeOptions } from "@prompthub/shared/utils/mcp-native-options";
import { isMcpTargetKind } from "@prompthub/shared/types/mcp";

import type {
  McpCreateFromTargetRequest,
  McpImportResult,
  McpLibraryFile,
  McpServerConfig,
  McpServerDraft,
  McpTargetKind,
} from "@prompthub/shared/types/mcp";
import {
  getMcpJsonServerEntries,
  normalizeMcpServerDraft,
  parseMcpJsonConfigContent,
} from "@prompthub/shared/utils/mcp-config";

function importServerEntry(
  name: string,
  entry: unknown,
  now: number,
  target?: McpTargetKind,
): McpServerConfig | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const commandParts = Array.isArray(record.command)
    ? record.command.filter((item): item is string => typeof item === "string")
    : [];
  const command =
    typeof record.command === "string" ? record.command : commandParts[0];
  const url =
    typeof record.serverUrl === "string"
      ? record.serverUrl
      : typeof record.url === "string"
        ? record.url
        : undefined;
  if (!command && !url) return null;

  const args =
    commandParts.length > 0
      ? commandParts.slice(1)
      : Array.isArray(record.args)
        ? record.args.filter((item): item is string => typeof item === "string")
        : undefined;
  const envRecord = record.env ?? record.environment;
  const headersRecord = record.headers ?? record.http_headers;

  return normalizeMcpServerDraft(
    {
      name,
      ...normalizeMcpNativeOptions({
        ...record,
        ...(target === "codex" && {
          bearerTokenEnvVar: record.bearer_token_env_var,
          enabledTools: record.enabled_tools,
          disabledTools: record.disabled_tools,
          httpHeadersHelper: record.http_headers_helper,
          startupTimeoutSec: record.startup_timeout_sec,
          toolTimeoutSec: record.tool_timeout_sec,
          envVars: record.env_vars,
        }),
      }),
      displayName: name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      transport: command
        ? "stdio"
        : target === "openclaw"
          ? record.transport === "streamable-http"
            ? "streamable-http"
            : "sse"
          : record.type === "sse"
            ? "sse"
            : "streamable-http",
      command,
      args,
      cwd: typeof record.cwd === "string" ? record.cwd : undefined,
      env:
        envRecord && typeof envRecord === "object" && !Array.isArray(envRecord)
          ? (envRecord as Record<string, string>)
          : undefined,
      url,
      headers:
        headersRecord &&
        typeof headersRecord === "object" &&
        !Array.isArray(headersRecord)
          ? (headersRecord as Record<string, string>)
          : undefined,
      headerRefs:
        target === "codex"
          ? codexHeaderReferences(record.env_http_headers)
          : undefined,
      enabled:
        record.enable !== false &&
        record.enabled !== false &&
        record.disabled !== true,
      source: { type: "import" },
    },
    now,
  );
}

export function parseTomlString(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function parseTomlStringArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseTomlInlineTable(
  value: string,
): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const entries = trimmed
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) return null;
      const key = entry.slice(0, separatorIndex).trim().replace(/^"|"$/g, "");
      const parsedValue = parseTomlString(entry.slice(separatorIndex + 1));
      return key && parsedValue !== undefined ? [key, parsedValue] : null;
    })
    .filter((entry): entry is [string, string] => Boolean(entry));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseCodexTomlServers(
  content: string,
  now: number,
): McpServerConfig[] {
  const entries = parseToml(content).mcp_servers;
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    return [];
  return Object.entries(entries)
    .map(([name, entry]) => importServerEntry(name, entry, now, "codex"))
    .filter((server): server is McpServerConfig => server !== null);
}

function codexHeaderReferences(
  value: unknown,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Codex env_http_headers must be a table");
  return Object.fromEntries(
    Object.entries(value).map(([key, name]) => {
      if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw new Error(`Invalid Codex header environment variable: ${key}`);
      return [key, `\${${name}}`];
    }),
  );
}

function parseJsonImportServers(
  content: string,
  now: number,
): McpServerConfig[] {
  const raw = parseMcpJsonConfigContent(content) as Record<string, unknown>;
  const asObjectRecord = (
    value: unknown,
  ): Record<string, unknown> | undefined =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const mcp = asObjectRecord(raw.mcp);
  const source =
    asObjectRecord(raw.mcpServers) ??
    asObjectRecord(raw.servers) ??
    asObjectRecord(mcp?.servers) ??
    mcp ??
    {};
  return Object.entries(source)
    .map(([name, entry]) => importServerEntry(name, entry, now))
    .filter((server): server is McpServerConfig => Boolean(server));
}

export function readImportServersFromContent(
  content: string,
  now: number,
  format?: "json" | "toml",
): McpServerConfig[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (format === "toml") return parseCodexTomlServers(trimmed, now);
  if (format === "json") return parseJsonImportServers(trimmed, now);
  try {
    return parseJsonImportServers(trimmed, now);
  } catch {
    const servers = parseCodexTomlServers(trimmed, now);
    if (servers.length > 0) return servers;
    throw new Error("Invalid MCP config content");
  }
}

export function readMcpImportServers(
  filePath: string,
  now: number,
): McpServerConfig[] {
  const content = fs.readFileSync(filePath, "utf8");
  const format =
    path.extname(filePath).toLowerCase() === ".toml" ? "toml" : "json";
  return readImportServersFromContent(content, now, format);
}

export function mergeMcpImportedServers(
  library: McpLibraryFile,
  sourceServers: McpServerConfig[],
): McpImportResult & { library: McpLibraryFile } {
  const imported: McpServerConfig[] = [];
  const skipped: string[] = [];
  const existingNames = new Set(library.servers.map((server) => server.name));
  for (const server of sourceServers) {
    if (existingNames.has(server.name)) {
      skipped.push(server.name);
      continue;
    }
    imported.push(server);
    existingNames.add(server.name);
  }
  return {
    imported,
    skipped,
    library:
      imported.length > 0
        ? { ...library, servers: [...imported, ...library.servers] }
        : library,
  };
}

export function readMcpTargetServers(
  filePath: string,
  target: McpTargetKind,
  now: number,
): McpServerConfig[] {
  const content = fs.readFileSync(filePath, "utf8");
  if (target === "codex" || target === "custom-toml" || target === "grok") {
    return parseCodexTomlServers(content, now);
  }
  const source = getMcpJsonServerEntries(
    parseMcpJsonConfigContent(content),
    target,
  );
  if (!source) return [];
  return Object.entries(source)
    .map(([name, entry]) => importServerEntry(name, entry, now, target))
    .filter((server): server is McpServerConfig => Boolean(server))
    .map((server) => ({
      ...server,
      source: { type: "import", id: target, label: filePath },
    }));
}

export function readMcpTargetImportDraft(
  request: McpCreateFromTargetRequest,
  now: number,
): McpServerDraft {
  const { preset, serverName } = request;
  if (
    !preset ||
    !isMcpTargetKind(preset.target) ||
    typeof preset.path !== "string" ||
    !path.isAbsolute(preset.path) ||
    preset.path.includes("\0") ||
    typeof preset.id !== "string" ||
    !preset.id.trim() ||
    typeof preset.label !== "string" ||
    typeof serverName !== "string" ||
    !serverName.trim()
  )
    throw new Error("Invalid MCP target import request");
  const server = readMcpTargetServers(preset.path, preset.target, now).find(
    (entry) => entry.name === serverName,
  );
  if (!server) throw new Error(`MCP target server not found: ${serverName}`);
  // Credentials must come from the main-process file read, never the redacted inventory.
  return {
    ...server,
    id: undefined,
    source: { type: "import", id: preset.id, label: preset.label },
  };
}
