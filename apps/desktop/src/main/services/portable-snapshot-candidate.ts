import { readSkillVersionPayload } from "@prompthub/core/skill-version-files";
import { readSkillEntrypoint } from "@prompthub/core/skill-storage-files";
import { collectGenerationResources } from "@prompthub/core/generation-storage";
import { PluginStorage } from "@prompthub/core/plugin-storage";
import { collectSkillPackageFiles } from "@prompthub/core/skill-storage-files";
import fs from "node:fs";
import path from "node:path";
import {
  createStorageInventory,
  deriveLocalResourceDeviceId,
  encodeCanonicalResourceDirectory,
  readContentAddressedObject,
  readGenerationResourceBundle,
  readPluginResourceBundle,
  readSkillResourceBundle,
  readRuleResourceBundle,
  readMcpServerResourceBundle,
  parseMcpBindingConfigDocument,
  resolveDisplayedRuleFileName,
  ruleGroupForKnownId,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
  initializeMcpStorage,
  importMcpStorageSnapshot,
  readMcpStorageSnapshotLibrary,
  assertMcpSnapshotOverview,
  resolveRuntimeStorageContext,
  MCP_STORAGE_SNAPSHOT_FILE,
  type CanonicalGenerationShadowInput,
  type CanonicalAgentProviderShadowInput,
  type CanonicalSkillShadowInput,
  type PortableLogicalEnvelope,
  type RendererPersistenceEncryption,
} from "@prompthub/core";
import {
  normalizeLibrary,
  normalizePluginVersionsFile,
} from "@prompthub/core/plugin-library/normalization";
import { normalizeMcpLibrary } from "@prompthub/core/mcp-library-persistence";
import {
  DatabaseAdapter,
  RuleDB,
  SkillDB,
  McpDB,
  clearMcpDatabaseState,
} from "@prompthub/db";
import type { PluginVersion, RuleFileContent } from "@prompthub/shared/types";
import { mergeMcpLibraryFromTransport } from "@prompthub/shared/utils/mcp-config";
import {
  createCanonicalStorageCheckpoint,
  type CanonicalStorageCheckpointManifest,
} from "./canonical-storage-checkpoint";

interface CandidateOptions {
  stageRoot: string;
  activeRoot: string;
  operationId: string;
  envelope: PortableLogicalEnvelope;
  encryption: RendererPersistenceEncryption;
  agentProviders?: readonly CanonicalAgentProviderShadowInput[];
  generationSnapshot: boolean;
}

function candidatePath(
  root: string,
  activeRoot: string,
  reference: string,
): string {
  const relative = path.relative(activeRoot, reference);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "Portable candidate references a file outside the managed root",
    );
  }
  return path.join(root, relative);
}

function bundlePaths(
  root: string,
  metadataFiles: readonly string[] = [],
): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink())
      throw new Error("Portable candidate contains a linked resource");
    if (entry.isDirectory()) return [path.join(root, entry.name)];
    if (entry.isFile() && metadataFiles.includes(entry.name)) return [];
    throw new Error(
      `Portable candidate contains an unrecognized resource entry: ${entry.name}`,
    );
  });
}

function collectSkills(
  database: DatabaseAdapter,
  options: CandidateOptions,
): CanonicalSkillShadowInput[] {
  const skills = new SkillDB(database);
  const fileHistory =
    options.envelope.scope.skills ||
    Boolean(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "skill-payload-files-v1",
      ),
    );
  const legacyPackages = new Map<
    string,
    Array<{ path: string; sourcePath: string }>
  >();
  // One inventory pass indexes package files; no per-Skill tree rescanning.
  const inventory = createStorageInventory(options.stageRoot, {
    includeSecrets: true,
    detachedLayoutEpoch: 1,
  });
  for (const file of inventory.files) {
    const [data, domain, name, ...relative] = file.relativePath.split("/");
    if (data !== "data" || domain !== "skills" || relative.length === 0)
      continue;
    const files = legacyPackages.get(name) ?? [];
    files.push({
      path: relative.join("/"),
      sourcePath: path.join(options.stageRoot, file.relativePath),
    });
    legacyPackages.set(name, files);
  }
  return skills.getAll().map((skill) => {
    const bundlePath = path.join(
      options.stageRoot,
      "data",
      "skills",
      encodeCanonicalResourceDirectory(skill.id),
    );
    const packageFiles = fs.existsSync(path.join(bundlePath, "manifest.json"))
      ? readSkillResourceBundle(bundlePath).packageFiles.map((file) => ({
          path: file.path,
          sourcePath: file.absolutePath,
        }))
      : fs.existsSync(path.join(bundlePath, "files"))
        ? collectSkillPackageFiles(path.join(bundlePath, "files"))
        : (legacyPackages.get(skill.name) ?? []);
    const entrypoint = packageFiles.find((file) => file.path === "SKILL.md");
    const content = entrypoint
      ? readSkillEntrypoint(entrypoint.sourcePath)
      : skill.content;
    const versions = skills
      .getVersions(skill.id)
      .map((version) =>
        fileHistory
          ? readSkillVersionPayload(
              version,
              path.join(options.stageRoot, "data", "skills"),
              options.stageRoot,
            )
          : version,
      );
    return {
      skill: { ...skill, content, instructions: content },
      versions,
      packageFiles,
    };
  });
}

function collectRules(
  database: DatabaseAdapter,
  options: CandidateOptions,
): RuleFileContent[] {
  const rules = new RuleDB(database);
  return rules.getAll().flatMap((rule) => {
    if (!options.envelope.scope.rules) {
      const bundlePath = path.join(
        options.stageRoot,
        "data",
        "rules",
        encodeCanonicalResourceDirectory(rule.id),
      );
      if (fs.existsSync(path.join(bundlePath, "manifest.json"))) {
        const resource = readRuleResourceBundle(bundlePath).rule;
        return [
          {
            ...resource,
            path: rule.targetPath,
            targetPath: rule.targetPath,
            managedPath: rule.managedPath,
            exists: rule.syncStatus !== "target-missing",
            syncStatus: rule.syncStatus,
          },
        ];
      }
    }
    const file = candidatePath(
      options.stageRoot,
      options.activeRoot,
      rule.managedPath,
    );
    const versions = rules
      .getVersions(rule.id)
      .sort((left, right) => left.version - right.version);
    if (
      rule.currentVersion === 0 &&
      versions.length === 0 &&
      !fs.existsSync(file)
    )
      return [];
    return [
      {
        id: rule.id,
        platformId: rule.platformId,
        platformName: rule.platformName,
        platformIcon: rule.platformIcon,
        platformDescription: rule.platformDescription,
        name: resolveDisplayedRuleFileName(
          rule.canonicalFileName,
          rule.targetPath,
        ),
        description: rule.description,
        path: rule.targetPath,
        targetPath: rule.targetPath,
        managedPath: rule.managedPath,
        projectRootPath: rule.projectRootPath,
        exists: rule.syncStatus !== "target-missing",
        syncStatus: rule.syncStatus,
        group:
          rule.scope === "project" ? "workspace" : ruleGroupForKnownId(rule.id),
        content: fs.readFileSync(file, "utf8"),
        versions: versions.map((version) => ({
          id: version.id,
          savedAt: version.createdAt,
          source: version.source,
          content: fs.readFileSync(
            candidatePath(
              options.stageRoot,
              options.activeRoot,
              version.filePath,
            ),
            "utf8",
          ),
        })),
      },
    ];
  });
}

function collectPlugins(options: CandidateOptions, database: DatabaseAdapter) {
  if (!options.envelope.scope.plugins) {
    const storage = new PluginStorage(
        database,
        options.stageRoot,
        options.activeRoot,
      ),
      histories = storage.readVersions();
    const plugins = storage
      .read()
      .map((plugin) => ({
        ...plugin,
        ...(plugin.localPackagePath
          ? {
              localPackagePath: candidatePath(
                options.stageRoot,
                options.activeRoot,
                plugin.localPackagePath,
              ),
            }
          : {}),
      }));
    const pluginVersions = new Map<string, PluginVersion[]>();
    for (const version of histories) {
      const group = pluginVersions.get(version.pluginId) ?? [];
      group.push(version);
      pluginVersions.set(version.pluginId, group);
    }
    return { plugins, pluginVersions };
  }
  const root = path.join(options.stageRoot, "data", "plugins");
  const resources = new Map(
    bundlePaths(root, ["library.json", "versions.json", "market-cache.json"])
      .filter((directory) =>
        fs.existsSync(path.join(directory, "manifest.json")),
      )
      .map((directory) => {
        const resource = readPluginResourceBundle(directory);
        return [resource.plugin.id, { directory, resource }] as const;
      }),
  );
  const libraryPath = path.join(root, "library.json");
  const plugins = fs.existsSync(libraryPath)
    ? normalizeLibrary(JSON.parse(fs.readFileSync(libraryPath, "utf8"))).plugins
    : [...resources.values()].map(({ resource }) => resource.plugin);
  const versions = new Map<string, readonly PluginVersion[]>();
  const versionsPath = path.join(root, "versions.json");
  const legacyVersions = fs.existsSync(versionsPath)
    ? normalizePluginVersionsFile(
        JSON.parse(fs.readFileSync(versionsPath, "utf8")),
      ).versions
    : [];
  return {
    plugins: plugins.map((plugin) => {
      const bundle = resources.get(plugin.id);
      if (bundle) {
        versions.set(plugin.id, bundle.resource.versions);
        return {
          ...plugin,
          localPackagePath: path.join(bundle.directory, "files"),
        };
      }
      versions.set(
        plugin.id,
        legacyVersions.filter((version) => version.pluginId === plugin.id),
      );
      return {
        ...plugin,
        ...(plugin.localPackagePath
          ? {
              localPackagePath: candidatePath(
                options.stageRoot,
                options.activeRoot,
                plugin.localPackagePath,
              ),
            }
          : {}),
      };
    }),
    pluginVersions: versions,
  };
}

function collectGenerations(
  stageRoot: string,
): CanonicalGenerationShadowInput[] {
  const objectsRoot = path.join(stageRoot, "data", "assets", "objects");
  return bundlePaths(path.join(stageRoot, "data", "generations")).map(
    (directory) => {
      const resource = readGenerationResourceBundle(directory, objectsRoot);
      return {
        manifest: resource.manifest,
        bundleRevision: resource.bundleManifest.revision,
        outputSources: Object.fromEntries(
          resource.outputs.map((output) => [
            output.fileName,
            readContentAddressedObject(objectsRoot, output.sha256, {
              maxBytes: output.byteSize,
            }).path,
          ]),
        ),
      };
    },
  );
}

function collectMcp(options: CandidateOptions, database: DatabaseAdapter) {
  const root = path.join(options.stageRoot, "data", "mcp");
  if (new McpDB(database).state()?.adoptedAt)
    return { mcpResourceBundles: [], mcpHistorySourcePath: root };
  const bundles = bundlePaths(root, ["library.json", "market-sources.json"]);
  // Verified bundles retain all versions and secret references without decrypting.
  if (
    bundles.length ||
    !options.envelope.scope.mcp ||
    !options.envelope.payload.mcpLibrary?.servers.length
  ) {
    return { mcpResourceBundles: bundles };
  }
  const library = normalizeMcpLibrary(options.envelope.payload.mcpLibrary);
  return {
    mcpLibrary: mergeMcpLibraryFromTransport(
      { ...library, servers: [], bindings: [] },
      library,
    ),
  };
}

function prepareMcpSqliteCandidate(
  options: CandidateOptions,
  databasePath: string,
): void {
  if (!options.envelope.scope.mcp) return;
  const context = resolveRuntimeStorageContext(options.stageRoot, {
    identityRoot: options.activeRoot,
  });
  const historyRoot = path.join(context.dataPath, "mcp"),
    image = path.join(historyRoot, MCP_STORAGE_SNAPSHOT_FILE);
  const target = new DatabaseAdapter(databasePath);
  const active = new DatabaseAdapter(
    resolveRuntimeStorageContext(options.activeRoot).databasePath,
    { readOnly: true },
  );
  try {
    if (fs.existsSync(image)) {
      readMcpStorageSnapshotLibrary(image);
      if (options.envelope.payload.mcpLibrary)
        assertMcpSnapshotOverview(image, options.envelope.payload.mcpLibrary);
      importMcpStorageSnapshot(image, {
        database: target,
        historyRoot,
        storageContext: context,
      });
      fs.unlinkSync(image);
      const overview = path.join(historyRoot, "library.json");
      if (fs.existsSync(overview)) fs.unlinkSync(overview);
    } else {
      const keyId = new McpDB(active).state()?.keyId;
      target.transaction(() => clearMcpDatabaseState(target))();
      initializeMcpStorage({
        database: target,
        storageContext: context,
        deviceId: deriveLocalResourceDeviceId(options.activeRoot),
        keyId,
        credentialSourceDatabase: active,
      });
    }
    const records = new McpDB(target),
      knownIds = new Set(records.servers().map((row) => row.server.id));
    records.transaction(() => {
      records.clearBindings();
      for (const binding of new McpDB(active).bindings()) {
        const serverIds = binding.serverIds.filter((id) => knownIds.has(id));
        if (serverIds.length)
          records.putBinding({
            ...binding,
            serverIds,
            entryDigests: binding.entryDigests
              ? Object.fromEntries(
                  Object.entries(binding.entryDigests).filter(([id]) =>
                    knownIds.has(id),
                  ),
                )
              : undefined,
          });
      }
    });
  } finally {
    target.close();
    active.close();
  }
}

function retainMcpDeviceBindings(
  options: CandidateOptions,
  serverIds: ReadonlySet<string>,
): void {
  if (!options.envelope.scope.mcp) return;
  const bindingPath = path.join(
    options.stageRoot,
    "config",
    "devices",
    "mcp-bindings.json",
  );
  if (!fs.existsSync(bindingPath)) return;
  const previousIds = new Set(
    bundlePaths(path.join(options.activeRoot, "data", "mcp"), [
      "library.json",
      "market-sources.json",
    ]).map((directory) => readMcpServerResourceBundle(directory).server.id),
  );
  const document = parseMcpBindingConfigDocument(
    fs.readFileSync(bindingPath, "utf8"),
    {
      expectedDeviceId: deriveLocalResourceDeviceId(options.activeRoot),
      knownServerIds: previousIds,
    },
  );
  const bindings = document.bindings.flatMap((binding) => {
    const retainedIds = binding.serverIds.filter((id) => serverIds.has(id));
    if (!retainedIds.length) return [];
    const entryDigests = binding.entryDigests
      ? Object.fromEntries(
          Object.entries(binding.entryDigests).filter(([id]) =>
            serverIds.has(id),
          ),
        )
      : undefined;
    return [
      {
        ...binding,
        serverIds: retainedIds,
        ...(entryDigests ? { entryDigests } : {}),
      },
    ];
  });
  if (JSON.stringify(bindings) !== JSON.stringify(document.bindings))
    fs.writeFileSync(
      bindingPath,
      `${JSON.stringify({ ...document, bindings }, null, 2)}\n`,
      { mode: 0o600 },
    );
}

function publishCheckpointIntoCandidate(
  options: CandidateOptions,
  checkpointPath: string,
  manifest: CanonicalStorageCheckpointManifest,
): void {
  const data = path.join(options.stageRoot, "data");
  const canonical = path.join(checkpointPath, "canonical");
  // These domain metadata files are outside the resource catalog. Preserve
  // whichever files remain after the selected scopes have been merged.
  for (const relativePath of [
    "mcp/market-sources.json",
    "plugins/market-cache.json",
  ]) {
    const source = path.join(data, relativePath);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(canonical, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const name of [
    "catalog.json",
    "prompts",
    "folders",
    "tags",
    "relations",
    "output-formats",
    "skills",
    "rules",
    "rule-files",
    "mcp",
    "plugins",
    "plugin-files",
    "agents",
    "generations",
    "legacy-versions",
  ]) {
    fs.rmSync(path.join(data, name), { recursive: true, force: true });
  }
  // Attachments, unreferenced media, conversations and operation records remain
  // in the candidate. The graph reader verifies the replacement domain trees.
  fs.cpSync(canonical, data, { recursive: true, dereference: false });
  fs.copyFileSync(
    path.join(checkpointPath, "catalog", "prompthub.db"),
    path.join(data, "prompthub.db"),
  );
  writeRuntimeLayoutState(options.stageRoot, {
    identityRoot: options.activeRoot,
    lastVerifiedOperation: options.operationId,
  });
  writeCanonicalStorageAuthority(options.stageRoot, {
    identityRoot: options.activeRoot,
    operationId: options.operationId,
    consistencyId: manifest.consistencyId,
  });
}

export async function prepareCanonicalPortableCandidate(
  options: CandidateOptions,
): Promise<CanonicalStorageCheckpointManifest> {
  const databasePath = path.join(options.stageRoot, "data", "prompthub.db");
  const checkpointPath = path.join(
    options.stageRoot,
    ".portable-canonical-checkpoint",
  );
  try {
    prepareMcpSqliteCandidate(options, databasePath);
    const database = new DatabaseAdapter(databasePath, { readOnly: true });
    let checkpoint;
    try {
      const mcp = collectMcp(options, database);
      if (!new McpDB(database).state()?.adoptedAt)
        retainMcpDeviceBindings(
          options,
          new Set(
            mcp.mcpResourceBundles
              ? mcp.mcpResourceBundles.map(
                  (directory) =>
                    readMcpServerResourceBundle(directory).server.id,
                )
              : mcp.mcpLibrary.servers.map((server) => server.id),
          ),
        );
      checkpoint = await createCanonicalStorageCheckpoint({
        database,
        targetPath: checkpointPath,
        operationalSourceDatabasePath: databasePath,
        publishedCanonicalRootPath: path.join(options.activeRoot, "data"),
        deviceId: deriveLocalResourceDeviceId(options.activeRoot),
        skills: collectSkills(database, options),
        readRules: () => collectRules(database, options),
        ...collectPlugins(options, database),
        ...mcp,
        generations: options.generationSnapshot
          ? collectGenerations(options.stageRoot)
          : collectGenerationResources(database, options.stageRoot),
        agentProviders: options.agentProviders,
        resolvePromptMediaSource: (_prompt, kind, reference) =>
          path.join(
            options.stageRoot,
            "data",
            "assets",
            kind === "image" ? "images" : "videos",
            reference,
          ),
      });
    } finally {
      database.close();
    }
    publishCheckpointIntoCandidate(
      options,
      checkpointPath,
      checkpoint.manifest,
    );
    return checkpoint.manifest;
  } finally {
    fs.rmSync(checkpointPath, { recursive: true, force: true });
  }
}
