import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { AgentCliDescriptor } from "@prompthub/shared/types/agent-platform";
import {
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
  AGENT_CLI_MUTATION_TIMEOUT_MS,
} from "../agent-native-command-policy";
import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "../native-command";

interface CodexRuntimeOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  environment?: NodeJS.ProcessEnv;
  standalone?: NativeCommandRunner;
  accessExecutable?: (candidate: string) => Promise<void>;
  readFile?: (candidate: string) => Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function vscodeRuntimeCandidates(
  cli: AgentCliDescriptor,
  options: CodexRuntimeOptions,
  home: string,
): Promise<string[]> {
  const extension = cli.vscodeExtensionRuntime;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  if (
    !extension ||
    (arch !== "x64" && arch !== "arm64") ||
    (platform !== "darwin" && platform !== "win32" && platform !== "linux")
  )
    return [];
  const binary = extension.executablePaths[platform]?.[arch];
  if (!binary) return [];
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const root = pathApi.join(home, extension.extensionsRelativePath);
  let entries: unknown;
  try {
    entries = JSON.parse(
      await (options.readFile ?? ((file) => readFile(file, "utf8")))(
        pathApi.join(root, "extensions.json"),
      ),
    );
  } catch {
    // Missing or unreadable editor metadata is not an installed runtime.
    return [];
  }
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: unknown) => {
    if (
      !isRecord(entry) ||
      !isRecord(entry.identifier) ||
      entry.identifier.id !== extension.id ||
      typeof entry.relativeLocation !== "string"
    )
      return [];
    const location = entry.relativeLocation;
    if (
      !location ||
      location === "." ||
      location === ".." ||
      /[/\\\x00]/.test(location) ||
      pathApi.isAbsolute(location)
    )
      return [];
    return [pathApi.join(root, location, binary)];
  });
}

async function windowsPackageCandidates(
  cli: AgentCliDescriptor,
  runner: NativeCommandRunner,
  environment: NodeJS.ProcessEnv,
): Promise<string[]> {
  const app = cli.windowsAppPackage;
  if (!app || !/^[a-zA-Z0-9.]+$/.test(app.name)) return [];
  const powershell = await runner.resolve("powershell.exe");
  if (!powershell) return [];
  try {
    const result = await runner.run(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-AppxPackage -Name '${app.name}' | Select-Object -ExpandProperty InstallLocation`,
      ],
      {
        env: environment,
        timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
        maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
      },
    );
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => path.win32.isAbsolute(line) && !line.includes("\0"))
      .map((root) => path.win32.join(root, app.executableRelativePath));
  } catch {
    // Store discovery can be unavailable on hosts with only a standalone CLI.
    return [];
  }
}

/** Prefer the installed desktop protocol, then the editor runtime, then PATH. */
export function createCodexPluginRunner(
  options: CodexRuntimeOptions = {},
): NativeCommandRunner {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const standalone =
    options.standalone ??
    createNativeCommandRunner({ env: environment, platform });
  const accessExecutable =
    options.accessExecutable ??
    ((candidate: string) => access(candidate, constants.X_OK));
  return {
    run: standalone.run,
    async resolve(command) {
      const cli = getPlatformById("codex")?.cli;
      if (
        command !== "codex" ||
        !cli ||
        (platform !== "darwin" && platform !== "win32" && platform !== "linux")
      )
        return standalone.resolve(command);
      const home =
        (platform === "win32" ? environment.USERPROFILE : environment.HOME) ||
        os.homedir();
      const candidates = (cli.bundledExecutablePaths?.[platform] ?? []).map(
        (template) => template.replace(/^~/, home),
      );
      if (platform === "win32")
        candidates.push(
          ...(await windowsPackageCandidates(cli, standalone, environment)),
        );
      candidates.push(...(await vscodeRuntimeCandidates(cli, options, home)));
      for (const candidate of candidates) {
        try {
          await accessExecutable(candidate);
          return candidate;
        } catch {
          // An absent runtime is not eligible for native plugin operations.
        }
      }
      return standalone.resolve(command);
    },
  };
}
