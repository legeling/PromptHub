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
} from "@prompthub/db";
import { assertDatabaseCompatibility } from "@prompthub/db/database-migration-state";
import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublications,
} from "./canonical-entry-publication";
import {
  calculateCanonicalResourceCatalogHash,
  stageCanonicalStorageDatabase,
} from "./canonical-storage-shadow";
import { calculatePromptCanonicalGraphHash } from "./prompt-canonical-catalog";
import { collectPromptCanonicalGraph } from "./prompt-canonical-export";
import { recoverCanonicalResourcePublications } from "./resource-bundle-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { acquireStorageMaintenanceIntent } from "./storage-maintenance-intent";
import { migrateCanonicalSkillSources } from "./canonical-skill-sources";

const DATABASE_SIDECARS = ["-journal", "-shm", "-wal"] as const;

export interface ReconcileCanonicalStorageCatalogOptions {
  activeRoot: string;
  databasePath: string;
  /** Desktop's existing recovery flow can explicitly accept lost unreadable operational state. */
  unreadableDatabase?: "reject" | "rebuild";
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
): string | undefined {
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
    return undefined;
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
    if (options.unreadableDatabase === "rebuild") return undefined;
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
  recoverCanonicalEntryPublications(options.activeRoot);
  const dataPath = path.dirname(options.databasePath);
  recoverCanonicalResourcePublications(dataPath);
  const sourcePath = operationalSource(options);
  if (sourcePath) migrateCanonicalSkillSources(options.activeRoot, sourcePath);
  const current = sourcePath ? currentCatalogHashes(sourcePath) : undefined;
  const stagedPath = createOwnedTemporaryDatabasePath(
    dataPath,
    "catalog-rebuild",
  );
  try {
    const staged = stageCanonicalStorageDatabase(dataPath, stagedPath, {
      operationalSourceDatabasePath: sourcePath,
      publishedCanonicalRootPath: dataPath,
    });
    if (sameHashes(current, staged)) return { status: "current" };
    publishCatalog(options, stagedPath, staged);
    return { status: "rebuilt" };
  } finally {
    cleanupOwnedTemporaryDatabase(stagedPath);
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
