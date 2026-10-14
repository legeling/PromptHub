import path from "path";
import { PromptContentValidationError } from "@prompthub/shared/utils/prompt-content";

import { closeDatabase, initDatabase } from "../database";
import { configureRuntimePaths, resetRuntimePaths } from "../runtime-paths";
import { CoreMcpError } from "../mcp-library";
import { coreCliSkillService, type CliSkillService } from "./skill";
import { handleAIConfigCommand } from "./ai-config-command";
import { handleAgentCommand } from "./agent-command";
import { handlePluginCommand } from "./plugin-command";
import { handlePromptCommand } from "./prompt-command";
import { handleFolderCommand } from "./folder-command";
import { handleDoctorCommand } from "./doctor-command";
import { handleWorkspaceCommand, handleSyncCommand } from "./workspace-command";
import { handleRulesCommand } from "./rules-command";
import { handleSkillCommand } from "./skill-command";
import { handleMcpCommand } from "./mcp-command";
import { CliRemoteSyncError } from "./sync-command";
import {
  SkillPackageEntryLimitError,
  SkillPackageScanLimitError,
  SkillPackageSecretsError,
} from "../skills/package-policy";
import { ROOT_HELP } from "./help";
import {
  CLI_VERSION,
  CliError,
  EXIT_CODES,
  defaultIO,
  type CliContext,
  type CliDatabaseHooks,
  type CliIO,
  type CliRuntimeHooks,
  type OutputDetail,
  type OutputFormat,
} from "./types";
import {
  cloneArgs,
  emitError,
  mapCoreMcpError,
  suppressConsoleNoise,
} from "./io";
import { requirePositional, takeOption } from "./args";

// Re-export public types used by tests and consumers
export type {
  CliIO,
  CliRuntimeHooks,
  CliDatabaseHooks,
  OutputFormat,
} from "./types";
export { CliError, EXIT_CODES, CLI_VERSION } from "./types";

function configureCliRuntime(
  args: string[],
  runtimeHooks: CliRuntimeHooks,
): {
  args: string[];
  detail: OutputDetail;
  output: OutputFormat;
} {
  const nextArgs = cloneArgs(args);
  const dataDir = takeOption(nextArgs, "--data-dir");
  const appDataDir = takeOption(nextArgs, "--app-data-dir");
  const outputOption =
    takeOption(nextArgs, "--output") ?? takeOption(nextArgs, "-o") ?? "json";
  const detailFlags = nextArgs.filter((arg) =>
    ["--summary", "--full", "--quiet"].includes(arg),
  );
  for (let index = nextArgs.length - 1; index >= 0; index -= 1) {
    if (["--summary", "--full", "--quiet"].includes(nextArgs[index])) {
      nextArgs.splice(index, 1);
    }
  }

  if (detailFlags.length > 1) {
    throw new CliError(
      "USAGE_ERROR",
      "--summary、--full 和 --quiet 只能选择一个",
      EXIT_CODES.USAGE,
    );
  }

  if (outputOption !== "json" && outputOption !== "table") {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的输出格式: ${outputOption}`,
      EXIT_CODES.USAGE,
    );
  }

  runtimeHooks.configureRuntimePaths({
    ...(dataDir && { userDataPath: path.resolve(dataDir) }),
    ...(appDataDir && { appDataPath: path.resolve(appDataDir) }),
    exePath: process.execPath,
    isPackaged: false,
    platform: process.platform,
  });

  return {
    args: nextArgs,
    detail:
      detailFlags[0] === "--full"
        ? "full"
        : detailFlags[0] === "--quiet"
          ? "quiet"
          : "summary",
    output: outputOption,
  };
}

function isDatabaseBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("database is locked") ||
    normalized.includes("database table is locked") ||
    normalized.includes("sqlite_busy")
  );
}

let cliProcessGlobalsTail: Promise<void> = Promise.resolve();

async function withCliProcessGlobals<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let release!: () => void;
  const previousOperation = cliProcessGlobalsTail;
  cliProcessGlobalsTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previousOperation.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function runCli(
  argv: string[],
  io: CliIO = defaultIO(),
  runtimeHooks: CliRuntimeHooks = {
    configureRuntimePaths,
    resetRuntimePaths,
  },
  databaseHooks: CliDatabaseHooks = {
    closeDatabase,
    initDatabase,
  },
  skillService: CliSkillService = coreCliSkillService,
): Promise<number> {
  return withCliProcessGlobals(() =>
    runCliOperation(argv, io, runtimeHooks, databaseHooks, skillService),
  );
}

async function runCliOperation(
  argv: string[],
  io: CliIO,
  runtimeHooks: CliRuntimeHooks,
  databaseHooks: CliDatabaseHooks,
  skillService: CliSkillService,
): Promise<number> {
  // Runtime paths, the database adapter, and console suppression are process-global.
  const restoreConsole = suppressConsoleNoise();

  try {
    const configured = configureCliRuntime(argv, runtimeHooks);
    const commandIo: CliIO =
      configured.detail === "quiet" ? { ...io, stdout: () => undefined } : io;
    const context: CliContext = {
      io: commandIo,
      output: configured.output,
      detail: configured.detail,
      skills: skillService,
    };
    const args = configured.args;

    if (args[0] === "--version" || args[0] === "-v") {
      commandIo.stdout(CLI_VERSION);
      return EXIT_CODES.OK;
    }

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      commandIo.stdout(ROOT_HELP);
      return EXIT_CODES.OK;
    }

    const resource = requirePositional(args, 0, "资源类型");
    const commandArgs = args.slice(1);

    if (resource === "prompt") {
      await handlePromptCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "folder") {
      await handleFolderCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "doctor") {
      await handleDoctorCommand(commandArgs, context);
      return EXIT_CODES.OK;
    }
    if (resource === "agent") {
      await handleAgentCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "rules") {
      await handleRulesCommand(commandArgs, context);
      return EXIT_CODES.OK;
    }
    if (resource === "workspace") {
      await handleWorkspaceCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "sync") {
      await handleSyncCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "skill") {
      await handleSkillCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "mcp") {
      await handleMcpCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "plugin") {
      return await handlePluginCommand(
        commandArgs,
        commandIo,
        configured.output,
      );
    }
    if (resource === "ai") {
      return await handleAIConfigCommand(
        commandArgs,
        commandIo,
        configured.output,
      );
    }

    throw new CliError(
      "USAGE_ERROR",
      `不支持的资源类型: ${resource}`,
      EXIT_CODES.USAGE,
    );
  } catch (error) {
    const normalizedError =
      error instanceof PromptContentValidationError
        ? new CliError("USAGE_ERROR", error.message, EXIT_CODES.USAGE)
        : error;
    const cliError =
      normalizedError instanceof CliError
        ? normalizedError
        : error instanceof CoreMcpError
          ? mapCoreMcpError(error)
          : error instanceof CliRemoteSyncError
            ? new CliError(
                error.status === 409 ? "CONFLICT" : "SYNC_ERROR",
                error.message,
                error.status === 409 ? EXIT_CODES.CONFLICT : EXIT_CODES.IO,
              )
            : error instanceof SkillPackageSecretsError
              ? new CliError(
                  "SKILL_PACKAGE_SECRETS_DETECTED",
                  "Skill package 包含疑似私钥、访问令牌或密码，已阻止写入；请移除敏感信息或使用 .prompthubignore 排除本地凭据文件",
                  EXIT_CODES.CONFLICT,
                  {
                    findings: error.findings,
                    findingsTruncated: error.findingsTruncated,
                  },
                )
              : error instanceof SkillPackageScanLimitError
                ? new CliError(
                    "SKILL_PACKAGE_SCAN_LIMIT_EXCEEDED",
                    "Skill package 文本文件过大，无法在受限内存中完成敏感信息扫描；请拆分文件或使用 .prompthubignore 排除无需打包的内容",
                    EXIT_CODES.CONFLICT,
                    {
                      path: error.path,
                      limitKind: error.limitKind,
                      observedBytes: error.observedBytes,
                      limitBytes: error.limitBytes,
                    },
                  )
                : error instanceof SkillPackageEntryLimitError
                  ? new CliError(
                      "SKILL_PACKAGE_ENTRY_LIMIT_EXCEEDED",
                      "Skill package 文件数量超过安全扫描上限；请拆分 package 或使用 .prompthubignore 排除依赖、缓存和构建产物",
                      EXIT_CODES.CONFLICT,
                      {
                        path: error.path,
                        observedEntries: error.observedEntries,
                        limitEntries: error.limitEntries,
                      },
                    )
                  : isDatabaseBusyError(error)
                    ? new CliError(
                        "DATABASE_BUSY",
                        "数据库正在被另一个 PromptHub 进程写入，请稍后重试；如持续出现，请关闭其他 PromptHub 进程后重试",
                        EXIT_CODES.CONFLICT,
                      )
                    : new CliError(
                        "INTERNAL_ERROR",
                        error instanceof Error ? error.message : String(error),
                        EXIT_CODES.INTERNAL,
                      );
    emitError(
      { io, output: "json", detail: "summary", skills: skillService },
      cliError,
    );
    return cliError.exitCode;
  } finally {
    restoreConsole();
    databaseHooks.closeDatabase();
    runtimeHooks.resetRuntimePaths();
  }
}
