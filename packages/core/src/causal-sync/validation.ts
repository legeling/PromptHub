import type {
  CausalSyncGeneration,
  CausalSyncResource,
  SyncResourceContent,
  SyncResourceIdentity,
} from "@prompthub/shared/types/causal-sync";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Causal sync ${label} must be an object`);
  // The checked boundary exposes only unknown-valued fields to the parser.
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error("Causal sync contains an unknown field");
}

export function syncIdentity(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || /\p{Cc}/u.test(value))
    throw new Error(`Causal sync ${label} is invalid`);
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new Error("Causal sync revision is invalid");
  return value;
}

function contentHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    throw new Error("Causal sync content hash is invalid");
  return value;
}

export function resourceKey(value: SyncResourceIdentity): string {
  return JSON.stringify([value.resourceType, value.resourceId]);
}

function identity(value: Record<string, unknown>): SyncResourceIdentity {
  return {
    resourceType: syncIdentity(value.resourceType, "resource type"),
    resourceId: syncIdentity(value.resourceId, "resource identity"),
  };
}

function references(value: unknown): SyncResourceIdentity[] {
  if (!Array.isArray(value))
    throw new Error("Causal sync references are invalid");
  const parsed = value.map((entry: unknown) => {
    const item = record(entry, "reference");
    exactKeys(item, ["resourceType", "resourceId"]);
    return identity(item);
  });
  uniqueIndex(parsed);
  return parsed.sort(compareResources);
}

export function compareResources(
  left: SyncResourceIdentity,
  right: SyncResourceIdentity,
): number {
  const a = resourceKey(left);
  const b = resourceKey(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function uniqueIndex<T extends SyncResourceIdentity>(
  values: T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = resourceKey(value);
    if (result.has(key))
      throw new Error("Causal sync contains a duplicate resource identity");
    result.set(key, value);
  }
  return result;
}

const CONTENT_KEYS = [
  "resourceType",
  "resourceId",
  "contentHash",
  "references",
];

function content(value: Record<string, unknown>): SyncResourceContent {
  return {
    ...identity(value),
    contentHash: contentHash(value.contentHash),
    references: references(value.references),
  };
}

export function parseLocalSyncInventory(value: unknown): SyncResourceContent[] {
  if (!Array.isArray(value))
    throw new Error("Causal sync local inventory is invalid");
  const values = value.map((entry: unknown) => {
    const item = record(entry, "local resource");
    exactKeys(item, CONTENT_KEYS);
    return content(item);
  });
  uniqueIndex(values);
  return values;
}

function parseResource(value: unknown): CausalSyncResource {
  const item = record(value, "resource");
  const metadata = {
    revision: revision(item.revision),
    commitId: syncIdentity(item.commitId, "resource commit identity"),
    deviceId: syncIdentity(item.deviceId, "resource device identity"),
  };
  const metadataKeys = ["state", "revision", "commitId", "deviceId"];
  if (item.state === "live") {
    exactKeys(item, [...CONTENT_KEYS, ...metadataKeys]);
    return { ...content(item), ...metadata, state: "live" };
  }
  if (item.state !== "deleted")
    throw new Error("Causal sync resource state is invalid");
  exactKeys(item, [
    "resourceType",
    "resourceId",
    "previousContentHash",
    ...metadataKeys,
  ]);
  return {
    ...identity(item),
    ...metadata,
    state: "deleted",
    previousContentHash: contentHash(item.previousContentHash),
  };
}

function assertResourceRevisions(generation: CausalSyncGeneration): void {
  const commits = new Map<number, string>();
  const revisions = new Map<string, number>();
  for (const entry of generation.resources) {
    const identity = JSON.stringify([entry.commitId, entry.deviceId]);
    if (
      (commits.has(entry.revision) &&
        commits.get(entry.revision) !== identity) ||
      (revisions.has(entry.commitId) &&
        revisions.get(entry.commitId) !== entry.revision)
    )
      throw new Error(
        "Causal sync resources have inconsistent commit identities",
      );
    commits.set(entry.revision, identity);
    revisions.set(entry.commitId, entry.revision);
    if (
      entry.revision > generation.revision ||
      (entry.revision === generation.revision &&
        (entry.commitId !== generation.commitId ||
          entry.deviceId !== generation.deviceId)) ||
      (entry.revision < generation.revision &&
        entry.commitId === generation.commitId)
    )
      throw new Error(
        "Causal sync resource revision does not match its generation",
      );
  }
}

export function parseCausalSyncGeneration(
  value: unknown,
): CausalSyncGeneration {
  const item = record(value, "generation");
  exactKeys(item, [
    "kind",
    "schemaVersion",
    "syncId",
    "revision",
    "commitId",
    "parentCommitId",
    "deviceId",
    "resources",
  ]);
  if (item.kind !== "prompthub-causal-sync" || item.schemaVersion !== 1)
    throw new Error("Causal sync generation format is unsupported");
  if (!Array.isArray(item.resources))
    throw new Error("Causal sync resources are invalid");
  const currentRevision = revision(item.revision);
  const commitId = syncIdentity(item.commitId, "commit identity");
  const parentCommitId =
    item.parentCommitId === null
      ? null
      : syncIdentity(item.parentCommitId, "parent commit identity");
  if (
    (currentRevision === 1) !== (parentCommitId === null) ||
    parentCommitId === commitId
  )
    throw new Error("Causal sync parent commit is invalid");
  const result: CausalSyncGeneration = {
    kind: "prompthub-causal-sync",
    schemaVersion: 1,
    syncId: syncIdentity(item.syncId, "sync identity"),
    revision: currentRevision,
    commitId,
    parentCommitId,
    deviceId: syncIdentity(item.deviceId, "device identity"),
    resources: item.resources.map(parseResource),
  };
  uniqueIndex(result.resources);
  assertResourceRevisions(result);
  return result;
}
