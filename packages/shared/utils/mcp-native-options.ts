import type { McpServerConfig } from "../types/mcp";

type NativeOptions = Pick<
  McpServerConfig,
  | "authProviderType"
  | "oauth"
  | "disabledTools"
  | "enabledTools"
  | "bearerTokenEnvVar"
  | "headersHelper"
  | "httpHeadersHelper"
  | "startupTimeoutSec"
  | "toolTimeoutSec"
  | "required"
  | "envVars"
>;

export function normalizeMcpNativeOptions(value: unknown): NativeOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MCP native options must be an object");
  }
  // Imports arrive as untyped native JSON at this boundary.
  const record = value as Record<string, unknown>;
  const result: NativeOptions = {};
  for (const key of [
    "authProviderType",
    "bearerTokenEnvVar",
    "headersHelper",
    "httpHeadersHelper",
  ] as const) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string")
      throw new Error(`MCP ${key} must be a string`);
    result[key] = entry;
  }
  for (const key of ["disabledTools", "enabledTools", "envVars"] as const) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (!Array.isArray(entry) || entry.some((item) => typeof item !== "string"))
      throw new Error(`MCP ${key} must be a string array`);
    result[key] = [...entry];
  }
  for (const key of ["startupTimeoutSec", "toolTimeoutSec"] as const) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0)
      throw new Error(`MCP ${key} must be a nonnegative number`);
    result[key] = entry;
  }
  if (record.required !== undefined) {
    if (typeof record.required !== "boolean")
      throw new Error("MCP required must be a boolean");
    result.required = record.required;
  }
  if (record.oauth !== undefined) {
    if (
      !record.oauth ||
      typeof record.oauth !== "object" ||
      Array.isArray(record.oauth)
    )
      throw new Error("MCP oauth must be an object");
    const oauth: McpServerConfig["oauth"] = {};
    for (const key of ["clientId", "clientSecret"] as const) {
      const entry: unknown = Reflect.get(record.oauth, key);
      if (entry !== undefined && typeof entry !== "string")
        throw new Error(`MCP oauth.${key} must be a string`);
      if (typeof entry === "string") oauth[key] = entry;
    }
    result.oauth = oauth;
  }
  return result;
}
