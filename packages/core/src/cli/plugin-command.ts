import { CoreMcpLibraryService } from "../mcp-library";
import { importChildMcpServersForPlugin } from "../plugin-child-mcp";
import { removeManagedPluginDistribution } from "../plugin-distribution-workflow";
import { readPluginDistributionStatus } from "../plugin-distribution-status";
import { CorePluginError, CorePluginLibraryService } from "../plugin-library";
import {
  getPluginTargetPlatformId,
  resolvePluginPackageTargetPath,
  resolveSharedPluginTargetPath,
} from "../plugin-target-paths";
import type { PluginTargetPathResolver } from "../plugin-library/shared";
import { getCliAgentAssetInventory } from "./agent-assets";
import type { CliDatabaseHooks } from "./types";
import { CliError } from "./types";
import { handlePluginManagement } from "./plugin-management";
import {
  isNativePluginRegistered,
  uninstallNativePlugin,
  installNativePlugin,
  type PluginNativeInstallationOptions,
} from "../plugin-native-installation";

async function createTargetResolver(databaseHooks: CliDatabaseHooks): Promise<{
  resolvePath: PluginTargetPathResolver;
  nativeOptions: PluginNativeInstallationOptions;
}> {
  const agents = new Map(
    (await getCliAgentAssetInventory(databaseHooks.initDatabase())).map(
      (agent) => [agent.id, agent],
    ),
  );
  const resolvePath: PluginTargetPathResolver = (targetId, plugin) => {
    if (targetId === "shared-agents")
      return resolveSharedPluginTargetPath(plugin);
    const platformId = getPluginTargetPlatformId(targetId);
    const agent = platformId ? agents.get(platformId) : undefined;
    if (!agent?.paths.plugins)
      throw new CorePluginError(
        "UNSUPPORTED_TARGET",
        `Cannot resolve Plugin target: ${targetId}`,
      );
    return resolvePluginPackageTargetPath(targetId, plugin, {
      root: agent.paths.root,
      plugins: agent.paths.plugins,
    });
  };
  return {
    resolvePath,
    nativeOptions: {
      getRoot: (id) => {
        const agent = agents.get(id);
        if (!agent)
          throw new CorePluginError(
            "UNSUPPORTED_TARGET",
            `Cannot resolve Plugin Agent: ${id}`,
          );
        return agent.paths.root;
      },
    },
  };
}

export type PluginCliIO = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type OutputFormat = "json" | "table";

const EXIT_CODES = {
  OK: 0,
  USAGE: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  INTERNAL: 10,
} as const;

export const PLUGIN_HELP = [
  "Plugin 命令",
  "",
  "用法:",
  "  prompthub plugin list",
  "  prompthub plugin get <id|name>",
  "  prompthub plugin market",
  "  prompthub plugin sources",
  "  prompthub plugin install <entry-id|name|query>",
  "  prompthub plugin delete <id|name> [--remove-targets]",
  "  prompthub plugin versions <id|name>",
  "  prompthub plugin create-version <id|name> [--note <text>]",
  "  prompthub plugin import <directory|Git URL> [--branch <ref>] [--directory <path>]",
  "  prompthub plugin metadata <id|name> [--favorite|--unfavorite] [--tags <csv>] [--notes <text>]",
  "  prompthub plugin targets",
  "  prompthub plugin import-child-mcp <id|name>",
  "  prompthub plugin status <id|name> [--details]",
  "  prompthub plugin check|check-update <id|name>",
  "  prompthub plugin update <id|name> [--force]",
  "  prompthub plugin rollback <id|name> --version <number>",
  "  prompthub plugin delete-version <id|name> <version-id>",
  "  prompthub plugin distribute|redistribute <id|name> --targets <csv> [--mode copy|symlink]",
  "  prompthub plugin undistribute <id|name> --targets <csv>",
  "",
  "说明:",
  "  Plugin CLI 读写与桌面端相同的 PromptHub Plugin library。",
  "  install 使用官方/内置 market 条目 id；交互终端在 query 多匹配时可选择。",
].join("\n");

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function emitSuccess(
  io: PluginCliIO,
  output: OutputFormat,
  value: unknown,
  tableRows?: Array<Record<string, unknown>>,
): void {
  if (output === "table" && tableRows) {
    if (tableRows.length === 0) {
      io.stdout("(empty)");
      return;
    }
    const headers = Object.keys(tableRows[0]);
    io.stdout(headers.join("\t"));
    for (const row of tableRows) {
      io.stdout(headers.map((key) => String(row[key] ?? "")).join("\t"));
    }
    return;
  }
  io.stdout(toJson(value));
}

function emitError(io: PluginCliIO, code: string, message: string): void {
  io.stderr(toJson({ error: { code, message } }));
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  if (index === args.length - 1) {
    throw new CorePluginError("USAGE_ERROR", `${name} 需要一个值`);
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function requirePositional(
  args: string[],
  index: number,
  name: string,
): string {
  const value = args[index]?.trim();
  if (!value) {
    throw new CorePluginError("USAGE_ERROR", `缺少 ${name}`);
  }
  return value;
}

function ensureNoUnknownOptions(args: string[]): void {
  const unknown = args.find((arg) => arg.startsWith("-"));
  if (unknown) {
    throw new CorePluginError("USAGE_ERROR", `未知参数: ${unknown}`);
  }
}

function resolvePlugin(service: CorePluginLibraryService, identifier: string) {
  const library = service.read();
  const exact = library.plugins.find(
    (plugin) => plugin.id === identifier || plugin.name === identifier,
  );
  if (exact) {
    return exact;
  }
  const needle = identifier.toLowerCase();
  const matches = library.plugins.filter(
    (plugin) =>
      plugin.id.toLowerCase().includes(needle) ||
      plugin.name.toLowerCase().includes(needle) ||
      plugin.displayName.toLowerCase().includes(needle),
  );
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 0) {
    throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${identifier}`);
  }
  throw new CorePluginError(
    "USAGE_ERROR",
    `Plugin 匹配不唯一: ${identifier}（${matches.map((item) => item.id).join(", ")}）`,
  );
}

export async function handlePluginCommand(
  args: string[],
  io: PluginCliIO,
  output: OutputFormat,
  databaseHooks: CliDatabaseHooks,
): Promise<number> {
  try {
    if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
      io.stdout(PLUGIN_HELP);
      return EXIT_CODES.OK;
    }

    databaseHooks.initDatabase();
    const action = requirePositional(args, 0, "plugin 子命令");
    const targets =
      (action === "delete" && args.includes("--remove-targets")) ||
      ["status", "distribute", "redistribute", "undistribute"].includes(action)
        ? await createTargetResolver(databaseHooks)
        : undefined;
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: targets?.resolvePath,
    });

    if (action === "import-child-mcp") {
      const plugin = resolvePlugin(
        service,
        requirePositional(args, 1, "Plugin"),
      );
      if (args.length !== 2)
        throw new CorePluginError(
          "USAGE_ERROR",
          "Expected one Plugin id or name",
        );
      const result = importChildMcpServersForPlugin(
        service,
        plugin.id,
        new CoreMcpLibraryService({ database: databaseHooks.initDatabase() }),
      );
      emitSuccess(io, output, result);
      return result.failedFiles.length ? EXIT_CODES.CONFLICT : EXIT_CODES.OK;
    }
    if (action === "status") {
      const includeContent = takeFlag(args, "--details");
      ensureNoUnknownOptions(args.slice(1));
      const plugin = resolvePlugin(
        service,
        requirePositional(args, 1, "plugin"),
      );
      if (!targets) throw new Error("Plugin targets are unavailable");
      emitSuccess(
        io,
        output,
        readPluginDistributionStatus([plugin], {
          resolvePath: targets.resolvePath,
          includeContent,
          nativeRegistered: (id, entry) =>
            isNativePluginRegistered(entry, id, targets.nativeOptions),
        })[plugin.id],
      );
      return EXIT_CODES.OK;
    }
    const managed = await handlePluginManagement(action, args.slice(1), {
      service,
      resolve: (identifier) => resolvePlugin(service, identifier),
      native: {
        install: async (plugin, target) => {
          if (!targets) throw new Error("Plugin targets are unavailable");
          await installNativePlugin(plugin, target, targets.nativeOptions);
        },
        uninstall: async (plugin, id) => {
          if (!targets) throw new Error("Plugin targets are unavailable");
          await uninstallNativePlugin(plugin, id, targets.nativeOptions);
        },
      },
    });
    if (managed) {
      emitSuccess(io, output, managed.value);
      return managed.failed ? EXIT_CODES.CONFLICT : EXIT_CODES.OK;
    }

    if (action === "list") {
      ensureNoUnknownOptions(args.slice(1));
      const plugins = service.read().plugins;
      emitSuccess(
        io,
        output,
        plugins,
        plugins.map((plugin) => ({
          id: plugin.id,
          name: plugin.name,
          displayName: plugin.displayName,
          version: plugin.version ?? "",
          trust: plugin.trustLevel ?? "",
        })),
      );
      return EXIT_CODES.OK;
    }

    if (action === "get") {
      const identifier = requirePositional(args, 1, "plugin id 或 name");
      ensureNoUnknownOptions(args.slice(2));
      emitSuccess(io, output, resolvePlugin(service, identifier));
      return EXIT_CODES.OK;
    }

    if (action === "market") {
      ensureNoUnknownOptions(args.slice(1));
      const entries = await service.getMarketEntries();
      emitSuccess(
        io,
        output,
        entries,
        entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          displayName: entry.displayName,
          trust: entry.trustLevel,
          marketplace: entry.marketplaceId,
        })),
      );
      return EXIT_CODES.OK;
    }

    if (action === "sources") {
      ensureNoUnknownOptions(args.slice(1));
      const sources = service.getMarketSources();
      emitSuccess(
        io,
        output,
        sources,
        sources.map((source) => ({
          id: source.id,
          displayName: source.displayName,
          trust: source.trustLevel,
        })),
      );
      return EXIT_CODES.OK;
    }

    if (action === "install") {
      const identifier = requirePositional(args, 1, "market entry id 或 name");
      ensureNoUnknownOptions(args.slice(2));
      const entries = await service.getMarketEntries();
      const exact = entries.find(
        (entry) => entry.id === identifier || entry.name === identifier,
      );
      let entryId = exact?.id;
      if (!entryId) {
        const needle = identifier.toLowerCase();
        const matches = entries.filter(
          (entry) =>
            entry.id.toLowerCase().includes(needle) ||
            entry.name.toLowerCase().includes(needle) ||
            entry.displayName.toLowerCase().includes(needle),
        );
        if (matches.length === 1) {
          entryId = matches[0].id;
        } else if (matches.length === 0) {
          throw new CorePluginError(
            "NOT_FOUND",
            `Plugin market 条目不存在: ${identifier}`,
          );
        } else {
          throw new CorePluginError(
            "USAGE_ERROR",
            `Plugin market 匹配不唯一: ${identifier}`,
          );
        }
      }
      const result = await service.installMarketPlugin(entryId);
      emitSuccess(io, output, result);
      return EXIT_CODES.OK;
    }

    if (action === "delete") {
      const identifier = requirePositional(args, 1, "plugin id 或 name");
      const deleteArgs = args.slice(2);
      const removeTargets = takeFlag(deleteArgs, "--remove-targets");
      ensureNoUnknownOptions(deleteArgs);
      const plugin = resolvePlugin(service, identifier);
      if (removeTargets && targets) {
        const ids = plugin.distributedTargetIds ?? [];
        if (ids.length) {
          const removal = await removeManagedPluginDistribution(
            service,
            { pluginId: plugin.id, targetIds: ids },
            {
              install: (entry, target) =>
                installNativePlugin(entry, target, targets.nativeOptions),
              uninstall: (entry, id) =>
                uninstallNativePlugin(entry, id, targets.nativeOptions),
            },
          );
          if (removal.failures?.length) {
            emitSuccess(io, output, { deleted: false, ...removal });
            return EXIT_CODES.CONFLICT;
          }
        }
      }
      const library = service.deletePlugin(plugin.id);
      emitSuccess(io, output, {
        deleted: true,
        id: plugin.id,
        name: plugin.name,
        remaining: library.plugins.length,
        removeDistributedTargets: removeTargets,
      });
      return EXIT_CODES.OK;
    }

    if (action === "versions") {
      const identifier = requirePositional(args, 1, "plugin id 或 name");
      ensureNoUnknownOptions(args.slice(2));
      const plugin = resolvePlugin(service, identifier);
      const versions = service.getPluginVersions(plugin.id);
      emitSuccess(
        io,
        output,
        versions,
        versions.map((version) => ({
          id: version.id,
          version: version.version ?? "",
          note: version.note ?? "",
          createdAt: version.createdAt,
        })),
      );
      return EXIT_CODES.OK;
    }

    if (action === "create-version") {
      const identifier = requirePositional(args, 1, "plugin id 或 name");
      const versionArgs = args.slice(2);
      const note = takeOption(versionArgs, "--note");
      ensureNoUnknownOptions(versionArgs);
      const plugin = resolvePlugin(service, identifier);
      const version = service.createPluginVersion(plugin.id, note);
      emitSuccess(io, output, version);
      return EXIT_CODES.OK;
    }

    throw new CorePluginError(
      "USAGE_ERROR",
      `不支持的 plugin 子命令: ${action}`,
    );
  } catch (error) {
    if (error instanceof CliError) {
      emitError(io, error.code, error.message);
      return error.exitCode;
    }
    if (error instanceof CorePluginError) {
      const exitCode =
        error.code === "NOT_FOUND"
          ? EXIT_CODES.NOT_FOUND
          : error.code === "DUPLICATE_PLUGIN"
            ? EXIT_CODES.CONFLICT
            : error.code === "USAGE_ERROR" || error.code === "INVALID_INPUT"
              ? EXIT_CODES.USAGE
              : EXIT_CODES.INTERNAL;
      emitError(io, error.code, error.message);
      return exitCode;
    }
    emitError(
      io,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : String(error),
    );
    return EXIT_CODES.INTERNAL;
  }
}
