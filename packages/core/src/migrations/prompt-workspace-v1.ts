import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  createDatabaseSafetyPoint,
  FolderDB,
  PromptDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import { type CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import {
  calculatePromptCanonicalGraphHash,
  insertMissingPromptGraphRows,
  normalizePromptGraphForDatabase,
} from "../prompt-canonical-catalog";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import {
  readLegacyPromptWorkspace,
  workspacePromptProjection,
  workspaceVersionProjection,
} from "../prompt-workspace/legacy-reader";
import { getPromptWorkspaceRestoreMarkerPath } from "../prompt-workspace/restore-marker";
import {
  readLegacyWebPromptWorkspace,
  webWorkspacePromptProjection,
} from "../prompt-workspace/web-legacy-reader";
import type { Prompt } from "@prompthub/shared/types";

const MIGRATION_NAME = "prompt-workspace-v1";
const SOURCE_ENTRIES = ["prompts", ".versions", "folders.json"];
const HASH_BUFFER_BYTES = 64 * 1024;
interface SourceFile {
  relative: string;
  sha256: string;
}

function hashFile(file: string): string {
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  const digest = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  try {
    let length: number;
    while (
      (length = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0
    )
      digest.update(buffer.subarray(0, length));
    return digest.digest("hex");
  } finally {
    fs.closeSync(descriptor);
  }
}

function inventory(root: string, target: string, files: SourceFile[]): void {
  assertStoragePathComponentsSafe(root, target);
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink())
    throw new Error("Historical Prompt workspace symlink is unsafe");
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target).sort())
      inventory(root, path.join(target, name), files);
  } else if (stat.isFile())
    files.push({
      relative: path.relative(root, target),
      sha256: hashFile(target),
    });
  else throw new Error("Historical Prompt workspace entry is unsafe");
}

function merge<T extends { id: string }>(
  current: T[],
  historical: T[],
  project: (entry: T) => unknown = (entry) => entry,
): T[] {
  const result = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of historical) {
    const prior = result.get(entry.id);
    if (prior && !isDeepStrictEqual(project(prior), project(entry)))
      throw new Error(`Historical Prompt workspace conflict: ${entry.id}`);
    if (!prior) result.set(entry.id, entry);
  }
  return [...result.values()];
}

function mergeWorkspace(
  current: PromptCanonicalGraphSnapshot,
  historical: PromptCanonicalGraphSnapshot,
  projectPrompt: (prompt: Prompt) => unknown,
): PromptCanonicalGraphSnapshot {
  return {
    ...current,
    prompts: merge(current.prompts, historical.prompts, projectPrompt),
    folders: merge(current.folders, historical.folders),
    promptVersions: merge(
      current.promptVersions,
      historical.promptVersions,
      workspaceVersionProjection,
    ),
  };
}

function completeMissingHistory(graph: PromptCanonicalGraphSnapshot): void {
  const owners = new Set(
    graph.promptVersions.map((version) => version.promptId),
  );
  for (const prompt of graph.prompts) {
    if (owners.has(prompt.id)) continue;
    if (prompt.currentVersion === 0) {
      prompt.currentVersion = 1;
      prompt.version = 1;
    }
    // An entrypoint without history retains its current content as one stable version.
    graph.promptVersions.push({
      id: `workspace-${crypto.createHash("sha256").update(prompt.id).digest("hex")}`,
      promptId: prompt.id,
      version: prompt.currentVersion,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      systemPromptEn: prompt.systemPromptEn,
      userPromptEn: prompt.userPromptEn,
      variables: prompt.variables,
      note: null,
      aiResponse: null,
      createdAt: prompt.updatedAt,
    });
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

function recoveryEntry(
  root: string,
  files: SourceFile[],
  migrationName: string,
): CanonicalEntryMutation {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  const targetPath = path.join(root, "recovery", migrationName, digest);
  assertStoragePathComponentsSafe(root, targetPath);
  const verify = (base: string): void => {
    for (const file of files) {
      const destination = path.join(base, file.relative);
      assertStoragePathComponentsSafe(root, destination);
      if (hashFile(destination) !== file.sha256)
        throw new Error("Historical Prompt recovery copy differs from source");
    }
  };
  return {
    targetPath,
    prepare(stage) {
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      for (const file of files) {
        const destination = path.join(stage, file.relative);
        fs.mkdirSync(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        fs.copyFileSync(
          path.join(root, file.relative),
          destination,
          fs.constants.COPYFILE_EXCL,
        );
      }
      verify(stage);
      if (fs.existsSync(targetPath)) verify(targetPath);
    },
  };
}

/** Ordered startup conversion; normal CRUD never reads or writes Markdown mirrors. */
export function migratePromptWorkspaceV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    /** Explicit historical format at the application upgrade boundary. */
    sourceFormat?: "desktop" | "web";
    injectFailure?: (targetPath: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  const isWebSource = options.sourceFormat === "web";
  const migrationName = isWebSource
    ? "web-prompt-workspace-v1"
    : MIGRATION_NAME;
  recoverSqliteEntryPublication(database, root, migrationName);
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      migrationName,
    ),
  );
  const marker = getPromptWorkspaceRestoreMarkerPath(root);
  assertStoragePathComponentsSafe(root, marker);
  const restored = fs.existsSync(marker);
  const sources: string[] = [];
  const files: SourceFile[] = [];
  const workspaces = isWebSource
    ? [path.join(root, "data")]
    : [path.join(root, "workspace"), path.join(root, "data")];
  for (const workspace of workspaces) {
    // Canonical JSON is converted by prompt-sqlite-v1 before this migration.
    if (fs.existsSync(path.join(workspace, "catalog.json")))
      throw new Error(
        "Canonical Prompt conversion must precede Markdown conversion",
      );
    for (const entry of isWebSource ? ["prompts"] : SOURCE_ENTRIES) {
      const target = path.join(workspace, entry);
      assertStoragePathComponentsSafe(root, target);
      if (!fs.existsSync(target)) continue;
      sources.push(target);
      inventory(root, target, files);
    }
  }
  if (completed && sources.length === 0 && !restored) return;
  if (completed && files.length > 0 && !restored)
    throw new Error(
      "Historical Prompt workspace reappeared; explicit recovery is required",
    );
  let graph = readGraph(database);
  if (!restored)
    for (const workspace of workspaces)
      graph = mergeWorkspace(
        graph,
        isWebSource
          ? readLegacyWebPromptWorkspace(path.join(workspace, "prompts"))
          : readLegacyPromptWorkspace(workspace),
        isWebSource ? webWorkspacePromptProjection : workspacePromptProjection,
      );
  const promptIds = new Set(graph.prompts.map((prompt) => prompt.id));
  // Old deletion could leave Markdown history behind. Preserve its exact files
  // in the recovery publication without inventing or resurrecting a parent row.
  graph.promptVersions = graph.promptVersions.filter((version) =>
    promptIds.has(version.promptId),
  );
  completeMissingHistory(graph);
  const expected = calculatePromptCanonicalGraphHash(graph);
  const commit = (): void =>
    database.transaction(() => {
      insertMissingPromptGraphRows(database, graph);
      if (calculatePromptCanonicalGraphHash(readGraph(database)) !== expected)
        throw new Error("Historical Prompt workspace SQL readback mismatch");
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        migrationName,
        Date.now(),
      );
    })();
  if (sources.length === 0 && !restored) {
    commit();
    return;
  }
  if (restored) inventory(root, marker, files);
  const entries: CanonicalEntryMutation[] = [
    recoveryEntry(root, files, migrationName),
    ...sources.map((targetPath) => ({ targetPath, delete: true })),
    ...(restored ? [{ targetPath: marker, delete: true }] : []),
  ];
  createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: migrationName,
    entries,
    commit,
    injectFailure: options.injectFailure,
  });
}
