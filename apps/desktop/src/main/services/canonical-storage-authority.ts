import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  acquireStorageMaintenanceIntent,
  deriveStorageRootIdentity,
  readCanonicalStorageAuthority,
  readPromptCanonicalGraph,
  readRendererPersistenceMigrationMarker,
  readRuntimeLayoutState,
  runJournaledStorageRestore,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
  type StorageRestorePublicationStage,
} from "@prompthub/core";
import { DatabaseAdapter } from "@prompthub/db";
import { migrateCanonicalSkillSources } from "@prompthub/core/canonical-skill-sources";

import {
  createCanonicalCheckpointFromClosedDatabase,
  verifyCanonicalStorageCheckpoint,
  verifyCanonicalStorageCheckpointContent,
  type CanonicalStorageCheckpointManifest,
  type CreateCanonicalCheckpointFromClosedDatabaseOptions,
} from "./canonical-storage-checkpoint";

export interface PublishCanonicalStorageAuthorityOptions extends Omit<
  CreateCanonicalCheckpointFromClosedDatabaseOptions,
  "targetPath" | "maintenanceOperationId" | "publishedCanonicalRootPath"
> {
  checkpointPath: string;
  operationId?: string;
  now?: Date;
  injectFailure?: (stage: StorageRestorePublicationStage) => void;
}

export interface PublishCanonicalStorageAuthorityResult {
  status: "committed";
  operationId: string;
  consistencyId: string;
  recoveryArtifactPath: string;
}

export type CanonicalStorageAuthorityRecoveryScope =
  | "prompt-graph"
  | "canonical-storage";

export interface RecoverCanonicalStorageAuthorityOptions extends PublishCanonicalStorageAuthorityOptions {
  recoveryScope?: CanonicalStorageAuthorityRecoveryScope;
}

function copyCompletedMigrationState(
  activeRoot: string,
  candidateData: string,
): void {
  const sourcePath = path.join(activeRoot, "data", "operations", "migrations");
  if (!fs.existsSync(sourcePath)) return;
  const stats = fs.lstatSync(sourcePath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Canonical authority migration state is unsafe");
  }
  fs.cpSync(sourcePath, path.join(candidateData, "operations", "migrations"), {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
}

function copyExistingRootEntry(
  activeRoot: string,
  stageRoot: string,
  entryName: "config" | "secrets",
): void {
  const sourcePath = path.join(activeRoot, entryName);
  const targetPath = path.join(stageRoot, entryName);
  if (!fs.existsSync(sourcePath)) {
    fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    return;
  }
  const stats = fs.lstatSync(sourcePath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Canonical authority ${entryName} path is unsafe`);
  }
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
}

function copyProjectedDeviceBindings(
  checkpointPath: string,
  stageRoot: string,
): void {
  const source = path.join(checkpointPath, "device", "mcp-bindings.json");
  if (!fs.existsSync(source)) return;
  const targetDirectory = path.join(stageRoot, "config", "devices");
  if (fs.existsSync(targetDirectory)) {
    const directoryStats = fs.lstatSync(targetDirectory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      throw new Error("Canonical authority device config path is unsafe");
    }
  } else {
    fs.mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
  }
  const target = path.join(targetDirectory, "mcp-bindings.json");
  if (fs.existsSync(target)) {
    const targetStats = fs.lstatSync(target);
    if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
      throw new Error("Canonical authority MCP binding target is unsafe");
    }
    fs.rmSync(target);
  }
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function hashFile(filePath: string): string {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY);
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function verifyPublishedCatalogPaths(
  databasePath: string,
  publishedDataPath: string,
): void {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    if (
      JSON.stringify(database.pragma("quick_check")) !==
      JSON.stringify([{ quick_check: "ok" }])
    ) {
      throw new Error("Canonical authority catalog failed quick_check");
    }
    const skillRoot = `${path.join(publishedDataPath, "skills")}${path.sep}`;
    const ruleRoot = `${path.join(publishedDataPath, "rules")}${path.sep}`;
    const skills = database.all(
      "SELECT local_repo_path AS path FROM skills WHERE local_repo_path IS NOT NULL",
    ) as Array<{ path: string }>;
    const rules = database.all(
      "SELECT managed_path AS path FROM rules WHERE managed_path IS NOT NULL",
    ) as Array<{ path: string }>;
    if (skills.some((entry) => !entry.path.startsWith(skillRoot))) {
      throw new Error(
        "Canonical authority catalog contains a stale Skill path",
      );
    }
    if (rules.some((entry) => !entry.path.startsWith(ruleRoot))) {
      throw new Error("Canonical authority catalog contains a stale Rule path");
    }
  } finally {
    database.close();
  }
}

export function verifyCanonicalAuthorityRoot(
  rootPath: string,
  manifest: CanonicalStorageCheckpointManifest,
  identityRoot = rootPath,
): void {
  const root = path.resolve(rootPath);
  const identity = path.resolve(identityRoot);
  const dataPath = path.join(root, "data");
  const layout = readRuntimeLayoutState(root);
  if (layout?.rootIdentity !== deriveStorageRootIdentity(identity)) {
    throw new Error("Canonical authority layout identity mismatch");
  }
  const authority = readCanonicalStorageAuthority(root, {
    identityRoot: identity,
  });
  if (!authority || authority.consistencyId !== manifest.consistencyId) {
    throw new Error("Canonical authority marker consistency mismatch");
  }
  verifyCanonicalStorageCheckpointContent(dataPath, manifest);
  const databasePath = path.join(dataPath, "prompthub.db");
  const stats = fs.lstatSync(databasePath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size !== manifest.catalogByteSize ||
    hashFile(databasePath) !== manifest.catalogSha256
  ) {
    throw new Error("Canonical authority catalog digest mismatch");
  }
  verifyPublishedCatalogPaths(databasePath, path.join(identity, "data"));
}

function prepareAuthorityCandidate(
  stageRoot: string,
  options: PublishCanonicalStorageAuthorityOptions,
  manifest: CanonicalStorageCheckpointManifest,
  operationId: string,
): void {
  copyExistingRootEntry(options.activeRoot, stageRoot, "config");
  copyExistingRootEntry(options.activeRoot, stageRoot, "secrets");
  const candidateData = path.join(stageRoot, "data");
  fs.cpSync(path.join(options.checkpointPath, "canonical"), candidateData, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
  fs.copyFileSync(
    path.join(options.checkpointPath, "catalog", "prompthub.db"),
    path.join(candidateData, "prompthub.db"),
    fs.constants.COPYFILE_EXCL,
  );
  copyCompletedMigrationState(options.activeRoot, candidateData);
  copyProjectedDeviceBindings(options.checkpointPath, stageRoot);
  writeRuntimeLayoutState(stageRoot, {
    identityRoot: options.activeRoot,
    lastVerifiedOperation: operationId,
    now: options.now,
  });
  writeCanonicalStorageAuthority(stageRoot, {
    consistencyId: manifest.consistencyId,
    operationId,
    identityRoot: options.activeRoot,
    now: options.now,
  });
}

export async function publishCanonicalStorageAuthority(
  options: PublishCanonicalStorageAuthorityOptions,
): Promise<PublishCanonicalStorageAuthorityResult> {
  return publishCanonicalStorageAuthorityInternal(options, false);
}

async function publishCanonicalStorageAuthorityInternal(
  options: PublishCanonicalStorageAuthorityOptions,
  replaceInvalidAuthority: boolean,
): Promise<PublishCanonicalStorageAuthorityResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const existingAuthority = readCanonicalStorageAuthority(activeRoot);
  if (existingAuthority && !replaceInvalidAuthority) {
    throw new Error("Canonical file authority is already published");
  }
  if (!existingAuthority && replaceInvalidAuthority) {
    throw new Error(
      "Canonical file authority recovery requires an authority marker",
    );
  }
  if (!readRendererPersistenceMigrationMarker(activeRoot)) {
    throw new Error(
      "Renderer persistence migration must complete before authority publication",
    );
  }
  const operationId = options.operationId ?? `authority-${crypto.randomUUID()}`;
  const maintenance = acquireStorageMaintenanceIntent(activeRoot, {
    operationId,
    operationKind: replaceInvalidAuthority
      ? "canonical-authority-recovery"
      : "canonical-authority",
  });
  let ownsCheckpoint = false;
  try {
    migrateCanonicalSkillSources(activeRoot, options.sourceDatabasePath);
    const checkpoint = await createCanonicalCheckpointFromClosedDatabase({
      ...options,
      activeRoot,
      targetPath: path.resolve(options.checkpointPath),
      maintenanceOperationId: operationId,
      publishedCanonicalRootPath: path.join(activeRoot, "data"),
    });
    ownsCheckpoint = true;
    const manifest = verifyCanonicalStorageCheckpoint(checkpoint.targetPath);
    const result = await runJournaledStorageRestore({
      activeRoot,
      operationId,
      maintenanceOperationId: operationId,
      entryNames: ["data", "config", "secrets"],
      prepareCandidate: (stageRoot) =>
        prepareAuthorityCandidate(stageRoot, options, manifest, operationId),
      verifyCandidate: (stageRoot) =>
        verifyCanonicalAuthorityRoot(stageRoot, manifest, activeRoot),
      verifyActive: (publishedRoot) =>
        verifyCanonicalAuthorityRoot(publishedRoot, manifest),
      injectFailure: options.injectFailure,
      now: options.now,
    });
    return {
      status: result.status,
      operationId,
      consistencyId: manifest.consistencyId,
      recoveryArtifactPath: result.recoveryArtifactPath,
    };
  } finally {
    if (ownsCheckpoint) {
      fs.rmSync(path.resolve(options.checkpointPath), {
        recursive: true,
        force: true,
      });
    }
    maintenance.release();
  }
}

export async function recoverCanonicalStorageAuthorityFromDatabase(
  options: RecoverCanonicalStorageAuthorityOptions,
): Promise<PublishCanonicalStorageAuthorityResult> {
  const { recoveryScope = "prompt-graph", ...publicationOptions } = options;
  const activeRoot = path.resolve(options.activeRoot);
  if (!readCanonicalStorageAuthority(activeRoot)) {
    throw new Error(
      "Canonical file authority recovery requires an authority marker",
    );
  }
  let graphIsInvalid = false;
  try {
    readPromptCanonicalGraph(path.join(activeRoot, "data"));
  } catch {
    graphIsInvalid = true;
  }
  if (!graphIsInvalid && recoveryScope !== "canonical-storage") {
    throw new Error("Canonical file authority does not require recovery");
  }
  return publishCanonicalStorageAuthorityInternal(publicationOptions, true);
}
