import path from "path";
import type { BuiltinAgentOverrideConfig } from "@prompthub/shared/types";

import { CoreMcpLibraryService, getMcpTargetPresets } from "../mcp-library";
import {
  MCP_TARGET_KINDS,
  type McpApplyTarget,
  type McpMarketTemplate,
  type McpServerConfig,
  type McpServerDraft,
  type McpTargetKind,
  type McpTransport,
} from "@prompthub/shared/types/mcp";
import {
  CliError,
  EXIT_CODES,
  type CliContext,
  type SelectionChoice,
} from "./types";
import {
  ensureNoUnknownOptions,
  optionalPositional,
  parseCsv,
  requirePositional,
  takeFlag,
  takeOption,
} from "./args";
import {
  findRankedMatches,
  hasExactSearchMatch,
  rankSearchValues,
  selectFromTerminal,
  sortPromptChoices,
} from "./select";

export function mcpTemplateChoice(
  template: McpMarketTemplate,
): SelectionChoice<McpMarketTemplate> {
  return {
    value: template,
    id: template.id,
    label: template.displayName || template.name,
    description: template.description,
  };
}

export function parseMcpTransport(
  value: string | undefined,
): McpTransport | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "stdio" || value === "sse" || value === "streamable-http") {
    return value;
  }
  if (value === "http") {
    return "streamable-http";
  }
  throw new CliError(
    "USAGE_ERROR",
    `不支持的 MCP transport: ${value}`,
    EXIT_CODES.USAGE,
  );
}

export function parseJsonObjectOption(
  value: string | undefined,
  optionName: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      result[key] = String(entry);
    }
    return result;
  } catch (error) {
    throw new CliError(
      "USAGE_ERROR",
      `${optionName} 必须是 JSON object`,
      EXIT_CODES.USAGE,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export function resolveMcpServerDraft(
  args: string[],
  options: { requireName: boolean },
): McpServerDraft {
  const name = takeOption(args, "--name");
  const displayName = takeOption(args, "--display-name");
  const description = takeOption(args, "--description");
  const notes = takeOption(args, "--notes");
  const transport = parseMcpTransport(takeOption(args, "--transport"));
  const command = takeOption(args, "--command");
  const argsList = parseCsv(takeOption(args, "--args"));
  const cwd = takeOption(args, "--cwd");
  const url = takeOption(args, "--url");
  const env = parseJsonObjectOption(takeOption(args, "--env"), "--env");
  const headers = parseJsonObjectOption(
    takeOption(args, "--headers"),
    "--headers",
  );
  const tags = parseCsv(takeOption(args, "--tags"));
  const enabled = takeFlag(args, "--enabled")
    ? true
    : takeFlag(args, "--disabled")
      ? false
      : undefined;
  ensureNoUnknownOptions(args);

  if (options.requireName && !name?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "mcp create 需要 --name",
      EXIT_CODES.USAGE,
    );
  }

  const draft: McpServerDraft = {
    ...(name !== undefined && { name: name.trim() }),
    ...(displayName !== undefined && { displayName }),
    ...(description !== undefined && { description }),
    ...(notes !== undefined && { notes }),
    ...(transport !== undefined && { transport }),
    ...(command !== undefined && { command }),
    ...(argsList !== undefined && { args: argsList }),
    ...(cwd !== undefined && { cwd }),
    ...(url !== undefined && { url }),
    ...(env !== undefined && { env }),
    ...(headers !== undefined && { headers }),
    ...(tags !== undefined && { tags }),
    ...(enabled !== undefined && { enabled }),
  };

  if (options.requireName) {
    draft.source = { type: "manual" };
  }

  if (!options.requireName && Object.keys(draft).length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "mcp update 至少需要一个更新字段",
      EXIT_CODES.USAGE,
    );
  }

  return draft;
}

export function resolveMcpTemplate(
  context: CliContext,
  service: CoreMcpLibraryService,
  identifier: string | undefined,
): Promise<McpMarketTemplate> {
  const templates = service.getMarketTemplates();
  if (!identifier?.trim()) {
    return selectFromTerminal(
      context,
      "选择要安装的 MCP 模板：",
      templates.map(mcpTemplateChoice),
      {
        emptyMessage: "没有可安装的 MCP 模板",
        missingMessage:
          "缺少 MCP template id/name；在交互式终端中可省略并选择，非交互调用请传入模板 id 或查询词",
        invalidLabel: "MCP 模板编号",
      },
    );
  }

  const matches = findRankedMatches(
    templates,
    identifier,
    (template) => [
      template.id,
      template.name,
      template.displayName,
      template.description,
      template.packageName,
      ...template.tags,
    ],
    (template) => template.displayName || template.name,
  );
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `MCP 模板不存在或没有匹配项: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  const exactMatches = matches.filter((template) =>
    hasExactSearchMatch(
      [template.id, template.name, template.displayName],
      identifier,
    ),
  );
  if (matches.length === 1 || exactMatches.length === 1) {
    return Promise.resolve(exactMatches[0] ?? matches[0]);
  }

  if (context.io.isInteractive) {
    return selectFromTerminal(
      context,
      `选择 MCP 模板（匹配 "${identifier.trim()}"）：`,
      matches.map(mcpTemplateChoice),
      {
        emptyMessage: "没有可安装的 MCP 模板",
        missingMessage: "缺少 MCP template id/name",
        invalidLabel: "MCP 模板编号",
      },
    );
  }

  throw new CliError(
    "CONFLICT",
    `MCP 模板查询匹配多个结果: ${identifier}`,
    EXIT_CODES.CONFLICT,
    {
      candidates: matches.map((template) => ({
        id: template.id,
        name: template.name,
        displayName: template.displayName,
      })),
    },
  );
}

export function mcpServerTableRows(
  servers: ReturnType<CoreMcpLibraryService["read"]>["servers"],
): Array<Record<string, unknown>> {
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    displayName: server.displayName,
    transport: server.transport,
    command: server.command ?? server.url ?? "",
    enabled: server.enabled,
    source: server.source.type,
  }));
}

export function mcpTemplateTableRows(
  templates: ReturnType<CoreMcpLibraryService["getMarketTemplates"]>,
): Array<Record<string, unknown>> {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    runtime: template.runtime ?? template.command ?? template.transport,
    package: template.packageName ?? "",
    source: template.source?.label ?? "",
  }));
}

export function parseMcpTargetKind(value: string | undefined): McpTargetKind {
  if (!value || !(MCP_TARGET_KINDS as readonly string[]).includes(value)) {
    throw new CliError(
      "USAGE_ERROR",
      `--target 必须是: ${MCP_TARGET_KINDS.join("|")}`,
      EXIT_CODES.USAGE,
    );
  }
  return value as McpTargetKind;
}

export function mcpServerChoice(
  server: McpServerConfig,
): SelectionChoice<McpServerConfig> {
  return {
    value: server,
    id: server.id,
    label: server.displayName || server.name,
    description: server.description,
  };
}

export async function resolveMcpServerIds(
  context: CliContext,
  service: CoreMcpLibraryService,
  identifiers?: string[],
): Promise<string[]> {
  const servers = service.readForTransport().servers;
  if (!identifiers?.length) {
    return servers
      .filter((server) => server.enabled)
      .map((server) => server.id);
  }

  const resolved: string[] = [];
  for (const identifier of identifiers) {
    const matches = findRankedMatches(
      servers,
      identifier,
      (server) => [
        server.id,
        server.name,
        server.displayName,
        server.description,
      ],
      (server) => server.displayName || server.name,
    );
    if (matches.length === 0) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    const exactMatches = matches.filter((server) =>
      hasExactSearchMatch(
        [server.id, server.name, server.displayName],
        identifier,
      ),
    );
    if (matches.length === 1 || exactMatches.length === 1) {
      resolved.push((exactMatches[0] ?? matches[0]).id);
      continue;
    }
    if (context.io.isInteractive) {
      const selected = await selectFromTerminal(
        context,
        `选择 MCP 服务（匹配 "${identifier.trim()}"）：`,
        matches.map(mcpServerChoice),
        {
          emptyMessage: "没有可选择的 MCP 服务",
          missingMessage: "缺少 MCP 服务 id/name",
          invalidLabel: "MCP 服务编号",
        },
      );
      resolved.push(selected.id);
      continue;
    }
    throw new CliError(
      "CONFLICT",
      `MCP 服务查询匹配多个结果: ${identifier}`,
      EXIT_CODES.CONFLICT,
      {
        candidates: matches.map((server) => ({
          id: server.id,
          name: server.name,
        })),
      },
    );
  }

  return Array.from(new Set(resolved));
}

export function resolveMcpApplyTarget(
  args: string[],
  builtinOverrides: Record<string, BuiltinAgentOverrideConfig> = {},
): Omit<McpApplyTarget, "serverIds"> {
  const presetId = takeOption(args, "--preset");
  const targetOption = takeOption(args, "--target");
  const customPath = takeOption(args, "--path");

  if (presetId) {
    const preset = getMcpTargetPresets(
      undefined,
      undefined,
      undefined,
      builtinOverrides,
    ).find((item) => item.id === presetId);
    if (!preset) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 目标平台不存在: ${presetId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    return {
      target: preset.target,
      scope: preset.scope,
      path: preset.path,
    };
  }

  const target = parseMcpTargetKind(targetOption);
  if (!customPath?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "mcp apply/remove 需要 --preset 或 --target + --path",
      EXIT_CODES.USAGE,
    );
  }
  return {
    target,
    scope: "custom",
    path: path.resolve(customPath),
  };
}
