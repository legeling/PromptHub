import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface NativeCommandRunOptions {
  timeout: number;
  maxBuffer: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface NativeCommandRunner {
  resolve(command: string): Promise<string | null>;
  run(
    command: string,
    args: string[],
    options: NativeCommandRunOptions,
  ): Promise<{ stdout: string; stderr: string }>;
}

export interface NativeCommandResolverOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  accessExecutable?(candidate: string): Promise<void>;
  realpath?(candidate: string): Promise<string>;
}

const MAX_SEARCH_DIRECTORIES = 256;

function execFileAsync(
  command: string,
  args: string[],
  options: NativeCommandRunOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: options.env ?? process.env,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        signal: options.signal,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          stdout,
          stderr,
        });
      },
    );
  });
}

function homeDirectoryForEnvironment(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === "win32") {
    return env.USERPROFILE || os.homedir();
  }
  return env.HOME || os.homedir();
}

function searchDirectories(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const home = homeDirectoryForEnvironment(platform, env);
  const configured = (env.PATH || "")
    .split(delimiter)
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  const managerDirectories = [
    env.NVM_BIN,
    env.FNM_MULTISHELL_PATH,
    env.PNPM_HOME,
    env.VOLTA_HOME ? pathApi.join(env.VOLTA_HOME, "bin") : undefined,
  ];
  const defaults =
    platform === "win32"
      ? [
          pathApi.join(home, "AppData", "Roaming", "npm"),
          pathApi.join(home, ".local", "bin"),
        ]
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          pathApi.join(home, ".local", "bin"),
          pathApi.join(home, ".local", "share", "pnpm"),
          pathApi.join(home, "Library", "pnpm"),
          pathApi.join(home, ".volta", "bin"),
          pathApi.join(home, ".bun", "bin"),
        ];
  const unique = new Set(
    [...configured, ...managerDirectories, ...defaults].filter(
      (item): item is string => Boolean(item),
    ),
  );
  return [...unique].slice(0, MAX_SEARCH_DIRECTORIES);
}

function executableNames(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platform !== "win32") return [command];
  const extensions = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    extensions.some((extension) =>
      command.toLowerCase().endsWith(extension.toLowerCase()),
    )
  ) {
    return [command];
  }
  return extensions.map((extension) => `${command}${extension}`);
}

async function resolveFromSearchPath(
  command: string,
  options: Required<NativeCommandResolverOptions>,
): Promise<string | null> {
  const pathApi = options.platform === "win32" ? path.win32 : path.posix;
  const names = executableNames(command, options.platform, options.env);
  for (const directory of searchDirectories(options.platform, options.env)) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      try {
        await options.accessExecutable(candidate);
        return await options.realpath(candidate).catch(() => candidate);
      } catch {
        // Continue through the bounded allowlisted search path.
      }
    }
  }
  return null;
}

export function createNativeCommandRunner(
  resolverOptions: NativeCommandResolverOptions = {},
): NativeCommandRunner {
  const options: Required<NativeCommandResolverOptions> = {
    platform: resolverOptions.platform ?? process.platform,
    env: resolverOptions.env ?? process.env,
    accessExecutable:
      resolverOptions.accessExecutable ??
      ((candidate) => access(candidate, fsConstants.X_OK)),
    realpath: resolverOptions.realpath ?? realpath,
  };
  return {
    async resolve(command) {
      if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(command) || command.includes("..")) {
        return null;
      }
      return resolveFromSearchPath(command, options);
    },
    run: execFileAsync,
  };
}
