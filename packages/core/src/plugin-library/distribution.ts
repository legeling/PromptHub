import {
  publishPluginTarget,
  assertPluginTargetWritable,
} from "../plugin-target-publication";
import fs from "fs";
import path from "path";
import {
  assertSharedPluginOwnership,
  writeSharedPluginPackage,
} from "../plugin-shared-distribution";
import { isAntigravityPluginManifest } from "@prompthub/shared/utils/antigravity-plugin";

import type {
  PluginDistributeMode,
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginTargetCompatibility,
  PluginUndistributeRequest,
  PluginUndistributeResult,
} from "@prompthub/shared/types/plugin";

import {
  ADAPTER_MANIFEST_CAPABILITY_FIELDS,
  CorePluginError,
  LOCAL_PLUGIN_MARKER_PATHS,
  type PluginTargetPathResolver,
  type RawRecord,
  TARGET_PLUGIN_MARKER_PATHS,
  ensureInsideDirectory,
  getManagedPluginsDir,
  getPluginLocalPackagePath,
  normalizeDistributedTargetIds,
  normalizeRelativePosixPath,
  normalizeSlug,
  nowIso,
  nowMs,
  safeString,
  writeJsonFileAtomic,
} from "./shared";
import {
  findLocalPluginMarker,
  findLocalPluginMarkerForTarget,
  inspectLocalPluginNativeTargets,
  readLocalPluginManifest,
  validateLocalPluginPackage,
} from "./package-validation";

function isInsideManagedPluginsDir(candidatePath: string): boolean {
  try {
    ensureInsideDirectory(getManagedPluginsDir(), candidatePath);
    return true;
  } catch {
    return false;
  }
}

export function assertSupportedPluginTargets(targetIds: string[]): void {
  const targetMatrix = getPluginTargetMatrix();
  const targetsById = new Map(
    targetMatrix.map((target) => [target.id, target]),
  );
  for (const targetId of targetIds) {
    const target = targetsById.get(targetId);
    if (!target) {
      throw new CorePluginError(
        "UNSUPPORTED_TARGET",
        `Plugin 目标不存在: ${targetId}`,
      );
    }
    if (!target.enabled) {
      throw new CorePluginError(
        "UNSUPPORTED_TARGET",
        target.unsupportedReason ||
          `${target.displayName} 暂不支持 Plugin 分发`,
      );
    }
  }
}

export function assertReadableDirectory(
  directoryPath: string,
  label: string,
): void {
  if (!directoryPath.trim()) {
    throw new CorePluginError("MISSING_SOURCE", `${label} 路径为空`);
  }
  const stat = fs.existsSync(directoryPath)
    ? fs.lstatSync(directoryPath)
    : null;
  if (stat?.isSymbolicLink()) {
    throw new CorePluginError(
      "INVALID_PATH",
      `${label} 不能是软链接: ${directoryPath}`,
    );
  }
  if (!stat?.isDirectory()) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${label} 不存在或不是目录: ${directoryPath}`,
    );
  }
}

function copyPluginPackageDirectoryToTarget(
  sourcePath: string,
  targetPath: string,
): void {
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    dereference: false,
  });
}

function findPluginPackageMarkerPath(packagePath: string): string | undefined {
  const markerPaths = Array.from(
    new Set([
      ...LOCAL_PLUGIN_MARKER_PATHS,
      ...Object.values(TARGET_PLUGIN_MARKER_PATHS),
    ]),
  );
  return markerPaths.find((markerPath) =>
    fs.existsSync(path.join(packagePath, ...markerPath.split("/"))),
  );
}

function isDirectoryEmpty(directoryPath: string): boolean {
  try {
    return fs.readdirSync(directoryPath).length === 0;
  } catch {
    return false;
  }
}

function isSafeExistingPluginTarget(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) {
    return true;
  }

  const targetStat = fs.lstatSync(targetPath);
  if (targetStat.isSymbolicLink()) {
    try {
      const realTarget = fs.realpathSync(targetPath);
      return (
        fs.statSync(realTarget).isDirectory() &&
        Boolean(findPluginPackageMarkerPath(realTarget))
      );
    } catch {
      const linkTarget = fs.readlinkSync(targetPath);
      const resolvedLinkTarget = path.resolve(
        path.dirname(targetPath),
        linkTarget,
      );
      return isInsideManagedPluginsDir(resolvedLinkTarget);
    }
  }

  if (!targetStat.isDirectory()) {
    return false;
  }

  return (
    isDirectoryEmpty(targetPath) ||
    Boolean(findPluginPackageMarkerPath(targetPath))
  );
}

function assertSafeExistingPluginTarget(
  targetPath: string,
  operation: "remove" | "write",
): void {
  if (isSafeExistingPluginTarget(targetPath)) {
    return;
  }
  throw new CorePluginError(
    "UNSAFE_TARGET_PATH",
    `Agent Plugin 目标路径不是可${operation === "write" ? "覆盖" : "删除"}的 Plugin 包，已拒绝操作: ${targetPath}`,
  );
}

function writePluginPackageToTarget(
  sourcePath: string,
  targetPath: string,
  mode: PluginDistributeMode,
  pluginId: string,
): void {
  if (!targetPath.trim())
    throw new CorePluginError(
      "MISSING_TARGET_PATH",
      "Plugin target path is empty",
    );
  publishPluginTarget(sourcePath, targetPath, pluginId, (stage) => {
    if (mode === "symlink")
      fs.symlinkSync(
        sourcePath,
        stage,
        process.platform === "win32" ? "junction" : "dir",
      );
    else copyPluginPackageDirectoryToTarget(sourcePath, stage);
  });
}

function isRawRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFirstManifestValue(manifest: RawRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (manifest[key] !== undefined) {
      return manifest[key];
    }
  }
  return undefined;
}

function normalizeAdapterManifestValue(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const entries = value.filter(
      (entry): entry is string | RawRecord =>
        (typeof entry === "string" && entry.trim().length > 0) ||
        isRawRecord(entry),
    );
    return entries.length > 0 ? entries : undefined;
  }
  if (isRawRecord(value) && Object.keys(value).length > 0) {
    return value;
  }
  return undefined;
}

function findExistingAdapterCapabilityPath(
  sourcePath: string,
  fallbackPaths: string[],
): string | undefined {
  for (const fallbackPath of fallbackPaths) {
    const relativePath = normalizeRelativePosixPath(fallbackPath);
    const candidatePath = path.join(sourcePath, ...relativePath.split("/"));
    try {
      ensureInsideDirectory(sourcePath, candidatePath);
      if (fs.existsSync(candidatePath)) {
        return `./${relativePath}`;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function readPluginManifestForAdapter(sourcePath: string): RawRecord {
  const markerPath = findLocalPluginMarker(sourcePath);
  if (!markerPath) {
    return {};
  }
  try {
    return readLocalPluginManifest(markerPath).manifest;
  } catch {
    return {};
  }
}

function getAdapterManifestIdentity(
  plugin: PluginLibraryEntry,
  sourceManifest: RawRecord,
): {
  description?: string;
  displayName: string;
  longDescription?: string;
  name: string;
  version?: string;
} {
  const sourceInterface = isRawRecord(sourceManifest.interface)
    ? sourceManifest.interface
    : {};
  const name =
    safeString(sourceManifest.name) ||
    safeString(plugin.name) ||
    normalizeSlug(plugin.displayName) ||
    normalizeSlug(plugin.id) ||
    "plugin";
  return {
    name,
    displayName:
      safeString(sourceManifest.displayName) ||
      safeString(sourceInterface.displayName) ||
      safeString(plugin.displayName) ||
      name,
    description:
      safeString(sourceManifest.description) ||
      safeString(sourceInterface.shortDescription) ||
      safeString(plugin.description),
    longDescription:
      safeString(sourceInterface.longDescription) ||
      safeString(plugin.longDescription),
    version: safeString(sourceManifest.version) || safeString(plugin.version),
  };
}

function appendAdapterCapabilities(
  manifest: RawRecord,
  sourceManifest: RawRecord,
  sourcePath: string,
): void {
  for (const field of ADAPTER_MANIFEST_CAPABILITY_FIELDS) {
    const sourceValue = normalizeAdapterManifestValue(
      getFirstManifestValue(sourceManifest, field.sourceKeys),
    );
    const value =
      sourceValue ??
      findExistingAdapterCapabilityPath(sourcePath, field.fallbackPaths);
    if (value !== undefined) {
      manifest[field.outputKey] = value;
    }
  }
}

function buildAdapterPluginManifest(
  plugin: PluginLibraryEntry,
  sourceManifest: RawRecord,
  sourcePath: string,
): RawRecord {
  const identity = getAdapterManifestIdentity(plugin, sourceManifest);
  const manifest: RawRecord = {
    name: identity.name,
    displayName: identity.displayName,
    interface: {
      displayName: identity.displayName,
      ...(identity.description
        ? { shortDescription: identity.description }
        : {}),
      ...(identity.longDescription
        ? { longDescription: identity.longDescription }
        : {}),
    },
    prompthub: {
      sourcePluginId: plugin.id,
      generatedAt: nowIso(),
    },
  };

  if (identity.description) {
    manifest.description = identity.description;
  }
  if (identity.version) {
    manifest.version = identity.version;
  }
  appendAdapterCapabilities(manifest, sourceManifest, sourcePath);
  return manifest;
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function buildKiroPowerDocument(
  plugin: PluginLibraryEntry,
  manifest: RawRecord,
): string {
  const name =
    safeString(manifest.name) ||
    safeString(plugin.name) ||
    normalizeSlug(plugin.displayName) ||
    "plugin";
  const displayName =
    safeString(manifest.displayName) || safeString(plugin.displayName) || name;
  const description =
    safeString(manifest.description) ||
    safeString(plugin.description) ||
    `${displayName} Plugin package`;
  const lines = [
    "---",
    `name: ${yamlQuoted(name)}`,
    `description: ${yamlQuoted(description)}`,
  ];
  const version = safeString(manifest.version) || safeString(plugin.version);
  if (version) {
    lines.push(`version: ${yamlQuoted(version)}`);
  }
  lines.push("---", "", `# ${displayName}`, "");
  lines.push(description, "");
  lines.push(
    "This Power was generated by PromptHub from an installed Plugin package.",
  );
  return `${lines.join("\n")}\n`;
}

function writeGeneratedPluginMarker(
  sourcePath: string,
  targetPath: string,
  targetId: string,
  plugin: PluginLibraryEntry,
): void {
  const markerPath = TARGET_PLUGIN_MARKER_PATHS[targetId];
  if (!markerPath) {
    throw new CorePluginError(
      "UNSUPPORTED_TARGET",
      `Plugin 目标不存在: ${targetId}`,
    );
  }
  const sourceManifest = readPluginManifestForAdapter(sourcePath);
  const manifest = buildAdapterPluginManifest(
    plugin,
    sourceManifest,
    sourcePath,
  );
  const markerFilePath = path.join(targetPath, ...markerPath.split("/"));
  ensureInsideDirectory(targetPath, markerFilePath);
  if (markerPath === "POWER.md") {
    fs.mkdirSync(path.dirname(markerFilePath), { recursive: true });
    fs.writeFileSync(
      markerFilePath,
      buildKiroPowerDocument(plugin, manifest),
      "utf8",
    );
    return;
  }
  writeJsonFileAtomic(markerFilePath, manifest);
}

function canPassthroughNativePluginPackage(
  sourcePath: string,
  targetId: string,
): boolean {
  const markerPath = findLocalPluginMarkerForTarget(sourcePath, targetId);
  if (!markerPath) {
    return false;
  }
  const { manifest } = readLocalPluginManifest(markerPath);
  if (
    ["antigravity", "antigravity-cli"].includes(targetId) &&
    !isAntigravityPluginManifest(manifest)
  ) {
    throw new CorePluginError(
      "INVALID_MANIFEST",
      "Invalid Antigravity native plugin.json",
    );
  }
  validateLocalPluginPackage(sourcePath, manifest);
  return true;
}

export function writePluginPackageToAgentTarget(
  sourcePath: string,
  targetPath: string,
  mode: PluginDistributeMode,
  targetId: string,
  plugin: PluginLibraryEntry,
): PluginDistributeMode {
  if (targetId === "shared-agents") {
    const marker = findPluginPackageMarkerPath(sourcePath);
    if (!marker)
      throw new CorePluginError(
        "INVALID_MANIFEST",
        "Shared Plugin package has no manifest",
      );
    validateLocalPluginPackage(
      sourcePath,
      readLocalPluginManifest(path.join(sourcePath, marker)).manifest,
    );
    writeSharedPluginPackage(sourcePath, targetPath, mode, plugin);
    return mode;
  }
  if (canPassthroughNativePluginPackage(sourcePath, targetId)) {
    writePluginPackageToTarget(sourcePath, targetPath, mode, plugin.id);
    return mode;
  }
  if (
    getPluginTargetMatrix().find((target) => target.id === targetId)
      ?.requiresNativeManifest
  ) {
    throw new CorePluginError(
      "UNSUPPORTED_TARGET",
      "Antigravity requires a native plugin.json package; automatic conversion is not supported.",
    );
  }
  if (!targetPath.trim()) {
    throw new CorePluginError("MISSING_TARGET_PATH", "Plugin 目标目录为空");
  }
  publishPluginTarget(sourcePath, targetPath, plugin.id, (stage) => {
    copyPluginPackageDirectoryToTarget(sourcePath, stage);
    writeGeneratedPluginMarker(sourcePath, stage, targetId, plugin);
  });
  return "copy";
}

export function deletePluginPackageTarget(targetPath: string): void {
  if (!targetPath.trim()) {
    return;
  }
  const resolvedTarget = path.resolve(targetPath);
  const root = path.parse(resolvedTarget).root;
  if (
    resolvedTarget === root ||
    resolvedTarget === path.dirname(resolvedTarget)
  ) {
    return;
  }
  assertSafeExistingPluginTarget(resolvedTarget, "remove");
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

const PLUGIN_TARGET_MATRIX: PluginTargetCompatibility[] = [
  {
    id: "shared-agents",
    displayName: "Shared Plugin directory",
    status: "shared",
    enabled: true,
    installSurface: "~/.agents/plugins/<name>/",
    description:
      "Store the complete package in a shared directory; compatible clients or separate registration are required.",
  },
  {
    id: "codex",
    displayName: "Codex",
    status: "native",
    enabled: true,
    nativeMarker: ".codex-plugin/plugin.json",
    installSurface: "codex plugin / .agents/plugins/marketplace.json",
    description: "Native PromptHub Plugin target for Codex plugin bundles.",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    status: "adapter",
    enabled: true,
    nativeMarker: ".claude-plugin/plugin.json",
    installSurface: "claude plugin / --plugin-dir / --plugin-url",
    adapterOutput: "Generate Claude Code plugin package from inventory.",
  },
  {
    id: "cursor",
    displayName: "Cursor",
    status: "adapter",
    enabled: false,
    nativeMarker: ".cursor-plugin/plugin.json",
    installSurface: "Cursor Marketplace / ~/.cursor/plugins/local",
    adapterOutput: "Generate Cursor plugin package from inventory.",
    unsupportedReason:
      "Native Cursor Marketplace installation or verified local-plugin loading is required; direct filesystem distribution is disabled.",
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    status: "adapter",
    enabled: true,
    nativeMarker: "gemini-extension.json",
    installSurface: "gemini extensions install",
    adapterOutput: "Generate Gemini extension package from inventory.",
  },
  {
    id: "antigravity",
    displayName: "Antigravity",
    status: "native",
    enabled: true,
    requiresNativeManifest: true,
    nativeMarker: "plugin.json",
    installSurface: "~/.gemini/config/plugins/<name>/plugin.json",
    description:
      "Copy native Antigravity IDE Plugin packages without manifest conversion.",
  },
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    status: "native",
    enabled: true,
    requiresNativeManifest: true,
    nativeMarker: "plugin.json",
    installSurface: "~/.gemini/config/plugins/<name>/plugin.json",
    description:
      "Copy native Antigravity CLI Plugin packages without manifest conversion.",
  },
  {
    id: "kiro",
    displayName: "Kiro",
    status: "adapter",
    enabled: false,
    nativeMarker: "POWER.md",
    installSurface: "Native Kiro Power import",
    adapterOutput: "Read existing Kiro Power package structures only.",
    unsupportedReason:
      "Native Kiro Power import and registration is required; direct filesystem distribution is disabled.",
  },
  {
    id: "github-copilot",
    displayName: "GitHub Copilot / VS Code",
    status: "adapter",
    enabled: false,
    nativeMarker: "plugin.json",
    installSurface: "copilot plugin / VS Code Agent Plugins",
    adapterOutput: "Generate Copilot or VS Code agent plugin package.",
    unsupportedReason:
      "Native registration through `copilot plugin install` is required; direct filesystem distribution is disabled.",
  },
  {
    id: "qwen",
    displayName: "Qwen Code",
    status: "native",
    enabled: false,
    nativeMarker: "qwen-extension.json",
    installSurface: "qwen extensions install",
    unsupportedReason:
      "PromptHub currently discovers native Qwen extensions but leaves installation and updates to Qwen Code.",
  },
  {
    id: "oh-my-pi",
    displayName: "Oh My Pi",
    status: "native",
    enabled: false,
    nativeMarker:
      ".omp-plugin/plugin.json / .claude-plugin/plugin.json / plugin.json",
    installSurface: "~/.omp/plugins/installed_plugins.json",
    unsupportedReason:
      "PromptHub reads installed Oh My Pi plugin inventory but leaves installation and updates to Oh My Pi.",
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    status: "runtime-only",
    enabled: false,
    nativeMarker: ".opencode/plugins",
    installSurface: "opencode.json plugin modules",
    unsupportedReason:
      "Runtime JS/TS plugin modules are not full Plugin bundle inventory.",
  },
  {
    id: "cline",
    displayName: "Cline",
    status: "runtime-only",
    enabled: false,
    nativeMarker: "AgentPlugin entrypoint",
    installSurface: "cline plugin install",
    unsupportedReason:
      "AgentPlugin runtime entrypoints are not full Plugin bundle inventory.",
  },
  {
    id: "windsurf",
    displayName: "Windsurf / Devin",
    status: "composite",
    enabled: false,
    installSurface: "Separate skills, workflows, hooks and MCP surfaces",
    unsupportedReason:
      "No confirmed single native bundle package; requires composite adapter.",
  },
  {
    id: "roo-code",
    displayName: "Roo Code",
    status: "composite",
    enabled: false,
    installSurface: "Skills, rules, commands and MCP-like config surfaces",
    unsupportedReason:
      "No confirmed single plugin package; requires decomposition.",
  },
  {
    id: "cherry-studio",
    displayName: "Cherry Studio",
    status: "composite",
    enabled: false,
    installSurface: "Local skill and agent registries",
    unsupportedReason:
      "No confirmed single plugin package; requires decomposition.",
  },
  {
    id: "amp",
    displayName: "Amp / Other Agents",
    status: "pending",
    enabled: false,
    unsupportedReason: "Public evidence is insufficient for a stable adapter.",
  },
  {
    id: "zcode",
    displayName: "智谱 ZCode",
    status: "pending",
    enabled: false,
    installSurface: "ZCode Marketplace / local Plugin import",
    unsupportedReason:
      "ZCode documents Plugin bundles, but a stable local package marker and install path are not publicly confirmed.",
  },
];

export function getPluginTargetMatrix(): PluginTargetCompatibility[] {
  return [...PLUGIN_TARGET_MATRIX];
}

interface DistributionContext {
  readLibrary: () => PluginLibraryFile;
  persistLibrary: (library: PluginLibraryFile) => PluginLibraryFile;
  resolveTargetPath?: PluginTargetPathResolver;
}

function requirePlugin(
  library: PluginLibraryFile,
  pluginId: string,
): PluginLibraryEntry {
  const plugin = library.plugins.find((entry) => entry.id === pluginId);
  if (!plugin) {
    throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${pluginId}`);
  }
  return plugin;
}

function requireTargetResolver(
  resolver: PluginTargetPathResolver | undefined,
): PluginTargetPathResolver {
  if (!resolver) {
    throw new CorePluginError(
      "MISSING_TARGET_RESOLVER",
      "当前环境没有配置 Agent Plugin 目标路径解析器",
    );
  }
  return resolver;
}

function persistDistributedPlugin(
  context: DistributionContext,
  library: PluginLibraryFile,
  plugin: PluginLibraryEntry,
): PluginLibraryFile {
  const nextLibrary: PluginLibraryFile = {
    ...library,
    updatedAt: nowIso(),
    plugins: library.plugins.map((entry) =>
      entry.id === plugin.id ? plugin : entry,
    ),
  };
  return context.persistLibrary(nextLibrary);
}

function resolveDistributionTargets(
  plugin: PluginLibraryEntry,
  targetIds: string[],
  mode: PluginDistributeMode,
  resolver: PluginTargetPathResolver,
): PluginDistributeResult["targets"] {
  const sourcePath = getPluginLocalPackagePath(plugin);
  assertReadableDirectory(sourcePath, `${plugin.displayName} 本地 Plugin 包`);
  return targetIds.map((targetId) => {
    const targetPath = resolver(targetId, plugin);
    if (!targetPath) {
      throw new CorePluginError(
        "MISSING_TARGET_PATH",
        `无法解析 Agent Plugin 目标路径: ${targetId}`,
      );
    }
    const resolvedMode = writePluginPackageToAgentTarget(
      sourcePath,
      targetPath,
      mode,
      targetId,
      plugin,
    );
    return { targetId, path: targetPath, mode: resolvedMode };
  });
}

export function distributePlugin(
  context: DistributionContext,
  request: PluginDistributeRequest,
  persist = true,
): PluginDistributeResult {
  const targetIds = normalizeDistributedTargetIds(request.targetIds);
  if (targetIds.length === 0) {
    throw new CorePluginError(
      "MISSING_TARGET",
      "请选择至少一个 Agent Plugin 目标",
    );
  }
  if (request.mode !== "copy" && request.mode !== "symlink") {
    throw new CorePluginError(
      "INVALID_MODE",
      `不支持的 Plugin 分发模式: ${request.mode}`,
    );
  }
  assertSupportedPluginTargets(targetIds);

  const library = context.readLibrary();
  const plugin = requirePlugin(library, request.pluginId);
  const resolver = requireTargetResolver(context.resolveTargetPath);
  const targets = resolveDistributionTargets(
    plugin,
    targetIds,
    request.mode,
    resolver,
  );
  const nextPlugin: PluginLibraryEntry = {
    ...plugin,
    ...inspectLocalPluginNativeTargets(getPluginLocalPackagePath(plugin)),
    distributedTargetIds: normalizeDistributedTargetIds([
      ...(plugin.distributedTargetIds ?? []),
      ...targets.map((target) => target.targetId),
    ]),
    updatedAt: nowMs(),
  };
  return {
    plugin: nextPlugin,
    library: persist
      ? persistDistributedPlugin(context, library, nextPlugin)
      : library,
    targets,
  };
}

function removeTargets(
  plugin: PluginLibraryEntry,
  targetIds: string[],
  resolver: PluginTargetPathResolver,
): { removedTargetIds: string[]; skippedTargetIds: string[] } {
  const distributed = new Set(
    normalizeDistributedTargetIds(plugin.distributedTargetIds ?? []),
  );
  const removedTargetIds: string[] = [];
  const skippedTargetIds: string[] = [];
  const requested = new Set(targetIds);
  const retainedPaths = new Set(
    [...distributed]
      .filter((id) => !requested.has(id))
      .flatMap((id) => {
        const targetPath = resolver(id, plugin);
        return targetPath ? [path.resolve(targetPath)] : [];
      }),
  );
  for (const targetId of targetIds) {
    if (!distributed.has(targetId)) {
      skippedTargetIds.push(targetId);
      continue;
    }
    const targetPath = resolver(targetId, plugin);
    if (!targetPath) {
      throw new CorePluginError(
        "MISSING_TARGET_PATH",
        `无法解析 Agent Plugin 目标路径: ${targetId}`,
      );
    }
    if (targetId === "shared-agents")
      assertSharedPluginOwnership(targetPath, plugin);
    assertPluginTargetWritable(
      getPluginLocalPackagePath(plugin),
      targetPath,
      plugin.id,
    );
    // Desktop and CLI may reference the same native package directory.
    if (!retainedPaths.has(path.resolve(targetPath)))
      deletePluginPackageTarget(targetPath);
    removedTargetIds.push(targetId);
  }
  return { removedTargetIds, skippedTargetIds };
}

export function removePluginDistribution(
  context: DistributionContext,
  request: PluginUndistributeRequest,
): PluginUndistributeResult {
  const targetIds = normalizeDistributedTargetIds(request.targetIds ?? []);
  if (!request.pluginId.trim()) {
    throw new CorePluginError("INVALID_INPUT", "Plugin ID 不能为空");
  }
  if (targetIds.length === 0) {
    throw new CorePluginError(
      "MISSING_TARGET",
      "请选择至少一个 Agent Plugin 目标",
    );
  }
  const library = context.readLibrary();
  const plugin = requirePlugin(library, request.pluginId);
  const resolver = requireTargetResolver(context.resolveTargetPath);
  const result = removeTargets(plugin, targetIds, resolver);
  const removed = new Set(result.removedTargetIds);
  const nextPlugin: PluginLibraryEntry = {
    ...plugin,
    distributedTargetIds: normalizeDistributedTargetIds(
      plugin.distributedTargetIds ?? [],
    ).filter((targetId) => !removed.has(targetId)),
    updatedAt: nowMs(),
  };
  return {
    plugin: nextPlugin,
    library: persistDistributedPlugin(context, library, nextPlugin),
    ...result,
  };
}

export function deleteDistributedPluginTargets(
  plugin: PluginLibraryEntry,
  resolver: PluginTargetPathResolver | undefined,
): void {
  const targetIds = normalizeDistributedTargetIds(
    plugin.distributedTargetIds ?? [],
  );
  if (targetIds.length === 0) {
    return;
  }
  const targetResolver = requireTargetResolver(resolver);
  const targetPaths = targetIds.map((targetId) => {
    const targetPath = targetResolver(targetId, plugin);
    if (!targetPath)
      throw new CorePluginError(
        "MISSING_TARGET_PATH",
        `Cannot resolve Plugin target: ${targetId}`,
      );
    if (targetId === "shared-agents")
      assertSharedPluginOwnership(targetPath, plugin);
    assertPluginTargetWritable(
      getPluginLocalPackagePath(plugin),
      targetPath,
      plugin.id,
    );
    assertSafeExistingPluginTarget(targetPath, "remove");
    return targetPath;
  });
  for (const targetPath of targetPaths) deletePluginPackageTarget(targetPath);
}
