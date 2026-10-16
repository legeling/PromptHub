import { GenerationDB } from "@prompthub/db";
import { isExternalSkillRepoPath } from "./skill-local-repo-ownership";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  AgentProviderProfileDB,
  CanonicalResourceDB,
  DatabaseAdapter,
  RuleDB,
  SkillDB,
  cleanupOwnedTemporaryDatabase,
  copyMcpDatabaseState,
  McpDB,
  PromptDB,
  FolderDB,
  SYNC_TARGET_SCHEMA_VERSION,
  type CanonicalResourceRecord,
} from "@prompthub/db";
import type { GenerationBatchManifest, Prompt } from "@prompthub/shared/types";
import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared/types/agent";
import type { McpLibraryFile } from "@prompthub/shared/types/mcp";
import { MCP_STORAGE_TABLES } from "@prompthub/shared/types/mcp-storage";
import { MCP_STORAGE_SNAPSHOT_FILE } from "./mcp-storage-snapshot";
import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import type { RuleFileContent } from "@prompthub/shared/types/rules";
import type { Skill, SkillVersion } from "@prompthub/shared/types/skill";

import {
  createMcpBindingConfigDocument,
  materializeMcpServerResourceBundle,
  readMcpServerResourceBundle,
  type ExtractedMcpSecret,
  type McpBindingConfigDocument,
  type ReadMcpServerResourceResult,
} from "./mcp-resource-schema";
import {
  materializeAgentProviderResourceBundle,
  readAgentProviderResourceBundle,
  type ReadAgentProviderResourceResult,
} from "./agent-resource-schema";
import {
  materializeGenerationResourceBundle,
  readGenerationResourceBundle,
  type ReadGenerationResourceResult,
} from "./generation-resource-schema";
import {
  materializePluginResourceBundle,
  readPluginResourceBundle,
  type PluginPackagePayloadSource,
  type ReadPluginResourceResult,
} from "./plugin-resource-schema";
import {
  materializePromptCanonicalGraph,
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphManifest,
  type PromptCanonicalGraphSnapshot,
} from "./prompt-canonical-export";
import { readPromptCanonicalGraph } from "./prompt-canonical-import";
import {
  stagePromptCanonicalDatabase,
  stagePromptSnapshotDatabase,
} from "./prompt-canonical-catalog";
import {
  materializeRuleResourceBundle,
  readRuleResourceBundle,
  type ReadRuleResourceResult,
} from "./rule-resource-schema";
import {
  readResourceBundle,
  type ResourceBundleManifest,
} from "./resource-bundle";
import {
  materializeSkillResourceBundle,
  readSkillResourceBundle,
  type ReadSkillResourceResult,
  type SkillPackagePayloadSource,
} from "./skill-resource-schema";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";

export interface CanonicalSkillShadowInput {
  skill: Skill;
  versions: readonly SkillVersion[];
  packageFiles: readonly SkillPackagePayloadSource[];
}

export interface CanonicalPluginShadowInput {
  plugin: PluginLibraryEntry;
  versions: readonly PluginVersion[];
  packageFiles: readonly PluginPackagePayloadSource[];
}

export interface CanonicalAgentProviderShadowInput {
  profile: AgentProviderProfile;
  modelMappings: readonly AgentProviderModelMapping[];
}

export interface CanonicalGenerationShadowInput {
  manifest: GenerationBatchManifest;
  outputSources: Readonly<Record<string, string>>;
  bundleRevision?: number;
}

export interface MaterializeCanonicalStorageShadowInput {
  targetPath: string;
  prompts: PromptCanonicalGraphSnapshot;
  skills?: readonly CanonicalSkillShadowInput[];
  rules?: readonly RuleFileContent[];
  mcpLibrary?: McpLibraryFile;
  mcpResourceBundles?: readonly string[];
  plugins?: readonly CanonicalPluginShadowInput[];
  agentProviders?: readonly CanonicalAgentProviderShadowInput[];
  generations?: readonly CanonicalGenerationShadowInput[];
  deviceId?: string;
  createdAt?: string;
  resolvePromptMediaSource?: (
    prompt: Prompt,
    kind: "image" | "video",
    reference: string,
  ) => string;
}

export interface MaterializeCanonicalStorageShadowResult {
  manifest: PromptCanonicalGraphManifest;
  domainCounts: Record<string, number>;
  extractedMcpSecrets: ExtractedMcpSecret[];
  mcpBindingConfig?: McpBindingConfigDocument;
}

export interface ReadCanonicalStorageShadowResult {
  promptGraph: ReturnType<typeof readPromptCanonicalGraph>;
  skills: ReadSkillResourceResult[];
  rules: ReadRuleResourceResult[];
  mcpServers: ReadMcpServerResourceResult[];
  plugins: ReadPluginResourceResult[];
  agentProviders: ReadAgentProviderResourceResult[];
  generations: ReadGenerationResourceResult[];
  domainCounts: Record<string, number>;
}

export interface StageCanonicalStorageDatabaseResult {
  databasePath: string;
  promptGraphHash: string;
  resourceCatalogHash: string;
  resourceCount: number;
  domainCounts: Record<string, number>;
  preservedDatabaseCounts: Record<string, number>;
}

export const LOCAL_DATABASE_AUTHORITY_TABLES = Object.freeze({
  skills: ["skills", "skill_versions"],
  rules: ["rules", "rule_versions"],
  agentProviders: ["agent_provider_profiles", "agent_provider_model_mappings"],
  generations: ["generation_batches", "generation_outputs"],
  plugins: ["plugins", "plugin_versions"],
  settings: ["settings"],
  serverAuthoritative: ["users", "refresh_tokens", "user_settings"],
  sessions: [
    "agent_session_sources",
    "agent_session_index",
    "agent_conversation_metadata",
  ],
  operational: [
    "sync_targets",
    "storage_publication_receipts",
    "agent_provider_snapshots",
    "agent_conversation_handoffs",
  ],
  structuredBusiness: MCP_STORAGE_TABLES,
} as const);

const CANONICAL_DOMAIN_METADATA_FILES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze({
  mcp: new Set([
    "library.json",
    "market-sources.json",
    MCP_STORAGE_SNAPSHOT_FILE,
  ]),
  plugins: new Set(["library.json", "market-cache.json", "versions.json"]),
});

const CANONICAL_DOMAIN_EMPTY_METADATA_DIRECTORIES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze({
  rules: new Set([".versions", "projects"]),
});

export interface StageCanonicalStorageDatabaseOptions {
  /** Normal maintenance uses SQLite; explicit archive imports use the graph. */
  promptSourceDatabasePath?: string;
  skillSourceDatabasePath?: string;
  ruleSourceDatabasePath?: string;
  agentProviderSourceDatabasePath?: string;
  generationSourceDatabasePath?: string;
  pluginSourceDatabasePath?: string;
  operationalSourceDatabasePath?: string;
  mcpSourceDatabasePath?: string;
  publishedCanonicalRootPath?: string;
}

function preserveMcpState(
  target: DatabaseAdapter.Database,
  sourcePath: string | undefined,
): Record<string, number> {
  if (!sourcePath) return {};
  const source = new DatabaseAdapter(sourcePath, { readOnly: true });
  try {
    if (
      !source.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        "mcp_storage_state",
      )
    ) {
      const version = source.pragma("user_version") as Array<{
        user_version: number;
      }>;
      if (version[0]?.user_version >= 4)
        throw new Error(
          "MCP authoritative tables are missing from the source database",
        );
      return {};
    }
    if (!new McpDB(source).state()?.adoptedAt) {
      if (new McpDB(source).servers().length)
        throw new Error("MCP authoritative adoption is incomplete");
      return {};
    }
    return copyMcpDatabaseState(source, target);
  } finally {
    source.close();
  }
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertUniqueIds<T>(
  values: readonly T[],
  getId: (value: T) => string,
  label: string,
): void {
  const ids = new Set<string>();
  for (const value of values) {
    const id = getId(value);
    if (ids.has(id)) throw new Error(`duplicate canonical ${label} id: ${id}`);
    ids.add(id);
  }
}

function copyMcpResourceBundles(
  stagePath: string,
  sources: readonly string[],
): number {
  const mcpBundles = sources.map((bundlePath) => ({
    bundlePath: path.resolve(bundlePath),
    resource: readMcpServerResourceBundle(bundlePath),
  }));
  assertUniqueIds(
    mcpBundles,
    (entry) => entry.resource.server.id,
    "MCP server",
  );
  for (const entry of mcpBundles) {
    const destination = path.join(
      stagePath,
      "mcp",
      encodeCanonicalResourceDirectory(entry.resource.server.id),
    );
    fs.cpSync(entry.bundlePath, destination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    const copied = readMcpServerResourceBundle(destination);
    if (
      copied.bundleManifest.contentHash !==
      entry.resource.bundleManifest.contentHash
    ) {
      throw new Error("Canonical MCP bundle changed during projection");
    }
  }
  return mcpBundles.length;
}

function materializeAdditionalDomains(
  stagePath: string,
  input: MaterializeCanonicalStorageShadowInput,
  extractedSecrets: ExtractedMcpSecret[],
): Record<string, number> {
  const skills = input.skills ?? [];
  const rules = input.rules ?? [];
  const mcpServers = input.mcpLibrary?.servers ?? [];
  const plugins = input.plugins ?? [];
  const agentProviders = input.agentProviders ?? [];
  const generations = input.generations ?? [];
  assertUniqueIds(skills, (entry) => entry.skill.id, "Skill");
  assertUniqueIds(rules, (entry) => entry.id, "Rule");
  assertUniqueIds(mcpServers, (entry) => entry.id, "MCP server");
  assertUniqueIds(plugins, (entry) => entry.plugin.id, "Plugin");
  assertUniqueIds(
    agentProviders,
    (entry) => entry.profile.id,
    "Agent provider",
  );
  assertUniqueIds(generations, (entry) => entry.manifest.id, "generation");
  for (const entry of skills) {
    materializeSkillResourceBundle({
      bundlePath: path.join(
        stagePath,
        "skills",
        encodeCanonicalResourceDirectory(entry.skill.id),
      ),
      skill: entry.skill,
      versions: entry.versions,
      packageFiles: entry.packageFiles,
    });
  }
  for (const rule of rules) {
    materializeRuleResourceBundle({
      bundlePath: path.join(
        stagePath,
        "rules",
        encodeCanonicalResourceDirectory(rule.id),
      ),
      rule,
    });
  }
  for (const server of mcpServers) {
    const result = materializeMcpServerResourceBundle({
      bundlePath: path.join(
        stagePath,
        "mcp",
        encodeCanonicalResourceDirectory(server.id),
      ),
      server,
    });
    extractedSecrets.push(...result.extractedSecrets);
  }
  const mcpBundleCount = copyMcpResourceBundles(
    stagePath,
    input.mcpResourceBundles ?? [],
  );
  for (const entry of plugins) {
    materializePluginResourceBundle({
      bundlePath: path.join(
        stagePath,
        "plugins",
        encodeCanonicalResourceDirectory(entry.plugin.id),
      ),
      plugin: entry.plugin,
      versions: entry.versions,
      packageFiles: entry.packageFiles,
    });
  }
  for (const entry of agentProviders) {
    materializeAgentProviderResourceBundle({
      bundlePath: path.join(
        stagePath,
        "agents",
        encodeCanonicalResourceDirectory(entry.profile.id),
      ),
      profile: entry.profile,
      modelMappings: entry.modelMappings,
    });
  }
  const objectsRoot = path.join(stagePath, "assets", "objects");
  for (const entry of generations) {
    materializeGenerationResourceBundle({
      bundlePath: path.join(
        stagePath,
        "generations",
        encodeCanonicalResourceDirectory(entry.manifest.id),
      ),
      objectsRoot,
      manifest: entry.manifest,
      outputSources: entry.outputSources,
      writePolicy:
        entry.bundleRevision === undefined
          ? undefined
          : { mode: "create", revision: entry.bundleRevision },
    });
  }
  return {
    skills: skills.length,
    rules: rules.length,
    "mcp-servers": mcpServers.length + mcpBundleCount,
    plugins: plugins.length,
    "agent-providers": agentProviders.length,
    generations: generations.length,
  };
}

export function materializeCanonicalStorageShadow(
  input: MaterializeCanonicalStorageShadowInput,
): MaterializeCanonicalStorageShadowResult {
  if (
    input.mcpLibrary !== undefined &&
    input.mcpResourceBundles !== undefined
  ) {
    throw new Error(
      "Canonical MCP library and resource bundle inputs are mutually exclusive",
    );
  }
  if (
    input.mcpLibrary &&
    input.mcpLibrary.bindings.length > 0 &&
    !input.deviceId
  ) {
    throw new Error("Canonical MCP bindings require a local device identity");
  }
  const extractedMcpSecrets: ExtractedMcpSecret[] = [];
  let domainCounts: Record<string, number> = {};
  const manifest = materializePromptCanonicalGraph(
    input.targetPath,
    input.prompts,
    {
      createdAt: input.createdAt,
      resolveMediaSource: input.resolvePromptMediaSource,
      materializeAdditionalDomains: (stagePath) => {
        domainCounts = materializeAdditionalDomains(
          stagePath,
          input,
          extractedMcpSecrets,
        );
      },
    },
  );
  const mcpBindingConfig =
    input.deviceId && input.mcpLibrary
      ? createMcpBindingConfigDocument({
          deviceId: input.deviceId,
          bindings: input.mcpLibrary.bindings,
          knownServerIds: new Set(
            input.mcpLibrary.servers.map((server) => server.id),
          ),
        })
      : undefined;
  return {
    manifest,
    domainCounts,
    extractedMcpSecrets,
    ...(mcpBindingConfig ? { mcpBindingConfig } : {}),
  };
}

function childBundlePaths(rootPath: string, domain: string): string[] {
  const domainPath = path.join(rootPath, domain);
  if (!fs.existsSync(domainPath)) return [];
  const stat = fs.lstatSync(domainPath);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`canonical ${domain} root is invalid`);
  const metadataFiles = CANONICAL_DOMAIN_METADATA_FILES[domain];
  const emptyMetadataDirectories =
    CANONICAL_DOMAIN_EMPTY_METADATA_DIRECTORIES[domain];
  return fs
    .readdirSync(domainPath, { withFileTypes: true })
    .flatMap((entry) => {
      if (metadataFiles?.has(entry.name)) {
        if (!entry.isFile() || entry.isSymbolicLink()) {
          throw new Error(
            `canonical ${domain} metadata is invalid: ${entry.name}`,
          );
        }
        return [];
      }
      if (emptyMetadataDirectories?.has(entry.name)) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          fs.readdirSync(path.join(domainPath, entry.name)).length > 0
        ) {
          throw new Error(
            `canonical ${domain} metadata directory is invalid: ${entry.name}`,
          );
        }
        return [];
      }
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error(`canonical ${domain} entry is invalid: ${entry.name}`);
      if (
        domain === "mcp" &&
        !fs.existsSync(path.join(domainPath, entry.name, "manifest.json"))
      ) {
        const children = fs.readdirSync(path.join(domainPath, entry.name));
        if (children.length === 1 && children[0] === "versions") return [];
      }
      return [path.join(domainPath, entry.name)];
    })
    .sort(compareText);
}

function readCanonicalStorageDomains(
  rootPath: string,
  includeSkills = true,
  includeGenerations = true,
): Omit<ReadCanonicalStorageShadowResult, "promptGraph"> {
  const skillPaths = includeSkills ? childBundlePaths(rootPath, "skills") : [];
  const rulePaths = childBundlePaths(rootPath, "rules");
  const mcpPaths = childBundlePaths(rootPath, "mcp");
  const pluginPaths = childBundlePaths(rootPath, "plugins");
  const agentPaths = childBundlePaths(rootPath, "agents");
  const generationPaths = includeGenerations
    ? childBundlePaths(rootPath, "generations")
    : [];
  const skills = skillPaths.map(readSkillResourceBundle);
  const rules = rulePaths.map(readRuleResourceBundle);
  const mcpServers = mcpPaths.map((bundlePath) =>
    readMcpServerResourceBundle(bundlePath),
  );
  const plugins = pluginPaths.map(readPluginResourceBundle);
  const agentProviders = agentPaths.map(readAgentProviderResourceBundle);
  const objectsRoot = path.join(rootPath, "assets", "objects");
  const generations = generationPaths.map((bundlePath) =>
    readGenerationResourceBundle(bundlePath, objectsRoot),
  );
  const domainCounts = {
    skills: skills.length,
    rules: rules.length,
    "mcp-servers": mcpServers.length,
    plugins: plugins.length,
    "agent-providers": agentProviders.length,
    generations: generations.length,
  };
  return {
    skills,
    rules,
    mcpServers,
    plugins,
    agentProviders,
    generations,
    domainCounts,
  };
}

export function readCanonicalStorageShadow(
  rootPath: string,
): ReadCanonicalStorageShadowResult {
  return {
    ...readCanonicalStorageDomains(rootPath),
    promptGraph: readPromptCanonicalGraph(rootPath),
  };
}

function bundleCatalogRecords(
  rootPath: string,
  includePrompts = true,
  includeSkills = true,
  includeGenerations = true,
): CanonicalResourceRecord[] {
  const domains = [
    ...(includePrompts ? ["prompts"] : []),
    ...(includeSkills ? ["skills"] : []),
    "rules",
    "mcp",
    "plugins",
    "agents",
    ...(includeGenerations ? ["generations"] : []),
  ];
  const records: CanonicalResourceRecord[] = [];
  for (const domain of domains) {
    for (const bundlePath of childBundlePaths(rootPath, domain)) {
      const manifest: ResourceBundleManifest =
        readResourceBundle(bundlePath).manifest;
      records.push({
        resourceType: manifest.resourceType,
        resourceId: manifest.resourceId,
        schemaVersion: manifest.schemaVersion,
        revision: manifest.revision,
        contentHash: manifest.contentHash,
        manifestPath: path
          .relative(rootPath, path.join(bundlePath, "manifest.json"))
          .split(path.sep)
          .join("/"),
        updatedAt: manifest.updatedAt,
      });
    }
  }
  return records.sort(
    (left, right) =>
      compareText(left.resourceType, right.resourceType) ||
      compareText(left.resourceId, right.resourceId),
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function calculateCanonicalResourceCatalogHash(
  records: readonly CanonicalResourceRecord[],
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(records)), "utf8")
    .digest("hex");
}

function quickCheck(database: InstanceType<typeof DatabaseAdapter>): void {
  const rows = database.pragma("quick_check") as Array<Record<string, unknown>>;
  if (rows.length !== 1 || Object.values(rows[0] ?? {})[0] !== "ok")
    throw new Error("canonical storage staged database failed quick_check");
}

function tableColumns(
  database: InstanceType<typeof DatabaseAdapter>,
  table: string,
): string[] {
  return (
    database.pragma(`table_info(${table})`) as Array<{ name: string }>
  ).map((column) => column.name);
}

function copyApplicationMigrationHistory(
  target: InstanceType<typeof DatabaseAdapter>,
  source: InstanceType<typeof DatabaseAdapter>,
): void {
  if (tableColumns(source, "schema_migrations").length === 0) return;
  // Retain completed application migrations without losing new schema markers.
  for (const row of source.all(
    "SELECT name, applied_at FROM schema_migrations",
  )) {
    if (
      row === null ||
      typeof row !== "object" ||
      !("name" in row) ||
      typeof row.name !== "string" ||
      !("applied_at" in row) ||
      typeof row.applied_at !== "number"
    ) {
      throw new Error("Invalid source migration history");
    }
    target.run(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET applied_at = excluded.applied_at",
      row.name,
      row.applied_at,
    );
  }
}

function copyPreservedDatabaseState(
  target: InstanceType<typeof DatabaseAdapter>,
  sourcePath: string | undefined,
  tables: readonly string[],
): Record<string, number> {
  if (!sourcePath) return {};
  const source = new DatabaseAdapter(sourcePath, { readOnly: true });
  try {
    const counts: Record<string, number> = {};
    target.transaction(() => {
      if (tables.includes("settings"))
        copyApplicationMigrationHistory(target, source);
      for (const table of tables) {
        const sourceColumns = tableColumns(source, table);
        const targetColumns = tableColumns(target, table);
        if (table === "sync_targets" && sourceColumns.length === 0) {
          const version: unknown = source.get("PRAGMA user_version");
          if (
            typeof version === "object" &&
            version !== null &&
            "user_version" in version &&
            typeof version.user_version === "number" &&
            version.user_version < SYNC_TARGET_SCHEMA_VERSION
          ) {
            counts[table] = 0;
            continue;
          }
        }
        if (
          sourceColumns.length === 0 ||
          JSON.stringify(sourceColumns) !== JSON.stringify(targetColumns)
        ) {
          throw new Error(
            `canonical catalog cannot preserve incompatible table: ${table}`,
          );
        }
        const rows = source.prepare(`SELECT * FROM ${table}`).all() as Array<
          Record<string, unknown>
        >;
        const insert = target.prepare(
          `INSERT INTO ${table} (${targetColumns.join(", ")}) VALUES (${targetColumns
            .map(() => "?")
            .join(", ")})`,
        );
        for (const row of rows) {
          insert.run(...targetColumns.map((column) => row[column]));
        }
        const copied = Number(
          (
            target.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
        );
        if (copied !== rows.length) {
          throw new Error(
            `canonical catalog preserved table count mismatch: ${table}`,
          );
        }
        counts[table] = copied;
      }
    })();
    return counts;
  } finally {
    source.close();
  }
}

function localSkillBindings(
  sourcePath: string | undefined,
): Map<string, Pick<Skill, "source_url" | "local_repo_path">> {
  if (!sourcePath) return new Map();
  const source = new DatabaseAdapter(sourcePath, { readOnly: true });
  try {
    return new Map(
      new SkillDB(source).getAll().flatMap((skill) => {
        if (!skill.source_url || !path.isAbsolute(skill.source_url)) return [];
        return [
          [
            skill.id,
            {
              source_url: skill.source_url,
              ...(isExternalSkillRepoPath(skill.id, skill.local_repo_path)
                ? { local_repo_path: skill.local_repo_path }
                : {}),
            },
          ],
        ];
      }),
    );
  } finally {
    source.close();
  }
}

function skillForLocalProjection(
  database: InstanceType<typeof DatabaseAdapter>,
  skill: Skill,
): Skill {
  if (!skill.ownerUserId) return skill;
  const owner = database.get(
    "SELECT id FROM users WHERE id = ?",
    skill.ownerUserId,
  );
  return owner ? skill : { ...skill, ownerUserId: undefined };
}

function projectCanonicalRules(
  database: InstanceType<typeof DatabaseAdapter>,
  publishedRootPath: string,
  rules: readonly ReadRuleResourceResult[],
): void {
  const ruleDb = new RuleDB(database);
  for (const entry of rules) {
    const bundlePath = path.join(
      publishedRootPath,
      "rules",
      encodeCanonicalResourceDirectory(entry.rule.id),
    );
    const managedPath = path.join(bundlePath, "rule.md");
    const versions = entry.rule.versions.map((version, index) => ({
      id: version.id,
      ruleId: entry.rule.id,
      version: index + 1,
      filePath: path.join(
        bundlePath,
        "versions",
        `${String(index + 1).padStart(6, "0")}.md`,
      ),
      source: version.source,
      createdAt: version.savedAt,
    }));
    ruleDb.upsert({
      id: entry.rule.id,
      scope: entry.rule.id.startsWith("project:") ? "project" : "global",
      platformId: entry.rule.platformId,
      platformName: entry.rule.platformName,
      platformIcon: entry.rule.platformIcon,
      platformDescription: entry.rule.platformDescription,
      canonicalFileName: entry.rule.name,
      description: entry.rule.description,
      managedPath,
      targetPath: entry.rule.targetPath ?? "",
      projectRootPath: entry.rule.projectRootPath ?? null,
      syncStatus: "target-missing",
      currentVersion: versions.length,
      contentHash: crypto
        .createHash("sha256")
        .update(entry.rule.content, "utf8")
        .digest("hex"),
      createdAt: versions[0]?.createdAt ?? entry.bundleManifest.createdAt,
      updatedAt: versions.at(-1)?.createdAt ?? entry.bundleManifest.updatedAt,
    });
    ruleDb.replaceVersions(entry.rule.id, versions);
  }
}

function projectCanonicalGenerations(
  database: InstanceType<typeof DatabaseAdapter>,
  generations: readonly ReadGenerationResourceResult[],
): void {
  const repository = new GenerationDB(database);
  for (const entry of generations) repository.upsert(entry.manifest);
}

export function stageCanonicalStorageDatabase(
  rootPath: string,
  databasePath: string,
  options: StageCanonicalStorageDatabaseOptions = {},
): StageCanonicalStorageDatabaseResult {
  const includeSkills = !options.skillSourceDatabasePath;
  const includeGenerations = !options.generationSourceDatabasePath;
  const storage = readCanonicalStorageDomains(
    rootPath,
    includeSkills,
    includeGenerations,
  );
  const publishedRootPath = path.resolve(
    options.publishedCanonicalRootPath ?? rootPath,
  );
  const includePrompts = !options.promptSourceDatabasePath;
  const promptResult = options.promptSourceDatabasePath
    ? stageDatabasePromptGraph(options.promptSourceDatabasePath, databasePath)
    : stagePromptCanonicalDatabase(rootPath, databasePath);
  try {
    const database = new DatabaseAdapter(databasePath);
    let preservedDatabaseCounts: Record<string, number> = {};
    try {
      preservedDatabaseCounts = copyPreservedDatabaseState(
        database,
        options.operationalSourceDatabasePath,
        [
          ...LOCAL_DATABASE_AUTHORITY_TABLES.settings,
          ...LOCAL_DATABASE_AUTHORITY_TABLES.serverAuthoritative,
        ],
      );
      const records = bundleCatalogRecords(
        rootPath,
        includePrompts,
        includeSkills,
        includeGenerations,
      );
      const deviceSkills = localSkillBindings(
        options.operationalSourceDatabasePath,
      );
      database.transaction(() => {
        const skillDb = new SkillDB(database);
        for (const entry of storage.skills) {
          skillDb.insertSkillDirect({
            ...skillForLocalProjection(database, entry.skill),
            local_repo_path: path.join(
              publishedRootPath,
              "skills",
              encodeCanonicalResourceDirectory(entry.skill.id),
              "files",
            ),
            ...deviceSkills.get(entry.skill.id),
          });
          for (const version of entry.versions) {
            skillDb.insertVersionDirect(version);
          }
        }
        if (!options.ruleSourceDatabasePath)
          projectCanonicalRules(database, publishedRootPath, storage.rules);
        if (!options.agentProviderSourceDatabasePath) {
          const agentDb = new AgentProviderProfileDB(database);
          for (const entry of storage.agentProviders) {
            agentDb.insertProfileGraphDirect(
              entry.profile,
              entry.modelMappings,
            );
          }
        }
        projectCanonicalGenerations(database, storage.generations);
        new CanonicalResourceDB(database).replaceAll(records);
      })();
      preservedDatabaseCounts = {
        ...preservedDatabaseCounts,
        ...copyPreservedDatabaseState(
          database,
          options.skillSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.skills,
        ),
        ...copyPreservedDatabaseState(
          database,
          options.ruleSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.rules,
        ),
        ...copyPreservedDatabaseState(
          database,
          options.agentProviderSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.agentProviders,
        ),
        ...copyPreservedDatabaseState(
          database,
          options.generationSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.generations,
        ),
        ...copyPreservedDatabaseState(
          database,
          options.pluginSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.plugins,
        ),
        ...copyPreservedDatabaseState(
          database,
          options.operationalSourceDatabasePath,
          [
            ...LOCAL_DATABASE_AUTHORITY_TABLES.sessions,
            ...LOCAL_DATABASE_AUTHORITY_TABLES.operational,
          ],
        ),
        ...preserveMcpState(
          database,
          options.mcpSourceDatabasePath ??
            options.operationalSourceDatabasePath,
        ),
      };
      // Portable Skill bundles are an explicit migration input, not runtime SQL payloads.
      if (!options.skillSourceDatabasePath)
        database.run("DELETE FROM schema_migrations WHERE name = ?", "skill-payload-files-v1");
      // Explicit portable imports rebuild Plugin SQL from the selected verified bundles.
      if (!options.pluginSourceDatabasePath)
        database.run(
          "DELETE FROM schema_migrations WHERE name = ?",
          "plugin-sqlite-v1",
        );
      quickCheck(database);
    } finally {
      database.close();
    }
    const reopened = new DatabaseAdapter(databasePath, { readOnly: true });
    try {
      const records = new CanonicalResourceDB(reopened).list();
      const resourceCatalogHash =
        calculateCanonicalResourceCatalogHash(records);
      if (
        resourceCatalogHash !==
        calculateCanonicalResourceCatalogHash(
          bundleCatalogRecords(
            rootPath,
            includePrompts,
            includeSkills,
            includeGenerations,
          ),
        )
      )
        throw new Error("canonical resource catalog reload hash mismatch");
      quickCheck(reopened);
      return {
        databasePath,
        promptGraphHash: promptResult.graphHash,
        resourceCatalogHash,
        resourceCount: records.length,
        domainCounts: {
          ...storage.domainCounts,
          skills: preservedDatabaseCounts.skills ?? storage.domainCounts.skills,
          rules: preservedDatabaseCounts.rules ?? storage.domainCounts.rules,
          plugins:
            preservedDatabaseCounts.plugins ?? storage.domainCounts.plugins,
          generations:
            preservedDatabaseCounts.generation_batches ??
            storage.domainCounts.generations,
          "agent-providers":
            preservedDatabaseCounts.agent_provider_profiles ??
            storage.domainCounts["agent-providers"],
          "mcp-servers":
            preservedDatabaseCounts.mcp_servers ??
            storage.domainCounts["mcp-servers"],
        },
        preservedDatabaseCounts,
      };
    } finally {
      reopened.close();
    }
  } catch (error) {
    cleanupOwnedTemporaryDatabase(databasePath);
    throw error;
  }
}

function stageDatabasePromptGraph(sourcePath: string, targetPath: string) {
  const source = new DatabaseAdapter(sourcePath, { readOnly: true });
  try {
    return stagePromptSnapshotDatabase(
      collectPromptCanonicalGraph(
        new PromptDB(source),
        new FolderDB(source),
        source,
      ),
      targetPath,
      new Date().toISOString(),
    );
  } finally {
    source.close();
  }
}
