import { migrateSkillPayloadFilesV1 } from "./migrations/skill-payload-files-v1";
import { migrateGenerationSqliteV1 } from "./migrations/generation-sqlite-v1";
import { migratePluginSqliteV1 } from "./migrations/plugin-sqlite-v1";
import { migrateSkillSqliteV1 } from "./migrations/skill-sqlite-v1";
import { migrateRuleMetadataV1 } from "./migrations/rule-metadata-v1";
import { migratePromptWorkspaceV1 } from "./migrations/prompt-workspace-v1";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  acquireDatabaseMigrationIntent,
  CanonicalResourceDB,
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
  DatabaseAdapter,
  FolderDB,
  inspectDatabaseClientLeases,
  PromptDB,
  initDatabase,
  closeDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";
import { assertDatabaseCompatibility } from "@prompthub/db/database-migration-state";
import { publishCanonicalEntries } from "./canonical-entry-publication";
import { recoverStorageEntryPublications } from "./sqlite-entry-publication";
import {
  calculateCanonicalResourceCatalogHash,
  stageCanonicalStorageDatabase,
} from "./canonical-storage-shadow";
import { calculatePromptCanonicalGraphHash } from "./prompt-canonical-catalog";
import { collectPromptCanonicalGraph } from "./prompt-canonical-export";
import { recoverCanonicalResourcePublications } from "./resource-bundle-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { acquireStorageMaintenanceIntent } from "./storage-maintenance-intent";

import { migrateSkillPackageInternalsV1 } from "./migrations/skill-package-internals-v1";
import { migrateAgentProviderSqliteV1 } from "./migrations/agent-provider-sqlite-v1";
import { migratePromptSqliteV1 } from "./migrations/prompt-sqlite-v1";

const DATABASE_SIDECARS = ["-journal", "-shm", "-wal"] as const;

export interface ReconcileCanonicalStorageCatalogOptions {
  activeRoot: string;
  databasePath: string;
}

interface CatalogHashes {
  promptGraphHash: string;
  resourceCatalogHash: string;
}

function quickCheck(database: DatabaseAdapter.Database): void {
  const rows = database.pragma("quick_check") as Array<{
    quick_check?: unknown;
  }>;
  if (rows.length !== 1 || rows[0]?.quick_check !== "ok") {
    throw new Error("Canonical SQLite projection failed quick_check");
  }
}

function readCatalogHashes(databasePath: string): CatalogHashes {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    quickCheck(database);
    return {
      promptGraphHash: calculatePromptCanonicalGraphHash(
        collectPromptCanonicalGraph(
          new PromptDB(database),
          new FolderDB(database),
          database,
        ),
      ),
      resourceCatalogHash: calculateCanonicalResourceCatalogHash(
        new CanonicalResourceDB(database).list(),
      ),
    };
  } finally {
    database.close();
  }
}

function currentCatalogHashes(databasePath: string): CatalogHashes | undefined {
  try {
    return readCatalogHashes(databasePath);
  } catch {
    // Logical damage to a derived catalog does not make operational rows disposable.
    return undefined;
  }
}

function operationalSource(
  options: ReconcileCanonicalStorageCatalogOptions,
): string {
  try {
    const stats = fs.lstatSync(options.databasePath);
    if (!stats.isFile())
      throw new Error("Canonical database path is not a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (
      DATABASE_SIDECARS.some((suffix) =>
        fs.existsSync(`${options.databasePath}${suffix}`),
      )
    ) {
      throw new Error(
        "Missing canonical database has sidecar recovery material",
      );
    }
    throw new Error("Authoritative SQLite is missing; recovery is required", {
      cause: error,
    });
  }
  try {
    const database = new DatabaseAdapter(options.databasePath, {
      readOnly: true,
    });
    try {
      quickCheck(database);
    } finally {
      database.close();
    }
  } catch (cause) {
    throw new Error(
      "Canonical database is not readable; operational state cannot be preserved",
      { cause },
    );
  }
  // Never turn an unsupported future schema into a freshly rebuilt older one.
  assertDatabaseCompatibility(options.databasePath);
  return options.databasePath;
}

function sameHashes(
  current: CatalogHashes | undefined,
  expected: CatalogHashes,
): boolean {
  return (
    current?.promptGraphHash === expected.promptGraphHash &&
    current.resourceCatalogHash === expected.resourceCatalogHash
  );
}

function publishCatalog(
  options: ReconcileCanonicalStorageCatalogOptions,
  stagedPath: string,
  expected: CatalogHashes,
): void {
  publishCanonicalEntries({
    rootPath: options.activeRoot,
    operationKey: "canonical-catalog",
    entries: [
      {
        targetPath: options.databasePath,
        prepare(stage) {
          fs.renameSync(stagedPath, stage);
        },
      },
      ...DATABASE_SIDECARS.map((suffix) => ({
        targetPath: `${options.databasePath}${suffix}`,
        delete: true as const,
      })),
    ],
    verify() {
      if (!sameHashes(readCatalogHashes(options.databasePath), expected)) {
        throw new Error("Canonical SQLite projection verification failed");
      }
    },
  });
}

function reconcileWithMaintenance(
  options: ReconcileCanonicalStorageCatalogOptions,
): { status: "current" | "rebuilt" } {
  const leases = inspectDatabaseClientLeases(options.databasePath);
  if (leases.livePids.length > 0 || leases.unknownEntries.length > 0) {
    throw new Error(
      "Canonical catalog repair requires all database clients to be closed",
    );
  }
  recoverStorageEntryPublications(options.activeRoot);
  const dataPath = path.dirname(options.databasePath);
  recoverCanonicalResourcePublications(dataPath);
  migrateSkillPackageInternalsV1(options.activeRoot);
  const sourcePath = operationalSource(options);
  const source = new DatabaseAdapter(sourcePath);
  try {
    migrateAgentProviderSqliteV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migratePromptSqliteV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migratePluginSqliteV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migrateSkillSqliteV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migrateSkillPayloadFilesV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
      skillsRoot: path.join(options.activeRoot, "data", "skills"),
    });
    migrateRuleMetadataV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migrateGenerationSqliteV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
    migratePromptWorkspaceV1(source, {
      rootPath: options.activeRoot,
      databasePath: sourcePath,
    });
  } finally {
    source.close();
  }
  const current = currentCatalogHashes(sourcePath);
  const stagedPath = createOwnedTemporaryDatabasePath(
    dataPath,
    "catalog-rebuild",
  );
  try {
    const staged = stageCanonicalStorageDatabase(dataPath, stagedPath, {
      skillSourceDatabasePath: sourcePath,
      ruleSourceDatabasePath: sourcePath,
      promptSourceDatabasePath: sourcePath,
      operationalSourceDatabasePath: sourcePath,
      agentProviderSourceDatabasePath: sourcePath,
      pluginSourceDatabasePath: sourcePath,
      generationSourceDatabasePath: sourcePath,
      publishedCanonicalRootPath: dataPath,
    });
    if (sameHashes(current, staged)) return { status: "current" };
    publishCatalog(options, stagedPath, staged);
    return { status: "rebuilt" };
  } finally {
    cleanupOwnedTemporaryDatabase(stagedPath);
  }
}

function upgradeSourceSchema(databasePath: string): void {
  const probe = new DatabaseAdapter(databasePath, { readOnly: true });
  let current: boolean;
  try {
    const rows = probe.pragma("user_version");
    current =
      Array.isArray(rows) &&
      rows.length === 1 &&
      typeof rows[0] === "object" &&
      rows[0] !== null &&
      "user_version" in rows[0] &&
      rows[0].user_version === CURRENT_DATABASE_SCHEMA_VERSION;
  } finally {
    probe.close();
  }
  if (current) return;
  const clients = inspectDatabaseClientLeases(databasePath);
  if (clients.livePids.length > 0 || clients.unknownEntries.length > 0)
    throw new Error(
      "Canonical catalog repair requires all database clients to be closed",
    );
  try {
    initDatabase(databasePath);
  } finally {
    closeDatabase();
  }
}

export function reconcileCanonicalStorageCatalog(
  input: ReconcileCanonicalStorageCatalogOptions,
): { status: "current" | "rebuilt" } {
  const activeRoot = path.resolve(input.activeRoot);
  const databasePath = path.resolve(input.databasePath);
  if (databasePath !== path.join(activeRoot, "data", "prompthub.db")) {
    throw new Error("Canonical catalog path does not match its bound root");
  }
  assertStoragePathComponentsSafe(activeRoot, databasePath);
  const maintenance = acquireStorageMaintenanceIntent(activeRoot, {
    operationId: `catalog-reconcile-${crypto.randomUUID()}`,
    operationKind: "catalog-reconcile",
  });
  try {
    recoverStorageEntryPublications(activeRoot);
    // Catalog maintenance preserves an already upgraded business database. Domain
    // conversions below must not write into an older schema before its migration.
    const sourcePath = operationalSource({ activeRoot, databasePath });
    upgradeSourceSchema(sourcePath);
    const migration = acquireDatabaseMigrationIntent(databasePath, {
      timeoutMs: 0,
    });
    try {
      return reconcileWithMaintenance({ ...input, activeRoot, databasePath });
    } finally {
      migration.release();
    }
  } finally {
    maintenance.release();
  }
}
