import { app, net } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path, { win32 as pathWin32 } from "node:path";
import type {
  CliInstallMethod,
  CliInstallResult,
  CliStatus,
} from "@prompthub/shared/types";
import {
  prepareCliShellEnvironment,
  preparePnpmEnvironment,
} from "./cli-install-environment";
import { resolveCliInstallSource } from "./cli-install-source";
import {
  CliCommandError,
  describeCliInstallFailure,
} from "./cli-install-error";

const CLI_COMMAND = "prompthub";
const PACKAGE_MANAGER_NOT_FOUND_ERROR = "CLI_PACKAGE_MANAGER_NOT_FOUND";
const VERSION_PROBE_TIMEOUT_MS = 3_000;
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_LEGACY_WRAPPER_BYTES = 4_096;
type CommandPathSource =
  | "app-env"
  | "login-shell"
  | "windows-where"
  | "npm-prefix";

function execFileAsync(
  command: string,
  args: string[],
  options: Parameters<typeof execFile>[2],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(
          new CliCommandError(error, stdout.toString(), stderr.toString()),
        );
        return;
      }
      resolve({
        stdout: typeof stdout === "string" ? stdout : stdout.toString(),
        stderr: typeof stderr === "string" ? stderr : stderr.toString(),
      });
    });
  });
}

function buildInstallCommand(method: CliInstallMethod, source: string): string {
  if (!source) return "";
  return `${method} ${method === "pnpm" ? "add" : "install"} -g ${source}`;
}

function getManualInstallCommands(
  source: string,
): Record<CliInstallMethod, string> {
  return {
    pnpm: buildInstallCommand("pnpm", source),
    npm: buildInstallCommand("npm", source),
  };
}

async function runCommand(
  command: string,
  args: string[],
  timeout = COMMAND_TIMEOUT_MS,
  env = process.env,
): Promise<{ stdout: string; stderr: string }> {
  const executable =
    process.platform === "win32" &&
    pathWin32.isAbsolute(command) &&
    /[\s&()]/.test(command)
      ? `"${command}"`
      : command;
  return execFileAsync(executable, args, {
    env,
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function getLegacyCliWrapperPath(): string {
  return path.join(
    app.getPath("userData"),
    "bin",
    process.platform === "win32" ? "prompthub.cmd" : CLI_COMMAND,
  );
}

function isRecognizedLegacyWrapper(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_LEGACY_WRAPPER_BYTES
    ) {
      return false;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const invokesDesktop =
      /PromptHub(?:\.app[^\r\n"]*)?[\s\S]*--cli(?:\s|%\*|"\$@")/i.test(content);
    return invokesDesktop && /^(?:#!\/bin\/sh|@echo off)/i.test(content.trim());
  } catch {
    return false;
  }
}

function findLegacyCliWrapper(): string | null {
  const candidate = getLegacyCliWrapperPath();
  return isRecognizedLegacyWrapper(candidate) ? candidate : null;
}

function removeLegacyCliWrapper(filePath: string | null): boolean {
  if (!filePath || !isRecognizedLegacyWrapper(filePath)) {
    return false;
  }
  fs.rmSync(filePath);
  return true;
}

async function resolveFromLoginShell(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (process.platform === "win32") {
    return null;
  }

  const shell = env.SHELL || "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(
      shell,
      ["-c", `command -v ${command}`],
      {
        env,
        timeout: VERSION_PROBE_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function cleanCommandPath(value: string): string {
  return value.trim().replace(/^"|"$/g, "");
}

async function resolveFromWindowsWhere(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const { stdout } = await runCommand(
      "where.exe",
      [command],
      VERSION_PROBE_TIMEOUT_MS,
      env,
    );
    return uniqueNonEmpty(stdout.split(/\r?\n/).map(cleanCommandPath));
  } catch {
    return [];
  }
}

async function detectVersionAtPath(
  commandPath: string,
  pathSource: CommandPathSource,
  env: NodeJS.ProcessEnv,
): Promise<{
  version: string | null;
  path: string | null;
  pathSource: CommandPathSource | null;
}> {
  try {
    if (
      isRecognizedLegacyWrapper(commandPath) ||
      (process.platform === "win32" &&
        pathWin32.basename(commandPath).toLowerCase() === "prompthub.exe")
    ) {
      return { version: null, path: null, pathSource: null };
    }
    const { stdout } = await runCommand(
      commandPath,
      ["--version"],
      VERSION_PROBE_TIMEOUT_MS,
      env,
    );
    return {
      version: stdout.trim() || null,
      path: commandPath,
      pathSource,
    };
  } catch {
    return { version: null, path: null, pathSource: null };
  }
}

async function detectVersionFromCandidates(
  candidates: string[],
  pathSource: CommandPathSource,
  env: NodeJS.ProcessEnv,
): Promise<{
  version: string | null;
  path: string | null;
  pathSource: CommandPathSource | null;
}> {
  for (const candidate of uniqueNonEmpty(candidates)) {
    const result = await detectVersionAtPath(candidate, pathSource, env);
    if (result.version) {
      return result;
    }
  }

  return { version: null, path: null, pathSource: null };
}

async function queryNpmValue(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const npmExecutables = uniqueNonEmpty([
    "npm",
    ...(await resolveFromWindowsWhere("npm", env)),
  ]);

  for (const npmExecutable of npmExecutables) {
    try {
      const { stdout } = await runCommand(
        npmExecutable,
        args,
        VERSION_PROBE_TIMEOUT_MS,
        env,
      );
      const value = stdout.trim();
      if (value) {
        return value;
      }
    } catch {
      // Try the next npm resolver. Electron may have a narrower PATH than the user's terminal.
    }
  }

  return null;
}

async function getWindowsNpmGlobalPrefixes(
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const prefix = await queryNpmValue(["config", "get", "prefix"], env);
  const root = await queryNpmValue(["root", "-g"], env);
  const rootPrefix =
    root && pathWin32.basename(root).toLowerCase() === "node_modules"
      ? pathWin32.dirname(root)
      : null;

  return uniqueNonEmpty([prefix, rootPrefix]);
}

async function detectPrompthubFromWindowsNpmPrefix(
  env: NodeJS.ProcessEnv,
): Promise<{
  version: string | null;
  path: string | null;
  pathSource: CommandPathSource | null;
}> {
  if (process.platform !== "win32") {
    return { version: null, path: null, pathSource: null };
  }

  const prefixes = await getWindowsNpmGlobalPrefixes(env);
  const candidates = prefixes.flatMap((prefix) => [
    pathWin32.join(prefix, "prompthub.cmd"),
    pathWin32.join(prefix, "prompthub.exe"),
    pathWin32.join(prefix, "prompthub"),
  ]);

  return detectVersionFromCandidates(candidates, "npm-prefix", env);
}

async function detectCommandVersion(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<{
  version: string | null;
  path: string | null;
  pathSource: CommandPathSource | null;
}> {
  // Resolve PromptHub before running it: PATH may still point to a desktop
  // wrapper from a previous data directory, or to PromptHub.exe itself.
  if (command !== CLI_COMMAND) {
    const directResult = await detectVersionAtPath(command, "app-env", env);
    if (directResult.version) {
      return directResult;
    }
  }

  const windowsWhereResult = await detectVersionFromCandidates(
    await resolveFromWindowsWhere(command, env),
    "windows-where",
    env,
  );
  if (windowsWhereResult.version) {
    return windowsWhereResult;
  }

  if (command === CLI_COMMAND) {
    const windowsNpmPrefixResult =
      await detectPrompthubFromWindowsNpmPrefix(env);
    if (windowsNpmPrefixResult.version) {
      return windowsNpmPrefixResult;
    }
  }

  const shellPath = await resolveFromLoginShell(command, env);
  if (!shellPath) {
    return { version: null, path: null, pathSource: null };
  }
  return detectVersionAtPath(shellPath, "login-shell", env);
}

async function detectPackageManager(
  command: CliInstallMethod,
  env: NodeJS.ProcessEnv,
): Promise<{
  version: string | null;
  path: string | null;
  pathSource: CommandPathSource | null;
}> {
  return detectCommandVersion(command, env);
}

async function detectPrompthubVersion(env: NodeJS.ProcessEnv): Promise<{
  version: string | null;
  globalBinDirectory?: string | null;
}> {
  const result = await detectCommandVersion(CLI_COMMAND, env);
  if (result.version) return { version: result.version };
  const pnpm = await detectPackageManager("pnpm", env);
  if (!pnpm.version) return { version: null };
  const prepared = await preparePnpmEnvironment(
    (args, childEnv) =>
      runCommand(pnpm.path || "pnpm", args, VERSION_PROBE_TIMEOUT_MS, childEnv),
    env,
  );
  if (!prepared.globalBinDirectory) return { version: null };
  const paths = process.platform === "win32" ? pathWin32 : path;
  const command = paths.join(
    prepared.globalBinDirectory,
    process.platform === "win32" ? "prompthub.cmd" : CLI_COMMAND,
  );
  if (isRecognizedLegacyWrapper(command)) return { version: null };
  try {
    const { stdout } = await runCommand(
      command,
      ["--version"],
      VERSION_PROBE_TIMEOUT_MS,
      prepared.env,
    );
    return {
      version: stdout.trim() || null,
      globalBinDirectory: prepared.globalBinDirectory,
    };
  } catch {
    return { version: null };
  }
}

async function getCliStatusInEnvironment(
  requireInstallSource: boolean,
  env: NodeJS.ProcessEnv,
): Promise<CliStatus> {
  const legacyCommandPath = findLegacyCliWrapper();
  const [pnpmInfo, npmInfo, installedVersion] = await Promise.all([
    detectPackageManager("pnpm", env),
    detectPackageManager("npm", env),
    detectPrompthubVersion(env),
  ]);
  const release =
    installedVersion.version && !requireInstallSource
      ? { source: null, error: undefined }
      : await resolveCliInstallSource((input, init) => net.fetch(input, init))
          .then((source) => ({ source, error: undefined }))
          .catch((error: unknown) => ({
            source: null,
            error: error instanceof Error ? error.message : String(error),
          }));

  const packageManager: CliInstallMethod | null = pnpmInfo.version
    ? "pnpm"
    : npmInfo.version
      ? "npm"
      : null;
  const packageManagerVersion =
    packageManager === "pnpm"
      ? pnpmInfo.version
      : packageManager === "npm"
        ? npmInfo.version
        : null;
  const packageManagerPath =
    packageManager === "pnpm"
      ? pnpmInfo.path
      : packageManager === "npm"
        ? npmInfo.path
        : null;
  const packageManagerPathSource =
    packageManager === "pnpm"
      ? pnpmInfo.pathSource
      : packageManager === "npm"
        ? npmInfo.pathSource
        : null;
  const installSource = release.source?.location ?? "";
  const installCommand =
    packageManager && installSource
      ? buildInstallCommand(packageManager, installSource)
      : null;

  return {
    installed: Boolean(installedVersion.version),
    command: CLI_COMMAND,
    version: installedVersion.version,
    globalBinDirectory: installedVersion.globalBinDirectory,
    packageManager,
    packageManagerVersion,
    packageManagerPath,
    packageManagerPathSource,
    releaseTag: release.source?.releaseTag ?? "",
    installCommand,
    manualInstallCommands: getManualInstallCommands(installSource),
    installSource,
    error: release.error,
    legacyCommandPath,
  };
}

async function getCliEnvironment(): Promise<NodeJS.ProcessEnv> {
  return prepareCliShellEnvironment((args, env) =>
    execFileAsync(env.SHELL || "/bin/zsh", args, {
      env,
      timeout: VERSION_PROBE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    }),
  );
}

export async function getCliStatus(
  requireInstallSource = false,
): Promise<CliStatus> {
  return getCliStatusInEnvironment(
    requireInstallSource,
    await getCliEnvironment(),
  );
}

async function performCliInstall(
  method?: CliInstallMethod,
): Promise<CliInstallResult> {
  const env = await getCliEnvironment();
  const status = await getCliStatusInEnvironment(true, env);
  const installMethod = method ?? status.packageManager;

  if (status.error)
    return {
      success: false,
      method: installMethod ?? "npm",
      command: "",
      error: status.error,
      errorCode: "network",
    };

  if (!installMethod) {
    return {
      success: false,
      method: "npm",
      command: "",
      error: "Neither pnpm nor npm is available on PATH.",
    };
  }

  const installSource = status.installSource;
  const args =
    installMethod === "pnpm"
      ? ["add", "-g", installSource]
      : ["install", "-g", installSource];
  const command = `${installMethod} ${args.join(" ")}`;
  const packageManagerInfo = await detectPackageManager(installMethod, env);

  if (!packageManagerInfo.version) {
    return {
      success: false,
      method: installMethod,
      command,
      error: PACKAGE_MANAGER_NOT_FOUND_ERROR,
    };
  }

  try {
    const executable = packageManagerInfo.path || installMethod;
    const prepared =
      installMethod === "pnpm"
        ? await preparePnpmEnvironment(
            (probeArgs, childEnv) =>
              runCommand(
                executable,
                probeArgs,
                VERSION_PROBE_TIMEOUT_MS,
                childEnv,
              ),
            env,
          )
        : { env };
    const { stdout, stderr } = await runCommand(
      executable,
      args,
      COMMAND_TIMEOUT_MS,
      prepared.env,
    );
    const removedLegacyCommand = removeLegacyCliWrapper(
      status.legacyCommandPath ?? null,
    );
    return {
      success: true,
      method: installMethod,
      command,
      stdout,
      stderr,
      removedLegacyCommand,
    };
  } catch (error) {
    return {
      success: false,
      method: installMethod,
      command,
      ...describeCliInstallFailure(error),
    };
  }
}

export async function installCli(
  method?: CliInstallMethod,
): Promise<CliInstallResult> {
  try {
    if (method !== undefined && method !== "pnpm" && method !== "npm")
      throw new Error("Invalid CLI installation method");
    return await performCliInstall(method);
  } catch (error) {
    return {
      success: false,
      method: method === "pnpm" ? "pnpm" : "npm",
      command: "",
      ...describeCliInstallFailure(error),
    };
  }
}
