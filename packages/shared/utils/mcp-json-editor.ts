import type { McpServerConfig, McpServerDraft } from "../types/mcp";
import { MCP_REDACTED_VALUE, toMcpServerEntry } from "./mcp-config";

export class McpJsonEditError extends Error {
  constructor(
    readonly code:
      | "syntax"
      | "shape"
      | "singleServer"
      | "fields"
      | "values"
      | "redacted"
      | "required"
      | "transport",
  ) {
    super(`Invalid MCP JSON: ${code}`);
    this.name = "McpJsonEditError";
  }
}

export function buildMcpEditableJson(server: McpServerConfig): string {
  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: toMcpServerEntry(server, "custom-json", {
          redactValues: true,
        }),
      },
    },
    null,
    2,
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new McpJsonEditError("shape");
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.includes("\0"))
    throw new McpJsonEditError("values");
  return value;
}

function required(value: unknown): string {
  if (value === undefined || value === "")
    throw new McpJsonEditError("required");
  const result = string(value);
  if (!result.trim()) throw new McpJsonEditError("required");
  return result;
}

function values(
  value: unknown,
  retained?: Record<string, string>,
): Record<string, string> {
  if (value === undefined) return {};
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, entry]) => {
      string(key);
      if (!key || key.trim() !== key) throw new McpJsonEditError("values");
      const text = string(entry);
      if (
        text === MCP_REDACTED_VALUE &&
        !Object.prototype.hasOwnProperty.call(retained ?? {}, key)
      ) {
        throw new McpJsonEditError("redacted");
      }
      return [key, text];
    }),
  );
}

function args(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new McpJsonEditError("values");
  return value.map(string);
}

function entryFromJson(content: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new McpJsonEditError("syntax");
  }
  const root = object(parsed);
  if (Object.keys(root).length !== 1 || !Object.hasOwn(root, "mcpServers"))
    throw new McpJsonEditError("shape");
  const servers = object(root.mcpServers);
  if (Object.keys(servers).length !== 1 || !Object.hasOwn(servers, name))
    throw new McpJsonEditError("singleServer");
  return object(servers[name]);
}

/** Parse the single-server editable projection; library metadata/native options stay Core-owned. */
export function parseMcpEditableJson(
  content: string,
  current: McpServerConfig,
): McpServerDraft {
  const entry = entryFromJson(content, current.name);
  const type =
    entry.type === undefined
      ? entry.url !== undefined
        ? "http"
        : "stdio"
      : entry.type;
  if (
    type !== "stdio" &&
    type !== "http" &&
    type !== "sse" &&
    type !== "streamable-http"
  )
    throw new McpJsonEditError("transport");
  const allowed =
    type === "stdio"
      ? ["type", "command", "args", "cwd", "env"]
      : ["type", "url", "headers"];
  if (Object.keys(entry).some((key) => !allowed.includes(key)))
    throw new McpJsonEditError("fields");
  return {
    transport: type === "http" ? "streamable-http" : type,
    command: type === "stdio" ? required(entry.command) : undefined,
    args: type === "stdio" ? args(entry.args) : [],
    cwd: type === "stdio" && entry.cwd !== undefined ? string(entry.cwd) : "",
    env: type === "stdio" ? values(entry.env, current.env) : {},
    envRefs: {},
    url: type !== "stdio" ? required(entry.url) : undefined,
    headers: type !== "stdio" ? values(entry.headers, current.headers) : {},
    headerRefs: {},
  };
}
