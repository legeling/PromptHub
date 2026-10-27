import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  readRuntimeLayoutState,
  resolveRuntimeStorageContext,
  type RuntimeLayoutEpoch,
} from "./runtime-storage-context";

const COPY_BUFFER_BYTES = 1024 * 1024;
const IGNORED_EMPTY_ENTRIES = new Set([".DS_Store", "Thumbs.db"]);
const CANONICAL_TOP_LEVEL = ["data", "config", "secrets"] as const;
const LEGACY_TOP_LEVEL = [
  "prompthub.db",
  "workspace",
  "skills",
  "images",
  "videos",
  "shortcuts.json",
  "shortcut-mode.json",
  "config",
  "secrets",
] as const;
const EXCLUDED_DATA_RELATIVE_PREFIXES = [
  ".layout-state.json",
  "operations/journals",
  "operations/storage-maintenance.json",
  "prompthub.db-wal",
  "prompthub.db-shm",
  "prompthub.db-journal",
] as const;

export interface StorageInventoryLimits {
  maxEntries?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxDepth?: number;
}

export interface StorageInventoryOptions extends StorageInventoryLimits {
  includeSecrets?: boolean;
  /** Used only for a manifest-validated detached snapshot, never root discovery. */
  detachedLayoutEpoch?: RuntimeLayoutEpoch;
  /** Exact entries; an excluded directory excludes its complete subtree. */
  excludeRelativePaths?: readonly string[];
}

export interface StorageInventoryEntry {
  relativePath: string;
  sizeBytes: number;
  modifiedMs: number;
  sha256: string;
}

export interface StorageInventory {
  rootPath: string;
  layoutEpoch: RuntimeLayoutEpoch;
  files: StorageInventoryEntry[];
  totalBytes: number;
  digest: string;
}

export type StorageRootClassificationKind =
  | "missing"
  | "empty"
  | "canonical"
  | "legacy"
  | "mixed"
  | "unknown"
  | "invalid";

export interface StorageRootClassification {
  rootPath: string;
  kind: StorageRootClassificationKind;
  layoutEpoch?: RuntimeLayoutEpoch;
  databasePath?: string;
  unknownEntries: string[];
  reason?: string;
}

function readStats(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function meaningfulEntries(rootPath: string): fs.Dirent[] {
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => !IGNORED_EMPTY_ENTRIES.has(entry.name));
}

function directoryContainsMeaningfulEntry(directoryPath: string): boolean {
  const stats = readStats(directoryPath);
  if (!stats) return false;
  if (stats.isSymbolicLink() || !stats.isDirectory()) return true;
  return meaningfulEntries(directoryPath).length > 0;
}

export function classifyStorageRoot(
  rootPath: string,
): StorageRootClassification {
  const root = path.resolve(rootPath);
  const stats = readStats(root);
  if (!stats) return { rootPath: root, kind: "missing", unknownEntries: [] };
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    return {
      rootPath: root,
      kind: "invalid",
      unknownEntries: [],
      reason: stats.isSymbolicLink()
        ? "root is a symbolic link"
        : "root is not a directory",
    };
  }

  const entries = meaningfulEntries(root);
  if (entries.length === 0) {
    return { rootPath: root, kind: "empty", unknownEntries: [] };
  }
  const onlyEmptyMarkers = entries.every(
    (entry) =>
      (entry.name === "data" || entry.name === "config") &&
      entry.isDirectory() &&
      !directoryContainsMeaningfulEntry(path.join(root, entry.name)),
  );
  if (onlyEmptyMarkers) {
    return { rootPath: root, kind: "empty", unknownEntries: [] };
  }

  try {
    const context = resolveRuntimeStorageContext(root);
    const state = readRuntimeLayoutState(root);
    if (state || context.resolutionReason !== "empty-root") {
      return {
        rootPath: root,
        kind: context.layoutEpoch === 1 ? "canonical" : "legacy",
        layoutEpoch: context.layoutEpoch,
        databasePath: context.databasePath,
        unknownEntries: [],
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      rootPath: root,
      kind: /mixed PromptHub storage layout/i.test(message)
        ? "mixed"
        : "invalid",
      unknownEntries: entries.map((entry) => entry.name).sort(),
      reason: message,
    };
  }

  return {
    rootPath: root,
    kind: "unknown",
    unknownEntries: entries.map((entry) => entry.name).sort(),
    reason: "directory has no complete PromptHub storage identity",
  };
}

function normalizeRelativePath(root: string, targetPath: string): string {
  const relative = path.relative(root, targetPath);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  ) {
    throw new Error(`Unsafe storage inventory path: ${targetPath}`);
  }
  return relative.split(path.sep).join("/");
}

function hashRegularFile(filePath: string): string {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function isExcludedCanonicalPath(relativePath: string): boolean {
  if (!relativePath.startsWith("data/")) return false;
  const withinData = relativePath.slice("data/".length);
  return EXCLUDED_DATA_RELATIVE_PREFIXES.some(
    (prefix) => withinData === prefix || withinData.startsWith(`${prefix}/`),
  );
}

function assertLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

export function createStorageInventory(
  rootPath: string,
  options: StorageInventoryOptions = {},
): StorageInventory {
  const root = path.resolve(rootPath);
  const classification =
    options.detachedLayoutEpoch === undefined
      ? classifyStorageRoot(root)
      : null;
  if (
    classification &&
    classification.kind !== "canonical" &&
    classification.kind !== "legacy"
  ) {
    throw new Error(
      `Cannot inventory ${classification.kind} PromptHub root: ${classification.rootPath}`,
    );
  }
  if (!classification) {
    const stats = fs.lstatSync(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Cannot inventory unsafe detached root: ${root}`);
    }
  }
  const layoutEpoch =
    options.detachedLayoutEpoch ?? classification!.layoutEpoch!;
  const maxEntries = assertLimit(options.maxEntries ?? 100_000, "maxEntries");
  const maxTotalBytes = assertLimit(
    options.maxTotalBytes ?? 100 * 1024 * 1024 * 1024,
    "maxTotalBytes",
  );
  const maxFileBytes = assertLimit(
    options.maxFileBytes ?? 10 * 1024 * 1024 * 1024,
    "maxFileBytes",
  );
  const maxDepth = assertLimit(options.maxDepth ?? 32, "maxDepth");
  const topLevel =
    layoutEpoch === 1
      ? CANONICAL_TOP_LEVEL.filter(
          (entry) => entry !== "secrets" || options.includeSecrets,
        )
      : LEGACY_TOP_LEVEL.filter(
          (entry) => entry !== "secrets" || options.includeSecrets,
        );
  const files: StorageInventoryEntry[] = [];
  const excludedPaths = new Set(
    (options.excludeRelativePaths ?? []).map((entry) =>
      entry.split(path.sep).join("/"),
    ),
  );
  let totalBytes = 0;
  let visitedEntries = 0;

  const visit = (targetPath: string, depth: number): void => {
    const relativePath = normalizeRelativePath(root, targetPath);
    if (excludedPaths.has(relativePath)) return;
    if (depth > maxDepth)
      throw new Error(`Storage inventory exceeds maxDepth at ${targetPath}`);
    visitedEntries += 1;
    if (visitedEntries > maxEntries)
      throw new Error("Storage inventory exceeds maxEntries");
    const stats = fs.lstatSync(targetPath);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Refusing symbolic link in storage inventory: ${targetPath}`,
      );
    }
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
        if (IGNORED_EMPTY_ENTRIES.has(entry.name)) continue;
        visit(path.join(targetPath, entry.name), depth + 1);
      }
      return;
    }
    if (!stats.isFile()) {
      throw new Error(
        `Refusing special file in storage inventory: ${targetPath}`,
      );
    }
    if (isExcludedCanonicalPath(relativePath)) return;
    if (stats.size > maxFileBytes) {
      throw new Error(
        `Storage inventory file exceeds maxFileBytes: ${targetPath}`,
      );
    }
    totalBytes += stats.size;
    if (totalBytes > maxTotalBytes)
      throw new Error("Storage inventory exceeds maxTotalBytes");
    files.push({
      relativePath,
      sizeBytes: stats.size,
      modifiedMs: stats.mtimeMs,
      sha256: hashRegularFile(targetPath),
    });
  };

  for (const entry of topLevel) {
    const targetPath = path.join(root, entry);
    if (readStats(targetPath)) visit(targetPath, 1);
  }
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  const digest = crypto
    .createHash("sha256")
    .update(
      files
        .map(
          (file) => `${file.relativePath}\0${file.sizeBytes}\0${file.sha256}\n`,
        )
        .join(""),
    )
    .digest("hex");
  return {
    rootPath: root,
    layoutEpoch,
    files,
    totalBytes,
    digest,
  };
}

export function copyStorageInventory(
  inventory: StorageInventory,
  destinationRoot: string,
): void {
  const destination = path.resolve(destinationRoot);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  for (const entry of inventory.files) {
    const sourcePath = path.join(
      inventory.rootPath,
      ...entry.relativePath.split("/"),
    );
    const destinationPath = path.join(
      destination,
      ...entry.relativePath.split("/"),
    );
    const before = fs.lstatSync(sourcePath);
    if (before.isSymbolicLink() || !before.isFile()) {
      throw new Error(`Storage inventory source changed type: ${sourcePath}`);
    }
    fs.mkdirSync(path.dirname(destinationPath), {
      recursive: true,
      mode: 0o700,
    });
    const source = fs.openSync(sourcePath, "r");
    const target = fs.openSync(destinationPath, "wx", 0o600);
    const digest = crypto.createHash("sha256");
    let copied = 0;
    try {
      let bytesRead = 0;
      do {
        bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
        if (bytesRead > 0) {
          const chunk = buffer.subarray(0, bytesRead);
          fs.writeSync(target, chunk);
          digest.update(chunk);
          copied += bytesRead;
        }
      } while (bytesRead > 0);
      fs.fsyncSync(target);
    } finally {
      fs.closeSync(source);
      fs.closeSync(target);
    }
    const after = fs.lstatSync(sourcePath);
    if (
      copied !== entry.sizeBytes ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      digest.digest("hex") !== entry.sha256
    ) {
      throw new Error(
        `Storage inventory source changed during copy: ${sourcePath}`,
      );
    }
  }
}

export function verifyStorageInventory(
  inventory: StorageInventory,
  destinationRoot: string,
): void {
  const destination = path.resolve(destinationRoot);
  for (const entry of inventory.files) {
    const targetPath = path.join(destination, ...entry.relativePath.split("/"));
    const stats = fs.lstatSync(targetPath);
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      stats.size !== entry.sizeBytes ||
      hashRegularFile(targetPath) !== entry.sha256
    ) {
      throw new Error(`Storage inventory verification failed: ${targetPath}`);
    }
  }
}
