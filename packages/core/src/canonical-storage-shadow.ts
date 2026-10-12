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
  type CanonicalResourceRecord,
} from "@prompthub/db";
import type { GenerationBatchManifest, Prompt } from "@prompthub/shared/types";
import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared/types/agent";
import type { McpLibraryFile } from "@prompthub/shared/types/mcp";
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
  type PromptCanonicalGraphManifest,
  type PromptCanonicalGraphSnapshot,
} from "./prompt-canonical-export";
import { readPromptCanonicalGraph } from "./prompt-canonical-import";
import { stagePromptCanonicalDatabase } from "./prompt-canonical-catalog";
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
  compatibility: ["settings"],
  serverAuthoritative: ["users", "refresh_tokens", "user_settings"],
  operational: [
    "agent_provider_snapshots",
    "agent_session_sources",
    "agent_session_index",
    "agent_conversation_metadata",
    "agent_conversation_handoffs",
  ],
} as const);

const CANONICAL_DOMAIN_METADATA_FILES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze({
  mcp: new Set(["library.json", "market-sources.json"]),
  plugins: new Set(["library.json", "market-cache.json", "versions.json"]),
});

const CANONICAL_DOMAIN_EMPTY_METADATA_DIRECTORIES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze({
  rules: new Set([".versions", "projects"]),
});

export interface StageCanonicalStorageDatabaseOptions {
  operationalSourceDatabasePath?: string;
  publishedCanonicalRootPath?: string;
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
      return [path.join(domainPath, entry.name)];
    })
    .sort(compareText);
}

export function readCanonicalStorageShadow(
  rootPath: string,
): ReadCanonicalStorageShadowResult {
  const skillPaths = childBundlePaths(rootPath, "skills");
  const rulePaths = childBundlePaths(rootPath, "rules");
  const mcpPaths = childBundlePaths(rootPath, "mcp");
  const pluginPaths = childBundlePaths(rootPath, "plugins");
  const agentPaths = childBundlePaths(rootPath, "agents");
  const generationPaths = childBundlePaths(rootPath, "generations");
  const promptGraph = readPromptCanonicalGraph(rootPath);
  const skills = skillPaths.map(readSkillResourceBundle);
  const rules = rulePaths.map(readRuleResourceBundle);
  const mcpServers = mcpPaths.map(readMcpServerResourceBundle);
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
    promptGraph,
    skills,
    rules,
    mcpServers,
    plugins,
    agentProviders,
    generations,
    domainCounts,
  };
}

function bundleCatalogRecords(rootPath: string): CanonicalResourceRecord[] {
  const domains = [
    "prompts",
    "skills",
    "rules",
    "mcp",
    "plugins",
    "agents",
    "generations",
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
      for (const table of tables) {
        const sourceColumns = tableColumns(source, table);
        const targetColumns = tableColumns(target, table);
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
      createdAt: versions[0]!.createdAt,
      updatedAt: versions.at(-1)!.createdAt,
    });
    ruleDb.replaceVersions(entry.rule.id, versions);
  }
}

function projectCanonicalGenerations(
  database: InstanceType<typeof DatabaseAdapter>,
  generations: readonly ReadGenerationResourceResult[],
): void {
  for (const entry of generations) {
    const manifest = entry.manifest;
    const sourcePromptId =
      manifest.sourcePromptId &&
      database.get(
        "SELECT id FROM prompts WHERE id = ?",
        manifest.sourcePromptId,
      )
        ? manifest.sourcePromptId
        : null;
    database.run(
      `INSERT INTO generation_batches (
        id, manifest_path, status, title, source_prompt_id, provider, model,
        requested_count, succeeded_count, failed_count, cancelled_count,
        interrupted_count, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      manifest.id,
      path.posix.join(
        "generations",
        encodeCanonicalResourceDirectory(manifest.id),
        "batch.json",
      ),
      manifest.status,
      manifest.title,
      sourcePromptId,
      manifest.model.provider,
      manifest.model.model,
      manifest.targetCount,
      manifest.counts.succeeded,
      manifest.counts.failed,
      manifest.counts.cancelled,
      manifest.counts.interrupted,
      manifest.createdAt,
      manifest.updatedAt,
      manifest.completedAt ?? null,
    );
    for (const slot of manifest.slots) {
      database.run(
        `INSERT INTO generation_outputs (
          id, batch_id, slot_index, status, file_name, mime_type, byte_size,
          sha256, favorite, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        slot.output?.id ?? `${manifest.id}:${slot.index}`,
        manifest.id,
        slot.index,
        slot.status,
        slot.output?.fileName ?? null,
        slot.output?.mimeType ?? null,
        slot.output?.byteSize ?? null,
        slot.output?.sha256 ?? null,
        slot.output?.favorite ? 1 : 0,
        slot.output?.createdAt ?? null,
      );
    }
  }
}

export function stageCanonicalStorageDatabase(
  rootPath: string,
  databasePath: string,
  options: StageCanonicalStorageDatabaseOptions = {},
): StageCanonicalStorageDatabaseResult {
  const storage = readCanonicalStorageShadow(rootPath);
  const publishedRootPath = path.resolve(
    options.publishedCanonicalRootPath ?? rootPath,
  );
  const promptResult = stagePromptCanonicalDatabase(rootPath, databasePath);
  try {
    const database = new DatabaseAdapter(databasePath);
    let preservedDatabaseCounts: Record<string, number> = {};
    try {
      preservedDatabaseCounts = copyPreservedDatabaseState(
        database,
        options.operationalSourceDatabasePath,
        [
          ...LOCAL_DATABASE_AUTHORITY_TABLES.compatibility,
          ...LOCAL_DATABASE_AUTHORITY_TABLES.serverAuthoritative,
        ],
      );
      const records = bundleCatalogRecords(rootPath);
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
          });
          for (const version of entry.versions) {
            skillDb.insertVersionDirect(version);
          }
        }
        projectCanonicalRules(database, publishedRootPath, storage.rules);
        const agentDb = new AgentProviderProfileDB(database);
        for (const entry of storage.agentProviders) {
          agentDb.insertProfileGraphDirect(entry.profile, entry.modelMappings);
        }
        projectCanonicalGenerations(database, storage.generations);
        new CanonicalResourceDB(database).replaceAll(records);
      })();
      preservedDatabaseCounts = {
        ...preservedDatabaseCounts,
        ...copyPreservedDatabaseState(
          database,
          options.operationalSourceDatabasePath,
          LOCAL_DATABASE_AUTHORITY_TABLES.operational,
        ),
      };
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
        calculateCanonicalResourceCatalogHash(bundleCatalogRecords(rootPath))
      )
        throw new Error("canonical resource catalog reload hash mismatch");
      quickCheck(reopened);
      return {
        databasePath,
        promptGraphHash: promptResult.graphHash,
        resourceCatalogHash,
        resourceCount: records.length,
        domainCounts: storage.domainCounts,
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
