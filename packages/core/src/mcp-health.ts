import fs from "fs";
import path from "path";

import type {
  McpHealthCheckResult,
  McpHealthIssue,
  McpHealthStatus,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import {
  getMcpEnvReferences,
  inferMcpEnvRequirements,
  inferMcpPlaceholderRequirements,
  inferMcpRuntimeDetails,
} from "@prompthub/shared/utils/mcp-config";

function commandExists(
  command: string,
  envPath = process.env.PATH ?? "",
): boolean {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command);
  }
  const extensions =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""];
  return envPath
    .split(path.delimiter)
    .some((dir) =>
      extensions.some((extension) =>
        fs.existsSync(path.join(dir, command + extension)),
      ),
    );
}

function getHealthStatus(issues: McpHealthIssue[]): McpHealthStatus {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  return issues.length > 0 ? "warning" : "ok";
}

function validateKnownEnvValue(name: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const validators: Record<string, { pattern: RegExp; example: string }> = {
    AMAP_MAPS_API_KEY: {
      pattern: /^[A-Za-z0-9]{16,64}$/,
      example: "a 16-64 character AMap key",
    },
    BRAVE_API_KEY: {
      pattern: /^BSA[0-9A-Za-z_-]{20,}$/,
      example: "a Brave key starting with BSA",
    },
    FIRECRAWL_API_KEY: {
      pattern: /^fc-[0-9A-Za-z_-]{20,}$/,
      example: "a Firecrawl key starting with fc-",
    },
    GITHUB_PERSONAL_ACCESS_TOKEN: {
      pattern: /^(ghp|github_pat|gho|ghu|ghs|ghr)_[0-9A-Za-z_]{20,}$/,
      example: "a GitHub token such as ghp_... or github_pat_...",
    },
    GOOGLE_MAPS_API_KEY: {
      pattern: /^AIza[0-9A-Za-z_-]{20,}$/,
      example: "a Google Maps key starting with AIza",
    },
    SLACK_BOT_TOKEN: {
      pattern: /^xoxb-[0-9A-Za-z-]{20,}$/,
      example: "a Slack bot token starting with xoxb-",
    },
    SLACK_TEAM_ID: {
      pattern: /^T[A-Z0-9]{8,}$/,
      example: "a Slack workspace/team id such as T01234567",
    },
  };
  const validator = validators[name];
  if (!validator || validator.pattern.test(trimmed)) return null;
  return `${name} has an invalid format; expected ${validator.example}`;
}

export function createMcpHealthResult(
  server: McpServerConfig,
): McpHealthCheckResult {
  const issues: McpHealthIssue[] = [];
  if (server.transport === "stdio") {
    if (!server.command) {
      issues.push({
        code: "MISSING_COMMAND",
        severity: "error",
        field: "command",
        message: "stdio MCP server is missing a command",
      });
    } else if (!commandExists(server.command)) {
      issues.push({
        code: "COMMAND_NOT_FOUND",
        severity: "error",
        field: "command",
        message: `Command not found: ${server.command}`,
      });
    }
    if (server.cwd && !fs.existsSync(server.cwd)) {
      issues.push({
        code: "MISSING_CWD",
        severity: "warning",
        field: "cwd",
        message: `Working directory does not exist: ${server.cwd}`,
      });
    }
  } else {
    try {
      if (!server.url) throw new Error("missing url");
      new URL(server.url);
    } catch {
      issues.push({
        code: "INVALID_URL",
        severity: "error",
        field: "url",
        message: "Remote MCP server URL is invalid",
      });
    }
  }

  const referenceDetails = new Map<string, { hasDefault: boolean }>();
  const referenceValues = [
    ...Object.values(server.env ?? {}),
    ...Object.values(server.envRefs ?? {}),
    ...(server.args ?? []),
    ...(server.url ? [server.url] : []),
    ...Object.values(server.headers ?? {}),
    ...Object.values(server.headerRefs ?? {}),
  ];
  for (const value of referenceValues) {
    for (const reference of getMcpEnvReferences(value)) {
      const current = referenceDetails.get(reference.name);
      referenceDetails.set(reference.name, {
        hasDefault: (current?.hasDefault ?? false) || reference.hasDefault,
      });
    }
  }

  for (const requirement of inferMcpEnvRequirements(server)) {
    const reference = referenceDetails.get(requirement.name);
    const directValue = server.env?.[requirement.name];
    const hasMissingDirectValue =
      Object.prototype.hasOwnProperty.call(
        server.env ?? {},
        requirement.name,
      ) &&
      (!directValue || /^<[^>]+>$/.test(directValue.trim()));
    if (reference) {
      if (hasMissingDirectValue) {
        issues.push({
          code: "MISSING_ENV",
          severity: "error",
          field: requirement.name,
          message: `Missing environment variable: ${requirement.name}`,
        });
        continue;
      }
      if (!reference.hasDefault && !process.env[requirement.name]?.trim()) {
        issues.push({
          code: "UNRESOLVED_ENV_REFERENCE",
          severity: "warning",
          field: requirement.name,
          message: `Environment reference is unavailable in this process: ${requirement.name}`,
        });
      }
      continue;
    }
    if (
      requirement.required &&
      (!directValue || /^<[^>]+>$/.test(directValue.trim()))
    ) {
      issues.push({
        code: "MISSING_ENV",
        severity: "error",
        field: requirement.name,
        message: `Missing environment variable: ${requirement.name}`,
      });
      continue;
    }
    if (!directValue) continue;
    if (/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(directValue.trim())) {
      issues.push({
        code: "UNRESOLVED_ENV_REFERENCE",
        severity: "warning",
        field: requirement.name,
        message: `Environment references may not expand in all MCP targets: ${requirement.name}`,
      });
      continue;
    }
    const invalidMessage = validateKnownEnvValue(requirement.name, directValue);
    if (invalidMessage) {
      issues.push({
        code: "INVALID_ENV_VALUE",
        severity: "warning",
        field: requirement.name,
        message: invalidMessage,
      });
    }
  }

  for (const placeholder of inferMcpPlaceholderRequirements(server)) {
    issues.push({
      code: "PLACEHOLDER_VALUE",
      severity: "error",
      field: placeholder.source,
      message: `Replace the placeholder in ${placeholder.source}`,
    });
  }

  return {
    serverId: server.id,
    serverName: server.name,
    status: getHealthStatus(issues),
    checkedAt: new Date().toISOString(),
    runtime: inferMcpRuntimeDetails(server),
    issues,
  };
}
