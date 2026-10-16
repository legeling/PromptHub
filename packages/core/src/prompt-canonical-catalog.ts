import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
  recordCurrentDatabaseMigration,
  recordCurrentLegacySchemaMigrations,
  type Database,
} from "@prompthub/db";

import {
  collectPromptCanonicalGraph,
  validatePromptCanonicalGraphSnapshot,
  type PromptCanonicalGraphCounts,
  type PromptCanonicalGraphSnapshot,
} from "./prompt-canonical-export";
import { readPromptCanonicalGraph } from "./prompt-canonical-import";
import { deriveCanonicalTagId } from "./prompt-resource-schema";

export interface PromptCanonicalCatalogBuildResult {
  databasePath: string;
  sourceCatalogCreatedAt: string;
  counts: PromptCanonicalGraphCounts;
  graphHash: string;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortSnapshot(snapshot: PromptCanonicalGraphSnapshot) {
  return {
    prompts: [...snapshot.prompts].sort((a, b) => compareText(a.id, b.id)),
    promptVersions: [...snapshot.promptVersions].sort(
      (a, b) => compareText(a.promptId, b.promptId) || a.version - b.version,
    ),
    folders: [...snapshot.folders].sort((a, b) => compareText(a.id, b.id)),
    promptRelations: [...snapshot.promptRelations].sort((a, b) =>
      compareText(a.id, b.id),
    ),
    outputFormatItems: [...snapshot.outputFormatItems].sort((a, b) =>
      compareText(a.id, b.id),
    ),
  };
}

export function normalizePromptGraphForDatabase(
  snapshot: PromptCanonicalGraphSnapshot,
): PromptCanonicalGraphSnapshot {
  return {
    prompts: snapshot.prompts.map((prompt) => ({
      ...prompt,
      ownerUserId: prompt.ownerUserId ?? undefined,
      visibility: prompt.visibility ?? "private",
      description: prompt.description ?? null,
      promptType: prompt.promptType ?? "text",
      systemPrompt: prompt.systemPrompt ?? null,
      systemPromptEn: prompt.systemPromptEn ?? null,
      userPromptEn: prompt.userPromptEn ?? null,
      folderId: prompt.folderId ?? null,
      parentId: prompt.parentId ?? null,
      order: prompt.order ?? 0,
      images: prompt.images!,
      videos: prompt.videos!,
      source: prompt.source ?? null,
      notes: prompt.notes ?? null,
      lastAiResponse: prompt.lastAiResponse ?? null,
    })),
    promptVersions: snapshot.promptVersions.map((version) => ({
      ...version,
      systemPrompt: version.systemPrompt ?? null,
      systemPromptEn: version.systemPromptEn ?? null,
      userPromptEn: version.userPromptEn ?? null,
      note: version.note ?? null,
      aiResponse: version.aiResponse ?? null,
    })),
    folders: snapshot.folders.map((folder) => ({
      ...folder,
      ownerUserId: folder.ownerUserId ?? undefined,
      visibility: folder.visibility ?? "private",
      icon: folder.icon ?? undefined,
      parentId: folder.parentId ?? undefined,
      order: folder.order,
      isPrivate: folder.isPrivate ?? false,
    })),
    promptRelations: snapshot.promptRelations.map((relation) => ({
      ...relation,
      note: relation.note ?? null,
    })),
    outputFormatItems: snapshot.outputFormatItems.map((item) => ({ ...item })),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function calculatePromptCanonicalGraphHash(
  snapshot: PromptCanonicalGraphSnapshot,
): string {
  validatePromptCanonicalGraphSnapshot(snapshot);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(sortSnapshot(snapshot))), "utf8")
    .digest("hex");
}

function assertLocalOwnership(snapshot: PromptCanonicalGraphSnapshot): void {
  const owner = [...snapshot.prompts, ...snapshot.folders].find(
    (item) => item.ownerUserId !== undefined && item.ownerUserId !== null,
  );
  if (owner) {
    throw new Error(
      `local canonical catalog cannot rebuild server-owned user reference: ${owner.id}`,
    );
  }
}

function orderParentsFirst<T extends { id: string; parentId?: string | null }>(
  values: readonly T[],
  label: string,
): T[] {
  const byId = new Map(values.map((value) => [value.id, value]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];

  for (const value of values) {
    if (!value.parentId) {
      roots.push(value);
      continue;
    }
    if (!byId.has(value.parentId)) {
      throw new Error(`${label} ${value.id} references missing parent`);
    }
    const siblings = children.get(value.parentId) ?? [];
    siblings.push(value);
    children.set(value.parentId, siblings);
  }

  const ordered: T[] = [];
  const queue = [...roots];
  for (let index = 0; index < queue.length; index += 1) {
    const value = queue[index];
    ordered.push(value);
    queue.push(...(children.get(value.id) ?? []));
  }
  if (ordered.length !== values.length) {
    throw new Error(`${label} graph contains a cycle`);
  }
  return ordered;
}

/** Append verified missing identities without REPLACE cascading existing history. */
export function insertMissingPromptGraphRows(
  database: Database.Database,
  snapshot: PromptCanonicalGraphSnapshot,
): void {
  const current = collectPromptCanonicalGraph(
    new PromptDB(database),
    new FolderDB(database),
    database,
  );
  const known = {
    folders: new Set(current.folders.map((entry) => entry.id)),
    prompts: new Set(current.prompts.map((entry) => entry.id)),
    versions: new Set(current.promptVersions.map((entry) => entry.id)),
    relations: new Set(current.promptRelations.map((entry) => entry.id)),
    formats: new Set(current.outputFormatItems.map((entry) => entry.id)),
  };
  const folderDb = new FolderDB(database);
  const promptDb = new PromptDB(database);
  const relationDb = new PromptRelationDB(database);
  const outputFormatDb = new PromptOutputFormatDB(database);
  for (const folder of orderParentsFirst(snapshot.folders, "folder")) {
    if (!known.folders.has(folder.id)) folderDb.insertFolderDirect(folder);
  }
  for (const prompt of orderParentsFirst(snapshot.prompts, "prompt")) {
    if (!known.prompts.has(prompt.id)) promptDb.insertPromptDirect(prompt);
  }
  for (const version of snapshot.promptVersions) {
    if (!known.versions.has(version.id)) promptDb.insertVersionDirect(version);
  }
  for (const relation of snapshot.promptRelations) {
    if (!known.relations.has(relation.id))
      relationDb.insertRelationDirect(relation);
  }
  for (const item of snapshot.outputFormatItems) {
    if (!known.formats.has(item.id)) outputFormatDb.insertItemDirect(item);
  }
}

function quickCheck(database: Database.Database): void {
  const rows = database.pragma("quick_check") as Array<Record<string, unknown>>;
  if (rows.length !== 1 || Object.values(rows[0] ?? {})[0] !== "ok") {
    throw new Error("staged canonical catalog failed SQLite quick_check");
  }
}

function createStageDatabase(
  stagePath: string,
  snapshot: PromptCanonicalGraphSnapshot,
): void {
  const database = new DatabaseAdapter(stagePath);
  try {
    database.pragma("foreign_keys = ON");
    const create = database.transaction(() => {
      database.exec(SCHEMA_TABLES);
      database.exec(SCHEMA_INDEXES);
      recordCurrentLegacySchemaMigrations(database);
      recordCurrentDatabaseMigration(database, 0);
      insertMissingPromptGraphRows(database, snapshot);
      quickCheck(database);
    });
    create();
  } finally {
    database.close();
  }
}

function verifyStageDatabase(
  stagePath: string,
  expectedHash: string,
): PromptCanonicalGraphSnapshot {
  const database = new DatabaseAdapter(stagePath, { readOnly: true });
  try {
    database.pragma("foreign_keys = ON");
    quickCheck(database);
    const rebuilt = collectPromptCanonicalGraph(
      new PromptDB(database),
      new FolderDB(database),
      database,
    );
    if (calculatePromptCanonicalGraphHash(rebuilt) !== expectedHash) {
      throw new Error("staged canonical catalog does not match source graph");
    }
    return rebuilt;
  } finally {
    database.close();
  }
}

function cleanupDatabaseStage(stagePath: string): void {
  cleanupOwnedTemporaryDatabase(stagePath);
}

function counts(
  snapshot: PromptCanonicalGraphSnapshot,
): PromptCanonicalGraphCounts {
  const tags = new Set(
    snapshot.prompts.flatMap((prompt) => prompt.tags.map(deriveCanonicalTagId)),
  );
  return {
    prompts: snapshot.prompts.length,
    promptVersions: snapshot.promptVersions.length,
    folders: snapshot.folders.length,
    tags: tags.size,
    relations: snapshot.promptRelations.length,
    outputFormatItems: snapshot.outputFormatItems.length,
  };
}

export function stagePromptCanonicalDatabase(
  canonicalRoot: string,
  targetDatabasePath: string,
): PromptCanonicalCatalogBuildResult {
  const source = readPromptCanonicalGraph(canonicalRoot);
  return stagePromptSnapshotDatabase(
    source.snapshot,
    targetDatabasePath,
    source.manifest.createdAt,
  );
}

export function stagePromptSnapshotDatabase(
  snapshot: PromptCanonicalGraphSnapshot,
  targetDatabasePath: string,
  sourceCatalogCreatedAt: string,
): PromptCanonicalCatalogBuildResult {
  if (fs.existsSync(targetDatabasePath)) {
    throw new Error(
      `canonical catalog destination already exists: ${targetDatabasePath}`,
    );
  }
  const normalizedSnapshot = normalizePromptGraphForDatabase(snapshot);
  assertLocalOwnership(normalizedSnapshot);
  const graphHash = calculatePromptCanonicalGraphHash(normalizedSnapshot);
  const parentPath = path.dirname(targetDatabasePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const stagePath = createOwnedTemporaryDatabasePath(
    parentPath,
    "catalog-stage",
  );
  try {
    createStageDatabase(stagePath, normalizedSnapshot);
    const rebuilt = verifyStageDatabase(stagePath, graphHash);
    if (fs.existsSync(targetDatabasePath)) {
      throw new Error(
        `canonical catalog destination already exists: ${targetDatabasePath}`,
      );
    }
    fs.renameSync(stagePath, targetDatabasePath);
    return {
      databasePath: targetDatabasePath,
      sourceCatalogCreatedAt,
      counts: counts(rebuilt),
      graphHash,
    };
  } catch (error) {
    cleanupDatabaseStage(stagePath);
    throw error;
  }
}
