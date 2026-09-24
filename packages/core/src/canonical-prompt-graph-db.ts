import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  FolderDB as BaseFolderDB,
  PromptDB as BasePromptDB,
  PromptOutputFormatDB as BasePromptOutputFormatDB,
  PromptRelationDB as BasePromptRelationDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  CanonicalPostCommitError,
  isCanonicalCommitOutcomeError,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { storeContentAddressedObject } from "./content-addressed-object-store";
import { calculatePromptCanonicalGraphHash } from "./prompt-canonical-catalog";
import {
  collectPromptCanonicalGraph,
  materializePromptCanonicalGraph,
  PROMPT_CANONICAL_GRAPH_MANIFEST_FILE,
  type PromptCanonicalGraphSnapshot,
} from "./prompt-canonical-export";
import { readPromptCanonicalGraph } from "./prompt-canonical-import";
import { readResourceBundle } from "./resource-bundle";
import {
  getDataDir,
  getImagesDir,
  getRuntimeStorageContext,
  getUserDataPath,
  getVideosDir,
} from "./runtime-paths";

const OPERATION_KEY = "prompt-graph";
const GRAPH_DIRECTORIES = [
  "prompts",
  "folders",
  "tags",
  "relations",
  "output-formats",
] as const;
const MAX_CAS_OBJECTS_PER_PUBLICATION = 20_000;

interface ExistingPromptState {
  prompt: Prompt;
  versions: PromptVersion[];
  revision: number;
  media: Map<string, string>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function samePromptState(
  left: { prompt: Prompt; versions: PromptVersion[] },
  right: { prompt: Prompt; versions: PromptVersion[] },
): boolean {
  return (
    JSON.stringify(
      stableValue({
        prompt: left.prompt,
        versions: left.versions,
      }),
    ) ===
    JSON.stringify(
      stableValue({
        prompt: right.prompt,
        versions: right.versions,
      }),
    )
  );
}

function promptBundlePath(promptId: string): string {
  return path.join(
    getDataDir(),
    "prompts",
    encodeCanonicalResourceDirectory(promptId),
  );
}

function promptStateFromSnapshot(
  snapshot: PromptCanonicalGraphSnapshot,
): Map<string, { prompt: Prompt; versions: PromptVersion[] }> {
  const versions = new Map<string, PromptVersion[]>();
  for (const version of snapshot.promptVersions) {
    const owner = versions.get(version.promptId) ?? [];
    owner.push(version);
    versions.set(version.promptId, owner);
  }
  return new Map(
    snapshot.prompts.map((prompt) => [
      prompt.id,
      {
        prompt,
        versions: (versions.get(prompt.id) ?? []).sort(
          (left, right) => left.version - right.version,
        ),
      },
    ]),
  );
}

function readExistingPromptStates(): Map<string, ExistingPromptState> {
  const catalogPath = path.join(
    getDataDir(),
    PROMPT_CANONICAL_GRAPH_MANIFEST_FILE,
  );
  if (!fs.existsSync(catalogPath)) return new Map();
  const graph = readPromptCanonicalGraph(getDataDir()).snapshot;
  const states = promptStateFromSnapshot(graph);
  return new Map(
    [...states].map(([promptId, state]) => {
      const bundlePath = promptBundlePath(promptId);
      const bundle = readResourceBundle(bundlePath, {
        expectedResourceType: "prompt",
      });
      const raw: unknown = JSON.parse(
        fs.readFileSync(path.join(bundlePath, "prompt.json"), "utf8"),
      );
      const media = new Map<string, string>();
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const objects = Reflect.get(raw, "mediaObjects");
        if (Array.isArray(objects)) {
          for (const item of objects) {
            if (!item || typeof item !== "object" || Array.isArray(item))
              continue;
            const kind = Reflect.get(item, "kind");
            const reference = Reflect.get(item, "reference");
            const hash = Reflect.get(item, "sha256");
            if (
              (kind === "image" || kind === "video") &&
              typeof reference === "string" &&
              typeof hash === "string" &&
              /^[a-f0-9]{64}$/u.test(hash)
            ) {
              media.set(`${kind}\0${reference}`, hash);
            }
          }
        }
      }
      return [
        promptId,
        { ...state, revision: bundle.manifest.revision, media },
      ];
    }),
  );
}

function resolveMediaSource(
  existing: ReadonlyMap<string, ExistingPromptState>,
  prompt: Prompt,
  kind: "image" | "video",
  reference: string,
): string {
  const sourcePath = path.join(
    kind === "image" ? getImagesDir() : getVideosDir(),
    ...reference.split("/"),
  );
  if (fs.existsSync(sourcePath)) return sourcePath;
  const hash = existing.get(prompt.id)?.media.get(`${kind}\0${reference}`);
  if (!hash) throw new Error(`Prompt media source is missing: ${reference}`);
  return path.join(
    getDataDir(),
    "assets",
    "objects",
    "sha256",
    hash.slice(0, 2),
    hash,
  );
}

function publishStagedObjects(stageRoot: string): void {
  const objectsRoot = path.join(stageRoot, "assets", "objects", "sha256");
  if (!fs.existsSync(objectsRoot)) return;
  let count = 0;
  for (const prefix of fs.readdirSync(objectsRoot)) {
    const prefixPath = path.join(objectsRoot, prefix);
    const stats = fs.lstatSync(prefixPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Staged Prompt object prefix is invalid");
    }
    for (const hash of fs.readdirSync(prefixPath)) {
      count += 1;
      if (count > MAX_CAS_OBJECTS_PER_PUBLICATION) {
        throw new Error("Prompt object publication limit exceeded");
      }
      if (!/^[a-f0-9]{64}$/u.test(hash) || hash.slice(0, 2) !== prefix) {
        throw new Error("Staged Prompt object identity is invalid");
      }
      storeContentAddressedObject(
        path.join(getDataDir(), "assets", "objects"),
        path.join(prefixPath, hash),
        { expectedHash: hash },
      );
    }
  }
}

function graphHashIfReadable(
  ignorePublicationArtifacts = false,
): string | null {
  const catalogPath = path.join(
    getDataDir(),
    PROMPT_CANONICAL_GRAPH_MANIFEST_FILE,
  );
  if (!fs.existsSync(catalogPath)) return null;
  return calculatePromptCanonicalGraphHash(
    readPromptCanonicalGraph(getDataDir(), { ignorePublicationArtifacts })
      .snapshot,
  );
}

export function assertCanonicalPromptCatalogCurrent(
  database: DatabaseAdapter.Database,
): void {
  if (getRuntimeStorageContext().localAuthority !== "canonical-files") return;
  try {
    const snapshot = collectPromptCanonicalGraph(
      new BasePromptDB(database),
      new BaseFolderDB(database),
      database,
    );
    if (graphHashIfReadable() !== calculatePromptCanonicalGraphHash(snapshot))
      throw new Error("Canonical Prompt catalog requires recovery from files");
  } catch (error) {
    const reason =
      error instanceof Error
        ? error
        : new Error("Canonical Prompt catalog requires recovery", {
            cause: error,
          });
    database.invalidate(reason);
    throw reason;
  }
}

export function publishCanonicalPromptGraph(
  database: DatabaseAdapter.Database,
): "not-authority" | "unchanged" | "published" {
  if (getRuntimeStorageContext().localAuthority !== "canonical-files") {
    return "not-authority";
  }
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const snapshot = collectPromptCanonicalGraph(
    new BasePromptDB(database),
    new BaseFolderDB(database),
    database,
  );
  const expectedHash = calculatePromptCanonicalGraphHash(snapshot);
  if (graphHashIfReadable() === expectedHash) return "unchanged";

  const existing = readExistingPromptStates();
  const next = promptStateFromSnapshot(snapshot);
  const stageRoot = path.join(
    getDataDir(),
    "operations",
    `prompt-graph-stage-${process.pid}-${crypto.randomUUID()}`,
  );
  let published = false;
  try {
    materializePromptCanonicalGraph(stageRoot, snapshot, {
      resolveMediaSource: (prompt, kind, reference) =>
        resolveMediaSource(existing, prompt, kind, reference),
      resolvePromptRevision(prompt, defaultRevision) {
        const prior = existing.get(prompt.id);
        const current = next.get(prompt.id)!;
        if (prior && samePromptState(prior, current)) {
          return prior.revision;
        }
        return prior ? prior.revision + 1 : defaultRevision;
      },
      resolveExistingPromptBundle(prompt) {
        const prior = existing.get(prompt.id);
        const current = next.get(prompt.id)!;
        return prior && samePromptState(prior, current)
          ? promptBundlePath(prompt.id)
          : undefined;
      },
      resolveExistingObjectSource(hash) {
        return path.join(
          getDataDir(),
          "assets",
          "objects",
          "sha256",
          hash.slice(0, 2),
          hash,
        );
      },
    });
    publishStagedObjects(stageRoot);
    const entries: CanonicalEntryMutation[] = GRAPH_DIRECTORIES.map(
      (directory) => ({
        targetPath: path.join(getDataDir(), directory),
        prepare(targetStagePath: string) {
          const sourcePath = path.join(stageRoot, directory);
          if (fs.existsSync(sourcePath))
            fs.renameSync(sourcePath, targetStagePath);
          else fs.mkdirSync(targetStagePath, { recursive: true, mode: 0o700 });
        },
      }),
    );
    entries.push({
      targetPath: path.join(getDataDir(), PROMPT_CANONICAL_GRAPH_MANIFEST_FILE),
      prepare(targetStagePath) {
        fs.renameSync(
          path.join(stageRoot, PROMPT_CANONICAL_GRAPH_MANIFEST_FILE),
          targetStagePath,
        );
      },
    });
    publishCanonicalEntries({
      rootPath: getUserDataPath(),
      operationKey: OPERATION_KEY,
      entries,
      verify() {
        if (graphHashIfReadable(true) !== expectedHash) {
          throw new Error("Canonical Prompt graph verification failed");
        }
      },
    });
    published = true;
    return "published";
  } finally {
    try {
      fs.rmSync(stageRoot, { recursive: true, force: true });
    } catch (error) {
      if (!published) throw error;
      console.warn("Committed Prompt staging cleanup is pending", error);
    }
  }
}

class CanonicalPromptCoordinator {
  private depth = 0;

  constructor(private readonly database: DatabaseAdapter.Database) {}

  mutate<T>(operation: () => T): T {
    if (
      getRuntimeStorageContext().localAuthority !== "canonical-files" ||
      this.depth > 0
    ) {
      return operation();
    }
    if (this.database.inTransaction) {
      throw new Error("Canonical mutation requires its own command boundary");
    }
    this.database.assertAvailable();
    this.depth += 1;
    let published = false;
    try {
      return this.database.transaction(() => {
        const result = operation();
        published = publishCanonicalPromptGraph(this.database) === "published";
        return result;
      })();
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) {
        this.database.invalidate(error);
        throw error;
      }
      if (published) {
        const pending = new CanonicalPostCommitError("prompt-graph", error);
        this.database.invalidate(pending);
        throw pending;
      }
      try {
        publishCanonicalPromptGraph(this.database);
      } catch (reconciliationError) {
        throw new AggregateError(
          [error, reconciliationError],
          "Prompt mutation failed and canonical reconciliation also failed",
          { cause: error },
        );
      }
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
}

const coordinators = new WeakMap<
  DatabaseAdapter.Database,
  CanonicalPromptCoordinator
>();

function coordinator(
  database: DatabaseAdapter.Database,
): CanonicalPromptCoordinator {
  const current = coordinators.get(database);
  if (current) return current;
  const created = new CanonicalPromptCoordinator(database);
  coordinators.set(database, created);
  return created;
}

export class CanonicalPromptDB extends BasePromptDB {
  private readonly coordinator: CanonicalPromptCoordinator;

  constructor(database: DatabaseAdapter.Database) {
    super(database);
    this.coordinator = coordinator(database);
  }

  publishCanonicalGraph(): "not-authority" | "unchanged" | "published" {
    return publishCanonicalPromptGraph(this.db);
  }

  override create(...args: Parameters<BasePromptDB["create"]>) {
    return this.coordinator.mutate(() => super.create(...args));
  }
  override update(...args: Parameters<BasePromptDB["update"]>) {
    return this.coordinator.mutate(() => super.update(...args));
  }
  override delete(...args: Parameters<BasePromptDB["delete"]>) {
    return this.coordinator.mutate(() => super.delete(...args));
  }
  override incrementUsage(...args: Parameters<BasePromptDB["incrementUsage"]>) {
    return this.coordinator.mutate(() => super.incrementUsage(...args));
  }
  override createVersion(...args: Parameters<BasePromptDB["createVersion"]>) {
    return this.coordinator.mutate(() => super.createVersion(...args));
  }
  override deleteVersion(...args: Parameters<BasePromptDB["deleteVersion"]>) {
    return this.coordinator.mutate(() => super.deleteVersion(...args));
  }
  override rollback(...args: Parameters<BasePromptDB["rollback"]>) {
    return this.coordinator.mutate(() => super.rollback(...args));
  }
  override renameTag(...args: Parameters<BasePromptDB["renameTag"]>) {
    return this.coordinator.mutate(() => super.renameTag(...args));
  }
  override deleteTag(...args: Parameters<BasePromptDB["deleteTag"]>) {
    return this.coordinator.mutate(() => super.deleteTag(...args));
  }
  override movePrompt(...args: Parameters<BasePromptDB["movePrompt"]>) {
    return this.coordinator.mutate(() => super.movePrompt(...args));
  }
}

export class CanonicalFolderDB extends BaseFolderDB {
  private readonly coordinator: CanonicalPromptCoordinator;

  constructor(database: DatabaseAdapter.Database) {
    super(database);
    this.coordinator = coordinator(database);
  }

  override create(...args: Parameters<BaseFolderDB["create"]>) {
    return this.coordinator.mutate(() => super.create(...args));
  }
  override update(...args: Parameters<BaseFolderDB["update"]>) {
    return this.coordinator.mutate(() => super.update(...args));
  }
  override delete(...args: Parameters<BaseFolderDB["delete"]>) {
    return this.coordinator.mutate(() => super.delete(...args));
  }
  override reorder(...args: Parameters<BaseFolderDB["reorder"]>) {
    return this.coordinator.mutate(() => super.reorder(...args));
  }
}

export class CanonicalPromptRelationDB extends BasePromptRelationDB {
  private readonly coordinator: CanonicalPromptCoordinator;

  constructor(database: DatabaseAdapter.Database) {
    super(database);
    this.coordinator = coordinator(database);
  }

  override create(...args: Parameters<BasePromptRelationDB["create"]>) {
    return this.coordinator.mutate(() => super.create(...args));
  }
  override update(...args: Parameters<BasePromptRelationDB["update"]>) {
    return this.coordinator.mutate(() => super.update(...args));
  }
  override delete(...args: Parameters<BasePromptRelationDB["delete"]>) {
    return this.coordinator.mutate(() => super.delete(...args));
  }
}

export class CanonicalPromptOutputFormatDB extends BasePromptOutputFormatDB {
  private readonly coordinator: CanonicalPromptCoordinator;

  constructor(database: DatabaseAdapter.Database) {
    super(database);
    this.coordinator = coordinator(database);
  }

  override create(...args: Parameters<BasePromptOutputFormatDB["create"]>) {
    return this.coordinator.mutate(() => super.create(...args));
  }
  override update(...args: Parameters<BasePromptOutputFormatDB["update"]>) {
    return this.coordinator.mutate(() => super.update(...args));
  }
  override reorder(...args: Parameters<BasePromptOutputFormatDB["reorder"]>) {
    return this.coordinator.mutate(() => super.reorder(...args));
  }
  override delete(...args: Parameters<BasePromptOutputFormatDB["delete"]>) {
    return this.coordinator.mutate(() => super.delete(...args));
  }
  override deleteBySourcePromptId(
    ...args: Parameters<BasePromptOutputFormatDB["deleteBySourcePromptId"]>
  ) {
    return this.coordinator.mutate(() => super.deleteBySourcePromptId(...args));
  }
}
