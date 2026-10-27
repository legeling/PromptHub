import { captureSnapshotSkillPackages } from "./workspace-snapshot-files";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DatabaseAdapter,
  db as activeDatabase,
  createConsistentDatabaseImage,
  getDatabaseSafetyPointRoot,
  initDatabase,
  closeDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";
import { assertDatabaseCompatibility } from "@prompthub/db/database-migration-state";
import {
  createStorageInventory,
  copyStorageInventory,
  verifyStorageInventory,
  type StorageInventory,
} from "./storage-inventory";
import {
  createPortableSnapshot,
  readPortableSnapshot,
  type PortableSnapshotResult,
} from "./portable-snapshot";
import { writeCanonicalStorageAuthority } from "./canonical-storage-authority";
import { writeRuntimeLayoutState } from "./runtime-storage-context";
import {
  runJournaledStorageRestore,
  type StorageRestorePublicationStage,
  type StorageRestoreResult,
} from "./journaled-storage-restore";
import { acquireStorageMaintenanceIntent } from "./storage-maintenance-intent";
import {
  sanitizeSnapshotDatabase,
  relocateSnapshotPaths,
  retainSnapshotDeviceState,
} from "./workspace-snapshot-policy";

export const WORKSPACE_SNAPSHOT_FILE = "workspace-snapshot.json";
export const WORKSPACE_SNAPSHOT_KIND = "prompthub-workspace-snapshot";
const MAX_HEADER_BYTES = 4096;
const DATABASE_FILE = "data/prompthub.db";
const EXCLUDED_PATHS = [
  DATABASE_FILE,
  "secrets",
  "config",
  "data/recovery",
  "data/operations/journals",
  "data/operations/storage-maintenance.json",
];

function assertDatabaseClosed(): void {
  if (activeDatabase)
    throw new Error(
      "Close the active database before a workspace snapshot operation",
    );
}

function verifyDatabase(file: string): void {
  assertDatabaseCompatibility(file);
  const db = new DatabaseAdapter(file, { readOnly: true });
  try {
    const rows = db.pragma("quick_check") as Array<{ quick_check: string }>;
    if (
      rows.length !== 1 ||
      rows[0].quick_check !== "ok" ||
      (db.pragma("foreign_key_check") as unknown[]).length
    )
      throw new Error("Workspace snapshot database integrity failed");
  } finally {
    db.close();
  }
}

export function createWorkspaceSnapshot(options: {
  activeRoot: string;
  destinationPath: string;
}): PortableSnapshotResult {
  assertDatabaseClosed();
  const source = path.resolve(options.activeRoot);
  const working = `${options.destinationPath}.capture-${crypto.randomUUID()}`;
  const maintenance = acquireStorageMaintenanceIntent(source, {
    operationId: crypto.randomUUID(),
    operationKind: "workspace-snapshot",
  });
  try {
    verifyDatabase(path.join(source, DATABASE_FILE));
    const inventory = createStorageInventory(source, {
      includeSecrets: false,
      excludeRelativePaths: EXCLUDED_PATHS,
    });
    copyStorageInventory(inventory, working);
    createConsistentDatabaseImage(
      path.join(source, DATABASE_FILE),
      path.join(working, DATABASE_FILE),
    );
    const db = new DatabaseAdapter(path.join(working, DATABASE_FILE));
    try {
      captureSnapshotSkillPackages(db, source, working);
      sanitizeSnapshotDatabase(db, source);
    } finally {
      db.close();
    }
    verifyDatabase(path.join(working, DATABASE_FILE));
    return createPortableSnapshot({
      sourceRoot: working,
      destinationPath: options.destinationPath,
      scopes: [
        {
          id: "workspace",
          sourcePath: path.join(working, "data"),
          archivePath: "data",
        },
      ],
      generatedFiles: [
        {
          archivePath: WORKSPACE_SNAPSHOT_FILE,
          content: Buffer.from(
            JSON.stringify({
              kind: WORKSPACE_SNAPSHOT_KIND,
              version: 1,
              databaseSchemaVersion: CURRENT_DATABASE_SCHEMA_VERSION,
              layoutEpoch: 1,
            }),
          ),
        },
      ],
      omissions: [
        "Device credentials, device configuration, caches, logs and recovery copies",
      ],
    });
  } finally {
    try {
      fs.rmSync(working, { recursive: true, force: true });
    } finally {
      maintenance.release();
    }
  }
}

export function isWorkspaceSnapshot(snapshot: PortableSnapshotResult): boolean {
  return snapshot.manifest.entries.some(
    (entry) => entry.path === WORKSPACE_SNAPSHOT_FILE,
  );
}
export function validateWorkspaceSnapshot(
  snapshot: PortableSnapshotResult,
): void {
  const entry = snapshot.manifest.entries.find(
    (item) => item.path === WORKSPACE_SNAPSHOT_FILE,
  );
  if (!entry || entry.sizeBytes > MAX_HEADER_BYTES)
    throw new Error("Missing workspace snapshot header");
  const header = JSON.parse(
    fs.readFileSync(path.join(snapshot.path, WORKSPACE_SNAPSHOT_FILE), "utf8"),
  );
  if (
    header.kind !== WORKSPACE_SNAPSHOT_KIND ||
    header.version !== 1 ||
    header.layoutEpoch !== 1 ||
    !Number.isInteger(header.databaseSchemaVersion) ||
    header.databaseSchemaVersion > CURRENT_DATABASE_SCHEMA_VERSION
  )
    throw new Error(
      "Unsupported newer workspace snapshot; upgrade PromptHub before restoring",
    );
  if (
    snapshot.manifest.entries.some(
      (item) =>
        item.path !== WORKSPACE_SNAPSHOT_FILE && !item.path.startsWith("data/"),
    )
  )
    throw new Error("Workspace snapshot contains an unexpected root entry");
  if (
    snapshot.manifest.entries.some(
      (item) =>
        [
          "data/operations/journals/",
          "data/recovery/",
          "data/prompthub.db.clients/",
        ].some((prefix) => item.path.startsWith(prefix)) ||
        /^data\/prompthub\.db-(wal|shm|journal)$/.test(item.path),
    )
  )
    throw new Error("Workspace snapshot contains transient recovery data");
  verifyDatabase(path.join(snapshot.path, DATABASE_FILE));
}

export async function restoreWorkspaceSnapshot(options: {
  snapshotPath: string;
  activeRoot: string;
  migrateCandidate?: (root: string, database: DatabaseAdapter.Database) => void;
  injectFailure?: (stage: StorageRestorePublicationStage) => void;
}): Promise<StorageRestoreResult> {
  assertDatabaseClosed();
  const snapshot = readPortableSnapshot(options.snapshotPath);
  validateWorkspaceSnapshot(snapshot);
  let candidateInventory: StorageInventory | undefined;
  return runJournaledStorageRestore({
    activeRoot: options.activeRoot,
    entryNames: ["data"],
    injectFailure: options.injectFailure,
    prepareCandidate(stage) {
      // Only manifest-verified files enter the stage. Device config and vault stay outside the swap.
      for (const entry of snapshot.manifest.entries) {
        if (entry.path === WORKSPACE_SNAPSHOT_FILE) continue;
        const target = path.join(stage, entry.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(snapshot.path, entry.path), target);
      }
      writeRuntimeLayoutState(stage);
      if (fs.existsSync(path.join(stage, "data/.authority-state.json")))
        writeCanonicalStorageAuthority(stage, {
          consistencyId: snapshot.manifest.consistencyId,
          operationId: crypto.randomUUID(),
        });
      const db = initDatabase(path.join(stage, DATABASE_FILE));
      try {
        sanitizeSnapshotDatabase(db, stage);
        relocateSnapshotPaths(db, stage, false);
        options.migrateCandidate?.(stage, db);
        relocateSnapshotPaths(db, stage, true);
        relocateSnapshotPaths(db, options.activeRoot, false);
        const local = new DatabaseAdapter(
          path.join(options.activeRoot, DATABASE_FILE),
          { readOnly: true },
        );
        try {
          retainSnapshotDeviceState(db, local);
        } finally {
          local.close();
        }
      } finally {
        closeDatabase();
      }
      writeRuntimeLayoutState(stage, { identityRoot: options.activeRoot });
      if (fs.existsSync(path.join(stage, "data/.authority-state.json")))
        writeCanonicalStorageAuthority(stage, {
          identityRoot: options.activeRoot,
          consistencyId: snapshot.manifest.consistencyId,
          operationId: crypto.randomUUID(),
        });
      verifyDatabase(path.join(stage, DATABASE_FILE));
      // Startup migrations create safety copies in the owned candidate. The
      // verified input archive and restore journal already retain both originals;
      // candidate-only migration copies must not be published as business data.
      fs.rmSync(
        path.dirname(
          getDatabaseSafetyPointRoot(path.join(stage, DATABASE_FILE)),
        ),
        { recursive: true, force: true },
      );
      candidateInventory = createStorageInventory(stage, {
        detachedLayoutEpoch: 1,
        excludeRelativePaths: ["config", "secrets"],
      });
    },
    verifyCandidate(root) {
      verifyDatabase(path.join(root, DATABASE_FILE));
    },
    verifyActive(root) {
      if (!candidateInventory)
        throw new Error("Missing workspace restore inventory");
      verifyStorageInventory(candidateInventory, root);
      verifyDatabase(path.join(root, DATABASE_FILE));
    },
  });
}
