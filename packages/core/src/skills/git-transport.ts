import * as childProcess from "node:child_process";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import {
  sanitizeSkillPackageDiagnostic,
  sanitizeSkillPackageSourceUrl,
} from "./package-operation";

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
  const normalized = parseGitRepo(source)?.cloneUrl ?? source;
  await validateUrl(normalized);
  const args = [
    "clone",
    "--depth",
    "1",
    ...(ref ? ["--branch", ref] : []),
    "--",
    normalized,
    destination,
  ];
  await runClone(args, source, environment);
}

function runClone(
  args: string[],
  source: string,
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: environment,
    });
    let diagnostic = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Git clone timed out after 60s for URL: ${sanitizeSkillPackageSourceUrl(source)}`,
        ),
      );
      proc.kill("SIGKILL");
    }, 60_000);
    proc.stdout?.on("data", () => undefined);
    proc.stderr?.on("data", (data: Buffer | string) => {
      diagnostic = (diagnostic + data.toString()).slice(-32_768);
    });
    proc.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : createGitProcessError("Git clone", code, diagnostic),
      ),
    );
    proc.on("error", (error) =>
      finish(createGitLaunchError(error, "Git clone error")),
    );
  });
}
