import type { CliInstallResult } from "@prompthub/shared/types";

export class CliCommandError extends Error {
  readonly timedOut: boolean;
  constructor(
    error: Error,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(error.message, { cause: error });
    this.name = "CliCommandError";
    this.timedOut =
      "killed" in error &&
      error.killed === true &&
      !/maxBuffer/.test(error.message);
  }
}

export function describeCliInstallFailure(
  error: unknown,
): Pick<CliInstallResult, "error" | "errorCode" | "stdout" | "stderr"> {
  const message = error instanceof Error ? error.message : String(error);
  const stdout = error instanceof CliCommandError ? error.stdout : "";
  const stderr = error instanceof CliCommandError ? error.stderr : "";
  const diagnostic = `${message}\n${stderr}\n${stdout}`;
  const errorCode = /GLOBAL_BIN_DIR|global bin directory|PNPM_HOME/i.test(
    diagnostic,
  )
    ? "environment"
    : /EACCES|EPERM|permission denied/i.test(diagnostic)
      ? "permission"
      : (error instanceof CliCommandError && error.timedOut) ||
          /ETIMEDOUT|timed? ?out|SIGTERM/i.test(diagnostic)
        ? "timeout"
        : /ENOTFOUND|ECONN|EAI_AGAIN|ERR_PNPM_FETCH|404|CERT_/i.test(diagnostic)
          ? "network"
          : "failed";
  return {
    error: message.slice(0, 8000),
    errorCode,
    stdout: stdout.slice(-8000),
    stderr: stderr.slice(-8000),
  };
}
