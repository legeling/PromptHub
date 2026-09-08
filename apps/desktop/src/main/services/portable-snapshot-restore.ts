import crypto from "crypto";
import fs from "fs";
import { decodeSkillFileSnapshot, validateSkillFileSnapshots } from "@prompthub/shared/utils/skill-file-snapshot";
import path from "path";

import {
  assertPortableLogicalMatchesCanonicalStorage,
  copyStorageInventory,
  createRendererPersistenceStore,
  createStorageInventory,
  normalizeSlug,
  parsePortableLogicalEnvelope,
  runJournaledStorageRestore,
  writeRuntimeLayoutState,
  type PortableLogicalEnvelope,
  type PortableSnapshotResult,
  type RendererPersistenceEncryption,
} from "@prompthub/core";
import {
  AgentProviderProfileDB,
  createConsistentDatabaseImage,
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
  RuleDB,
  SkillDB,
} from "@prompthub/db";
import type {
  AgentAssetFileSnapshot,
  Folder,
  RuleBackupRecord,
  RuleRecord,
  RuleVersionRecord,
} from "@prompthub/shared/types";
import { mergeMcpLibraryFromTransport } from "@prompthub/shared/utils/mcp-config";

import Database from "../database/sqlite";
import { verifyCanonicalStorageCheckpointContent } from "./canonical-storage-checkpoint";
import { extractPortableSnapshotZip } from "./portable-snapshot-import";

const LOGICAL_FILE_NAME = "import-with-prompthub.json";
const MAX_LOGICAL_BYTES = 16 * 1024 * 1024;
const MAX_CANONICAL_CHECKPOINT_MANIFEST_BYTES = 1024 * 1024;
const COPY_BUFFER_BYTES = 1024 * 1024;
const CAPACITY_HEADROOM_BYTES = 64 * 1024 * 1024;
const RESTORE_ENTRY_NAMES = [
  "data",
  "config",
  "secrets",
  "prompthub.db",
  "workspace",
  "skills",
  "images",
  "videos",
  "shortcuts.json",
  "shortcut-mode.json",
];
const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|password|secret|token|access[_-]?key|private[_-]?key)/iu;

export interface PortableSnapshotRestoreResult {
  success: boolean;
  needsRestart: boolean;
  consistencyId?: string;
  recoveryArtifactPath?: string;
  error?: string;
}

export interface RestorePortableSnapshotOptions {
  archivePath: string;
  activeRoot: string;
  cacheRoot: string;
  encryption: RendererPersistenceEncryption;
  operationId?: string;
  getAvailableBytes?: (targetPath: string) => number;
}

export interface RestorePortableLogicalSnapshotOptions {
  logicalText: string;
  activeRoot: string;
  encryption: RendererPersistenceEncryption;
  operationId?: string;
  getAvailableBytes?: (targetPath: string) => number;
}

function readLogicalText(snapshot: PortableSnapshotResult): string {
  const logicalPath = path.join(snapshot.path, LOGICAL_FILE_NAME);
  const entry = snapshot.manifest.entries.find(
    (candidate) => candidate.path === LOGICAL_FILE_NAME,
  );
  if (!entry || entry.sizeBytes > MAX_LOGICAL_BYTES) {
    throw new Error("Portable snapshot has no bounded logical envelope");
  }
  return fs.readFileSync(logicalPath, "utf8");
}

function verifyEmbeddedCanonicalCheckpoint(
  snapshot: PortableSnapshotResult,
): string | null {
  const hasCanonical = snapshot.manifest.entries.some((entry) =>
    entry.path.startsWith("canonical/"),
  );
  const manifestEntry = snapshot.manifest.entries.find(
    (entry) => entry.path === "canonical-checkpoint.json",
  );
  if (hasCanonical !== Boolean(manifestEntry)) {
    throw new Error(
      "Portable canonical checkpoint manifest is missing or orphaned",
    );
  }
  if (!hasCanonical || !manifestEntry) return null;
  if (manifestEntry.sizeBytes > MAX_CANONICAL_CHECKPOINT_MANIFEST_BYTES) {
    throw new Error(
      "Portable canonical checkpoint manifest exceeds its byte limit",
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(snapshot.path, "canonical-checkpoint.json"),
      "utf8",
    ),
  ) as unknown;
  verifyCanonicalStorageCheckpointContent(
    path.join(snapshot.path, "canonical"),
    manifest,
  );
  return path.join(snapshot.path, "canonical");
}

export function previewPortableSnapshotArchive(options: {
  archivePath: string;
  cacheRoot: string;
  operationId?: string;
}): {
  text: string;
  consistencyId: string;
  scopes: string[];
} {
  const operationId = options.operationId ?? crypto.randomUUID();
  const extractionPath = path.join(
    path.resolve(options.cacheRoot),
    "portable-previews",
    operationId,
  );
  try {
    const snapshot = extractPortableSnapshotZip({
      sourcePath: options.archivePath,
      destinationPath: extractionPath,
    });
    const canonicalPath = verifyEmbeddedCanonicalCheckpoint(snapshot);
    const text = readLogicalText(snapshot);
    parsePortableLogicalEnvelope(text);
    if (canonicalPath) {
      assertPortableLogicalMatchesCanonicalStorage(text, canonicalPath);
    }
    return {
      text,
      consistencyId: snapshot.manifest.consistencyId,
      scopes: snapshot.manifest.scopes,
    };
  } finally {
    fs.rmSync(extractionPath, { recursive: true, force: true });
  }
}

function assertNoPortableSecrets(
  value: unknown,
  location = "configuration",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoPortableSecrets(entry, `${location}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key) && entry !== null && entry !== "") {
      throw new Error(
        `Portable snapshot contains a forbidden secret field: ${location}.${key}`,
      );
    }
    assertNoPortableSecrets(entry, `${location}.${key}`);
  }
}

function defaultAvailableBytes(targetPath: string): number {
  const stats = fs.statfsSync(targetPath, { bigint: true });
  const available = stats.bavail * stats.bsize;
  return available > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(available);
}

function assertCapacity(
  activeRoot: string,
  requiredBytes: number,
  getAvailableBytes?: (targetPath: string) => number,
): void {
  const availableBytes = (getAvailableBytes ?? defaultAvailableBytes)(
    activeRoot,
  );
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient space for portable restore: required=${requiredBytes}, available=${availableBytes}`,
    );
  }
}

function copyFile(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const source = fs.openSync(sourcePath, "r");
  const destination = fs.openSync(destinationPath, "wx", 0o600);
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        fs.writeSync(destination, buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    fs.fsyncSync(destination);
  } finally {
    fs.closeSync(source);
    fs.closeSync(destination);
  }
}

function replaceSnapshotPrefix(
  snapshot: PortableSnapshotResult | null,
  prefix: string,
  stageRoot: string,
): boolean {
  if (!snapshot) return false;
  const normalizedPrefix = prefix.replace(/\/$/u, "");
  const entries = snapshot.manifest.entries.filter(
    (entry) =>
      entry.path === normalizedPrefix ||
      entry.path.startsWith(`${normalizedPrefix}/`),
  );
  const targetRoot = path.join(stageRoot, ...normalizedPrefix.split("/"));
  fs.rmSync(targetRoot, { recursive: true, force: true });
  for (const entry of entries) {
    copyFile(
      path.join(snapshot.path, ...entry.path.split("/")),
      path.join(stageRoot, ...entry.path.split("/")),
    );
  }
  return entries.length > 0;
}

function safeRelativePath(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === ".." ||
    value.startsWith("../")
  ) {
    throw new Error(
      `Portable snapshot contains an unsafe relative path: ${value}`,
    );
  }
  return value;
}

function restoreAssetFiles(
  rootPath: string,
  files: AgentAssetFileSnapshot[] | undefined,
): void {
  if (!files) return;
  fs.rmSync(rootPath, { recursive: true, force: true });
  for (const file of files) {
    const relativePath = safeRelativePath(file.relativePath);
    const content = Buffer.from(file.contentBase64, "base64");
    if (content.length !== file.size) {
      throw new Error(`Portable asset size mismatch: ${relativePath}`);
    }
    const targetPath = path.join(rootPath, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(targetPath, content, { mode: 0o600 });
  }
}

function writeMediaMap(
  directoryPath: string,
  files: Record<string, string> | undefined,
): void {
  if (!files) return;
  fs.rmSync(directoryPath, { recursive: true, force: true });
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  for (const [fileName, encoded] of Object.entries(files)) {
    const relativePath = safeRelativePath(fileName);
    if (relativePath.includes("/")) {
      throw new Error(`Portable media entry must be a file name: ${fileName}`);
    }
    fs.writeFileSync(
      path.join(directoryPath, relativePath),
      Buffer.from(encoded, "base64"),
      {
        mode: 0o600,
      },
    );
  }
}

function sortFolders(folders: Folder[]): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: Folder[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id))
      throw new Error(`Portable Folder cycle includes ${id}`);
    const folder = byId.get(id);
    if (!folder) return;
    visiting.add(id);
    if (folder.parentId) {
      if (!byId.has(folder.parentId)) {
        throw new Error(`Portable Folder references missing parent: ${id}`);
      }
      visit(folder.parentId);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(folder);
  };
  folders.forEach((folder) => visit(folder.id));
  return ordered;
}

function assertUniqueIds(
  label: string,
  values: Array<{ id: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (
      !value ||
      typeof value.id !== "string" ||
      value.id.trim().length === 0
    ) {
      throw new Error(`Portable ${label} contains an invalid id`);
    }
    if (ids.has(value.id)) {
      throw new Error(`Portable ${label} contains duplicate id: ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function safeSkillDirectory(activeRoot: string, name: string): string {
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    path.basename(name) !== name ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new Error(`Portable Skill has an unsafe name: ${name}`);
  }
  return path.join(activeRoot, "data", "skills", name);
}

function restorePromptAndSkillDatabase(
  database: InstanceType<typeof Database>,
  activeRoot: string,
  envelope: PortableLogicalEnvelope,
): void {
  const { payload, scope } = envelope;
  const promptDb = new PromptDB(database);
  const folderDb = new FolderDB(database);
  const skillDb = new SkillDB(database);
  const relationDb = new PromptRelationDB(database);
  const outputDb = new PromptOutputFormatDB(database);
  const restore = database.transaction(() => {
    if (scope.prompts || scope.folders) {
      const existingPrompts =
        scope.folders && !scope.prompts ? promptDb.getAll() : [];
      const folderIds = scope.folders
        ? assertUniqueIds("Folders", payload.folders)
        : new Set(folderDb.getAll().map((folder) => folder.id));
      const promptIds = assertUniqueIds("Prompts", payload.prompts);
      if (scope.prompts) {
        database.exec("DELETE FROM prompt_output_format_items");
        database.exec("DELETE FROM prompt_relations");
        database.exec("DELETE FROM prompt_versions");
        database.exec("DELETE FROM prompts");
      }
      if (scope.folders) {
        for (const prompt of existingPrompts) {
          if (prompt.folderId && !folderIds.has(prompt.folderId)) {
            throw new Error(
              `Portable Folder set omits a Folder used by Prompt: ${prompt.id}`,
            );
          }
        }
        database.exec("DELETE FROM folders");
        for (const folder of sortFolders(payload.folders)) {
          folderDb.insertFolderDirect(folder);
        }
        for (const prompt of existingPrompts) {
          if (prompt.folderId) {
            database.run("UPDATE prompts SET folder_id = ? WHERE id = ?", [
              prompt.folderId,
              prompt.id,
            ]);
          }
        }
      }
      if (scope.prompts) {
        for (const prompt of payload.prompts) {
          if (prompt.folderId && !folderIds.has(prompt.folderId)) {
            throw new Error(
              `Portable Prompt references missing Folder: ${prompt.id}`,
            );
          }
          promptDb.insertPromptDirect(prompt);
        }
        if (scope.versions) {
          for (const version of payload.versions) {
            if (!promptIds.has(version.promptId)) {
              throw new Error(
                `Portable Prompt version has missing Prompt: ${version.id}`,
              );
            }
            promptDb.insertVersionDirect(version);
          }
        }
        for (const relation of payload.promptRelations ?? []) {
          if (
            relation.sourcePromptId === relation.targetPromptId ||
            !promptIds.has(relation.sourcePromptId) ||
            !promptIds.has(relation.targetPromptId)
          ) {
            throw new Error(
              `Portable Prompt relation is invalid: ${relation.id}`,
            );
          }
          relationDb.insertRelationDirect(relation);
        }
        for (const item of payload.outputFormatItems ?? []) {
          if (
            !promptIds.has(item.sourcePromptId) ||
            (item.targetPromptId !== null &&
              !promptIds.has(item.targetPromptId))
          ) {
            throw new Error(
              `Portable output format item is invalid: ${item.id}`,
            );
          }
          outputDb.insertItemDirect(item);
        }
      }
    } else if (scope.versions) {
      database.exec("DELETE FROM prompt_versions");
      for (const version of payload.versions) {
        if (!promptDb.getById(version.promptId)) {
          throw new Error(
            `Portable Prompt version has missing Prompt: ${version.id}`,
          );
        }
        promptDb.insertVersionDirect(version);
      }
    }

    if (scope.skills) {
      const skillIds = assertUniqueIds("Skills", payload.skills ?? []);
      database.exec("DELETE FROM skill_versions");
      database.exec("DELETE FROM skills");
      for (const skill of payload.skills ?? []) {
        skillDb.insertSkillDirect({
          ...skill,
          local_repo_path: safeSkillDirectory(activeRoot, skill.name),
        });
      }
      for (const version of payload.skillVersions ?? []) {
        if (!skillIds.has(version.skillId)) {
          throw new Error(
            `Portable Skill version has missing Skill: ${version.id}`,
          );
        }
        skillDb.insertVersionDirect(version);
      }
    }
  });
  restore();
}

function restoreRules(
  database: InstanceType<typeof Database>,
  activeRoot: string,
  records: RuleBackupRecord[],
): void {
  assertUniqueIds("Rules", records);
  database.exec("DELETE FROM rule_versions");
  database.exec("DELETE FROM rules");
  const ruleDb = new RuleDB(database);
  const now = new Date().toISOString();
  for (const record of records) {
    const encodedId = encodeURIComponent(record.id);
    const managedPath = path.join(
      activeRoot,
      "data",
      "rules",
      "managed",
      `${encodedId}.md`,
    );
    const orderedSnapshots = [...record.versions].sort(
      (left, right) =>
        Date.parse(left.savedAt) - Date.parse(right.savedAt) ||
        left.id.localeCompare(right.id),
    );
    const versions = orderedSnapshots.map(
      (version, index): RuleVersionRecord => ({
        id: version.id,
        ruleId: record.id,
        version: index + 1,
        filePath: path.join(
          activeRoot,
          "data",
          "rules",
          ".versions",
          encodedId,
          `${version.id}.md`,
        ),
        source: version.source,
        createdAt: version.savedAt,
      }),
    );
    const rule: RuleRecord = {
      id: record.id,
      scope: record.id.startsWith("project:") ? "project" : "global",
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      canonicalFileName: path.basename(record.path || `${encodedId}.md`),
      description: record.description,
      managedPath,
      targetPath: managedPath,
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: Math.max(1, versions.length),
      contentHash: crypto
        .createHash("sha256")
        .update(record.content)
        .digest("hex"),
      createdAt: versions[0]?.createdAt ?? now,
      updatedAt: versions.at(-1)?.createdAt ?? now,
    };
    ruleDb.upsert(rule);
    ruleDb.replaceVersions(record.id, versions);
  }
}

function restoreRuleFiles(
  stageRoot: string,
  records: RuleBackupRecord[],
): void {
  const rulesRoot = path.join(stageRoot, "data", "rules");
  fs.rmSync(rulesRoot, { recursive: true, force: true });
  for (const record of records) {
    const encodedId = encodeURIComponent(record.id);
    const managedPath = path.join(rulesRoot, "managed", `${encodedId}.md`);
    fs.mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(managedPath, record.content, { mode: 0o600 });
    for (const version of record.versions) {
      const versionPath = path.join(
        rulesRoot,
        ".versions",
        encodedId,
        `${encodeURIComponent(version.id)}.md`,
      );
      fs.mkdirSync(path.dirname(versionPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(versionPath, version.content, { mode: 0o600 });
    }
  }
}

function restorePluginSnapshotFiles(
  stageRoot: string,
  activeRoot: string,
  envelope: PortableLogicalEnvelope,
): void {
  const { pluginLibrary, pluginPackages } = envelope.payload;
  if (!pluginLibrary) {
    throw new Error("Portable Plugin restore is missing library metadata");
  }
  const pluginsRoot = path.join(stageRoot, "data", "plugins");
  const packages = new Map(
    (pluginPackages ?? []).map((entry) => [entry.pluginId, entry]),
  );
  const plugins = pluginLibrary.plugins.map((plugin) => {
    const slug = normalizeSlug(plugin.id) || "plugin";
    const managedPath = path.join(activeRoot, "data", "plugins", slug);
    const stagedManagedPath = path.join(pluginsRoot, slug);
    const packageSnapshot = packages.get(plugin.id);
    if (packageSnapshot) {
      restoreAssetFiles(
        path.join(stagedManagedPath, "package"),
        packageSnapshot.files,
      );
    }
    const hasPackage = fs.existsSync(path.join(stagedManagedPath, "package"));
    const localPackagePath = path.join(managedPath, "package");
    return {
      ...plugin,
      managedPath: hasPackage ? managedPath : undefined,
      localRepositoryPath: hasPackage ? managedPath : undefined,
      localPackagePath: hasPackage ? localPackagePath : undefined,
      source: {
        ...plugin.source,
        localRepositoryPath: hasPackage ? managedPath : undefined,
        localPackagePath: hasPackage ? localPackagePath : undefined,
      },
    };
  });
  fs.mkdirSync(pluginsRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(pluginsRoot, "library.json"),
    `${JSON.stringify({ ...pluginLibrary, plugins }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function restoreDatabase(
  stageRoot: string,
  activeRoot: string,
  envelope: PortableLogicalEnvelope,
): void {
  const databasePath = path.join(stageRoot, "data", "prompthub.db");
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    restorePromptAndSkillDatabase(database, activeRoot, envelope);
    if (envelope.scope.rules) {
      restoreRules(database, activeRoot, envelope.payload.rules ?? []);
    }
    if (envelope.scope.agents && envelope.payload.agentManagement) {
      new AgentProviderProfileDB(database).replacePortableBackup(
        envelope.payload.agentManagement,
      );
    }
    const check = database.pragma("quick_check") as Array<
      Record<string, unknown>
    >;
    if (check.length !== 1 || Object.values(check[0] ?? {})[0] !== "ok") {
      throw new Error("Portable restore staged database failed quick_check");
    }
  } finally {
    database.close();
  }
}

function verifyDatabase(rootPath: string): void {
  const database = new Database(path.join(rootPath, "data", "prompthub.db"), {
    readOnly: true,
  });
  try {
    const check = database.pragma("quick_check") as Array<
      Record<string, unknown>
    >;
    if (check.length !== 1 || Object.values(check[0] ?? {})[0] !== "ok") {
      throw new Error("Portable restore database failed quick_check");
    }
  } finally {
    database.close();
  }
}

async function restoreConfiguration(
  stageRoot: string,
  envelope: PortableLogicalEnvelope,
  encryption: RendererPersistenceEncryption,
): Promise<void> {
  const { payload, scope } = envelope;
  const importedSettings = {
    ...(scope.settings ? payload.settings?.state : undefined),
    ...(scope.aiConfig ? payload.aiConfig : undefined),
  };
  assertNoPortableSecrets(importedSettings);
  const store = createRendererPersistenceStore({
    rootPath: stageRoot,
    encryption,
  });
  if (scope.settings || scope.aiConfig) {
    const current = store.readHydratedStateSync();
    await store.replaceSettings({ ...current.settings, ...importedSettings });
  }
  const sources = payload.storeSources;
  for (const [selected, domain, value] of [
    [scope.skills, "skill", sources?.skills],
    [scope.mcp, "mcp", sources?.mcp],
    [scope.plugins, "plugin", sources?.plugins],
  ] as const) {
    if (!selected || !value) continue;
    const normalized = value.customStoreSources.flatMap((source, index) => {
      if (
        source.type !== "marketplace-json" &&
        source.type !== "git-repo" &&
        source.type !== "local-dir"
      ) {
        return [];
      }
      return [
        {
          id: source.id,
          name: source.name,
          type: source.type,
          url: source.url,
          branch: source.branch,
          directory: source.directory,
          enabled: source.enabled !== false,
          order: source.order ?? index,
          createdAt: source.createdAt ?? 0,
        },
      ];
    });
    await store.replaceMarketplaceSources(domain, normalized);
  }
}

function readMcpLibrary(stageRoot: string) {
  const filePath = path.join(stageRoot, "data", "mcp", "library.json");
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function restoreFileDomains(
  snapshot: PortableSnapshotResult | null,
  stageRoot: string,
  activeRoot: string,
  envelope: PortableLogicalEnvelope,
): void {
  const { scope, payload } = envelope;
  if (scope.prompts) {
    replaceSnapshotPrefix(snapshot, "data/prompts", stageRoot);
  }
  if (scope.folders) {
    replaceSnapshotPrefix(snapshot, "data/folders", stageRoot);
  }
  if (scope.versions) {
    replaceSnapshotPrefix(snapshot, "data/legacy-versions", stageRoot);
  }
  if (scope.skills) {
    const copied = replaceSnapshotPrefix(snapshot, "data/skills", stageRoot);
    if (!copied && payload.skillFiles) {
      fs.rmSync(path.join(stageRoot, "data", "skills"), {
        recursive: true,
        force: true,
      });
      for (const skill of payload.skills ?? []) {
        const files = payload.skillFiles[skill.id] ?? [];
        validateSkillFileSnapshots(files);
        for (const file of files) {
          const relativePath = safeRelativePath(file.relativePath);
          const targetPath = path.join(
            stageRoot,
            "data",
            "skills",
            skill.name,
            ...relativePath.split("/"),
          );
          fs.mkdirSync(path.dirname(targetPath), {
            recursive: true,
            mode: 0o700,
          });
          fs.writeFileSync(targetPath, decodeSkillFileSnapshot(file), { mode: 0o600 });
        }
      }
    }
  }
  if (scope.rules) {
    const copied = replaceSnapshotPrefix(snapshot, "data/rules", stageRoot);
    if (!copied) restoreRuleFiles(stageRoot, payload.rules ?? []);
  }
  if (scope.images) {
    const copied = replaceSnapshotPrefix(
      snapshot,
      "data/assets/images",
      stageRoot,
    );
    if (!copied) {
      writeMediaMap(
        path.join(stageRoot, "data", "assets", "images"),
        payload.images ?? {},
      );
    }
  }
  if (scope.videos) {
    const copied = replaceSnapshotPrefix(
      snapshot,
      "data/assets/videos",
      stageRoot,
    );
    if (!copied) {
      writeMediaMap(
        path.join(stageRoot, "data", "assets", "videos"),
        payload.videos ?? {},
      );
    }
  }
  if (scope.mcp) {
    const currentLibrary = readMcpLibrary(stageRoot);
    const copied = replaceSnapshotPrefix(snapshot, "data/mcp", stageRoot);
    if (!copied) {
      fs.rmSync(path.join(stageRoot, "data", "mcp"), {
        recursive: true,
        force: true,
      });
      restoreAssetFiles(
        path.join(stageRoot, "data", "mcp"),
        payload.agentAssetFiles?.mcp,
      );
    }
    if (payload.mcpLibrary) {
      const merged = currentLibrary
        ? mergeMcpLibraryFromTransport(currentLibrary, payload.mcpLibrary)
        : payload.mcpLibrary;
      const libraryPath = path.join(stageRoot, "data", "mcp", "library.json");
      fs.mkdirSync(path.dirname(libraryPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(libraryPath, `${JSON.stringify(merged, null, 2)}\n`, {
        mode: 0o600,
      });
    }
  }
  if (scope.plugins) {
    const copied = replaceSnapshotPrefix(snapshot, "data/plugins", stageRoot);
    if (!copied) {
      fs.rmSync(path.join(stageRoot, "data", "plugins"), {
        recursive: true,
        force: true,
      });
      restoreAssetFiles(
        path.join(stageRoot, "data", "plugins"),
        payload.agentAssetFiles?.plugins,
      );
    }
    restorePluginSnapshotFiles(stageRoot, activeRoot, envelope);
  }
  if (scope.agents) {
    replaceSnapshotPrefix(snapshot, "data/agents", stageRoot);
  }
  if (snapshot?.manifest.scopes.includes("generations")) {
    replaceSnapshotPrefix(snapshot, "data/generations", stageRoot);
    replaceSnapshotPrefix(snapshot, "data/assets/objects", stageRoot);
  }
}

async function prepareCandidate(
  activeRoot: string,
  stageRoot: string,
  snapshot: PortableSnapshotResult | null,
  envelope: PortableLogicalEnvelope,
  encryption: RendererPersistenceEncryption,
  operationId: string,
): Promise<void> {
  const databaseRelativePath = "data/prompthub.db";
  const inventoryWithoutDatabase = createStorageInventory(activeRoot, {
    includeSecrets: true,
    excludeRelativePaths: [databaseRelativePath],
  });
  copyStorageInventory(inventoryWithoutDatabase, stageRoot);
  createConsistentDatabaseImage(
    path.join(activeRoot, "data", "prompthub.db"),
    path.join(stageRoot, "data", "prompthub.db"),
  );
  restoreFileDomains(snapshot, stageRoot, activeRoot, envelope);
  restoreDatabase(stageRoot, activeRoot, envelope);
  await restoreConfiguration(stageRoot, envelope, encryption);
  writeRuntimeLayoutState(stageRoot, {
    identityRoot: activeRoot,
    lastVerifiedOperation: operationId,
  });
}

export async function restorePortableSnapshotArchive(
  options: RestorePortableSnapshotOptions,
): Promise<PortableSnapshotRestoreResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const operationId = options.operationId ?? crypto.randomUUID();
  const extractionPath = path.join(
    path.resolve(options.cacheRoot),
    "portable-imports",
    operationId,
  );
  try {
    const activeInventory = createStorageInventory(activeRoot, {
      includeSecrets: true,
    });
    const archiveStats = fs.lstatSync(path.resolve(options.archivePath));
    assertCapacity(
      activeRoot,
      activeInventory.totalBytes + archiveStats.size + CAPACITY_HEADROOM_BYTES,
      options.getAvailableBytes,
    );
    const snapshot = extractPortableSnapshotZip({
      sourcePath: options.archivePath,
      destinationPath: extractionPath,
    });
    const canonicalPath = verifyEmbeddedCanonicalCheckpoint(snapshot);
    const logicalText = readLogicalText(snapshot);
    const envelope = parsePortableLogicalEnvelope(logicalText);
    if (canonicalPath) {
      assertPortableLogicalMatchesCanonicalStorage(logicalText, canonicalPath);
    }
    const restore = await runJournaledStorageRestore({
      activeRoot,
      operationId,
      entryNames: RESTORE_ENTRY_NAMES,
      prepareCandidate: (stageRoot) =>
        prepareCandidate(
          activeRoot,
          stageRoot,
          snapshot,
          envelope,
          options.encryption,
          operationId,
        ),
      verifyCandidate: verifyDatabase,
      verifyActive: verifyDatabase,
    });
    return {
      success: true,
      needsRestart: true,
      consistencyId: snapshot.manifest.consistencyId,
      recoveryArtifactPath: restore.recoveryArtifactPath,
    };
  } catch (error) {
    return {
      success: false,
      needsRestart: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    fs.rmSync(extractionPath, { recursive: true, force: true });
  }
}

export async function restorePortableLogicalSnapshot(
  options: RestorePortableLogicalSnapshotOptions,
): Promise<PortableSnapshotRestoreResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const logicalBytes = Buffer.byteLength(options.logicalText, "utf8");
  if (logicalBytes < 1 || logicalBytes > MAX_LOGICAL_BYTES) {
    return {
      success: false,
      needsRestart: false,
      error: `Portable logical snapshot exceeds the ${MAX_LOGICAL_BYTES}-byte compatibility limit`,
    };
  }
  const operationId = options.operationId ?? crypto.randomUUID();
  try {
    const envelope = parsePortableLogicalEnvelope(options.logicalText);
    const activeInventory = createStorageInventory(activeRoot, {
      includeSecrets: true,
    });
    assertCapacity(
      activeRoot,
      activeInventory.totalBytes + logicalBytes + CAPACITY_HEADROOM_BYTES,
      options.getAvailableBytes,
    );
    const restore = await runJournaledStorageRestore({
      activeRoot,
      operationId,
      entryNames: RESTORE_ENTRY_NAMES,
      prepareCandidate: (stageRoot) =>
        prepareCandidate(
          activeRoot,
          stageRoot,
          null,
          envelope,
          options.encryption,
          operationId,
        ),
      verifyCandidate: verifyDatabase,
      verifyActive: verifyDatabase,
    });
    return {
      success: true,
      needsRestart: true,
      consistencyId: crypto
        .createHash("sha256")
        .update(options.logicalText, "utf8")
        .digest("hex"),
      recoveryArtifactPath: restore.recoveryArtifactPath,
    };
  } catch (error) {
    return {
      success: false,
      needsRestart: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
