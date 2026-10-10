import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  FolderDB,
  PromptOutputFormatDB,
  PromptRelationDB,
  type Database,
  type PromptDB,
} from "@prompthub/db";
import type {
  Folder,
  OutputFormatItem,
  Prompt,
  PromptRelation,
  PromptVersion,
} from "@prompthub/shared/types";

import {
  PROMPT_RESOURCE_SCHEMA_VERSION,
  createPromptResourceDocuments,
  type CanonicalTagReference,
  type PromptResourceDocuments,
  type PromptMediaObjectReference,
} from "./prompt-resource-schema";
import {
  materializeResourceBundle,
  readResourceBundle,
} from "./resource-bundle";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { storeContentAddressedObject } from "./content-addressed-object-store";

export const PROMPT_CANONICAL_GRAPH_KIND = "prompthub-prompt-canonical-graph";
export const PROMPT_CANONICAL_GRAPH_VERSION = 1;
export const PROMPT_CANONICAL_GRAPH_MANIFEST_FILE = "catalog.json";

export interface PromptCanonicalGraphSnapshot {
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  folders: Folder[];
  promptRelations: PromptRelation[];
  outputFormatItems: OutputFormatItem[];
}

export interface PromptCanonicalGraphCounts {
  prompts: number;
  promptVersions: number;
  folders: number;
  tags: number;
  relations: number;
  outputFormatItems: number;
}

export interface PromptCanonicalGraphFile {
  path: string;
  size: number;
  sha256: string;
}

export interface PromptCanonicalGraphManifest {
  kind: typeof PROMPT_CANONICAL_GRAPH_KIND;
  version: typeof PROMPT_CANONICAL_GRAPH_VERSION;
  createdAt: string;
  counts: PromptCanonicalGraphCounts;
  domainCounts?: Record<string, number>;
  files: PromptCanonicalGraphFile[];
}

export interface MaterializePromptCanonicalGraphOptions {
  createdAt?: string;
  materializeAdditionalDomains?: (stagePath: string) => void;
  resolveMediaSource?: (
    prompt: Prompt,
    kind: "image" | "video",
    reference: string,
  ) => string;
  resolvePromptRevision?: (prompt: Prompt, defaultRevision: number) => number;
  resolveExistingPromptBundle?: (prompt: Prompt) => string | undefined;
  resolveExistingObjectSource?: (sha256: string) => string;
  /** Verified files retained at the live target during atomic publication. */
  retainedFiles?: PromptCanonicalGraphManifest["files"];
}

interface ValidatedPromptEntry {
  prompt: Prompt;
  documents: PromptResourceDocuments;
}

interface ValidatedGraph {
  prompts: ValidatedPromptEntry[];
  folders: Folder[];
  tags: CanonicalTagReference[];
  relations: PromptRelation[];
  outputFormatItems: OutputFormatItem[];
  counts: PromptCanonicalGraphCounts;
}

interface CanonicalEnvelope {
  kind: string;
  schemaVersion: 1;
  [key: string]: unknown;
}

const MAX_GRAPH_RECORDS = 100_000;
const VISIBILITIES = new Set(["private", "shared"]);
const RELATION_KINDS = new Set([
  "related_to",
  "variant_of",
  "depends_on",
  "next_step",
]);

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertCanonicalTimestamp(value: string, label: string): void {
  if (
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
}

function assertResourceId(value: string, label: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
}

function assertUniqueIds<T extends { id: string }>(
  values: readonly T[],
  label: string,
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const value of values) {
    assertResourceId(value.id, `${label} id`);
    if (byId.has(value.id))
      throw new Error(`duplicate ${label} id: ${value.id}`);
    byId.set(value.id, value);
  }
  return byId;
}

function assertOptionalOwnerId(
  value: string | null | undefined,
  label: string,
) {
  if (value !== undefined && value !== null) assertResourceId(value, label);
}

function assertAcyclicParents<
  T extends { id: string; parentId?: string | null },
>(values: ReadonlyMap<string, T>, label: string): void {
  for (const value of values.values()) {
    const visited = new Set<string>([value.id]);
    let parentId = value.parentId;
    while (parentId) {
      if (visited.has(parentId))
        throw new Error(`${label} graph contains a cycle`);
      visited.add(parentId);
      parentId = values.get(parentId)?.parentId;
    }
  }
}

function validateFolderGraph(folders: readonly Folder[]): Map<string, Folder> {
  const byId = assertUniqueIds(folders, "folder");
  for (const folder of folders) {
    if (!folder.name.trim())
      throw new Error(`folder ${folder.id} name is invalid`);
    if (!Number.isSafeInteger(folder.order))
      throw new Error(`folder ${folder.id} order is invalid`);
    if (
      folder.visibility !== undefined &&
      !VISIBILITIES.has(folder.visibility)
    ) {
      throw new Error(`folder ${folder.id} visibility is invalid`);
    }
    if (
      folder.isPrivate !== undefined &&
      typeof folder.isPrivate !== "boolean"
    ) {
      throw new Error(`folder ${folder.id} private flag is invalid`);
    }
    assertOptionalOwnerId(folder.ownerUserId, "folder owner id");
    assertCanonicalTimestamp(folder.createdAt, "folder createdAt");
    assertCanonicalTimestamp(folder.updatedAt, "folder updatedAt");
    if (folder.parentId && !byId.has(folder.parentId)) {
      throw new Error(`folder ${folder.id} references a missing parent folder`);
    }
  }
  assertAcyclicParents(byId, "folder");
  return byId;
}

function groupVersions(
  versions: readonly PromptVersion[],
): Map<string, PromptVersion[]> {
  assertUniqueIds(versions, "Prompt version");
  const grouped = new Map<string, PromptVersion[]>();
  for (const version of versions) {
    const ownerVersions = grouped.get(version.promptId) ?? [];
    ownerVersions.push(version);
    grouped.set(version.promptId, ownerVersions);
  }
  return grouped;
}

function validatePrompts(
  snapshot: PromptCanonicalGraphSnapshot,
  folderIds: ReadonlyMap<string, Folder>,
): { entries: ValidatedPromptEntry[]; tags: CanonicalTagReference[] } {
  const promptIds = assertUniqueIds(snapshot.prompts, "Prompt");
  const versions = groupVersions(snapshot.promptVersions);
  const tags = new Map<string, CanonicalTagReference>();
  const entries = snapshot.prompts.map((prompt) => {
    if (prompt.folderId && !folderIds.has(prompt.folderId)) {
      throw new Error(`Prompt ${prompt.id} references a missing folder`);
    }
    if (prompt.parentId && !promptIds.has(prompt.parentId)) {
      throw new Error(`Prompt ${prompt.id} references a missing parent Prompt`);
    }
    const documents = createPromptResourceDocuments(
      prompt,
      versions.get(prompt.id) ?? [],
    );
    for (const tag of documents.promptDocument.tagReferences)
      tags.set(tag.id, tag);
    versions.delete(prompt.id);
    return { prompt: documents.promptDocument.prompt, documents };
  });
  if (versions.size > 0) {
    throw new Error(
      `Prompt version references a missing Prompt: ${versions.keys().next().value}`,
    );
  }
  assertAcyclicParents(promptIds, "Prompt");
  return {
    entries: entries.sort((left, right) =>
      compareText(left.prompt.id, right.prompt.id),
    ),
    tags: [...tags.values()].sort((left, right) =>
      compareText(left.id, right.id),
    ),
  };
}

function validateRelations(
  relations: readonly PromptRelation[],
  promptIds: ReadonlySet<string>,
): PromptRelation[] {
  assertUniqueIds(relations, "Prompt relation");
  for (const relation of relations) {
    assertResourceId(relation.sourcePromptId, "Prompt relation source id");
    assertResourceId(relation.targetPromptId, "Prompt relation target id");
    if (!promptIds.has(relation.sourcePromptId)) {
      throw new Error(
        `Prompt relation ${relation.id} references a missing source Prompt`,
      );
    }
    if (!promptIds.has(relation.targetPromptId)) {
      throw new Error(
        `Prompt relation ${relation.id} references a missing target Prompt`,
      );
    }
    if (relation.sourcePromptId === relation.targetPromptId) {
      throw new Error(`Prompt relation ${relation.id} cannot reference itself`);
    }
    if (!RELATION_KINDS.has(relation.kind)) {
      throw new Error(`Prompt relation ${relation.id} kind is invalid`);
    }
    assertCanonicalTimestamp(relation.createdAt, "Prompt relation createdAt");
    assertCanonicalTimestamp(relation.updatedAt, "Prompt relation updatedAt");
  }
  return [...relations].sort((left, right) => compareText(left.id, right.id));
}

function validateOutputFormats(
  items: readonly OutputFormatItem[],
  promptIds: ReadonlySet<string>,
): OutputFormatItem[] {
  assertUniqueIds(items, "output format item");
  for (const item of items) {
    assertResourceId(item.sourcePromptId, "output format source id");
    if (item.targetPromptId)
      assertResourceId(item.targetPromptId, "output format target id");
    if (!promptIds.has(item.sourcePromptId)) {
      throw new Error(
        `output format item ${item.id} references a missing source Prompt`,
      );
    }
    if (item.targetPromptId && !promptIds.has(item.targetPromptId)) {
      throw new Error(
        `output format item ${item.id} references a missing target Prompt`,
      );
    }
    if (!Number.isSafeInteger(item.sortOrder) || item.sortOrder < 0) {
      throw new Error(`output format item ${item.id} sort order is invalid`);
    }
    assertCanonicalTimestamp(item.createdAt, "output format item createdAt");
    assertCanonicalTimestamp(item.updatedAt, "output format item updatedAt");
  }
  return [...items].sort((left, right) => compareText(left.id, right.id));
}

function validateGraph(snapshot: PromptCanonicalGraphSnapshot): ValidatedGraph {
  const totalRecords =
    snapshot.prompts.length +
    snapshot.promptVersions.length +
    snapshot.folders.length +
    snapshot.promptRelations.length +
    snapshot.outputFormatItems.length;
  if (totalRecords > MAX_GRAPH_RECORDS) {
    throw new Error("canonical Prompt graph record limit exceeded");
  }
  const foldersById = validateFolderGraph(snapshot.folders);
  const { entries, tags } = validatePrompts(snapshot, foldersById);
  const promptIds = new Set(entries.map((entry) => entry.prompt.id));
  const relations = validateRelations(snapshot.promptRelations, promptIds);
  const outputFormatItems = validateOutputFormats(
    snapshot.outputFormatItems,
    promptIds,
  );
  return {
    prompts: entries,
    folders: [...foldersById.values()].sort((a, b) => compareText(a.id, b.id)),
    tags,
    relations,
    outputFormatItems,
    counts: {
      prompts: entries.length,
      promptVersions: snapshot.promptVersions.length,
      folders: foldersById.size,
      tags: tags.length,
      relations: relations.length,
      outputFormatItems: outputFormatItems.length,
    },
  };
}

export function validatePromptCanonicalGraphSnapshot(
  snapshot: PromptCanonicalGraphSnapshot,
): void {
  validateGraph(snapshot);
}

export function collectPromptCanonicalGraph(
  promptDb: PromptDB,
  folderDb: FolderDB,
  database: Database.Database,
): PromptCanonicalGraphSnapshot {
  const prompts = promptDb.getAll();
  return {
    prompts,
    promptVersions: prompts.flatMap((prompt) =>
      promptDb.getVersions(prompt.id),
    ),
    folders: folderDb.getAll(),
    promptRelations: new PromptRelationDB(database).list(),
    outputFormatItems: new PromptOutputFormatDB(database).list(),
  };
}

function writeJsonFile(
  filePath: string,
  value: unknown,
  options: { durable?: boolean } = {},
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    if (options.durable !== false) fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writePromptSources(
  sourceRoot: string,
  documents: PromptResourceDocuments,
): Array<{ path: string; sourcePath: string; role: string }> {
  const sources = [
    {
      path: "prompt.json",
      sourcePath: path.join(sourceRoot, "prompt.json"),
      role: "current",
      document: documents.promptDocument,
    },
    ...documents.versionDocuments.map((entry) => ({
      path: entry.path,
      sourcePath: path.join(sourceRoot, ...entry.path.split("/")),
      role: "version",
      document: entry.document,
    })),
  ];
  for (const source of sources)
    writeJsonFile(source.sourcePath, source.document, { durable: false });
  return sources.map(({ path: payloadPath, sourcePath, role }) => ({
    path: payloadPath,
    sourcePath,
    role,
  }));
}

function materializePrompt(
  stagePath: string,
  sourceRoot: string,
  entry: ValidatedPromptEntry,
  resolveMediaSource?: MaterializePromptCanonicalGraphOptions["resolveMediaSource"],
  resolvePromptRevision?: MaterializePromptCanonicalGraphOptions["resolvePromptRevision"],
  resolveExistingPromptBundle?: MaterializePromptCanonicalGraphOptions["resolveExistingPromptBundle"],
  resolveExistingObjectSource?: MaterializePromptCanonicalGraphOptions["resolveExistingObjectSource"],
  retainExistingBundles = false,
): void {
  const prompt = entry.prompt;
  const existingBundle = resolveExistingPromptBundle?.(prompt);
  if (existingBundle) {
    const stats = fs.lstatSync(existingBundle);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Existing Prompt bundle reuse source is unsafe");
    }
    if (retainExistingBundles) return;
    fs.cpSync(
      existingBundle,
      path.join(
        stagePath,
        "prompts",
        encodeCanonicalResourceDirectory(prompt.id),
      ),
      {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
        mode: fs.constants.COPYFILE_FICLONE,
      },
    );
    const objectHashes = readResourceBundle(existingBundle, {
      expectedResourceType: "prompt",
      expectedResourceId: prompt.id,
    }).manifest.objectHashes;
    for (const hash of objectHashes) {
      if (!resolveExistingObjectSource) {
        throw new Error("Existing Prompt object source resolver is missing");
      }
      const sourcePath = resolveExistingObjectSource(hash);
      const sourceStats = fs.lstatSync(sourcePath);
      if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
        throw new Error("Existing Prompt object reuse source is unsafe");
      }
      const targetPath = path.join(
        stagePath,
        "assets",
        "objects",
        "sha256",
        hash.slice(0, 2),
        hash,
      );
      if (fs.existsSync(targetPath)) continue;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_FICLONE);
    }
    return;
  }
  const mediaObjects: PromptMediaObjectReference[] = [];
  if (resolveMediaSource) {
    const objectsRoot = path.join(stagePath, "assets", "objects");
    for (const [kind, references] of [
      ["image", prompt.images ?? []],
      ["video", prompt.videos ?? []],
    ] as const) {
      for (const reference of references) {
        const stored = storeContentAddressedObject(
          objectsRoot,
          resolveMediaSource(prompt, kind, reference),
        );
        mediaObjects.push({
          kind,
          reference,
          sha256: stored.hash,
          byteSize: stored.size,
        });
      }
    }
  }
  const documents = createPromptResourceDocuments(
    prompt,
    entry.documents.versionDocuments.map((version) => version.document.version),
    mediaObjects,
  );
  materializeResourceBundle({
    bundlePath: path.join(
      stagePath,
      "prompts",
      encodeCanonicalResourceDirectory(prompt.id),
    ),
    resourceType: "prompt",
    resourceId: prompt.id,
    schemaVersion: PROMPT_RESOURCE_SCHEMA_VERSION,
    revision:
      resolvePromptRevision?.(prompt, prompt.currentVersion) ??
      prompt.currentVersion,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    provenance: { source: "sqlite-shadow-export" },
    objectHashes: [
      ...new Set(mediaObjects.map((object) => object.sha256)),
    ].sort(compareText),
    payloads: writePromptSources(sourceRoot, documents),
    durability: "publication-journal",
  });
}

function envelope(
  kind: string,
  field: string,
  value: unknown,
): CanonicalEnvelope {
  return { kind, schemaVersion: 1, [field]: value };
}

function writeGraphRecords(stagePath: string, graph: ValidatedGraph): void {
  for (const folder of graph.folders) {
    writeJsonFile(
      path.join(stagePath, "folders", `${folder.id}.json`),
      envelope("prompthub-folder-resource", "folder", folder),
    );
  }
  for (const tag of graph.tags) {
    writeJsonFile(
      path.join(stagePath, "tags", `${tag.id}.json`),
      envelope("prompthub-tag-resource", "tag", tag),
    );
  }
  for (const relation of graph.relations) {
    writeJsonFile(
      path.join(stagePath, "relations", `${relation.id}.json`),
      envelope("prompthub-prompt-relation-resource", "relation", relation),
    );
  }
  for (const item of graph.outputFormatItems) {
    writeJsonFile(
      path.join(stagePath, "output-formats", `${item.id}.json`),
      envelope("prompthub-output-format-resource", "outputFormatItem", item),
    );
  }
}

function hashRegularFile(filePath: string): PromptCanonicalGraphFile {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `canonical graph entry must be a regular file: ${filePath}`,
    );
  }
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        size += bytesRead;
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return {
    path: "",
    size,
    sha256: hash.digest("hex"),
  };
}

function inventoryFiles(rootPath: string): PromptCanonicalGraphFile[] {
  const files: PromptCanonicalGraphFile[] = [];
  const queue = [rootPath];
  while (queue.length > 0) {
    const directory = queue.shift() as string;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink())
        throw new Error(`canonical graph contains a symlink: ${absolutePath}`);
      if (stat.isDirectory()) {
        queue.push(absolutePath);
      } else {
        const file = hashRegularFile(absolutePath);
        file.path = path
          .relative(rootPath, absolutePath)
          .split(path.sep)
          .join("/");
        files.push(file);
      }
    }
  }
  return files.sort((left, right) => compareText(left.path, right.path));
}

function fsyncDirectory(directoryPath: string): void {
  try {
    const descriptor = fs.openSync(directoryPath, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    // File data is already flushed when directory fsync is unavailable.
  }
}

function materializeStage(
  stagePath: string,
  graph: ValidatedGraph,
  resolveMediaSource?: MaterializePromptCanonicalGraphOptions["resolveMediaSource"],
  resolvePromptRevision?: MaterializePromptCanonicalGraphOptions["resolvePromptRevision"],
  resolveExistingPromptBundle?: MaterializePromptCanonicalGraphOptions["resolveExistingPromptBundle"],
  resolveExistingObjectSource?: MaterializePromptCanonicalGraphOptions["resolveExistingObjectSource"],
  retainExistingBundles = false,
): void {
  fs.mkdirSync(stagePath, { mode: 0o700 });
  const sourcePath = path.join(stagePath, ".sources");
  for (const entry of graph.prompts) {
    materializePrompt(
      stagePath,
      path.join(sourcePath, entry.prompt.id),
      entry,
      resolveMediaSource,
      resolvePromptRevision,
      resolveExistingPromptBundle,
      resolveExistingObjectSource,
      retainExistingBundles,
    );
  }
  writeGraphRecords(stagePath, graph);
  fs.rmSync(sourcePath, { recursive: true, force: true });
}

export function materializePromptCanonicalGraph(
  targetPath: string,
  snapshot: PromptCanonicalGraphSnapshot,
  options: MaterializePromptCanonicalGraphOptions = {},
): PromptCanonicalGraphManifest {
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `canonical graph destination already exists: ${targetPath}`,
    );
  }
  const graph = validateGraph(snapshot);
  const createdAt = options.createdAt ?? new Date().toISOString();
  assertCanonicalTimestamp(createdAt, "canonical graph createdAt");
  const parentPath = path.dirname(targetPath);
  fs.mkdirSync(parentPath, { recursive: true });
  const stagePath = path.join(
    parentPath,
    `.${path.basename(targetPath)}.stage-${process.pid}-${crypto.randomUUID()}`,
  );
  try {
    materializeStage(
      stagePath,
      graph,
      options.resolveMediaSource,
      options.resolvePromptRevision,
      options.resolveExistingPromptBundle,
      options.resolveExistingObjectSource,
      options.retainedFiles !== undefined,
    );
    const files = [
      ...new Map(
        [...(options.retainedFiles ?? []), ...inventoryFiles(stagePath)].map(
          (file) => [file.path, file],
        ),
      ).values(),
    ].sort((left, right) => compareText(left.path, right.path));
    options.materializeAdditionalDomains?.(stagePath);
    const manifest: PromptCanonicalGraphManifest = {
      kind: PROMPT_CANONICAL_GRAPH_KIND,
      version: PROMPT_CANONICAL_GRAPH_VERSION,
      createdAt,
      counts: graph.counts,
      files,
    };
    writeJsonFile(
      path.join(stagePath, PROMPT_CANONICAL_GRAPH_MANIFEST_FILE),
      manifest,
    );
    fsyncDirectory(stagePath);
    if (fs.existsSync(targetPath)) {
      throw new Error(
        `canonical graph destination already exists: ${targetPath}`,
      );
    }
    fs.renameSync(stagePath, targetPath);
    fsyncDirectory(parentPath);
    return manifest;
  } catch (error) {
    fs.rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}
