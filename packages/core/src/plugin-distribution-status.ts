import { inspectPluginTargetContent } from "./plugin-target-publication";
import fs from "node:fs";
import path from "node:path";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import type {
  ResourceDistributionSnapshot,
  ResourceTargetObservation,
} from "@prompthub/shared/types/resource-observation";
import { getPluginTargetMatrix } from "./plugin-library/distribution";
import {
  TARGET_PLUGIN_MARKER_PATHS,
  type PluginTargetPathResolver,
} from "./plugin-library/shared";
import { assertSharedPluginOwnership } from "./plugin-shared-distribution";

export interface PluginDistributionStatusOptions {
  resolvePath: PluginTargetPathResolver;
  nativeRegistered: (targetId: string, plugin: PluginLibraryEntry) => boolean;
  targetIds?: string[];
  includeContent?: boolean;
}

function stat(file: string): fs.Stats | undefined {
  try {
    return fs.statSync(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

function hasNativePackage(targetId: string, target: string): boolean {
  const marker = TARGET_PLUGIN_MARKER_PATHS[targetId];
  if (!marker) return false;
  if (stat(path.join(target, marker))?.isFile()) return true;
  if (targetId !== "codex" && targetId !== "claude-code") return false;
  const parent = path.dirname(target);
  if (!stat(parent)?.isDirectory()) return false;
  const versions = fs.readdirSync(parent, { withFileTypes: true });
  if (versions.length > 100)
    throw new Error("Plugin target version scan limit exceeded");
  return versions.some(
    (entry) =>
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      stat(path.join(parent, entry.name, marker))?.isFile(),
  );
}

function withContent(
  plugin: PluginLibraryEntry,
  target: string,
  observation: ResourceTargetObservation,
  options: PluginDistributionStatusOptions,
): ResourceTargetObservation {
  if (!options.includeContent || !observation.installed) return observation;
  if (!stat(target)) return { ...observation, contentState: "needs-sync" };
  const source = plugin.localPackagePath ?? plugin.source.localPackagePath;
  try {
    return {
      ...observation,
      contentState: source
        ? inspectPluginTargetContent(source, target, plugin.id)
        : "unverified",
    };
  } catch (error) {
    return {
      ...observation,
      contentState: "unverified",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function observe(
  plugin: PluginLibraryEntry,
  targetId: string,
  options: PluginDistributionStatusOptions,
): ResourceTargetObservation {
  const checkedAt = Date.now();
  try {
    const target = options.resolvePath(targetId, plugin);
    if (!target) throw new Error(`Cannot resolve Plugin target: ${targetId}`);
    if (targetId === "shared-agents") {
      const exists = Boolean(stat(target)?.isDirectory());
      if (exists) assertSharedPluginOwnership(target, plugin);
      return withContent(
        plugin,
        target,
        { installed: exists, checkedAt },
        options,
      );
    }
    const installed =
      hasNativePackage(targetId, target) &&
      options.nativeRegistered(targetId, plugin);
    return withContent(plugin, target, { installed, checkedAt }, options);
  } catch (error) {
    return {
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Read only, bounded marker checks. Content hashing belongs to explicit synchronization checks. */
export function readPluginDistributionStatus(
  plugins: PluginLibraryEntry[],
  options: PluginDistributionStatusOptions,
): ResourceDistributionSnapshot {
  const ids =
    options.targetIds ??
    getPluginTargetMatrix()
      .filter((target) => target.enabled)
      .map((target) => target.id);
  return Object.fromEntries(
    plugins.map((plugin) => [
      plugin.id,
      Object.fromEntries(ids.map((id) => [id, observe(plugin, id, options)])),
    ]),
  );
}
