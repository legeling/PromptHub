import {
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
} from "@prompthub/db";
import type { Database } from "@prompthub/db";
import type {
  RestorePromptGraphInput,
  RestorePromptGraphResult,
} from "@prompthub/shared";

interface Actor {
  userId: string;
  role: "admin" | "user";
}
interface OwnedRow {
  id: string;
  owner_user_id: string | null;
  visibility: string;
  parent_id: string | null;
  folder_id?: string | null;
}

export class GraphRestoreError extends Error {}

function matchingVisibility(
  source: { visibility?: string },
  target: { visibility?: string } | undefined,
): void {
  if (
    target &&
    (source.visibility ?? "private") !== (target.visibility ?? "private")
  )
    throw new GraphRestoreError("Linked records must have matching visibility");
}

function orderedParents<T extends { id: string; parentId?: string | null }>(
  records: T[],
): T[] {
  const ids = new Set(records.map((record) => record.id));
  const children = new Map<string, T[]>();
  const ordered: T[] = [];
  for (const record of records) {
    if (!record.parentId) ordered.push(record);
    else {
      if (!ids.has(record.parentId))
        throw new GraphRestoreError(
          "Parent reference is outside restored graph",
        );
      const group = children.get(record.parentId) ?? [];
      group.push(record);
      children.set(record.parentId, group);
    }
  }
  for (let index = 0; index < ordered.length; index++)
    ordered.push(...(children.get(ordered[index].id) ?? []));
  if (ordered.length !== records.length)
    throw new GraphRestoreError("Cyclic parent references");
  return ordered;
}

function validateGraph(input: RestorePromptGraphInput, actor: Actor): void {
  const groups = [
    input.prompts,
    input.folders,
    input.versions,
    input.promptRelations ?? [],
    input.outputFormatItems ?? [],
  ];
  for (const records of groups) {
    const ids = new Set<string>();
    for (const record of records) {
      if (!record.id || ids.has(record.id))
        throw new GraphRestoreError("Invalid or duplicate graph ID");
      ids.add(record.id);
    }
  }
  const prompts = new Map(input.prompts.map((prompt) => [prompt.id, prompt]));
  const folders = new Map(input.folders.map((folder) => [folder.id, folder]));
  for (const record of [...input.prompts, ...input.folders]) {
    if (record.visibility === "shared" && actor.role !== "admin")
      throw new GraphRestoreError("Only admin can restore shared records");
  }
  for (const prompt of input.prompts) {
    if (prompt.folderId && !folders.has(prompt.folderId))
      throw new GraphRestoreError("Folder reference is outside restored graph");
    matchingVisibility(prompt, folders.get(prompt.folderId ?? ""));
    matchingVisibility(prompt, prompts.get(prompt.parentId ?? ""));
  }
  for (const folder of input.folders)
    matchingVisibility(folder, folders.get(folder.parentId ?? ""));
  for (const version of input.versions) {
    if (!prompts.has(version.promptId))
      throw new GraphRestoreError(
        "Version reference is outside restored graph",
      );
  }
  for (const edge of [
    ...(input.promptRelations ?? []),
    ...(input.outputFormatItems ?? []),
  ]) {
    if (
      !prompts.has(edge.sourcePromptId) ||
      (edge.targetPromptId !== null && !prompts.has(edge.targetPromptId))
    )
      throw new GraphRestoreError("Edge reference is outside restored graph");
    if (edge.sourcePromptId === edge.targetPromptId)
      throw new GraphRestoreError("Self reference is not allowed");
    matchingVisibility(
      prompts.get(edge.sourcePromptId)!,
      prompts.get(edge.targetPromptId ?? ""),
    );
  }
}

function clearOwnedGraph(database: Database.Database, actor: Actor): void {
  // SQL table names are fixed in this module; all actor and record values are bound.
  const prompts = database
    .prepare(
      "SELECT id, owner_user_id, visibility, parent_id, folder_id FROM prompts",
    )
    .all() as OwnedRow[];
  const folders = database
    .prepare("SELECT id, owner_user_id, visibility, parent_id FROM folders")
    .all() as OwnedRow[];
  const writable = (row: OwnedRow): boolean =>
    row.visibility === "shared"
      ? actor.role === "admin"
      : row.owner_user_id === actor.userId;
  const folderIds = new Set(folders.filter(writable).map((row) => row.id));
  const promptIds = new Set(prompts.filter(writable).map((row) => row.id));
  if (
    folders.some(
      (row) => !writable(row) && row.parent_id && folderIds.has(row.parent_id),
    ) ||
    prompts.some(
      (row) =>
        !writable(row) &&
        ((row.folder_id && folderIds.has(row.folder_id)) ||
          (row.parent_id && promptIds.has(row.parent_id))),
    )
  ) {
    throw new GraphRestoreError(
      "Graph is referenced by records outside the restore scope",
    );
  }
  const deletePrompt = database.prepare("DELETE FROM prompts WHERE id = ?");
  const deleteFolder = database.prepare("DELETE FROM folders WHERE id = ?");
  for (const id of promptIds) deletePrompt.run(id);
  for (const id of folderIds) deleteFolder.run(id);
}

function rejectIdCollisions(
  database: Database.Database,
  input: RestorePromptGraphInput,
): void {
  const groups = [
    ["prompts", input.prompts],
    ["folders", input.folders],
    ["prompt_versions", input.versions],
    ["prompt_relations", input.promptRelations ?? []],
    ["prompt_output_format_items", input.outputFormatItems ?? []],
  ] as const;
  for (const [table, records] of groups) {
    // These table identifiers are constants above, never user input.
    const get = database.prepare(`SELECT id FROM ${table} WHERE id = ?`);
    for (const record of records)
      if (get.get(record.id))
        throw new GraphRestoreError(
          "ID belongs to records outside the restore scope",
        );
  }
}

export function restorePromptGraph(
  database: Database.Database,
  actor: Actor,
  input: RestorePromptGraphInput,
): RestorePromptGraphResult {
  validateGraph(input, actor);
  const folders = orderedParents(input.folders);
  const prompts = orderedParents(input.prompts);
  return database.transaction(() => {
    clearOwnedGraph(database, actor);
    rejectIdCollisions(database, input);
    const folderDb = new FolderDB(database);
    const promptDb = new PromptDB(database);
    const relationDb = new PromptRelationDB(database);
    const outputDb = new PromptOutputFormatDB(database);
    for (const folder of folders)
      folderDb.insertFolderDirect({ ...folder, ownerUserId: actor.userId });
    for (const prompt of prompts)
      promptDb.insertPromptDirect({ ...prompt, ownerUserId: actor.userId });
    for (const version of input.versions) promptDb.insertVersionDirect(version);
    for (const relation of input.promptRelations ?? [])
      relationDb.insertRelationDirect(relation);
    for (const item of input.outputFormatItems ?? [])
      outputDb.insertItemDirect(item);
    return {
      promptCount: prompts.length,
      folderCount: folders.length,
      versionCount: input.versions.length,
      relationCount: input.promptRelations?.length ?? 0,
      outputFormatItemCount: input.outputFormatItems?.length ?? 0,
    };
  })();
}
