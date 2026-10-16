import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  getCanonicalStorageAuthorityPath,
  readCanonicalStorageAuthority,
} from "./canonical-storage-authority";
import { deriveStorageRootIdentity } from "./storage-root-identity";

export const CURRENT_LAYOUT_STATE_FORMAT_VERSION = 1;
export const CURRENT_LAYOUT_EPOCH = 1;
export const LEGACY_LAYOUT_EPOCH = 0;
export const LAYOUT_STATE_FILE_NAME = ".layout-state.json";

export type RuntimeLayoutEpoch =
  | typeof LEGACY_LAYOUT_EPOCH
  | typeof CURRENT_LAYOUT_EPOCH;

export type StorageResolutionReason =
  | "layout-state"
  | "canonical-database"
  | "canonical-files"
  | "legacy-database"
  | "legacy-files"
  | "empty-root";

export interface RuntimeLayoutState {
  formatVersion: number;
  layoutEpoch: number;
  state: "complete";
  rootIdentity: string;
  verifiedAt: string;
  lastVerifiedOperation?: string;
}

export interface RuntimeStorageContext {
  activeRoot: string;
  rootIdentity: string;
  layoutEpoch: RuntimeLayoutEpoch;
  dataPath: string;
  databasePath: string;
  promptsPath: string;
  skillsPath: string;
  imagesPath: string;
  videosPath: string;
  workspacePath: string;
  assetsPath: string;
  generationsPath: string;
  configPath: string;
  secretsPath: string;
  backupsPath: string;
  cachePath: string;
  logsPath: string;
  operationsPath: string;
  layoutStatePath: string;
  authorityStatePath: string;
  localAuthority: "database-catalog" | "canonical-files";
  resolutionReason: StorageResolutionReason;
}

interface LegacyLayoutMarker {
  version?: unknown;
  movedEntries?: unknown;
  failedEntries?: unknown;
  dbLayoutVersion?: unknown;
}

export {
  deriveLocalResourceDeviceId,
  deriveStorageRootIdentity,
  localResourceDeviceIdFromRootIdentity,
} from "./storage-root-identity";

function getSafePathStats(
  activeRoot: string,
  targetPath: string,
): fs.Stats | null {
  const root = path.resolve(activeRoot);
  const target = path.resolve(targetPath);
  const relativePath = path.relative(root, target);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `PromptHub storage path escapes its active root: ${target}`,
    );
  }

  const segments = relativePath ? relativePath.split(path.sep) : [];
  let currentPath = root;
  let result: fs.Stats | null = null;
  for (let index = -1; index < segments.length; index += 1) {
    if (index >= 0) {
      currentPath = path.join(currentPath, segments[index]);
    }
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Refusing symbolic link in PromptHub storage path: ${currentPath}`,
      );
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw new Error(
        `Invalid PromptHub storage path component: ${currentPath}`,
      );
    }
    if (index === segments.length - 1) {
      result = stats;
    }
  }
  return result;
}

export function assertStoragePathComponentsSafe(
  activeRoot: string,
  targetPath: string,
): void {
  getSafePathStats(activeRoot, targetPath);
}

function regularFileExists(activeRoot: string, filePath: string): boolean {
  const stats = getSafePathStats(activeRoot, filePath);
  if (!stats) return false;
  if (!stats.isFile()) {
    throw new Error(
      `PromptHub storage file is not a regular file: ${filePath}`,
    );
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLayoutState(raw: string, statePath: string): RuntimeLayoutState {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid PromptHub storage layout state: ${statePath}`);
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid PromptHub storage layout state: ${statePath}`);
  }

  const formatVersion = value.formatVersion;
  const layoutEpoch = value.layoutEpoch;
  if (
    typeof formatVersion !== "number" ||
    !Number.isInteger(formatVersion) ||
    typeof layoutEpoch !== "number" ||
    !Number.isInteger(layoutEpoch)
  ) {
    throw new Error(`Invalid PromptHub storage layout state: ${statePath}`);
  }
  if (formatVersion > CURRENT_LAYOUT_STATE_FORMAT_VERSION) {
    throw new Error(
      `PromptHub data uses a newer storage layout state format (${formatVersion})`,
    );
  }
  if (formatVersion !== CURRENT_LAYOUT_STATE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported PromptHub storage layout state format (${formatVersion})`,
    );
  }
  if (layoutEpoch > CURRENT_LAYOUT_EPOCH) {
    throw new Error(
      `PromptHub data uses a newer storage layout epoch (${layoutEpoch})`,
    );
  }
  if (
    layoutEpoch < LEGACY_LAYOUT_EPOCH ||
    value.state !== "complete" ||
    typeof value.rootIdentity !== "string" ||
    value.rootIdentity.length === 0 ||
    typeof value.verifiedAt !== "string" ||
    value.verifiedAt.length === 0 ||
    (value.lastVerifiedOperation !== undefined &&
      typeof value.lastVerifiedOperation !== "string")
  ) {
    throw new Error(`Invalid PromptHub storage layout state: ${statePath}`);
  }

  return value as unknown as RuntimeLayoutState;
}

export function readRuntimeLayoutState(
  activeRoot: string,
): RuntimeLayoutState | null {
  const root = path.resolve(activeRoot);
  const statePath = path.join(root, "data", LAYOUT_STATE_FILE_NAME);
  if (!regularFileExists(root, statePath)) {
    return null;
  }
  return parseLayoutState(fs.readFileSync(statePath, "utf8"), statePath);
}

function directoryHasEntries(
  activeRoot: string,
  directoryPath: string,
): boolean {
  const stats = getSafePathStats(activeRoot, directoryPath);
  if (!stats) return false;
  if (!stats.isDirectory()) {
    throw new Error(
      `PromptHub storage directory is not a directory: ${directoryPath}`,
    );
  }
  return fs.readdirSync(directoryPath).some((entry) => entry !== ".DS_Store");
}

function canonicalImagesContainUserData(activeRoot: string): boolean {
  const imagesPath = path.join(activeRoot, "data", "assets", "images");
  const stats = getSafePathStats(activeRoot, imagesPath);
  if (!stats) return false;
  if (!stats.isDirectory()) {
    throw new Error(
      `PromptHub storage directory is not a directory: ${imagesPath}`,
    );
  }
  return fs
    .readdirSync(imagesPath)
    .some((entry) => entry !== ".DS_Store" && entry !== "generated");
}

function readLegacyMarker(activeRoot: string): LegacyLayoutMarker | null {
  const markerPath = path.join(activeRoot, ".data-layout-v0.5.5.json");
  if (!regularFileExists(activeRoot, markerPath)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return isRecord(parsed) ? (parsed as LegacyLayoutMarker) : null;
  } catch {
    return null;
  }
}

function isCompletedLegacyDatabaseMigration(
  marker: LegacyLayoutMarker | null,
): boolean {
  if (
    marker?.version !== "0.5.5" ||
    marker.dbLayoutVersion !== "0.5.7" ||
    !Array.isArray(marker.movedEntries) ||
    !marker.movedEntries.includes("prompthub.db")
  ) {
    return false;
  }
  if (marker.failedEntries === undefined) return true;
  return (
    Array.isArray(marker.failedEntries) &&
    marker.failedEntries.every((entry) => typeof entry === "string") &&
    !marker.failedEntries.includes("prompthub.db")
  );
}

function inferLayout(activeRoot: string): {
  epoch: RuntimeLayoutEpoch;
  reason: StorageResolutionReason;
} {
  const canonicalDatabase = path.join(activeRoot, "data", "prompthub.db");
  const legacyDatabase = path.join(activeRoot, "prompthub.db");
  const legacyMarker = readLegacyMarker(activeRoot);

  const canonicalDatabaseExists = regularFileExists(
    activeRoot,
    canonicalDatabase,
  );
  const legacyDatabaseExists = regularFileExists(activeRoot, legacyDatabase);
  const canonicalDirectories = [
    path.join(activeRoot, "data", "prompts"),
    path.join(activeRoot, "data", "skills"),
    path.join(activeRoot, "data", "rules"),
    path.join(activeRoot, "data", "mcp"),
    path.join(activeRoot, "data", "plugins"),
    path.join(activeRoot, "data", "agents"),
    path.join(activeRoot, "data", "snippets"),
    path.join(activeRoot, "data", "workflows"),
    path.join(activeRoot, "data", "generations"),
    path.join(activeRoot, "data", "assets", "videos"),
    path.join(activeRoot, "data", "assets", "attachments"),
  ];
  const canonicalFiles =
    canonicalImagesContainUserData(activeRoot) ||
    canonicalDirectories.some((directoryPath) =>
      directoryHasEntries(activeRoot, directoryPath),
    );
  const legacyDirectories = [
    path.join(activeRoot, "workspace"),
    path.join(activeRoot, "skills"),
    path.join(activeRoot, "images"),
    path.join(activeRoot, "videos"),
  ];
  const legacyFiles = legacyDirectories.some((directoryPath) =>
    directoryHasEntries(activeRoot, directoryPath),
  );
  const hasCanonical = canonicalDatabaseExists || canonicalFiles;
  const hasLegacy = legacyDatabaseExists || legacyFiles;
  const compatibleLegacyDatabaseResidual =
    canonicalDatabaseExists &&
    legacyDatabaseExists &&
    !legacyFiles &&
    isCompletedLegacyDatabaseMigration(legacyMarker);

  if (hasCanonical && hasLegacy && !compatibleLegacyDatabaseResidual) {
    throw new Error(
      `Detected mixed PromptHub storage layout under ${activeRoot}; repair or staged migration is required`,
    );
  }
  if (canonicalDatabaseExists) {
    return { epoch: CURRENT_LAYOUT_EPOCH, reason: "canonical-database" };
  }
  if (legacyDatabaseExists) {
    return { epoch: LEGACY_LAYOUT_EPOCH, reason: "legacy-database" };
  }
  if (canonicalFiles) {
    return { epoch: CURRENT_LAYOUT_EPOCH, reason: "canonical-files" };
  }
  if (legacyFiles) {
    return { epoch: LEGACY_LAYOUT_EPOCH, reason: "legacy-files" };
  }

  return { epoch: CURRENT_LAYOUT_EPOCH, reason: "empty-root" };
}

function buildContext(
  activeRoot: string,
  layoutEpoch: RuntimeLayoutEpoch,
  rootIdentity: string,
  resolutionReason: StorageResolutionReason,
  identityRoot: string,
): RuntimeStorageContext {
  const dataPath = path.join(activeRoot, "data");
  const canonical = layoutEpoch === CURRENT_LAYOUT_EPOCH;
  const assetsPath = path.join(dataPath, "assets");
  const authority = readCanonicalStorageAuthority(activeRoot, { identityRoot });
  return Object.freeze({
    activeRoot,
    rootIdentity,
    layoutEpoch,
    dataPath,
    databasePath: canonical
      ? path.join(dataPath, "prompthub.db")
      : path.join(activeRoot, "prompthub.db"),
    promptsPath: canonical
      ? path.join(dataPath, "prompts")
      : path.join(activeRoot, "workspace", "prompts"),
    skillsPath: canonical
      ? path.join(dataPath, "skills")
      : path.join(activeRoot, "skills"),
    imagesPath: canonical
      ? path.join(assetsPath, "images")
      : path.join(activeRoot, "images"),
    videosPath: canonical
      ? path.join(assetsPath, "videos")
      : path.join(activeRoot, "videos"),
    workspacePath: canonical ? dataPath : path.join(activeRoot, "workspace"),
    assetsPath,
    generationsPath: path.join(dataPath, "generations"),
    configPath: path.join(activeRoot, "config"),
    secretsPath: path.join(activeRoot, "secrets"),
    backupsPath: path.join(activeRoot, "backups"),
    cachePath: path.join(activeRoot, "cache"),
    logsPath: path.join(activeRoot, "logs"),
    operationsPath: path.join(dataPath, "operations"),
    layoutStatePath: path.join(dataPath, LAYOUT_STATE_FILE_NAME),
    authorityStatePath: getCanonicalStorageAuthorityPath(activeRoot),
    localAuthority: authority ? "canonical-files" : "database-catalog",
    resolutionReason,
  });
}

export function resolveRuntimeStorageContext(
  rootPath: string,
  options: { identityRoot?: string } = {},
): RuntimeStorageContext {
  const activeRoot = path.resolve(rootPath);
  const identityRoot = path.resolve(options.identityRoot ?? activeRoot);
  const state = readRuntimeLayoutState(activeRoot);
  if (state) {
    const expectedRootIdentity = deriveStorageRootIdentity(identityRoot);
    if (state.rootIdentity !== expectedRootIdentity) {
      throw new Error(
        `PromptHub storage layout root identity mismatch: ${activeRoot}`,
      );
    }
    return buildContext(
      activeRoot,
      state.layoutEpoch as RuntimeLayoutEpoch,
      state.rootIdentity,
      "layout-state",
      identityRoot,
    );
  }

  const inferred = inferLayout(activeRoot);
  return buildContext(
    activeRoot,
    inferred.epoch,
    deriveStorageRootIdentity(identityRoot),
    inferred.reason,
    identityRoot,
  );
}

function flushDirectory(directoryPath: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(directoryPath, "r");
    fs.fsyncSync(descriptor);
  } catch {
    // Some platforms do not allow directory fsync. The file was still fsynced.
  } finally {
    if (descriptor !== null) {
      fs.closeSync(descriptor);
    }
  }
}

export function writeRuntimeLayoutState(
  activeRoot: string,
  input: {
    layoutEpoch?: RuntimeLayoutEpoch;
    rootIdentity?: string;
    identityRoot?: string;
    lastVerifiedOperation?: string;
    now?: Date;
  } = {},
): RuntimeLayoutState {
  const root = path.resolve(activeRoot);
  const dataPath = path.join(root, "data");
  const statePath = path.join(dataPath, LAYOUT_STATE_FILE_NAME);
  const temporaryPath = `${statePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const state: RuntimeLayoutState = {
    formatVersion: CURRENT_LAYOUT_STATE_FORMAT_VERSION,
    layoutEpoch: input.layoutEpoch ?? CURRENT_LAYOUT_EPOCH,
    state: "complete",
    rootIdentity:
      input.rootIdentity ??
      deriveStorageRootIdentity(input.identityRoot ?? root),
    verifiedAt: (input.now ?? new Date()).toISOString(),
    ...(input.lastVerifiedOperation
      ? { lastVerifiedOperation: input.lastVerifiedOperation }
      : {}),
  };

  if (
    state.layoutEpoch !== LEGACY_LAYOUT_EPOCH &&
    state.layoutEpoch !== CURRENT_LAYOUT_EPOCH
  ) {
    throw new Error(
      `Unsupported PromptHub storage layout epoch (${state.layoutEpoch})`,
    );
  }
  if (
    state.rootIdentity !== deriveStorageRootIdentity(input.identityRoot ?? root)
  ) {
    throw new Error(`PromptHub storage layout root identity mismatch: ${root}`);
  }

  getSafePathStats(root, dataPath);
  fs.mkdirSync(dataPath, { recursive: true });
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, statePath);
    flushDirectory(dataPath);
    return state;
  } catch (error) {
    if (descriptor !== null) {
      fs.closeSync(descriptor);
    }
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}
