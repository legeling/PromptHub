import path from "path";
import { redactMcpServerConfig } from "@prompthub/shared/utils/mcp-config";
import { handleMcpVersionCommand } from "./mcp-version-command";

import { CoreMcpLibraryService } from "../mcp-library";
import {
  CliError,
  EXIT_CODES,
  type CliContext,
  type CliDatabaseHooks,
} from "./types";
import { readAgentManagementSettings } from "../agent-management/agent-settings-repository";
import { MCP_HELP } from "./help";
import { emitSuccess } from "./io";
import {
  ensureNoUnknownOptions,
  optionalPositional,
  parseCsv,
  requirePositional,
  takeFlag,
  takeOption,
} from "./args";
import {
  mcpServerTableRows,
  mcpTemplateTableRows,
  parseMcpTargetKind,
  resolveMcpApplyTarget,
  resolveMcpServerDraft,
  resolveMcpServerIds,
  resolveMcpTemplate,
} from "./mcp-utils";

export async function handleMcpCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(MCP_HELP);
    return;
  }

  const database = databaseHooks.initDatabase();
  const service = new CoreMcpLibraryService({ database });
  const action = requirePositional(args, 0, "mcp 子命令");
  if (action === "version") {
    handleMcpVersionCommand(args.slice(1), context, service);
    return;
  }

  if (action === "list") {
    ensureNoUnknownOptions(args.slice(1));
    const library = service.readForTransport();
    emitSuccess(context, library.servers, mcpServerTableRows(library.servers));
    return;
  }

  if (action === "get") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const server = service.getServer(identifier);
    if (!server) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, server);
    return;
  }

  if (action === "create") {
    const draft = resolveMcpServerDraft(args.slice(1), { requireName: true });
    emitSuccess(context, redactMcpServerConfig(service.createServer(draft)));
    return;
  }

  if (action === "update") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    const current = service.getServer(identifier);
    if (!current) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    const draft = resolveMcpServerDraft(args.slice(2), { requireName: false });
    emitSuccess(context, redactMcpServerConfig(service.updateServer(current.id, draft)));
    return;
  }

  if (action === "delete") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const current = service.getServer(identifier);
    if (!current) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    const library = service.deleteServer(current.id);
    emitSuccess(context, {
      deleted: true,
      id: current.id,
      name: current.name,
      remaining: library.servers.length,
    });
    return;
  }

  if (action === "market") {
    ensureNoUnknownOptions(args.slice(1));
    const templates = service.getMarketTemplates();
    emitSuccess(context, templates, mcpTemplateTableRows(templates));
    return;
  }

  if (action === "sources") {
    ensureNoUnknownOptions(args.slice(1));
    const sources = service.getMarketSources();
    emitSuccess(
      context,
      sources,
      sources.map((source) => ({
        id: source.id,
        label: source.label,
        trustLevel: source.trustLevel,
        url: source.url,
      })),
    );
    return;
  }

  if (action === "install") {
    const identifier = optionalPositional(args, 1);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    const template = await resolveMcpTemplate(context, service, identifier);
    emitSuccess(context, redactMcpServerConfig(service.installMarketTemplate(template)));
    return;
  }

  if (action === "enable" || action === "disable") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    emitSuccess(
      context,
      redactMcpServerConfig(service.setServerEnabled(identifier, action === "enable")),
    );
    return;
  }

  if (action === "import") {
    const filePath = requirePositional(args, 1, "mcp config file");
    ensureNoUnknownOptions(args.slice(2));
    const result = service.importFromFile(path.resolve(filePath));
    emitSuccess(context, { ...result, imported: result.imported.map(redactMcpServerConfig) });
    return;
  }

  if (action === "export") {
    const exportArgs = args.slice(1);
    const target = parseMcpTargetKind(takeOption(exportArgs, "--target"));
    const serverIds = await resolveMcpServerIds(
      context,
      service,
      parseCsv(takeOption(exportArgs, "--servers")),
    );
    ensureNoUnknownOptions(exportArgs);
    context.io.stdout(service.preview(target, serverIds));
    return;
  }

  if (action === "apply" || action === "remove") {
    const targetArgs = args.slice(1);
    const serverIdentifiers = parseCsv(takeOption(targetArgs, "--servers"));
    const force = action === "apply" ? takeFlag(targetArgs, "--force") : false;
    if (action === "remove" && !serverIdentifiers?.length) {
      throw new CliError(
        "USAGE_ERROR",
        "mcp remove 需要 --servers 明确指定要移除的服务",
        EXIT_CODES.USAGE,
      );
    }
    const serverIds = await resolveMcpServerIds(
      context,
      service,
      serverIdentifiers,
    );
    const target = resolveMcpApplyTarget(
      targetArgs,
      readAgentManagementSettings(databaseHooks.initDatabase())
        .builtinAgentOverrides,
    );
    ensureNoUnknownOptions(targetArgs);
    if (serverIds.length === 0) {
      throw new CliError(
        "USAGE_ERROR",
        "没有可处理的 MCP 服务；请启用服务或用 --servers 指定",
        EXIT_CODES.USAGE,
      );
    }
    emitSuccess(
      context,
      action === "apply"
        ? service.apply({ ...target, serverIds, force })
        : service.removeFromTarget({ ...target, serverIds }),
    );
    return;
  }

  if (action === "check") {
    const identifier = args[1];
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    const result = identifier
      ? service.checkServer(identifier)
      : service.checkAllServers();
    emitSuccess(
      context,
      result,
      Array.isArray(result)
        ? result.map((item) => ({
            server: item.serverName,
            status: item.status,
            issues: item.issues.length,
          }))
        : undefined,
    );
    return;
  }

  if (action === "env-import") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    const importArgs = args.slice(2);
    const filePath = takeOption(importArgs, "--file");
    const selectedKeys = parseCsv(takeOption(importArgs, "--keys"));
    ensureNoUnknownOptions(importArgs);
    if (!filePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "mcp env-import 需要 --file",
        EXIT_CODES.USAGE,
      );
    }
    emitSuccess(
      context,
      service.importEnvForServer(
        identifier,
        path.resolve(filePath),
        selectedKeys,
      ),
    );
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 mcp 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}
