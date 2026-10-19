import crypto from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  createDatabaseSafetyPoint,
  FolderDB,
  PromptDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  PromptWorkspaceResolution,
  PromptWorkspaceReview,
} from "@prompthub/shared/types/prompt-workspace-recovery";
import {
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import {
  calculatePromptCanonicalGraphHash,
  insertMissingPromptGraphRows,
  normalizePromptGraphForDatabase,
} from "../prompt-canonical-catalog";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  completePromptWorkspaceHistory,
  planPromptWorkspaceUpgrade,
} from "../prompt-workspace/upgrade-plan";
import {
  inspectPromptWorkspaceFiles,
  promptWorkspaceRecoveryEntry,
  PROMPT_WORKSPACE_UPGRADE,
  type PromptWorkspaceInventory,
} from "../prompt-workspace/upgrade-files";

export interface PromptWorkspaceUpgradeOptions {
  rootPath: string;
  databasePath: string;
  resolution?: PromptWorkspaceResolution;
  injectFailure?: (targetPath: string) => void;
}

export class PromptWorkspaceRecoveryRequired extends Error {
  readonly code = "PROMPT_WORKSPACE_RECOVERY_REQUIRED";
  constructor(readonly review: PromptWorkspaceReview) {
    super("Historical Prompt workspace needs explicit conflict resolution");
    this.name = "PromptWorkspaceRecoveryRequired";
    Object.defineProperty(this, "review", { enumerable: false });
  }
}

function readGraph(
  database: DatabaseAdapter.Database,
): PromptCanonicalGraphSnapshot {
  return normalizePromptGraphForDatabase(
    collectPromptCanonicalGraph(
      new PromptDB(database),
      new FolderDB(database),
      database,
    ),
  );
}

function completionState(database: DatabaseAdapter.Database): {
  previous: boolean;
  current: boolean;
} {
  return {
    previous: Boolean(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "prompt-workspace-v1",
      ),
    ),
    current: Boolean(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        PROMPT_WORKSPACE_UPGRADE,
      ),
    ),
  };
}

function preparePlan(
  database: DatabaseAdapter.Database,
  options: PromptWorkspaceUpgradeOptions,
  inventory: PromptWorkspaceInventory,
) {
  const root = path.resolve(options.rootPath);
  const current = readGraph(database);
  const completed = completionState(database);
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        root,
        databasePath: path.resolve(options.databasePath),
        graph: calculatePromptCanonicalGraphHash(current),
        sources: inventory.digest,
        completed,
      }),
    )
    .digest("hex");
  if (options.resolution && options.resolution.fingerprint !== fingerprint)
    throw new Error(
      "Prompt workspace data changed after review; refresh before choosing again",
    );
  const review = {
    fingerprint,
    reappeared: completed.previous || completed.current,
    sourceFileCount: inventory.files.length,
  };
  if (inventory.restored)
    return { current, graph: current, review: { ...review, conflicts: [] } };
  return {
    current,
    ...planPromptWorkspaceUpgrade(root, current, review, options.resolution),
  };
}

export function inspectPromptWorkspaceUpgrade(
  database: DatabaseAdapter.Database,
  options: PromptWorkspaceUpgradeOptions,
): PromptWorkspaceReview {
  return preparePlan(
    database,
    options,
    inspectPromptWorkspaceFiles(path.resolve(options.rootPath)),
  ).review;
}

function changed<T extends { id: string }>(before: T[], after: T[]): T[] {
  const known = new Map(before.map((entry) => [entry.id, entry]));
  return after.filter(
    (entry) => !isDeepStrictEqual(known.get(entry.id), entry),
  );
}

function writeGraph(
  database: DatabaseAdapter.Database,
  current: PromptCanonicalGraphSnapshot,
  graph: PromptCanonicalGraphSnapshot,
): void {
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  // Add parents first using the existing graph insertion boundary. Version slots
  // are applied separately because only explicit review may replace a conflict.
  insertMissingPromptGraphRows(database, { ...graph, promptVersions: [] });
  for (const folder of changed(current.folders, graph.folders))
    folders.insertFolderDirect(folder);
  for (const prompt of changed(current.prompts, graph.prompts))
    prompts.insertPromptDirect(prompt);
  prompts.replaceVersionsForRecovery(
    changed(current.promptVersions, graph.promptVersions),
  );
}

/** Successor to the immutable released v1; only this boundary admits reviewed changes. */
export function migratePromptWorkspaceV2(
  database: DatabaseAdapter.Database,
  options: PromptWorkspaceUpgradeOptions,
): { status: "current" | "migrated"; recoveryPath?: string } {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, "prompt-workspace-v1");
  recoverSqliteEntryPublication(database, root, PROMPT_WORKSPACE_UPGRADE);
  const inventory = inspectPromptWorkspaceFiles(root);
  if (completionState(database).current && inventory.entries.length === 0)
    return { status: "current" };
  const plan = preparePlan(database, options, inventory);
  if (plan.review.conflicts.length > 0 && !options.resolution)
    throw new PromptWorkspaceRecoveryRequired(plan.review);
  if (inventory.files.length > 0 && !inventory.restored)
    completePromptWorkspaceHistory(plan.graph);
  const expected = calculatePromptCanonicalGraphHash(plan.graph);
  const recovery =
    inventory.entries.length > 0
      ? promptWorkspaceRecoveryEntry(root, inventory)
      : null;
  const entries = recovery
    ? [
        recovery,
        ...inventory.entries.map((targetPath) => ({
          targetPath,
          delete: true,
        })),
      ]
    : [];
  if (entries.length > 0)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: PROMPT_WORKSPACE_UPGRADE,
    entries,
    injectFailure: options.injectFailure,
    beforePublish() {
      const latest = preparePlan(
        database,
        { ...options, resolution: undefined },
        inspectPromptWorkspaceFiles(root),
      );
      if (latest.review.fingerprint !== plan.review.fingerprint)
        throw new Error(
          "Prompt workspace data changed during recovery preparation",
        );
    },
    commit() {
      writeGraph(database, plan.current, plan.graph);
      if (calculatePromptCanonicalGraphHash(readGraph(database)) !== expected)
        throw new Error("Historical Prompt workspace SQL readback mismatch");
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        PROMPT_WORKSPACE_UPGRADE,
        Date.now(),
      );
    },
  });
  return {
    status: "migrated",
    ...(recovery ? { recoveryPath: recovery.targetPath } : {}),
  };
}
