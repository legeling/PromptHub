import fs from "node:fs";
import path from "node:path";
import type {
  CodexInstalledPlugin,
  CodexPluginMutation,
} from "@prompthub/shared/types/codex-plugin";
import {
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
  AGENT_CLI_MUTATION_TIMEOUT_MS,
} from "../agent-native-command-policy";
import type { NativeCommandRunner } from "../native-command";
import { writeCodexPluginEnabled } from "./config-rpc";
import { CodexPluginError } from "./error";
import { createCodexPluginRunner } from "./runtime";

export interface CodexPluginServiceOptions {
  root: string;
  runner?: NativeCommandRunner;
  environment?: NodeJS.ProcessEnv;
  backupConfig: (content: string | null) => Promise<unknown>;
  writeEnabled?: typeof writeCodexPluginEnabled;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) &&
    !value.includes("..")
  );
}

export function validateCodexPluginMutation(
  value: unknown,
): CodexPluginMutation {
  if (!isRecord(value) || typeof value.pluginId !== "string")
    throw new CodexPluginError("invalid-plugin");
  const parts = value.pluginId.split("@");
  if (parts.length !== 2 || !parts.every(safeSegment))
    throw new CodexPluginError("invalid-plugin");
  const operation = value.operation;
  if (
    operation !== "enable" &&
    operation !== "disable" &&
    operation !== "update" &&
    operation !== "uninstall"
  )
    throw new CodexPluginError("invalid-plugin");
  return { pluginId: value.pluginId, operation };
}

function installedPath(
  root: string,
  plugin: CodexInstalledPlugin,
): string | undefined {
  if (!safeSegment(plugin.version)) return undefined;
  const candidate = path.join(
    root,
    "plugins",
    "cache",
    plugin.marketplaceName,
    plugin.name,
    plugin.version,
  );
  if (!fs.existsSync(candidate)) return undefined;
  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  if (
    !realCandidate.startsWith(`${realRoot}${path.sep}`) ||
    !fs.statSync(realCandidate).isDirectory()
  )
    return undefined;
  return candidate;
}

function parseEntry(value: unknown, root: string): CodexInstalledPlugin {
  if (
    !isRecord(value) ||
    !safeSegment(value.name) ||
    !safeSegment(value.marketplaceName) ||
    value.pluginId !== `${value.name}@${value.marketplaceName}` ||
    value.installed !== true ||
    typeof value.enabled !== "boolean" ||
    !isRecord(value.source) ||
    typeof value.source.source !== "string" ||
    (value.version != null && !safeSegment(value.version)) ||
    (value.installPolicy !== "AVAILABLE" &&
      value.installPolicy !== "INSTALLED_BY_DEFAULT" &&
      value.installPolicy !== "NOT_AVAILABLE")
  ) {
    throw new CodexPluginError("runtime-incompatible");
  }
  const plugin: CodexInstalledPlugin = {
    pluginId: `${value.name}@${value.marketplaceName}`,
    name: value.name,
    marketplaceName: value.marketplaceName,
    version: typeof value.version === "string" ? value.version : undefined,
    enabled: value.enabled,
    sourceType: value.source.source,
    installPolicy: value.installPolicy,
    marketplaceSourceType:
      isRecord(value.marketplaceSource) &&
      typeof value.marketplaceSource.sourceType === "string"
        ? value.marketplaceSource.sourceType
        : undefined,
  };
  plugin.sourcePath = installedPath(root, plugin);
  return plugin;
}

function parseInventory(stdout: string, root: string): CodexInstalledPlugin[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new CodexPluginError("runtime-incompatible");
  }
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.installed) ||
    !Array.isArray(parsed.available)
  )
    throw new CodexPluginError("runtime-incompatible");
  const plugins = parsed.installed.map((entry) => parseEntry(entry, root));
  if (new Set(plugins.map((plugin) => plugin.pluginId)).size !== plugins.length)
    throw new CodexPluginError("runtime-incompatible");
  return plugins;
}

export class CodexPluginService {
  private readonly runner: NativeCommandRunner;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(private readonly options: CodexPluginServiceOptions) {
    this.environment = {
      ...(options.environment ?? process.env),
      CODEX_HOME: options.root,
    };
    this.runner =
      options.runner ??
      createCodexPluginRunner({ environment: this.environment });
  }

  private async command(): Promise<string> {
    const command = await this.runner.resolve("codex");
    if (!command) throw new CodexPluginError("runtime-missing");
    return command;
  }

  private async run(args: string[], reading = false): Promise<string> {
    const command = await this.command();
    try {
      const output = await this.runner.run(command, ["plugin", ...args], {
        cwd: this.options.root,
        env: this.environment,
        timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
        maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
      });
      return output.stdout;
    } catch {
      throw new CodexPluginError(reading ? "read-failed" : "operation-failed");
    }
  }

  async list(): Promise<CodexInstalledPlugin[]> {
    if (!fs.existsSync(this.options.root)) return [];
    return parseInventory(
      await this.run(["list", "--json"], true),
      this.options.root,
    );
  }

  private config(): string | null {
    const file = path.join(this.options.root, "config.toml");
    if (!fs.existsSync(file)) return null;
    if (!fs.lstatSync(file).isFile())
      throw new CodexPluginError("config-conflict");
    return fs.readFileSync(file, "utf8");
  }

  private async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const originalConfig = this.config();
    if (originalConfig === null) throw new CodexPluginError("config-conflict");
    await (this.options.writeEnabled ?? writeCodexPluginEnabled)({
      command: await this.command(),
      root: this.options.root,
      environment: this.environment,
      pluginId,
      enabled,
      originalConfig,
    });
  }

  private async apply(
    request: CodexPluginMutation,
    plugin: CodexInstalledPlugin,
  ): Promise<void> {
    if (request.operation === "enable" || request.operation === "disable") {
      await this.setEnabled(plugin.pluginId, request.operation === "enable");
    } else if (request.operation === "update") {
      if (plugin.marketplaceSourceType === "git")
        await this.run([
          "marketplace",
          "upgrade",
          "--",
          plugin.marketplaceName,
        ]);
      await this.run(["add", "--", plugin.pluginId]);
      if (!plugin.enabled && plugin.sourceType !== "remote")
        await this.setEnabled(plugin.pluginId, false);
    } else {
      await this.run(["remove", "--", plugin.pluginId]);
    }
  }

  async mutate(input: CodexPluginMutation): Promise<CodexInstalledPlugin[]> {
    const request = validateCodexPluginMutation(input);
    const plugin = (await this.list()).find(
      (entry) => entry.pluginId === request.pluginId,
    );
    if (!plugin) throw new CodexPluginError("not-installed");
    if (
      (request.operation === "enable" || request.operation === "disable") &&
      plugin.sourceType === "remote"
    )
      throw new CodexPluginError("remote-policy");
    try {
      await this.options.backupConfig(this.config());
      await this.apply(request, plugin);
      const after = await this.list();
      const current = after.find(
        (entry) => entry.pluginId === request.pluginId,
      );
      if (
        request.operation === "uninstall"
          ? current !== undefined
          : current === undefined
      )
        throw new CodexPluginError("verification-failed");
      if (request.operation === "enable" && !current?.enabled)
        throw new CodexPluginError("verification-failed");
      if (request.operation === "disable" && current?.enabled !== false)
        throw new CodexPluginError("verification-failed");
      if (
        request.operation === "update" &&
        plugin.sourceType !== "remote" &&
        current?.enabled !== plugin.enabled
      )
        throw new CodexPluginError("verification-failed");
      return after;
    } catch (error) {
      if (error instanceof CodexPluginError) throw error;
      throw new CodexPluginError("operation-failed");
    }
  }
}
