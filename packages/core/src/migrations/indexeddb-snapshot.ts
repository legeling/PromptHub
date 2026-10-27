import { isDeepStrictEqual } from "node:util";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "@prompthub/db";
import type { LegacyIndexedDbSnapshot } from "@prompthub/shared/types/indexeddb-migration";
import type {
  PromptWorkspaceConflict,
  PromptWorkspaceResolution,
  PromptWorkspaceRecordKind,
} from "@prompthub/shared/types/prompt-workspace-recovery";
import {
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import { insertMissingPromptGraphRows } from "../prompt-canonical-catalog";

export function validateIndexedDbSnapshot(
  value: unknown,
): asserts value is LegacyIndexedDbSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid historical IndexedDB snapshot");
  for (const store of ["folders", "prompts", "versions"]) {
    const records: unknown = Reflect.get(value, store);
    if (!Array.isArray(records))
      throw new Error(`Historical IndexedDB ${store} must be an array`);
    const ids = new Set<string>();
    for (const record of records) {
      if (
        !record ||
        typeof record !== "object" ||
        typeof record.id !== "string" ||
        !record.id ||
        ids.has(record.id)
      )
        throw new Error(`Invalid or duplicate historical ${store} ID`);
      ids.add(record.id);
      validateRecord(record, store);
      for (const [key, field] of Object.entries(record)) {
        if (typeof field === "string" && field.includes("\0"))
          throw new Error(`Historical ${store}.${key} contains a null byte`);
        if (["createdAt", "updatedAt"].includes(key) && !validDate(field))
          throw new Error(`Historical ${store}.${key} is invalid`);
      }
      if (!record.createdAt || (store !== "versions" && !record.updatedAt))
        throw new Error(`Historical ${store} timestamps are missing`);
    }
  }
}

function validateRecord(record: object, store: string): void {
  const required =
    store === "folders"
      ? ["name"]
      : store === "prompts"
        ? ["title", "userPrompt"]
        : ["promptId", "userPrompt"];
  for (const key of required) {
    if (typeof Reflect.get(record, key) !== "string")
      throw new Error(`Historical ${store}.${key} must be a string`);
  }
  for (const key of ["variables", "tags", "images", "videos"]) {
    const value: unknown = Reflect.get(record, key);
    if (value != null && !Array.isArray(value))
      throw new Error(`Historical ${store}.${key} must be an array`);
  }
  for (const key of ["isFavorite", "isPinned", "isPrivate"]) {
    const value: unknown = Reflect.get(record, key);
    if (value != null && typeof value !== "boolean")
      throw new Error(`Historical ${store}.${key} must be a boolean`);
  }
  for (const key of ["version", "currentVersion", "order", "usageCount"]) {
    const value: unknown = Reflect.get(record, key);
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isSafeInteger(value))
    )
      throw new Error(`Historical ${store}.${key} must be an integer`);
  }
}

function validDate(value: unknown): boolean {
  return (
    (typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date) &&
    Number.isFinite(new Date(value).getTime())
  );
}

/** Reuse the DB codecs for dates, optional fields and version aliases instead of a second codec. */
export function normalizeIndexedDbSnapshot(
  source: LegacyIndexedDbSnapshot,
): PromptCanonicalGraphSnapshot {
  const slots = new Set<string>();
  for (const version of source.versions) {
    const slot = JSON.stringify([version.promptId, version.version]);
    if (slots.has(slot))
      throw new Error("Historical IndexedDB contains a duplicate version slot");
    slots.add(slot);
  }
  const staging = new DatabaseAdapter(":memory:");
  try {
    staging.pragma("foreign_keys = ON");
    staging.exec(SCHEMA_TABLES);
    staging.exec(SCHEMA_INDEXES);
    staging.transaction(() =>
      insertMissingPromptGraphRows(staging, {
        folders: source.folders,
        prompts: source.prompts,
        promptVersions: source.versions,
        promptRelations: [],
        outputFormatItems: [],
      }),
    )();
    return collectPromptCanonicalGraph(
      new PromptDB(staging),
      new FolderDB(staging),
      staging,
    );
  } finally {
    staging.close();
  }
}

function representedFields(
  record: object,
  kind: PromptWorkspaceRecordKind,
): string[] {
  const fields = Object.keys(record).filter(
    (key) => Reflect.get(record, key) !== undefined,
  );
  return [
    ...new Set(
      fields.map((key) =>
        kind === "prompt" && key === "version" ? "currentVersion" : key,
      ),
    ),
  ];
}

interface MergeContext {
  conflicts: PromptWorkspaceConflict[];
  choices: Map<string, "database" | "indexeddb">;
}

function mergeRows<T extends { id: string }>(
  kind: PromptWorkspaceRecordKind,
  current: T[],
  incoming: T[],
  original: T[],
  context: MergeContext,
  slot: (record: T) => string = (record) => record.id,
): T[] {
  const result = new Map(current.map((record) => [slot(record), record]));
  const originalById = new Map(original.map((record) => [record.id, record]));
  for (const candidate of incoming) {
    const key = slot(candidate);
    const existing = result.get(key);
    if (!existing) {
      result.set(key, candidate);
      continue;
    }
    const originalRecord = originalById.get(candidate.id);
    if (!originalRecord)
      throw new Error(
        "Historical record identity changed during normalization",
      );
    const fields = representedFields(originalRecord, kind);
    const differences = fields.filter(
      (field) =>
        !isDeepStrictEqual(
          Reflect.get(existing, field),
          Reflect.get(candidate, field),
        ),
    );
    if (differences.length === 0) continue;
    const displayFields = [
      ...differences,
      ...fields.filter((field) => !differences.includes(field)),
    ];
    const conflictKey = JSON.stringify([kind, key]);
    context.conflicts.push({
      key: conflictKey,
      kind,
      id: candidate.id,
      title: String(
        Reflect.get(candidate, "title") ??
          Reflect.get(candidate, "name") ??
          candidate.id,
      ),
      differingFields: differences,
      variants: [
        { source: "database", fields: printable(existing, displayFields) },
        { source: "indexeddb", fields: printable(candidate, displayFields) },
      ],
    });
    if (context.choices.get(conflictKey) === "indexeddb") {
      // Only represented legacy fields may replace current values after explicit review.
      const selected = { ...existing };
      for (const field of fields)
        Reflect.set(selected, field, Reflect.get(candidate, field));
      if (kind === "prompt" && "currentVersion" in selected)
        Reflect.set(selected, "version", selected.currentVersion);
      result.set(key, selected);
    }
  }
  return [...result.values()];
}

function printable(record: object, fields: string[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      JSON.stringify(Reflect.get(record, field)) ?? "null",
    ]),
  );
}

export function planIndexedDbMerge(
  current: PromptCanonicalGraphSnapshot,
  incoming: PromptCanonicalGraphSnapshot,
  source: LegacyIndexedDbSnapshot,
  resolution?: PromptWorkspaceResolution,
): {
  graph: PromptCanonicalGraphSnapshot;
  conflicts: PromptWorkspaceConflict[];
} {
  const context: MergeContext = { conflicts: [], choices: new Map() };
  if (
    resolution &&
    (typeof resolution.fingerprint !== "string" ||
      !Array.isArray(resolution.choices))
  )
    throw new Error("Invalid IndexedDB recovery resolution");
  for (const choice of resolution?.choices ?? []) {
    if (
      !choice ||
      typeof choice.key !== "string" ||
      (choice.source !== "database" && choice.source !== "indexeddb") ||
      context.choices.has(choice.key)
    )
      throw new Error("Invalid or duplicate IndexedDB recovery choice");
    context.choices.set(choice.key, choice.source);
  }
  const graph = {
    ...current,
    folders: mergeRows(
      "folder",
      current.folders,
      incoming.folders,
      source.folders,
      context,
    ),
    prompts: mergeRows(
      "prompt",
      current.prompts,
      incoming.prompts,
      source.prompts,
      context,
    ),
    promptVersions: mergeRows(
      "version",
      current.promptVersions,
      incoming.promptVersions,
      source.versions,
      context,
      (version) => JSON.stringify([version.promptId, version.version]),
    ),
  };
  if (
    resolution &&
    (context.choices.size !== context.conflicts.length ||
      context.conflicts.some(({ key }) => !context.choices.has(key)))
  )
    throw new Error("Every IndexedDB conflict requires one explicit choice");
  return { graph, conflicts: context.conflicts };
}
