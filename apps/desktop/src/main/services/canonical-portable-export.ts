import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  acquireStorageMaintenanceIntent,
  assertPortableLogicalMatchesCanonicalStorage,
  deriveLocalResourceDeviceId,
  type ExtractedMcpSecret,
} from "@prompthub/core";

import { closeDatabase, initDatabase } from "../database";
import {
  createCanonicalCheckpointFromClosedDatabase,
  type CreateCanonicalCheckpointFromClosedDatabaseOptions,
} from "./canonical-storage-checkpoint";
import {
  createPortableSnapshotZip,
  type PortableZipScope,
  type PortableZipSourcePaths,
  isCompleteCanonicalPortableScope,
} from "./portable-snapshot-archive";

export interface CanonicalPortableExportOptions {
  activeRoot: string;
  databasePath: string;
  cachePath: string;
  destinationPath: string;
  sourcePaths: PortableZipSourcePaths;
  scope: PortableZipScope;
  persistExtractedMcpSecrets?: (
    secrets: readonly ExtractedMcpSecret[],
  ) => void | Promise<void>;
  onDatabaseReopened?: () => void;
}

export interface CanonicalPortableExportDependencies {
  closeDatabase: () => void;
  reopenDatabase: () => unknown;
  createCheckpoint: typeof createCanonicalCheckpointFromClosedDatabase;
  acquireMaintenance: (
    rootPath: string,
    input: { operationId: string; operationKind: string },
  ) => { release: () => void };
  createZip: typeof createPortableSnapshotZip;
  assertConsistency: typeof assertPortableLogicalMatchesCanonicalStorage;
}

const defaultDependencies: CanonicalPortableExportDependencies = {
  closeDatabase,
  reopenDatabase: initDatabase,
  createCheckpoint: createCanonicalCheckpointFromClosedDatabase,
  acquireMaintenance: acquireStorageMaintenanceIntent,
  createZip: createPortableSnapshotZip,
  assertConsistency: assertPortableLogicalMatchesCanonicalStorage,
};

function combineFailure(current: unknown, next: unknown): unknown {
  if (!current) return next;
  return new AggregateError(
    [current, next],
    "Canonical portable export cleanup failed",
  );
}

export async function createCheckpointedPortableSnapshotZip(
  options: CanonicalPortableExportOptions,
  dependencies: CanonicalPortableExportDependencies = defaultDependencies,
): Promise<{ filePath: string; consistencyId: string }> {
  const operationId = crypto.randomUUID();
  const maintenanceOperationId = `portable-${operationId}`;
  const checkpointPath = path.join(
    path.resolve(options.cachePath),
    "canonical-checkpoints",
    operationId,
  );
  let failure: unknown = null;
  let result: { filePath: string; consistencyId: string } | null = null;
  let maintenance: { release: () => void } | null = null;
  let databaseClosed = false;
  try {
    if (!isCompleteCanonicalPortableScope(options.scope)) {
      throw new Error(
        "Canonical portable export requires every durable scope to be selected",
      );
    }
    if (typeof options.scope.exportJson !== "string") {
      throw new Error("Canonical portable export requires a logical envelope");
    }
    maintenance = dependencies.acquireMaintenance(options.activeRoot, {
      operationId: maintenanceOperationId,
      operationKind: "portable-export",
    });
    dependencies.closeDatabase();
    databaseClosed = true;
    const checkpointOptions: CreateCanonicalCheckpointFromClosedDatabaseOptions =
      {
        activeRoot: options.activeRoot,
        sourceDatabasePath: options.databasePath,
        targetPath: checkpointPath,
        deviceId: deriveLocalResourceDeviceId(options.activeRoot),
        persistExtractedMcpSecrets: options.persistExtractedMcpSecrets,
        maintenanceOperationId,
        includeMcpSnapshot: true,
      };
    const checkpoint = await dependencies.createCheckpoint(checkpointOptions);
    dependencies.assertConsistency(
      options.scope.exportJson,
      path.join(checkpoint.targetPath, "canonical"),
    );
    result = await dependencies.createZip({
      destinationPath: options.destinationPath,
      sourcePaths: {
        ...options.sourcePaths,
        canonicalCheckpointPath: checkpoint.targetPath,
      },
      scope: options.scope,
    });
  } catch (error) {
    failure = error;
  } finally {
    try {
      maintenance?.release();
    } catch (error) {
      failure = combineFailure(failure, error);
    }
    fs.rmSync(checkpointPath, { recursive: true, force: true });
    if (databaseClosed) {
      try {
        dependencies.reopenDatabase();
        options.onDatabaseReopened?.();
      } catch (error) {
        failure = combineFailure(failure, error);
      }
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error("Canonical portable export produced no result");
  return result;
}
