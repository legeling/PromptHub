import path from "node:path";
import type {
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
  ManagedAgentFilter,
} from "@prompthub/shared/types";

import {
  AgentSettingsError,
  AgentSettingsRepository,
  buildCliManagedAgentInventory,
  createAgentUserConfigFileService,
  validateAgentRelativePath,
  type AgentConfigContext,
  type AgentManagementSettings,
  type CliManagedAgent,
} from "../agent-management";
import { AGENT_HELP } from "./help";
import {
  ensureNoUnknownOptions,
  parseCsv,
  requirePositional,
  takeFlag,
  takeOption,
} from "./args";
import { emitSuccess } from "./io";
import {
  CliError,
  EXIT_CODES,
  type CliContext,
  type CliDatabaseHooks,
} from "./types";

const FILTERS = new Set<ManagedAgentFilter>([
  "all",
  "installed",
  "configured",
  "custom",
  "not-detected",
  "needs-attention",
]);

interface AgentAssetOptions {
  rootPath?: string;
  skillsRelativePath?: string;
  mcpRelativePath?: string;
  pluginsRelativePath?: string;
  rulesRelativePath?: string;
  agentsRelativePath?: string;
  commandsRelativePath?: string;
  configRelativePaths?: string[];
}

const agentConfigFileService = createAgentUserConfigFileService({
  createBackup: async () => {
    throw new Error("AGENT_CONFIG_WRITE_UNAVAILABLE");
  },
});

function toCliSettingsError(error: AgentSettingsError): CliError {
  const conflict =
    error.code === "AGENT_ID_CONFLICT" ||
    error.code === "AGENT_ROOT_CONFLICT" ||
    error.code === "BUILTIN_AGENT_DELETE_FORBIDDEN";
  return new CliError(
    error.code,
    error.message,
    conflict ? EXIT_CODES.CONFLICT : EXIT_CODES.NOT_FOUND,
  );
}

function validateRootPath(value: string, field = "--root"): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("\0")) {
    throw new CliError(
      "INVALID_AGENT_PATH",
      `${field} 必须是非空且不含 NUL 的路径`,
      EXIT_CODES.USAGE,
    );
  }
  return path.resolve(normalized);
}

function parseRelativeOption(
  args: string[],
  option: string,
  field: string,
): string | undefined {
  const value = takeOption(args, option);
  if (value === undefined) return undefined;
  try {
    return validateAgentRelativePath(value, field);
  } catch {
    throw new CliError(
      "INVALID_AGENT_PATH",
      `${option} 必须是安全的相对路径`,
      EXIT_CODES.USAGE,
    );
  }
}

function parseAgentAssetOptions(args: string[]): AgentAssetOptions {
  const root = takeOption(args, "--root");
  const configPaths = takeOption(args, "--config-paths");
  let configRelativePaths: string[] | undefined;
  if (configPaths !== undefined) {
    const entries = parseCsv(configPaths) ?? [];
    try {
      configRelativePaths = entries.map((entry) =>
        validateAgentRelativePath(entry, "config path"),
      );
    } catch {
      throw new CliError(
        "INVALID_AGENT_PATH",
        "--config-paths 必须只包含安全的相对路径",
        EXIT_CODES.USAGE,
      );
    }
  }
  return {
    ...(root !== undefined ? { rootPath: validateRootPath(root) } : {}),
    skillsRelativePath: parseRelativeOption(
      args,
      "--skills-path",
      "skillsRelativePath",
    ),
    mcpRelativePath: parseRelativeOption(args, "--mcp-path", "mcpRelativePath"),
    pluginsRelativePath: parseRelativeOption(
      args,
      "--plugins-path",
      "pluginsRelativePath",
    ),
    rulesRelativePath: parseRelativeOption(
      args,
      "--rules-path",
      "rulesRelativePath",
    ),
    agentsRelativePath: parseRelativeOption(
      args,
      "--agents-path",
      "agentsRelativePath",
    ),
    commandsRelativePath: parseRelativeOption(
      args,
      "--commands-path",
      "commandsRelativePath",
    ),
    ...(configRelativePaths !== undefined ? { configRelativePaths } : {}),
  };
}

function compactUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function resolveAgent(
  agents: CliManagedAgent[],
  identifier: string,
): CliManagedAgent {
  const normalized = identifier.trim().toLocaleLowerCase();
  const exact = agents.find(
    (agent) =>
      agent.id.toLocaleLowerCase() === normalized ||
      agent.name.toLocaleLowerCase() === normalized,
  );
  if (exact) return exact;
  const matches = agents.filter(
    (agent) =>
      agent.id.toLocaleLowerCase().includes(normalized) ||
      agent.name.toLocaleLowerCase().includes(normalized),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `Agent 不存在: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }
  throw new CliError(
    "AMBIGUOUS_AGENT",
    `Agent 匹配不唯一: ${identifier}（${matches.map((agent) => agent.id).join(", ")}）`,
    EXIT_CODES.USAGE,
  );
}

function capabilitySummary(agent: CliManagedAgent): string {
  return Object.entries(agent.capabilities)
    .filter(([, capability]) => capability.status === "supported")
    .map(([name]) => name)
    .join(",");
}

function agentRows(agents: CliManagedAgent[]): Array<Record<string, unknown>> {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    enabled: agent.enabled,
    status: agent.status,
    custom: agent.isCustom,
    root: agent.paths.root,
    capabilities: capabilitySummary(agent),
  }));
}

function toAgentConfigContext(agent: CliManagedAgent): AgentConfigContext {
  return {
    agentId: agent.id,
    rootPath: agent.paths.root,
    relativePaths: agent.paths.configFileRelativePaths,
  };
}

function toCliAgentConfigError(error: unknown): CliError | null {
  if (!(error instanceof Error)) return null;
  if (
    error.message === "AGENT_CONFIG_PATH_INVALID" ||
    error.message === "AGENT_CONFIG_PATH_EXCLUDED"
  ) {
    return new CliError(error.message, error.message, EXIT_CODES.USAGE);
  }
  if (error.message === "AGENT_CONFIG_FILE_NOT_DISCOVERED") {
    return new CliError(
      "AGENT_CONFIG_FILE_NOT_FOUND",
      "Agent 配置文件不存在或不在可读取清单中",
      EXIT_CODES.NOT_FOUND,
    );
  }
  if (
    error.message === "AGENT_CONFIG_ROOT_INVALID" ||
    error.message === "AGENT_CONFIG_SYMLINK_REJECTED" ||
    error.message === "AGENT_CONFIG_FILE_INVALID"
  ) {
    return new CliError(error.message, error.message, EXIT_CODES.IO);
  }
  return null;
}

function ensureNoUnexpectedPositionals(args: string[]): void {
  ensureNoUnknownOptions(args);
  if (args.length > 0) {
    throw new CliError(
      "USAGE_ERROR",
      `多余参数: ${args.join(", ")}`,
      EXIT_CODES.USAGE,
    );
  }
}

function getBuiltinPlatforms(context: CliContext) {
  return context.skills
    .getSupportedPlatforms()
    .filter((platform) => !platform.isCustom);
}

async function getInventory(
  context: CliContext,
  settings: AgentManagementSettings,
  options: {
    includeDisabled?: boolean;
    search?: string;
    filter?: ManagedAgentFilter;
  } = {},
): Promise<CliManagedAgent[]> {
  return buildCliManagedAgentInventory(
    getBuiltinPlatforms(context),
    settings,
    options,
  );
}

async function emitAgentById(
  context: CliContext,
  settings: AgentManagementSettings,
  agentId: string,
): Promise<void> {
  const agents = await getInventory(context, settings, {
    includeDisabled: true,
  });
  emitSuccess(context, resolveAgent(agents, agentId));
}

async function handleList(
  args: string[],
  context: CliContext,
  settings: AgentManagementSettings,
): Promise<void> {
  const filterValue = takeOption(args, "--filter") ?? "all";
  const search = takeOption(args, "--search") ?? "";
  const includeDisabled = takeFlag(args, "--include-disabled");
  ensureNoUnknownOptions(args.slice(1));
  if (!FILTERS.has(filterValue as ManagedAgentFilter)) {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的 Agent filter: ${filterValue}`,
      EXIT_CODES.USAGE,
    );
  }
  const agents = await getInventory(context, settings, {
    filter: filterValue as ManagedAgentFilter,
    search,
    includeDisabled,
  });
  emitSuccess(context, agents, agentRows(agents));
}

async function handleGet(
  args: string[],
  context: CliContext,
  settings: AgentManagementSettings,
): Promise<void> {
  const identifier = requirePositional(args, 1, "agent id、name 或 query");
  const queryArgs = args.slice(2);
  const includeDisabled = takeFlag(queryArgs, "--include-disabled");
  ensureNoUnknownOptions(queryArgs);
  const agents = await getInventory(context, settings, { includeDisabled });
  emitSuccess(context, resolveAgent(agents, identifier));
}

async function handleConfig(
  args: string[],
  context: CliContext,
  settings: AgentManagementSettings,
): Promise<void> {
  const action = requirePositional(args, 1, "config 子命令");
  if (action !== "list" && action !== "read") {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的 agent config 子命令: ${action}`,
      EXIT_CODES.USAGE,
    );
  }
  const identifier = requirePositional(args, 2, "agent id、name 或 query");
  const relativePath =
    action === "read"
      ? requirePositional(args, 3, "Agent 配置文件相对路径")
      : undefined;
  const optionArgs = args.slice(action === "read" ? 4 : 3);
  const includeDisabled = takeFlag(optionArgs, "--include-disabled");
  ensureNoUnexpectedPositionals(optionArgs);
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled }),
    identifier,
  );
  const configContext = toAgentConfigContext(agent);

  try {
    if (action === "list") {
      const entries = await agentConfigFileService.list(configContext);
      emitSuccess(
        context,
        entries,
        entries.map((entry) => ({
          path: entry.path,
          type: entry.isDirectory ? "directory" : "file",
          size: entry.size,
        })),
      );
      return;
    }

    const entry = await agentConfigFileService.read(
      configContext,
      relativePath!,
    );
    if (!entry) {
      throw new CliError(
        "AGENT_CONFIG_FILE_NOT_FOUND",
        `Agent 配置文件不存在: ${relativePath}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, entry);
  } catch (error) {
    if (error instanceof CliError) throw error;
    const cliError = toCliAgentConfigError(error);
    if (cliError) throw cliError;
    throw error;
  }
}

async function handleVisibility(
  action: "enable" | "disable",
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const identifier = requirePositional(args, 1, "agent id、name 或 query");
  ensureNoUnknownOptions(args.slice(2));
  const settings = repository.read();
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled: true }),
    identifier,
  );
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  const next = repository.setEnabled(agent.id, action === "enable", builtinIds);
  await emitAgentById(context, next, agent.id);
}

function resolveCustomInput(args: string[]): CustomAgentConfig {
  const nameValue = takeOption(args, "--name");
  const name = nameValue?.trim();
  const root = takeOption(args, "--root");
  const idValue = takeOption(args, "--id");
  const id = idValue?.trim() || `agent_${crypto.randomUUID()}`;
  if (!name || root === undefined) {
    throw new CliError(
      "USAGE_ERROR",
      "agent add 需要 --name 和 --root",
      EXIT_CODES.USAGE,
    );
  }
  if (idValue !== undefined && !idValue.trim()) {
    throw new CliError("USAGE_ERROR", "--id 不能为空", EXIT_CODES.USAGE);
  }
  const assetArgs = ["--root", root, ...args];
  const assetOptions = parseAgentAssetOptions(assetArgs);
  ensureNoUnknownOptions(assetArgs);
  return {
    id,
    name,
    rootPath: assetOptions.rootPath!,
    enabled: true,
    ...compactUndefined(assetOptions),
  };
}

async function handleAdd(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const input = resolveCustomInput(args.slice(1));
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  const next = repository.addCustomAgent(input, builtinIds);
  await emitAgentById(context, next, input.id);
}

function parseUpdateInput(
  args: string[],
): Partial<Omit<CustomAgentConfig, "id">> {
  const nameValue = takeOption(args, "--name");
  const name = nameValue?.trim();
  const enabled = takeFlag(args, "--enabled");
  const disabled = takeFlag(args, "--disabled");
  if (enabled && disabled) {
    throw new CliError(
      "USAGE_ERROR",
      "--enabled 和 --disabled 不能同时使用",
      EXIT_CODES.USAGE,
    );
  }
  if (nameValue !== undefined && !name) {
    throw new CliError("USAGE_ERROR", "--name 不能为空", EXIT_CODES.USAGE);
  }
  const options = compactUndefined(parseAgentAssetOptions(args));
  ensureNoUnknownOptions(args);
  return {
    ...options,
    ...(name !== undefined ? { name } : {}),
    ...(enabled || disabled ? { enabled } : {}),
  };
}

async function handleUpdate(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const identifier = requirePositional(
    args,
    1,
    "custom agent id、name 或 query",
  );
  const settings = repository.read();
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled: true }),
    identifier,
  );
  if (!agent.isCustom) {
    throw new CliError(
      "USAGE_ERROR",
      "内置 Agent 请使用 agent configure",
      EXIT_CODES.USAGE,
    );
  }
  const updates = parseUpdateInput(args.slice(2));
  if (Object.keys(updates).length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "agent update 缺少更新字段",
      EXIT_CODES.USAGE,
    );
  }
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  const next = repository.updateCustomAgent(agent.id, updates, builtinIds);
  await emitAgentById(context, next, agent.id);
}

async function handleConfigure(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const identifier = requirePositional(args, 1, "agent id、name 或 query");
  const settings = repository.read();
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled: true }),
    identifier,
  );
  const configureArgs = args.slice(2);
  const updates = compactUndefined(parseAgentAssetOptions(configureArgs));
  ensureNoUnknownOptions(configureArgs);
  if (Object.keys(updates).length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "agent configure 缺少路径配置字段",
      EXIT_CODES.USAGE,
    );
  }
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  const next = agent.isCustom
    ? repository.updateCustomAgent(agent.id, updates, builtinIds)
    : repository.setBuiltinOverride(
        agent.id,
        {
          ...settings.builtinAgentOverrides[agent.id],
          ...updates,
        } as BuiltinAgentOverrideConfig,
        builtinIds,
      );
  await emitAgentById(context, next, agent.id);
}

async function handleReset(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const identifier = requirePositional(
    args,
    1,
    "built-in agent id、name 或 query",
  );
  ensureNoUnknownOptions(args.slice(2));
  const settings = repository.read();
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled: true }),
    identifier,
  );
  if (agent.isCustom) {
    throw new CliError(
      "USAGE_ERROR",
      "Custom Agent 必须保留 root，请使用 agent update",
      EXIT_CODES.USAGE,
    );
  }
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  const next = repository.resetBuiltinOverride(agent.id, builtinIds);
  await emitAgentById(context, next, agent.id);
}

async function handleDelete(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): Promise<void> {
  const identifier = requirePositional(
    args,
    1,
    "custom agent id、name 或 query",
  );
  ensureNoUnknownOptions(args.slice(2));
  const settings = repository.read();
  const agent = resolveAgent(
    await getInventory(context, settings, { includeDisabled: true }),
    identifier,
  );
  const builtinIds = new Set(getBuiltinPlatforms(context).map(({ id }) => id));
  repository.deleteCustomAgent(agent.id, builtinIds);
  emitSuccess(context, { deleted: true, id: agent.id, rootPreserved: true });
}

function identityChoice(value: string | undefined, option: string) {
  if (value !== "codex" && value !== "chatgpt") {
    throw new CliError(
      "USAGE_ERROR",
      `${option} 必须是 codex 或 chatgpt`,
      EXIT_CODES.USAGE,
    );
  }
  return value;
}

function handleIdentity(
  args: string[],
  context: CliContext,
  repository: AgentSettingsRepository,
): void {
  const action = requirePositional(args, 1, "identity 子命令");
  if (action === "get") {
    ensureNoUnknownOptions(args.slice(2));
    emitSuccess(context, repository.read().agentIdentityPreferences.codex);
    return;
  }
  if (action !== "set") {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的 agent identity 子命令: ${action}`,
      EXIT_CODES.USAGE,
    );
  }
  const updateArgs = args.slice(2);
  const current = repository.read().agentIdentityPreferences.codex!;
  const nameOption = takeOption(updateArgs, "--name");
  const iconOption = takeOption(updateArgs, "--icon");
  ensureNoUnknownOptions(updateArgs);
  if (nameOption === undefined && iconOption === undefined) {
    throw new CliError(
      "USAGE_ERROR",
      "identity set 需要 --name 或 --icon",
      EXIT_CODES.USAGE,
    );
  }
  const next = repository.setCodexIdentity({
    name:
      nameOption !== undefined
        ? identityChoice(nameOption, "--name")
        : current.name,
    icon:
      iconOption !== undefined
        ? identityChoice(iconOption, "--icon")
        : current.icon,
  });
  emitSuccess(context, next.agentIdentityPreferences.codex);
}

async function dispatchAgentCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(AGENT_HELP);
    return;
  }
  const action = requirePositional(args, 0, "agent 子命令");
  const repository = new AgentSettingsRepository(databaseHooks.initDatabase());
  if (action === "list") return handleList(args, context, repository.read());
  if (action === "get") return handleGet(args, context, repository.read());
  if (action === "config") {
    return handleConfig(args, context, repository.read());
  }
  if (action === "enable" || action === "disable") {
    return handleVisibility(action, args, context, repository);
  }
  if (action === "add") return handleAdd(args, context, repository);
  if (action === "update") return handleUpdate(args, context, repository);
  if (action === "configure") return handleConfigure(args, context, repository);
  if (action === "reset") return handleReset(args, context, repository);
  if (action === "delete") return handleDelete(args, context, repository);
  if (action === "identity") return handleIdentity(args, context, repository);
  throw new CliError(
    "USAGE_ERROR",
    `不支持的 agent 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

export async function handleAgentCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  try {
    await dispatchAgentCommand(args, context, databaseHooks);
  } catch (error) {
    if (error instanceof AgentSettingsError) throw toCliSettingsError(error);
    throw error;
  }
}
