import { parse, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import type { AgentExtensionCapability } from "@prompthub/shared/constants/agent-extension-capabilities";

export function isExtensionRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function extensionJsonObject(content: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(content, errors, { allowTrailingComma: true });
  if (errors.length || !isExtensionRecord(value))
    throw new Error("AGENT_HOOKS_INVALID");
  return value;
}

function validateHandler(
  value: unknown,
  format: AgentExtensionCapability["hooksFormat"],
): void {
  if (!isExtensionRecord(value)) throw new Error("AGENT_HOOKS_INVALID");
  const type =
    value.type ??
    (["cursor", "antigravity"].includes(format) ? "command" : undefined);
  const required: Record<string, string[]> = {
    command: ["command"],
    http: ["url"],
    prompt: ["prompt"],
    agent: ["prompt"],
    mcp_tool: ["server", "tool"],
  };
  const allowed =
    format === "claude"
      ? ["command", "http", "prompt", "agent"]
      : format === "codex"
        ? ["command", "mcp_tool"]
        : format === "cursor"
          ? ["command", "prompt"]
          : ["command"];
  if (
    typeof type !== "string" ||
    !allowed.includes(type) ||
    required[type].some((key) => !nonempty(value[key]))
  )
    throw new Error("AGENT_HOOKS_INVALID");
  if (
    value.timeout !== undefined &&
    (typeof value.timeout !== "number" ||
      !Number.isFinite(value.timeout) ||
      value.timeout <= 0)
  )
    throw new Error("AGENT_HOOKS_INVALID");
}

function validateEvents(
  value: unknown,
  format: AgentExtensionCapability["hooksFormat"],
): void {
  if (!isExtensionRecord(value)) throw new Error("AGENT_HOOKS_INVALID");
  for (const [event, groups] of Object.entries(value)) {
    if (!nonempty(event) || !Array.isArray(groups))
      throw new Error("AGENT_HOOKS_INVALID");
    for (const group of groups) {
      if (
        !isExtensionRecord(group) ||
        (group.matcher !== undefined && typeof group.matcher !== "string")
      )
        throw new Error("AGENT_HOOKS_INVALID");
      if (
        format === "cursor" ||
        (format === "antigravity" && group.hooks === undefined)
      )
        validateHandler(group, format);
      else {
        if (!Array.isArray(group.hooks)) throw new Error("AGENT_HOOKS_INVALID");
        group.hooks.forEach((hook) => validateHandler(hook, format));
      }
    }
  }
}

export function validateExtensionHooks(
  value: unknown,
  format: AgentExtensionCapability["hooksFormat"],
): void {
  if (format !== "antigravity") return validateEvents(value, format);
  if (!isExtensionRecord(value)) throw new Error("AGENT_HOOKS_INVALID");
  for (const [name, definition] of Object.entries(value)) {
    if (!nonempty(name) || !isExtensionRecord(definition))
      throw new Error("AGENT_HOOKS_INVALID");
    const { enabled, ...events } = definition;
    if (enabled !== undefined && typeof enabled !== "boolean")
      throw new Error("AGENT_HOOKS_INVALID");
    validateEvents(events, format);
  }
}

function frontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("AGENT_SUBAGENT_INVALID");
  const document = parseDocument(match[1]);
  const value: unknown = document.errors.length ? null : document.toJS();
  if (!isExtensionRecord(value)) throw new Error("AGENT_SUBAGENT_INVALID");
  return value;
}

export function validateExtensionSubagent(
  agentId: string,
  content: string,
): void {
  let data: Record<string, unknown>;
  try {
    data = agentId === "codex" ? parseToml(content) : frontmatter(content);
  } catch {
    throw new Error("AGENT_SUBAGENT_INVALID");
  }
  const required =
    agentId === "cursor"
      ? []
      : agentId === "opencode"
        ? ["description"]
        : agentId === "codex"
          ? ["name", "description", "developer_instructions"]
          : ["name", "description"];
  if (required.some((key) => !nonempty(data[key])))
    throw new Error("AGENT_SUBAGENT_INVALID");
  for (const key of ["name", "description", "model"]) {
    if (data[key] !== undefined && !nonempty(data[key]))
      throw new Error("AGENT_SUBAGENT_INVALID");
  }
  if (
    agentId === "claude" &&
    typeof data.name === "string" &&
    (data.name.length > 256 ||
      data.name.startsWith("-") ||
      data.name.includes(":"))
  )
    throw new Error("AGENT_SUBAGENT_INVALID");
  if (
    agentId === "gemini" &&
    typeof data.name === "string" &&
    !/^[a-z0-9_-]+$/.test(data.name)
  )
    throw new Error("AGENT_SUBAGENT_INVALID");
  validateSubagentOptions(agentId, data);
}

function validateSubagentOptions(
  agentId: string,
  data: Record<string, unknown>,
): void {
  if (agentId === "opencode") {
    if (
      data.mode !== undefined &&
      !["primary", "subagent", "all"].includes(String(data.mode))
    )
      throw new Error("AGENT_SUBAGENT_INVALID");
    if (data.tools !== undefined && !isExtensionRecord(data.tools))
      throw new Error("AGENT_SUBAGENT_INVALID");
  } else
    for (const key of ["tools", "disallowedTools"]) {
      const value = data[key];
      if (
        value !== undefined &&
        !(Array.isArray(value) && value.every(nonempty)) &&
        !(agentId === "claude" && typeof value === "string")
      )
        throw new Error("AGENT_SUBAGENT_INVALID");
    }
  if (agentId === "claude" && data.hooks !== undefined)
    validateExtensionHooks(data.hooks, "claude");
}
