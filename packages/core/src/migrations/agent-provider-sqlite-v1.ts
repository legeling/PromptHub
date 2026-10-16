import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  AgentProviderProfileDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared";
import {
  readAgentProviderResourceBundle,
  type ReadAgentProviderResourceResult,
} from "../agent-resource-schema";
import { type CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { readPromptCanonicalGraph } from "../prompt-canonical-import";

const MIGRATION_NAME = "agent-provider-sqlite-v1";

interface HistoricalProvider {
  source: string;
  backup: string;
  resource: ReadAgentProviderResourceResult;
}

interface ProviderGraph {
  profile: AgentProviderProfile;
  mappings: AgentProviderModelMapping[];
}

function readHistoricalProviders(root: string): HistoricalProvider[] {
  const directory = path.join(root, "data", "agents");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  if (!fs.lstatSync(directory).isDirectory())
    throw new Error("Historical Agent provider directory is unsafe");
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Historical Agent provider bundle is unsafe");
    const source = path.join(directory, entry.name);
    const resource = readAgentProviderResourceBundle(source);
    if (entry.name !== encodeCanonicalResourceDirectory(resource.profile.id))
      throw new Error("Historical Agent provider bundle identity mismatch");
    const backup = path.join(
      root,
      "recovery",
      MIGRATION_NAME,
      entry.name,
      resource.bundleManifest.contentHash,
    );
    assertStoragePathComponentsSafe(root, backup);
    return { source, backup, resource };
  });
}

function currentGraphs(
  database: DatabaseAdapter.Database,
): Map<string, ProviderGraph> {
  const repository = new AgentProviderProfileDB(database);
  const profiles = repository.listProfiles({ includeArchived: true });
  const mappings = repository.listModelMappingsForProfiles(
    profiles.map((profile) => profile.id),
  );
  const graphs = new Map<string, ProviderGraph>(
    profiles.map((profile) => [profile.id, { profile, mappings: [] }]),
  );
  for (const mapping of mappings)
    graphs.get(mapping.providerProfileId)!.mappings.push(mapping);
  return graphs;
}

function sameProfile(
  left: AgentProviderProfile,
  right: AgentProviderProfile,
): boolean {
  // Bundles intentionally store only secret availability. SQLite keeps the
  // actual device reference, including references that predate deterministic IDs.
  return isDeepStrictEqual(
    { ...left, secretRef: Boolean(left.secretRef) },
    { ...right, secretRef: Boolean(right.secretRef) },
  );
}

function sameMappings(
  left: AgentProviderModelMapping[],
  right: AgentProviderModelMapping[],
): boolean {
  const byRoute = (values: AgentProviderModelMapping[]) =>
    [...values].sort((a, b) => a.routeKey.localeCompare(b.routeKey));
  return isDeepStrictEqual(byRoute(left), byRoute(right));
}

function planNewGraphs(
  current: Map<string, ProviderGraph>,
  historical: HistoricalProvider[],
  completed: boolean,
): ProviderGraph[] {
  const additions: ProviderGraph[] = [];
  const mappingOwners = new Map<string, string>();
  for (const graph of current.values())
    for (const mapping of graph.mappings)
      mappingOwners.set(mapping.id, graph.profile.id);
  for (const { resource } of historical) {
    const prior = current.get(resource.profile.id);
    if (prior) {
      if (
        !sameProfile(prior.profile, resource.profile) ||
        !sameMappings(prior.mappings, resource.modelMappings)
      )
        throw new Error(
          `Agent provider migration conflict: ${resource.profile.id}`,
        );
      continue;
    }
    if (completed)
      throw new Error(
        `Agent provider migration conflict: retired profile ${resource.profile.id} is absent from SQLite`,
      );
    for (const mapping of resource.modelMappings) {
      if (mappingOwners.has(mapping.id))
        throw new Error(
          `Agent provider mapping identity conflict: ${mapping.id}`,
        );
      mappingOwners.set(mapping.id, resource.profile.id);
    }
    const graph = {
      profile: resource.profile,
      mappings: resource.modelMappings,
    };
    additions.push(graph);
    current.set(resource.profile.id, graph);
  }
  return additions;
}

function verifyCopy(file: string, expected: HistoricalProvider): void {
  const copied = readAgentProviderResourceBundle(file);
  if (
    copied.bundleManifest.contentHash !==
      expected.resource.bundleManifest.contentHash ||
    !isDeepStrictEqual(copied.bundleManifest, expected.resource.bundleManifest)
  )
    throw new Error("Agent provider recovery copy does not match its source");
}

function retirementEntries(
  historical: HistoricalProvider[],
): CanonicalEntryMutation[] {
  return historical.flatMap((entry) => {
    const entries: CanonicalEntryMutation[] = [];
    if (fs.existsSync(entry.backup)) verifyCopy(entry.backup, entry);
    else
      entries.push({
        targetPath: entry.backup,
        prepare(stage) {
          fs.cpSync(entry.source, stage, {
            recursive: true,
            dereference: false,
            errorOnExist: true,
            force: false,
          });
          verifyCopy(stage, entry);
        },
      });
    entries.push({ targetPath: entry.source, delete: true });
    return entries;
  });
}

function assertIndependentBundles(root: string): void {
  const data = path.join(root, "data");
  if (!fs.existsSync(path.join(data, "catalog.json"))) return;
  const graph = readPromptCanonicalGraph(data);
  if (graph.manifest.files.some((file) => file.path.startsWith("agents/")))
    throw new Error(
      "Historical Agent provider bundles require explicit graph inventory repair",
    );
}

function commitGraphs(
  database: DatabaseAdapter.Database,
  additions: ProviderGraph[],
): void {
  database.transaction(() => {
    const repository = new AgentProviderProfileDB(database);
    for (const graph of additions)
      repository.insertProfileGraphDirect(graph.profile, graph.mappings);
    database.run(
      "DELETE FROM canonical_resources WHERE resource_type = ?",
      "agent-provider",
    );
    database.run(
      "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      MIGRATION_NAME,
      Date.now(),
    );
  })();
}

/** Only bootstrap calls this conversion; normal repositories never import bundles. */
export function migrateAgentProviderSqliteV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    injectFailure?: (targetPath: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const historical = readHistoricalProviders(root);
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
  if (completed && historical.length === 0) return;
  const additions = planNewGraphs(
    currentGraphs(database),
    historical,
    completed,
  );
  if (historical.length > 0) {
    assertIndependentBundles(root);
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  }
  const commit = () => commitGraphs(database, additions);
  if (historical.length === 0) {
    commit();
    return;
  }
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: MIGRATION_NAME,
    entries: retirementEntries(historical),
    injectFailure: options.injectFailure,
    verify() {
      for (const entry of historical) {
        if (fs.existsSync(entry.source))
          throw new Error("Agent provider source retirement failed");
        verifyCopy(entry.backup, entry);
      }
    },
    commit,
  });
}
