import fs from "fs";
import path from "path";
import * as childProcess from "child_process";
import * as crypto from "crypto";

import type {
  PluginImportSourceRequest,
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginPackageSnapshot,
  PluginPackageSource,
  PluginSourceKind,
  PluginSourceUpdateCheck,
} from "@prompthub/shared/types/plugin";

import { getCacheDir, getDataDir } from "../runtime-paths";
import {
  CODEX_PLUGIN_MANIFEST_FILE,
  CorePluginError,
  MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES,
  MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES,
  type MaterializedPluginPackage,
  type MaterializedPluginSourcePackage,
  type NormalizedPluginSourceRequest,
  PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS,
  type RawRecord,
  ensureInsideDirectory,
  getManagedPluginsDir,
  getPluginLocalPackagePath,
  normalizeRelativePosixPath,
  normalizeSlug,
  nowMs,
  safePluginUserNotes,
  safePluginUserTags,
} from "./shared";
import {
  getLocalPluginNativeTargetIds,
  inspectLocalPluginNativeTargets,
} from "./package-validation";
import { normalizePluginSafetyReport } from "./normalization";

function getPluginMaterializationDir(): string {
  return path.join(getCacheDir(), "plugin-materializations");
}

export function removePluginMaterialization(managedPath?: string): void {
  if (!managedPath) return;
  const root = path.resolve(getPluginMaterializationDir());
  const candidate = path.resolve(managedPath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return;
  }
  fs.rmSync(candidate, { recursive: true, force: true });
}

export function copyPluginPackageToManagedPath(
  sourcePath: string,
  pluginId: string,
): MaterializedPluginPackage {
  const managedPath = path.join(
    getPluginMaterializationDir(),
    normalizeSlug(pluginId) || "plugin",
  );
  const tempPath = `${managedPath}.tmp-${process.pid}-${Date.now()}`;
  const localPackagePath = path.join(managedPath, "package");
  try {
    fs.rmSync(tempPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.mkdirSync(tempPath, { recursive: true });
    fs.cpSync(sourcePath, path.join(tempPath, "package"), {
      recursive: true,
      force: true,
      dereference: false,
    });
    fs.rmSync(managedPath, { recursive: true, force: true });
    fs.renameSync(tempPath, managedPath);
    return {
      managedPath,
      localRepositoryPath: managedPath,
      localPackagePath,
    };
  } catch (error) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    throw error;
  }
}

function isInsideManagedPluginsDir(candidatePath: string): boolean {
  try {
    ensureInsideDirectory(
      path.join(getDataDir(), "plugin-files"),
      candidatePath,
    );
    return true;
  } catch {
    return false;
  }
}

function getPluginSnapshotPackagePath(
  plugin: PluginLibraryEntry,
): string | undefined {
  const packagePath =
    plugin.localPackagePath || plugin.source.localPackagePath || "";
  if (!packagePath.trim() || !isInsideManagedPluginsDir(packagePath)) {
    return undefined;
  }
  try {
    return fs.statSync(packagePath).isDirectory()
      ? path.resolve(packagePath)
      : undefined;
  } catch {
    return undefined;
  }
}

function appendPluginSnapshotEntry(
  plugin: PluginLibraryEntry,
  packagePath: string,
  current: string,
  entry: fs.Dirent,
  files: PluginPackageSnapshot["files"],
  queue: string[],
): void {
  const entryPath = path.join(current, entry.name);
  if (entry.isDirectory()) {
    if (!PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
      queue.push(entryPath);
    }
    return;
  }
  if (!entry.isFile()) {
    return;
  }
  const stat = fs.statSync(entryPath);
  if (stat.size > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES) {
    throw new CorePluginError(
      "PACKAGE_TOO_LARGE",
      `Plugin 文件超过同步上限: ${plugin.displayName}/${entry.name}`,
    );
  }
  if (files.length >= MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES) {
    throw new CorePluginError(
      "PACKAGE_TOO_LARGE",
      `Plugin 文件数量超过同步上限: ${plugin.displayName}`,
    );
  }
  files.push({
    relativePath: normalizeRelativePosixPath(
      path.relative(packagePath, entryPath),
    ),
    contentBase64: fs.readFileSync(entryPath).toString("base64"),
    size: stat.size,
  });
}

export function readPluginPackageSnapshot(
  plugin: PluginLibraryEntry,
): PluginPackageSnapshot | undefined {
  const packagePath = getPluginSnapshotPackagePath(plugin);
  if (!packagePath) {
    return undefined;
  }

  const files: PluginPackageSnapshot["files"] = [];
  const queue = [packagePath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      appendPluginSnapshotEntry(
        plugin,
        packagePath,
        current,
        entry,
        files,
        queue,
      );
    }
  }

  return {
    pluginId: plugin.id,
    files: files.sort((left, right) =>
      left.relativePath === right.relativePath
        ? 0
        : left.relativePath < right.relativePath
          ? -1
          : 1,
    ),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as RawRecord)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getPreviewFingerprintPayload(preview: PluginMarketPreview): RawRecord {
  return {
    name: preview.entry.name,
    displayName: preview.displayName,
    description: preview.description,
    longDescription: preview.longDescription,
    iconUrl: preview.iconUrl,
    logoUrl: preview.logoUrl,
    brandColor: preview.brandColor,
    version: preview.version,
    author: preview.author,
    category: preview.category,
    inventory: preview.inventory,
    classification: preview.classification,
    tags: preview.tags,
    homepage: preview.homepage,
    repository: preview.repository,
    source: getSourceFingerprintPayload(preview.entry.source),
  };
}

function getPluginFingerprintPayload(plugin: PluginLibraryEntry): RawRecord {
  return {
    name: plugin.name,
    displayName: plugin.displayName,
    description: plugin.description,
    longDescription: plugin.longDescription,
    iconUrl: plugin.iconUrl,
    logoUrl: plugin.logoUrl,
    brandColor: plugin.brandColor,
    version: plugin.version,
    author: plugin.author,
    category: plugin.category,
    inventory: plugin.inventory,
    classification: plugin.classification,
    tags: plugin.tags ?? [],
    homepage: plugin.homepage,
    repository: plugin.repository,
    source: getSourceFingerprintPayload(plugin.source),
  };
}

function getSourceFingerprintPayload(source: PluginPackageSource): RawRecord {
  return {
    kind: source.kind,
    sourceId: source.sourceId,
    repository: source.repository,
    rawJsonUrl: source.rawJsonUrl,
    marketplaceFile: source.marketplaceFile,
    packagePath: source.packagePath,
    manifestPath: source.manifestPath,
    url: source.url,
    branch: source.branch,
  };
}

export function computePluginPreviewFingerprint(
  preview: PluginMarketPreview,
): string {
  return sha256Text(stableJson(getPreviewFingerprintPayload(preview)));
}

export function computePluginEntryManifestFingerprint(
  plugin: PluginLibraryEntry,
): string {
  return sha256Text(stableJson(getPluginFingerprintPayload(plugin)));
}

export function computePluginPackageFingerprint(
  packagePath: string | undefined,
  ignoredFiles: readonly string[] = [],
): string | undefined {
  if (!packagePath?.trim() || !fs.existsSync(packagePath)) return undefined;
  if (!fs.statSync(packagePath).isDirectory()) return undefined;

  const root = path.resolve(packagePath);
  const hash = crypto.createHash("sha256");
  const queue = [root];
  let fileCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }
      const relativePath = normalizeRelativePosixPath(
        path.relative(root, entryPath),
      );
      if (ignoredFiles.includes(relativePath)) continue;
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        hash.update(`symlink:${relativePath}:${fs.readlinkSync(entryPath)}\n`);
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES) {
        throw new CorePluginError("PACKAGE_TOO_LARGE", relativePath);
      }
      if (++fileCount > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES) {
        throw new CorePluginError("PACKAGE_TOO_LARGE", root);
      }
      hash.update(`file:${relativePath}:${stat.size}\n`);
      hash.update(fs.readFileSync(entryPath));
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

export function getPluginUpdateStatus(
  localModified: boolean,
  remoteChanged: boolean,
): PluginSourceUpdateCheck["status"] {
  if (localModified && remoteChanged) return "conflict";
  if (localModified) return "local-modified";
  if (remoteChanged) return "update-available";
  return "up-to-date";
}

export function buildUpdatedPluginFromPreview(
  plugin: PluginLibraryEntry,
  preview: PluginMarketPreview,
  materialized: MaterializedPluginPackage | undefined,
  remoteManifestHash: string | undefined,
  timestamp: number,
): PluginLibraryEntry {
  const localPackagePath =
    materialized?.localPackagePath ?? plugin.localPackagePath;
  const localRepositoryPath =
    materialized?.localRepositoryPath ?? plugin.localRepositoryPath;
  const source = {
    ...preview.entry.source,
    label: preview.entry.source.label ?? plugin.source.label,
    localRepositoryPath,
    localPackagePath,
    url: preview.entry.source.url ?? plugin.source.url,
  };
  return {
    ...plugin,
    name: preview.entry.name,
    displayName: preview.displayName,
    description: preview.description,
    longDescription: preview.longDescription,
    iconUrl: preview.iconUrl,
    logoUrl: preview.logoUrl,
    brandColor: preview.brandColor,
    version: preview.version,
    author: preview.author,
    category: preview.category,
    inventory: preview.inventory,
    classification: preview.classification,
    source,
    isFavorite: plugin.isFavorite === true,
    tags: preview.tags,
    userTags: safePluginUserTags(plugin.userTags),
    userNotes: safePluginUserNotes(plugin.userNotes),
    safetyReport: normalizePluginSafetyReport(plugin.safetyReport),
    homepage: preview.homepage,
    repository: preview.repository,
    ...(localPackagePath
      ? inspectLocalPluginNativeTargets(localPackagePath)
      : { invalidNativeTargetIds: [], nativeTargetIds: [] }),
    managedPath: materialized?.managedPath ?? plugin.managedPath,
    localRepositoryPath,
    localPackagePath,
    installedManifestHash: remoteManifestHash,
    installedPackageHash: computePluginPackageFingerprint(localPackagePath),
    updatedFromSourceAt: timestamp,
    updatedAt: timestamp,
  };
}

function getRestoredPluginManagedPath(pluginId: string): string {
  return path.join(
    getPluginMaterializationDir(),
    normalizeSlug(pluginId) || "plugin",
  );
}

export function writePluginPackageSnapshot(snapshot: PluginPackageSnapshot): {
  localPackagePath: string;
  managedPath: string;
} {
  const managedPath = getRestoredPluginManagedPath(snapshot.pluginId);
  const tempPath = `${managedPath}.sync-tmp-${process.pid}-${Date.now()}`;
  const localPackagePath = path.join(tempPath, "package");

  try {
    fs.rmSync(tempPath, { recursive: true, force: true });
    fs.mkdirSync(localPackagePath, { recursive: true });
    for (const file of snapshot.files) {
      const relativePath = normalizeRelativePosixPath(file.relativePath);
      const targetPath = path.join(
        localPackagePath,
        ...relativePath.split("/"),
      );
      ensureInsideDirectory(localPackagePath, targetPath);
      const buffer = Buffer.from(file.contentBase64, "base64");
      if (buffer.length !== file.size) {
        throw new CorePluginError(
          "INVALID_PACKAGE_SNAPSHOT",
          `Plugin 文件快照大小不匹配: ${snapshot.pluginId}/${relativePath}`,
        );
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
    }
    fs.rmSync(managedPath, { recursive: true, force: true });
    fs.renameSync(tempPath, managedPath);
    return {
      managedPath,
      localPackagePath: path.join(managedPath, "package"),
    };
  } catch (error) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    throw error;
  }
}

export function remapRestoredPluginPackage(
  plugin: PluginLibraryEntry,
  restoredPackage:
    | {
        localPackagePath: string;
        managedPath: string;
      }
    | undefined,
): PluginLibraryEntry {
  if (!restoredPackage) {
    return plugin;
  }

  return {
    ...plugin,
    ...inspectLocalPluginNativeTargets(restoredPackage.localPackagePath),
    managedPath: restoredPackage.managedPath,
    localRepositoryPath: restoredPackage.managedPath,
    localPackagePath: restoredPackage.localPackagePath,
    source: {
      ...plugin.source,
      localRepositoryPath: restoredPackage.managedPath,
      localPackagePath: restoredPackage.localPackagePath,
    },
  };
}

const PLUGIN_GIT_TIMEOUT_MS = 30_000;

export function sanitizePluginSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[^a-z0-9@:/._-]+/gi, "");
  }
}

export function sanitizePluginSourceDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|secret|password|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(token|secret|password|api[_-]?key)=\S+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function runGit(
  args: string[],
  cwd?: string,
  sourceUrl?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const rejectOnce = (error: CorePluginError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      rejectOnce(
        new CorePluginError(
          "GIT_FAILED",
          `Git clone timed out after ${PLUGIN_GIT_TIMEOUT_MS / 1000}s for URL: ${sanitizePluginSourceUrl(sourceUrl ?? "unknown")}`,
        ),
      );
    }, PLUGIN_GIT_TIMEOUT_MS);
    timeout.unref?.();
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (error) => {
      rejectOnce(
        new CorePluginError(
          "GIT_FAILED",
          sanitizePluginSourceDiagnostic(error.message),
        ),
      );
    });
    proc.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        clearTimeout(timeout);
        resolve();
        return;
      }
      rejectOnce(
        new CorePluginError(
          "GIT_FAILED",
          sanitizePluginSourceDiagnostic(
            `Git 命令执行失败 (${code ?? "unknown"}): ${stderr.trim()}`,
          ),
        ),
      );
    });
  });
}

function inferPluginSourceKind(url: string): PluginSourceKind {
  const lower = url.toLowerCase();
  if (lower.startsWith("git@") || lower.startsWith("ssh://")) {
    return "ssh";
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "http";
  }
  return "git";
}

function normalizeOptionalSourcePackagePath(
  packagePath: string | undefined,
  ignoredFiles: readonly string[] = [],
): string | undefined {
  const trimmed = packagePath?.trim() ?? "";
  if (!trimmed || trimmed === "." || trimmed === "./") {
    return undefined;
  }
  return normalizeRelativePosixPath(trimmed);
}

function normalizeSourceBranch(branch: string | undefined): string | undefined {
  const trimmed = branch?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("\0")) {
    throw new CorePluginError("INVALID_SOURCE", "Plugin source branch 非法");
  }
  return trimmed;
}

export function normalizePluginSourceImportRequest(
  request: PluginImportSourceRequest,
): NormalizedPluginSourceRequest {
  const url = request.url.trim();
  if (!url || url.includes("\0")) {
    throw new CorePluginError("INVALID_SOURCE", "Plugin source URL 非法");
  }
  const packagePath = normalizeOptionalSourcePackagePath(request.packagePath);
  const branch = normalizeSourceBranch(request.branch);
  const kind = inferPluginSourceKind(url);
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      [
        kind,
        sanitizePluginSourceUrl(url),
        branch ?? "",
        packagePath ?? "",
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 10);
  return {
    branch,
    kind,
    label: request.label?.trim() || undefined,
    packagePath,
    sourceId: `${kind}-${fingerprint}`,
    url,
  };
}

export async function materializeGitSourcePackage(
  request: NormalizedPluginSourceRequest,
): Promise<MaterializedPluginSourcePackage> {
  const tempRoot = path.join(
    getManagedPluginsDir(),
    `.source-${request.sourceId}.tmp-${process.pid}-${Date.now()}`,
  );
  const repoDir = path.join(tempRoot, "repo");
  const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none"];
  if (request.packagePath) {
    cloneArgs.push("--sparse");
  }
  if (request.branch) {
    cloneArgs.push("--branch", request.branch);
  }
  cloneArgs.push("--", request.url, repoDir);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(tempRoot), { recursive: true });
    await runGit(cloneArgs, undefined, request.url);
    if (request.packagePath) {
      await runGit(
        ["sparse-checkout", "set", "--no-cone", request.packagePath],
        repoDir,
        request.url,
      );
    }

    const sourcePath = request.packagePath
      ? path.join(repoDir, ...request.packagePath.split("/"))
      : repoDir;
    ensureInsideDirectory(repoDir, sourcePath);
    return {
      cleanupPath: tempRoot,
      localRepositoryPath: repoDir,
      sourcePath,
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function getMarketGitPackageSource(entry: PluginMarketEntry): {
  packagePath: string;
  repository: string;
} {
  if (!entry.source.repository || !entry.source.packagePath) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${entry.displayName} 没有可下载的 Git source`,
    );
  }
  return {
    repository: entry.source.repository,
    packagePath: normalizeRelativePosixPath(entry.source.packagePath),
  };
}

async function checkoutMarketGitPackage(
  repository: string,
  packagePath: string,
  repoDir: string,
): Promise<void> {
  await runGit(
    [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--",
      repository,
      repoDir,
    ],
    undefined,
    repository,
  );
  await runGit(
    ["sparse-checkout", "set", "--no-cone", packagePath],
    repoDir,
    repository,
  );
}

function finalizeMarketGitPackage(
  entry: PluginMarketEntry,
  pluginRoot: string,
  tempRoot: string,
  repoDir: string,
  packagePath: string,
): MaterializedPluginPackage {
  const localPackagePath = path.join(repoDir, ...packagePath.split("/"));
  ensureInsideDirectory(repoDir, localPackagePath);
  if (!fs.existsSync(path.join(localPackagePath, CODEX_PLUGIN_MANIFEST_FILE))) {
    throw new CorePluginError(
      "MISSING_MANIFEST",
      `${entry.displayName} 下载后没有找到 Plugin manifest`,
    );
  }
  getLocalPluginNativeTargetIds(localPackagePath);
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  fs.renameSync(tempRoot, pluginRoot);
  return {
    managedPath: pluginRoot,
    localRepositoryPath: path.join(pluginRoot, "repo"),
    localPackagePath: path.join(pluginRoot, "repo", ...packagePath.split("/")),
  };
}

export async function materializeGitPackage(
  entry: PluginMarketEntry,
  pluginId: string,
): Promise<MaterializedPluginPackage> {
  const source = getMarketGitPackageSource(entry);
  const pluginRoot = path.join(
    getPluginMaterializationDir(),
    normalizeSlug(pluginId) || "plugin",
  );
  const tempRoot = `${pluginRoot}.tmp-${process.pid}-${Date.now()}`;
  const repoDir = path.join(tempRoot, "repo");
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    await checkoutMarketGitPackage(
      source.repository,
      source.packagePath,
      repoDir,
    );
    return finalizeMarketGitPackage(
      entry,
      pluginRoot,
      tempRoot,
      repoDir,
      source.packagePath,
    );
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
