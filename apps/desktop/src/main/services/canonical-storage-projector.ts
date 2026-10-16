import { SkillStorageDB as SkillDB } from "@prompthub/core/skill-storage";
import { collectGenerationResources } from "@prompthub/core/generation-storage";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  getDataDir,
  getMcpLibraryFilePath,
  readMcpLibraryRecoverySource,
  copyMcpHistoricalContents,
  exportMcpStorageSnapshot,
  MCP_STORAGE_SNAPSHOT_FILE,
  collectPromptCanonicalGraph,
  getUserDataPath,
  getImagesDir,
  getVideosDir,
  materializeCanonicalStorageShadow,
  resolveDisplayedRuleFileName,
  ruleGroupForKnownId,
  stageCanonicalStorageDatabase,
  type CanonicalGenerationShadowInput,
  type CanonicalAgentProviderShadowInput,
  type CanonicalPluginShadowInput,
  type CanonicalSkillShadowInput,
  type MaterializeCanonicalStorageShadowResult,
  type StageCanonicalStorageDatabaseResult,
} from "@prompthub/core";
import { PluginStorage } from "@prompthub/core/plugin-storage";
import {
  AgentProviderProfileDB,
  SkillDB as LegacySkillDB,
  FolderDB,
  PromptDB,
  McpDB,
  RuleDB,
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
} from "@prompthub/db";
import type {
  McpLibraryFile,
  PluginLibraryEntry,
  PluginVersion,
  RuleFileContent,
} from "@prompthub/shared/types";

import type DatabaseAdapter from "../database/sqlite";

const MAX_PACKAGE_FILES = 20_000;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_DOMAIN_RESOURCES = 100_000;
const MAX_RULE_FILE_BYTES = 16 * 1024 * 1024;
const IGNORED_PACKAGE_DIRECTORIES = new Set([
  ".git",
  ".package-lifecycle",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);

export interface CanonicalStorageProjectorOptions {
  database: DatabaseAdapter.Database;
  targetPath: string;
  readRules?: () => RuleFileContent[];
  skills?: readonly CanonicalSkillShadowInput[];
  mcpLibrary?: McpLibraryFile;
  mcpResourceBundles?: readonly string[];
  mcpHistorySourcePath?: string;
  includeMcpSnapshot?: boolean;
  plugins?: readonly PluginLibraryEntry[];
  pluginVersions?: ReadonlyMap<string, readonly PluginVersion[]>;
  generations?: readonly CanonicalGenerationShadowInput[];
  agentProviders?: readonly CanonicalAgentProviderShadowInput[];
  deviceId?: string;
  operationalSourceDatabasePath?: string;
  publishedCanonicalRootPath?: string;
  resolvePromptMediaSource?: (
    prompt: unknown,
    kind: "image" | "video",
    reference: string,
  ) => string;
}

export interface CanonicalStorageProjectionResult {
  targetPath: string;
  verificationDatabasePath: string;
  materialized: MaterializeCanonicalStorageShadowResult;
  stagedDatabase: StageCanonicalStorageDatabaseResult;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
function hasAdoptedMcp(database: DatabaseAdapter.Database): boolean {
  return Boolean(
    database.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      "mcp_storage_state",
    ) && new McpDB(database).state()?.adoptedAt,
  );
}

function assertSafeDirectory(rootPath: string): string {
  const stats = fs.lstatSync(rootPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      `Canonical package source is not a regular directory: ${rootPath}`,
    );
  }
  return path.resolve(rootPath);
}

function collectPackageFiles(rootPath: string): Array<{
  path: string;
  sourcePath: string;
}> {
  const root = assertSafeDirectory(rootPath);
  const files: Array<{ path: string; sourcePath: string }> = [];
  const queue = [root];
  let totalBytes = 0;
  while (queue.length > 0) {
    const directory = queue.shift();
    if (!directory) break;
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      if (IGNORED_PACKAGE_DIRECTORIES.has(entry.name)) continue;
      const sourcePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Canonical package source contains a symbolic link: ${sourcePath}`,
        );
      }
      if (entry.isDirectory()) {
        queue.push(sourcePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `Canonical package source contains a special file: ${sourcePath}`,
        );
      }
      const size = fs.statSync(sourcePath).size;
      totalBytes += size;
      if (files.length >= MAX_PACKAGE_FILES || totalBytes > MAX_PACKAGE_BYTES) {
        throw new Error("Canonical package source exceeds bounded scan limits");
      }
      files.push({
        path: path.relative(root, sourcePath).split(path.sep).join("/"),
        sourcePath,
      });
    }
  }
  return files.sort((left, right) => compareText(left.path, right.path));
}

function collectSkills(
  database: DatabaseAdapter.Database,
): CanonicalSkillShadowInput[] {
  // Bootstrap projection can precede payload migration; current profiles use only the file owner.
  const migrated = database.get(
    "SELECT name FROM schema_migrations WHERE name = ?",
    "skill-payload-files-v1",
  );
  const skillDb = migrated
    ? new SkillDB(database)
    : new LegacySkillDB(database);
  const skills = skillDb.getAll();
  if (skills.length > MAX_DOMAIN_RESOURCES) {
    throw new Error("Canonical Skill inventory exceeds bounded scan limits");
  }
  return skills.map((skill) => ({
    skill,
    versions: skillDb.getVersions(skill.id),
    packageFiles:
      skill.local_repo_path && fs.existsSync(skill.local_repo_path)
        ? collectPackageFiles(skill.local_repo_path)
        : [],
  }));
}

function readOptionalRuleFile(filePath: string): string | undefined {
  try {
    const stats = fs.lstatSync(filePath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size > MAX_RULE_FILE_BYTES
    ) {
      throw new Error(`Canonical Rule source is invalid: ${filePath}`);
    }
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function readRequiredRuleFile(filePath: string): string {
  const content = readOptionalRuleFile(filePath);
  if (content === undefined) {
    throw new Error(`Canonical Rule version source is missing: ${filePath}`);
  }
  return content;
}

export function collectPortableRules(
  database: DatabaseAdapter.Database,
): RuleFileContent[] {
  const ruleDb = new RuleDB(database);
  const records = ruleDb.getAll();
  if (records.length > MAX_DOMAIN_RESOURCES) {
    throw new Error("Canonical Rule inventory exceeds bounded scan limits");
  }
  let versionCount = 0;
  const rules: RuleFileContent[] = [];
  for (const record of records) {
    const managedContent = readOptionalRuleFile(record.managedPath);
    const versions = ruleDb
      .getVersions(record.id)
      .sort((left, right) => left.version - right.version);
    const isUnmaterializedPlaceholder =
      record.syncStatus === "target-missing" &&
      record.currentVersion === 0 &&
      record.scope === "global" &&
      managedContent === undefined &&
      versions.length === 0;
    if (isUnmaterializedPlaceholder) continue;
    versionCount += versions.length;
    if (versionCount > MAX_DOMAIN_RESOURCES) {
      throw new Error(
        "Canonical Rule version inventory exceeds bounded scan limits",
      );
    }
    rules.push({
      id: record.id,
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      name: resolveDisplayedRuleFileName(
        record.canonicalFileName,
        record.targetPath,
      ),
      description: record.description,
      path: record.targetPath,
      targetPath: record.targetPath,
      managedPath: record.managedPath,
      projectRootPath: record.projectRootPath ?? null,
      exists: record.syncStatus !== "target-missing",
      group:
        record.scope === "project"
          ? "workspace"
          : ruleGroupForKnownId(record.id),
      syncStatus: record.syncStatus,
      content: managedContent ?? readRequiredRuleFile(record.managedPath),
      versions: versions.map((version) => ({
        id: version.id,
        savedAt: version.createdAt,
        content: readRequiredRuleFile(version.filePath),
        source: version.source,
      })),
    });
  }
  return rules;
}

function collectPlugins(
  plugins: readonly PluginLibraryEntry[],
  versions: ReadonlyMap<string, readonly PluginVersion[]>,
): CanonicalPluginShadowInput[] {
  if (plugins.length > MAX_DOMAIN_RESOURCES) {
    throw new Error("Canonical Plugin inventory exceeds bounded scan limits");
  }
  return plugins.map((plugin) => {
    const sourcePath =
      plugin.localPackagePath ||
      plugin.source.localPackagePath ||
      plugin.managedPath ||
      plugin.localRepositoryPath ||
      plugin.source.localRepositoryPath;
    return {
      plugin,
      versions: versions.get(plugin.id) ?? [],
      packageFiles:
        sourcePath && fs.existsSync(sourcePath)
          ? collectPackageFiles(sourcePath)
          : [],
    };
  });
}

function resolveDefaultPromptMediaSource(
  _prompt: unknown,
  kind: "image" | "video",
  reference: string,
): string {
  return path.join(
    kind === "image" ? getImagesDir() : getVideosDir(),
    ...reference.split("/"),
  );
}

function assertProjectionCounts(
  materialized: MaterializeCanonicalStorageShadowResult,
  staged: StageCanonicalStorageDatabaseResult,
  sourceDatabase: DatabaseAdapter.Database,
): void {
  for (const [domain, count] of Object.entries(materialized.domainCounts)) {
    // Adopted MCP records live in SQLite; their history files are not a second
    // inventory of current servers.
    const expectedCount =
      domain === "mcp-servers" && hasAdoptedMcp(sourceDatabase)
        ? new McpDB(sourceDatabase).servers().length
        : count;
    if (staged.domainCounts[domain] !== expectedCount) {
      throw new Error(`Canonical storage projection count mismatch: ${domain}`);
    }
  }
}

function collectCanonicalStorageInput(
  options: CanonicalStorageProjectorOptions,
) {
  const pluginStorage =
    options.plugins === undefined
      ? new PluginStorage(options.database, getUserDataPath())
      : undefined;
  const plugins = options.plugins ?? pluginStorage!.read();
  const histories =
    options.pluginVersions === undefined
      ? (pluginStorage?.readVersions() ?? [])
      : [];
  const groupedVersions = new Map<string, PluginVersion[]>();
  for (const version of histories) {
    const group = groupedVersions.get(version.pluginId) ?? [];
    group.push(version);
    groupedVersions.set(version.pluginId, group);
  }
  const pluginVersions = options.pluginVersions ?? groupedVersions;
  const agentDb = new AgentProviderProfileDB(options.database);
  const profiles = agentDb.listProfiles({ includeArchived: true });
  if (profiles.length > MAX_DOMAIN_RESOURCES) {
    throw new Error("Canonical Agent inventory exceeds bounded scan limits");
  }
  return {
    prompts: collectPromptCanonicalGraph(
      new PromptDB(options.database),
      new FolderDB(options.database),
      options.database,
    ),
    skills: options.skills ?? collectSkills(options.database),
    rules: options.readRules
      ? options.readRules()
      : collectPortableRules(options.database),
    ...(hasAdoptedMcp(options.database)
      ? { mcpResourceBundles: [] }
      : options.mcpResourceBundles !== undefined
        ? {
            mcpResourceBundles: options.mcpResourceBundles,
            mcpLibrary: options.mcpLibrary,
          }
        : {
            mcpLibrary:
              options.mcpLibrary ??
              readMcpLibraryRecoverySource({
                supersededPath: getMcpLibraryFilePath(),
              }),
          }),
    plugins: collectPlugins(plugins, pluginVersions),
    agentProviders:
      options.agentProviders ??
      profiles.map((profile) => ({
        profile,
        modelMappings: agentDb.listModelMappings(profile.id),
      })),
    generations:
      options.generations ??
      collectGenerationResources(options.database, getUserDataPath()),
  };
}

export async function projectCanonicalStorageShadow(
  options: CanonicalStorageProjectorOptions,
): Promise<CanonicalStorageProjectionResult> {
  const targetPath = path.resolve(options.targetPath);
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `Canonical storage projection target already exists: ${targetPath}`,
    );
  }
  const verificationDatabasePath = createOwnedTemporaryDatabasePath(
    path.dirname(targetPath),
    "canonical-catalog",
  );
  try {
    // Capture and materialize without yielding between rows and their files.
    const storage = collectCanonicalStorageInput(options);
    const materialized = materializeCanonicalStorageShadow({
      targetPath,
      ...storage,
      deviceId: options.deviceId,
      resolvePromptMediaSource:
        options.resolvePromptMediaSource ?? resolveDefaultPromptMediaSource,
    });
    if (hasAdoptedMcp(options.database)) {
      const destination = path.join(targetPath, "mcp");
      fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyMcpHistoricalContents(
        options.database,
        options.mcpHistorySourcePath ?? path.join(getDataDir(), "mcp"),
        destination,
      );
      if (options.includeMcpSnapshot)
        exportMcpStorageSnapshot(
          path.join(destination, MCP_STORAGE_SNAPSHOT_FILE),
          { database: options.database },
        );
    }
    const stagedDatabase = stageCanonicalStorageDatabase(
      targetPath,
      verificationDatabasePath,
      {
        operationalSourceDatabasePath: options.operationalSourceDatabasePath,
        publishedCanonicalRootPath: options.publishedCanonicalRootPath,
      },
    );
    assertProjectionCounts(materialized, stagedDatabase, options.database);
    return {
      targetPath,
      verificationDatabasePath,
      materialized,
      stagedDatabase,
    };
  } catch (error) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    cleanupOwnedTemporaryDatabase(verificationDatabasePath);
    throw error;
  }
}
