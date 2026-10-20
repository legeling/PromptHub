import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type {
  PluginDistributedTarget,
  PluginLibraryEntry,
} from "@prompthub/shared/types/plugin";
import {
  writeJsonFileAtomic,
  getPluginNativeMarketplaceName,
} from "./plugin-library/shared";
import type { NativeCommandRunner } from "./native-command";
import { createCodexPluginRunner } from "./codex-plugins/runtime";
import {
  AGENT_CLI_MUTATION_TIMEOUT_MS,
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
} from "./agent-native-command-policy";

interface NativeTarget {
  command: string;
  environment: NodeJS.ProcessEnv;
  root: string;
  marketplace: string;
  selector: string;
}

export interface PluginNativeInstallationOptions {
  runner?: NativeCommandRunner;
  getRoot: (platformId: string) => string;
  environment?: NodeJS.ProcessEnv;
  beforeMutation?: (targetId: string, root: string) => Promise<void>;
}

function nativeTarget(
  targetId: string,
  plugin: PluginLibraryEntry,
  options: PluginNativeInstallationOptions,
): NativeTarget | null {
  const platformId =
    targetId === "codex"
      ? "codex"
      : targetId === "claude-code"
        ? "claude"
        : null;
  if (!platformId) return null;
  const platform = getPlatformById(platformId);
  if (!platform?.rootEnvironmentVariable || !platform.cli)
    throw new Error(`Native Plugin platform contract missing: ${targetId}`);
  const root = options.getRoot(platformId);
  const marketplace = getPluginNativeMarketplaceName(plugin.id);
  return {
    command: platform.cli.executableCandidates[0],
    root,
    marketplace,
    selector: `${plugin.name}@${marketplace}`,
    environment: {
      ...(options.environment ?? process.env),
      [platform.rootEnvironmentVariable]: root,
    },
  };
}

function nativePluginEntry(native: NativeTarget): unknown {
  const file = path.join(
    native.root,
    native.command === "codex" ? "config.toml" : "settings.json",
  );
  if (!fs.existsSync(file)) return undefined;
  const config: unknown =
    native.command === "codex"
      ? parseToml(fs.readFileSync(file, "utf8"))
      : JSON.parse(fs.readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Invalid native Plugin configuration");
  const entries: unknown = Reflect.get(
    config,
    native.command === "codex" ? "plugins" : "enabledPlugins",
  );
  if (!entries || typeof entries !== "object") return undefined;
  return Reflect.get(entries, native.selector);
}

function isEnabled(native: NativeTarget): boolean {
  const entry = nativePluginEntry(native);
  return native.command === "codex"
    ? Boolean(
        entry &&
        typeof entry === "object" &&
        Reflect.get(entry, "enabled") === true,
      )
    : entry === true;
}

/** Registration presence is independent of whether the user enabled the Plugin. */
export function isNativePluginRegistered(
  plugin: PluginLibraryEntry,
  targetId: string,
  options: PluginNativeInstallationOptions,
): boolean {
  const native = nativeTarget(targetId, plugin, options);
  return native === null || nativePluginEntry(native) !== undefined;
}

async function runNative(
  native: NativeTarget,
  args: string[],
  options: PluginNativeInstallationOptions,
): Promise<void> {
  const runner =
    options.runner ??
    createCodexPluginRunner({ environment: native.environment });
  const command = await runner.resolve(native.command);
  if (!command)
    throw new Error(`Native Plugin CLI not found: ${native.command}`);
  try {
    await runner.run(command, ["plugin", ...args], {
      env: native.environment,
      timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
      maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
    });
  } catch {
    // CLI output can include account/configuration data; expose only the failed operation.
    throw new Error(`Native Plugin ${args[0]} failed: ${native.selector}`);
  }
}

function hasClaudeMarketplace(native: NativeTarget): boolean {
  if (native.command !== "claude") return false;
  const file = path.join(native.root, "plugins", "known_marketplaces.json");
  if (!fs.existsSync(file)) return false;
  const entries: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    throw new Error("Invalid native marketplace registry");
  return native.marketplace in entries;
}

export async function installNativePlugin(
  plugin: PluginLibraryEntry,
  target: PluginDistributedTarget,
  options: PluginNativeInstallationOptions,
): Promise<void> {
  const native = nativeTarget(target.targetId, plugin, options);
  if (!native) return;
  await options.beforeMutation?.(target.targetId, native.root);
  const marketplaceRoot = path.dirname(target.path);
  const relativeSource = `./${path.basename(target.path)}`;
  const marker =
    native.command === "codex"
      ? ".agents/plugins/marketplace.json"
      : ".claude-plugin/marketplace.json";
  const entry = {
    name: plugin.name,
    source:
      native.command === "codex"
        ? { source: "local", path: relativeSource }
        : relativeSource,
  };
  writeJsonFileAtomic(path.join(marketplaceRoot, marker), {
    name: native.marketplace,
    owner: { name: "PromptHub" },
    plugins: [entry],
  });
  if (nativePluginEntry(native) !== undefined || hasClaudeMarketplace(native)) {
    if (native.command === "claude")
      await runNative(
        native,
        ["marketplace", "update", native.marketplace],
        options,
      );
  } else {
    await runNative(native, ["marketplace", "add", marketplaceRoot], options);
  }
  await runNative(
    native,
    native.command === "codex"
      ? ["add", "--", native.selector]
      : ["install", "--scope", "user", "--", native.selector],
    options,
  );
  if (native.command === "claude" && !isEnabled(native))
    await runNative(
      native,
      ["enable", "--scope", "user", "--", native.selector],
      options,
    );
  if (!isEnabled(native))
    throw new Error(`Native Plugin was not enabled: ${native.selector}`);
}

export async function uninstallNativePlugin(
  plugin: PluginLibraryEntry,
  targetId: string,
  options: PluginNativeInstallationOptions,
): Promise<void> {
  const native = nativeTarget(targetId, plugin, options);
  if (!native || nativePluginEntry(native) === undefined) return;
  await options.beforeMutation?.(targetId, native.root);
  await runNative(
    native,
    [
      native.command === "codex" ? "remove" : "uninstall",
      "--",
      native.selector,
    ],
    options,
  );
  if (isEnabled(native))
    throw new Error(`Native Plugin remains enabled: ${native.selector}`);
  await runNative(
    native,
    ["marketplace", "remove", "--", native.marketplace],
    options,
  );
  // Package directories belong to the distribution transaction. Removing the
  // source root here would also remove its retained rollback backup.
}
