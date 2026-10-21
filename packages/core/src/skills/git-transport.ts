import * as childProcess from "node:child_process";
import path from "node:path";
import { gitPackageDirectoryPattern } from "../git-package-directory";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import {
  sanitizeSkillPackageDiagnostic,
  sanitizeSkillPackageSourceUrl,
} from "./package-operation";
import { validateSkillGitDirectory } from "./git-source";
import { stopNativeCommand } from "../native-process";

const GIT_ACQUISITION_TIMEOUT_MS = 60_000;
const GIT_DIAGNOSTIC_MAX_CHARS = 32_768;

export class GitExecutableUnavailableError extends Error {
  constructor() {
    super(
      "GIT_EXECUTABLE_UNAVAILABLE: Git is not installed or is not available in PATH",
    );
    this.name = "GitExecutableUnavailableError";
  }
}

export function createGitLaunchError(error: unknown, operation: string): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return code === "ENOENT" || code === "EACCES"
    ? new GitExecutableUnavailableError()
    : new Error(`${operation}: ${sanitizeSkillPackageDiagnostic(error)}`);
}

export function createGitProcessError(
  operation: string,
  code: number | null,
  stderr: string,
): Error {
  const reason = getSkillPackageReadErrorCode(stderr);
  const marker =
    reason === "read-failed" ? "" : `SKILL_PACKAGE_READ:${reason}; `;
  return new Error(
    `${marker}${operation} failed with code ${code}: ${sanitizeSkillPackageDiagnostic(stderr)}`,
  );
}

function validateRemote(url: string): void {
  const repo = parseGitRepo(url);
  if (repo?.protocol === "ssh") return;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Only HTTPS or git@<host> SSH clone URLs are allowed");
}

/** Shared process boundary. A native adapter may additionally allow validated LAN HTTP. */
export async function cloneSkillRepository(
  url: string,
  destination: string,
  branch?: string,
  directory?: string,
  validateUrl: (url: string) => void | Promise<void> = validateRemote,
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  const source = url.trim();
  if (!source || source.startsWith("-") || /[\u0000\r\n]/u.test(source)) {
    throw new Error("Invalid Git clone URL");
  }
  const ref = branch?.trim();
  if (ref && (ref.startsWith("-") || /[\u0000\r\n]/u.test(ref)))
    throw new Error("Invalid Git branch");
  if (directory !== undefined) validateSkillGitDirectory(directory);
  const selected =
    directory === undefined ? "." : path.posix.normalize(directory);
  const normalized = parseGitRepo(source)?.cloneUrl ?? source;
  await validateUrl(normalized);
  const context = {
    source,
    environment,
    deadline: Date.now() + GIT_ACQUISITION_TIMEOUT_MS,
  };
  const args = [
    "clone",
    "--depth",
    "1",
    ...(selected === "." ? [] : ["--filter=blob:none", "--no-checkout"]),
    ...(ref ? ["--branch", ref] : []),
    "--",
    normalized,
    destination,
  ];
  await runGit(args, context);
  if (selected === ".") return;
  const checkoutContext = { ...context, cwd: destination };
  await runGit(
    ["sparse-checkout", "set", "--no-cone", "--stdin"],
    checkoutContext,
    `${gitPackageDirectoryPattern(selected)}\n`,
  );
  await runGit(["checkout"], checkoutContext);
}

function runGit(
  args: string[],
  context: {
    source: string;
    environment?: NodeJS.ProcessEnv;
    deadline: number;
    cwd?: string;
  },
  input?: string,
): Promise<void> {
  const remainingMs = context.deadline - Date.now();
  const timeoutError = (): Error =>
    new Error(
      `Git acquisition timed out after ${GIT_ACQUISITION_TIMEOUT_MS / 1000}s for URL: ${sanitizeSkillPackageSourceUrl(context.source)}`,
    );
  if (remainingMs <= 0) return Promise.reject(timeoutError());
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      env: context.environment,
      cwd: context.cwd,
      windowsHide: true,
      // Git may spawn SSH/helpers that inherit stdio; own their POSIX process group.
      detached: process.platform !== "win32",
    });
    let diagnostic = "";
    let failure: Error | undefined;
    let stopping = false;
    const stop = (error: Error): void => {
      failure ??= error;
      if (stopping) return;
      stopping = true;
      stopGitProcess(proc);
    };
    const timeout = setTimeout(() => stop(timeoutError()), remainingMs);
    proc.stdout?.on("data", () => undefined);
    proc.stderr?.on("data", (data: Buffer | string) => {
      diagnostic = (diagnostic + data.toString()).slice(
        -GIT_DIAGNOSTIC_MAX_CHARS,
      );
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(createGitProcessError(`Git ${args[0]}`, code, diagnostic));
      else {
        if (/warning:/iu.test(diagnostic))
          console.warn(sanitizeSkillPackageDiagnostic(diagnostic));
        resolve();
      }
    });
    proc.on("error", (error) => {
      failure ??= createGitLaunchError(error, `Git ${args[0]} error`);
      // Failed spawn has no running child to await; launched processes await close.
      if (!proc.pid) {
        clearTimeout(timeout);
        reject(failure);
      }
    });
    proc.stdin?.on("error", (error) =>
      stop(createGitLaunchError(error, "Git input error")),
    );
    proc.stdin?.end(input);
  });
}

function stopGitProcess(proc: childProcess.ChildProcess): void {
  if (process.platform === "win32" || !proc.pid) return stopNativeCommand(proc);
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH")
      return;
    console.error(
      "Failed to terminate Git process group:",
      sanitizeSkillPackageDiagnostic(error),
    );
    stopNativeCommand(proc);
  }
}
