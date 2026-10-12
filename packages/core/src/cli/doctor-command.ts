import {
  inspectDatabaseClientLock,
  recoverDatabaseClientLock,
} from "@prompthub/db";

import { getDatabasePath } from "../runtime-paths";
import { ensureNoUnknownOptions, requirePositional, takeFlag } from "./args";
import { DOCTOR_HELP } from "./help";
import { emitSuccess } from "./io";
import { CliError, EXIT_CODES, type CliContext } from "./types";

export async function handleDoctorCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(DOCTOR_HELP);
    return;
  }

  const action = requirePositional(args, 0, "doctor command");
  if (action !== "database-lock") {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的 doctor 命令: ${action}`,
      EXIT_CODES.USAGE,
    );
  }

  const commandArgs = args.slice(1);
  const shouldRecover = takeFlag(commandArgs, "--recover");
  ensureNoUnknownOptions(commandArgs);
  const dbPath = getDatabasePath();
  const result = shouldRecover
    ? recoverDatabaseClientLock(dbPath)
    : inspectDatabaseClientLock(dbPath);

  if (shouldRecover && result.status === "blocked") {
    throw new CliError(
      "DATABASE_LOCK_RECOVERY_BLOCKED",
      "数据库锁无法安全恢复；请关闭仍在运行的 PromptHub 进程并检查异常租约或锁路径",
      EXIT_CODES.CONFLICT,
      {
        reason: result.reason,
        lockPath: result.lockPath,
        livePids: result.livePids,
        unknownEntries: result.unknownEntries,
      },
    );
  }

  emitSuccess(context, result);
}
