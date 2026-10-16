import fs from "node:fs";
import path from "node:path";
import {
  FolderDB,
  PromptDB,
  PromptRelationDB,
  PromptOutputFormatDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { SyncResourceIdentity } from "@prompthub/shared/types/causal-sync";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  collectPromptCanonicalGraph,
  validatePromptCanonicalGraphSnapshot,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import {
  assertStoragePathComponentsSafe,
  resolveRuntimeStorageContext,
} from "../runtime-storage-context";
import { resourceKey } from "./validation";
import { type CausalSyncPayload, type CausalSyncWorkspace } from "./workflow";

import { syncPayload as payload } from "./payload";

function reference(
  resourceType: string,
  id: string | null | undefined,
): SyncResourceIdentity[] {
  return id ? [{ resourceType, resourceId: id }] : [];
}

function graphResources(
  graph: PromptCanonicalGraphSnapshot,
): CausalSyncPayload[] {
  const histories = new Map<
    string,
    PromptCanonicalGraphSnapshot["promptVersions"]
  >();
  for (const version of graph.promptVersions) {
    const history = histories.get(version.promptId) ?? [];
    history.push(version);
    histories.set(version.promptId, history);
  }
  return [
    ...graph.folders.map((folder) =>
      payload(
        "folder",
        folder.id,
        folder,
        reference("folder", folder.parentId),
      ),
    ),
    ...graph.prompts.map((prompt) =>
      payload(
        "prompt",
        prompt.id,
        {
          prompt,
          versions: (histories.get(prompt.id) ?? []).sort(
            (a, b) => a.version - b.version,
          ),
        },
        [
          ...reference("folder", prompt.folderId),
          ...reference("prompt", prompt.parentId),
          ...(prompt.images ?? []).map((name) => ({
            resourceType: "image",
            resourceId: name,
          })),
          ...(prompt.videos ?? []).map((name) => ({
            resourceType: "video",
            resourceId: name,
          })),
        ],
      ),
    ),
    ...graph.promptRelations.map((entry) =>
      payload("prompt-relation", entry.id, entry, [
        ...reference("prompt", entry.sourcePromptId),
        ...reference("prompt", entry.targetPromptId),
      ]),
    ),
    ...graph.outputFormatItems.map((entry) =>
      payload("prompt-output-format", entry.id, entry, [
        ...reference("prompt", entry.sourcePromptId),
        ...reference("prompt", entry.targetPromptId),
      ]),
    ),
  ];
}

function mediaPath(
  root: string,
  kind: "image" | "video",
  name: string,
): string {
  if (
    !name ||
    path.isAbsolute(name) ||
    /^[a-zA-Z]:/u.test(name) ||
    name
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..") ||
    /[\\\u0000-\u001f\u007f]/u.test(name)
  )
    throw new Error("Invalid sync media name");
  const context = resolveRuntimeStorageContext(root);
  const file = path.join(
    kind === "image" ? context.imagesPath : context.videosPath,
    name,
  );
  assertStoragePathComponentsSafe(root, file);
  return file;
}

function readMedia(file: string): string {
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    if (!fs.fstatSync(descriptor).isFile())
      throw new Error("Sync media is not a regular file");
    return fs.readFileSync(descriptor).toString("base64");
  } finally {
    fs.closeSync(descriptor);
  }
}

function decodeGraph(
  resources: CausalSyncPayload[],
): PromptCanonicalGraphSnapshot {
  const graph: PromptCanonicalGraphSnapshot = {
    prompts: [],
    promptVersions: [],
    folders: [],
    promptRelations: [],
    outputFormatItems: [],
  };
  for (const resource of resources) {
    const value: unknown = JSON.parse(resource.text);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("Invalid sync graph resource");
    // The full graph validator below checks these external objects, IDs, fields,
    // histories and dependencies before any SQL or filesystem mutation.
    if (resource.resourceType === "prompt") {
      const entry = value as {
        prompt: PromptCanonicalGraphSnapshot["prompts"][number];
        versions: PromptCanonicalGraphSnapshot["promptVersions"];
      };
      if (!Array.isArray(entry.versions))
        throw new Error("Sync Prompt history is missing");
      graph.prompts.push(entry.prompt);
      graph.promptVersions.push(...entry.versions);
    } else if (resource.resourceType === "folder")
      graph.folders.push(
        value as PromptCanonicalGraphSnapshot["folders"][number],
      );
    else if (resource.resourceType === "prompt-relation")
      graph.promptRelations.push(
        value as PromptCanonicalGraphSnapshot["promptRelations"][number],
      );
    else if (resource.resourceType === "prompt-output-format")
      graph.outputFormatItems.push(
        value as PromptCanonicalGraphSnapshot["outputFormatItems"][number],
      );
    else if (
      resource.resourceType !== "image" &&
      resource.resourceType !== "video"
    )
      throw new Error("Unsupported Prompt sync resource type");
  }
  validatePromptCanonicalGraphSnapshot(graph);
  const observed = new Map(
    resources.map((entry) => [resourceKey(entry), entry]),
  );
  const graphEntries = graphResources(graph);
  const expectedIds = new Set(graphEntries.map(resourceKey));
  for (const entry of graphEntries)
    for (const reference of entry.references)
      if (
        reference.resourceType === "image" ||
        reference.resourceType === "video"
      )
        expectedIds.add(resourceKey(reference));
  if (
    expectedIds.size !== resources.length ||
    resources.some((entry) => !expectedIds.has(resourceKey(entry)))
  )
    throw new Error("Sync graph contains unrelated or duplicated resources");
  for (const expected of graphEntries) {
    const actual = observed.get(resourceKey(expected));
    if (
      !actual ||
      actual.contentHash !== expected.contentHash ||
      JSON.stringify([...actual.references].map(resourceKey).sort()) !==
        JSON.stringify(expected.references.map(resourceKey).sort())
    )
      throw new Error(
        "Sync graph identity or references do not match its payload",
      );
  }
  return graph;
}

/** Prompt, folder, graph and media owners form a complete domain inventory. */
export class PromptCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly prompts: PromptDB;
  private readonly folders: FolderDB;
  constructor(
    private readonly database: DatabaseAdapter.Database,
    private readonly root: string,
  ) {
    this.prompts = new PromptDB(database);
    this.folders = new FolderDB(database);
  }

  capture(): CausalSyncPayload[] {
    const graph = collectPromptCanonicalGraph(
      this.prompts,
      this.folders,
      this.database,
    );
    validatePromptCanonicalGraphSnapshot(graph);
    const resources = graphResources(graph);
    const media = new Map<string, SyncResourceIdentity>();
    for (const resource of resources)
      for (const entry of resource.references)
        if (entry.resourceType === "image" || entry.resourceType === "video")
          media.set(resourceKey(entry), entry);
    for (const entry of media.values()) {
      if (entry.resourceType !== "image" && entry.resourceType !== "video")
        continue;
      resources.push(
        payload(entry.resourceType, entry.resourceId, {
          base64: readMedia(
            mediaPath(this.root, entry.resourceType, entry.resourceId),
          ),
        }),
      );
    }
    return resources;
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const graph = decodeGraph(resources);
    const entries: CanonicalEntryMutation[] = [];
    for (const resource of resources) {
      if (
        resource.resourceType !== "image" &&
        resource.resourceType !== "video"
      )
        continue;
      const value: unknown = JSON.parse(resource.text);
      if (
        typeof value !== "object" ||
        value === null ||
        !("base64" in value) ||
        typeof value.base64 !== "string"
      )
        throw new Error("Invalid sync media payload");
      const bytes = Buffer.from(value.base64, "base64");
      if (bytes.toString("base64") !== value.base64)
        throw new Error("Invalid sync media encoding");
      if (
        payload(resource.resourceType, resource.resourceId, {
          base64: value.base64,
        }).contentHash !== resource.contentHash ||
        resource.references.length !== 0
      )
        throw new Error("Invalid sync media resource fields");
      const targetPath = mediaPath(
        this.root,
        resource.resourceType,
        resource.resourceId,
      );
      if (fs.existsSync(targetPath) && readMedia(targetPath) === value.base64)
        continue;
      entries.push({
        targetPath,
        prepare(stage) {
          fs.writeFileSync(stage, bytes, { flag: "wx", mode: 0o600 });
        },
      });
    }
    return { entries, apply: () => this.applyGraph(graph) };
  }

  private applyGraph(graph: PromptCanonicalGraphSnapshot): void {
    const relationDb = new PromptRelationDB(this.database);
    const outputDb = new PromptOutputFormatDB(this.database);
    const keep = (rows: Array<{ id: string }>) =>
      new Set(rows.map((row) => row.id));
    const promptIds = keep(graph.prompts);
    const folderIds = keep(graph.folders);
    const relationIds = keep(graph.promptRelations);
    const outputIds = keep(graph.outputFormatItems);
    this.database.exec("PRAGMA defer_foreign_keys = ON");
    for (const folder of graph.folders) this.folders.insertFolderDirect(folder);
    for (const prompt of graph.prompts) this.prompts.insertPromptDirect(prompt);
    const versionIds = keep(graph.promptVersions);
    for (const prompt of graph.prompts)
      for (const previous of this.prompts.getVersions(prompt.id))
        if (!versionIds.has(previous.id))
          this.prompts.deleteVersion(previous.id);
    for (const version of graph.promptVersions)
      this.prompts.insertVersionDirect(version);
    for (const relation of relationDb.list())
      if (!relationIds.has(relation.id)) relationDb.delete(relation.id);
    for (const item of outputDb.list())
      if (!outputIds.has(item.id)) outputDb.delete(item.id);
    for (const relation of graph.promptRelations)
      relationDb.insertRelationDirect(relation);
    for (const item of graph.outputFormatItems) outputDb.insertItemDirect(item);
    for (const prompt of this.prompts.getAll())
      if (!promptIds.has(prompt.id)) this.prompts.delete(prompt.id);
    for (const folder of this.folders.getAll())
      if (!folderIds.has(folder.id)) this.folders.delete(folder.id);
  }
}
