import type {
  CausalSyncConflict,
  CausalSyncGeneration,
  CausalSyncInput,
  CausalSyncPlan,
  CausalSyncResource,
  CausalSyncSelection,
  SyncResourceContent,
  SyncResourceIdentity,
} from "@prompthub/shared/types/causal-sync";
import {
  compareResources,
  parseCausalSyncGeneration,
  parseLocalSyncInventory,
  resourceKey,
  syncIdentity,
  uniqueIndex,
} from "./validation";

export { parseCausalSyncGeneration } from "./validation";

type Indexed<T extends SyncResourceIdentity> = ReadonlyMap<string, T>;
type MissingBase = Extract<CausalSyncPlan, { status: "baseline-required" }>;

function liveContent(
  entry: CausalSyncResource | undefined,
): SyncResourceContent | undefined {
  return entry?.state === "live" ? entry : undefined;
}

function sameContent(
  left: SyncResourceContent | undefined,
  right: SyncResourceContent | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.contentHash === right.contentHash &&
    left.references.length === right.references.length &&
    left.references.every(
      (entry, index) =>
        resourceKey(entry) === resourceKey(right.references[index]),
    )
  );
}

function sameEntry(
  left: CausalSyncResource,
  right: CausalSyncResource,
): boolean {
  return (
    left.state === right.state &&
    left.revision === right.revision &&
    left.commitId === right.commitId &&
    left.deviceId === right.deviceId &&
    (left.state === "deleted" && right.state === "deleted"
      ? left.previousContentHash === right.previousContentHash
      : sameContent(liveContent(left), liveContent(right)))
  );
}

function sameInventory(
  local: Indexed<SyncResourceContent>,
  remote: Indexed<CausalSyncResource>,
): boolean {
  let liveCount = 0;
  for (const [key, entry] of remote) {
    if (entry.state !== "live") continue;
    liveCount++;
    if (!sameContent(local.get(key), entry)) return false;
  }
  return local.size === liveCount;
}

function lineageProblem(
  base: CausalSyncGeneration,
  remote: CausalSyncGeneration,
): MissingBase | null {
  const diverged: MissingBase = {
    status: "baseline-required",
    reason: "remote-revision-diverged",
  };
  if (
    remote.revision < base.revision ||
    (remote.revision === base.revision && remote.commitId !== base.commitId) ||
    (remote.revision > base.revision && remote.commitId === base.commitId) ||
    (remote.revision === base.revision + 1 &&
      remote.parentCommitId !== base.commitId)
  )
    return diverged;
  const current = uniqueIndex(remote.resources);
  const previous = uniqueIndex(base.resources);
  for (const [key, before] of previous) {
    const after = current.get(key);
    if (!after)
      return { status: "baseline-required", reason: "remote-history-missing" };
    if (!sameEntry(before, after) && after.revision <= base.revision)
      return diverged;
  }
  for (const [key, after] of current)
    if (!previous.has(key) && after.revision <= base.revision) return diverged;
  if (
    remote.revision === base.revision &&
    (remote.parentCommitId !== base.parentCommitId ||
      remote.deviceId !== base.deviceId)
  )
    return diverged;
  return null;
}

function baselineProblem(
  input: CausalSyncInput,
  local: Indexed<SyncResourceContent>,
  remote: Indexed<CausalSyncResource>,
): MissingBase | null {
  if (
    (input.base && input.base.syncId !== input.syncId) ||
    (input.remote && input.remote.syncId !== input.syncId)
  )
    return { status: "baseline-required", reason: "sync-identity-changed" };
  if (input.base && !input.remote)
    return { status: "baseline-required", reason: "remote-missing" };
  if (input.base && input.remote)
    return lineageProblem(input.base, input.remote);
  if (
    !input.base &&
    input.remote &&
    local.size > 0 &&
    !sameInventory(local, remote)
  )
    return { status: "baseline-required", reason: "unrelated-local-data" };
  return null;
}

function conflict(
  identity: SyncResourceIdentity,
  base: Indexed<CausalSyncResource>,
  local: Indexed<SyncResourceContent>,
  remote: Indexed<CausalSyncResource>,
): CausalSyncConflict {
  const key = resourceKey(identity);
  return {
    resourceType: identity.resourceType,
    resourceId: identity.resourceId,
    reason: "concurrent-change",
    base: base.get(key) ?? null,
    local: local.get(key) ?? null,
    remote: remote.get(key) ?? null,
  };
}

function localEntry(
  input: CausalSyncInput,
  local: SyncResourceContent | undefined,
  before: CausalSyncResource | undefined,
): CausalSyncResource {
  const metadata = {
    revision: (input.remote?.revision ?? 0) + 1,
    commitId: input.commitId,
    deviceId: input.deviceId,
  };
  if (local) return { ...local, ...metadata, state: "live" };
  if (!before || before.state !== "live")
    throw new Error("Causal sync deletion is missing its live base");
  return {
    resourceType: before.resourceType,
    resourceId: before.resourceId,
    ...metadata,
    state: "deleted",
    previousContentHash: before.contentHash,
  };
}

function mergeResources(
  input: CausalSyncInput,
  base: Indexed<CausalSyncResource>,
  local: Indexed<SyncResourceContent>,
  remote: Indexed<CausalSyncResource>,
  choices = new Map<string, "local" | "remote">(),
) {
  const merged = new Map(remote);
  const conflicts: CausalSyncConflict[] = [];
  let changed = false;
  const keys = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  for (const key of keys) {
    const before = base.get(key);
    const here = local.get(key);
    const there = remote.get(key);
    const choice = choices.get(key);
    if (choice) {
      if (choice === "local" && !sameContent(here, liveContent(there))) {
        merged.set(
          key,
          localEntry(input, here, there?.state === "live" ? there : before),
        );
        changed = true;
      }
      continue;
    }
    const localChanged = !sameContent(here, liveContent(before));
    const remoteChanged =
      !sameContent(liveContent(there), liveContent(before)) ||
      (there?.state === "deleted" &&
        (!before || (before.state === "deleted" && !sameEntry(before, there))));
    if (!localChanged || sameContent(here, liveContent(there))) continue;
    if (remoteChanged) {
      const identity = here ?? before ?? there;
      if (!identity)
        throw new Error("Causal sync resource identity is missing");
      conflicts.push(conflict(identity, base, local, remote));
    } else {
      merged.set(key, localEntry(input, here, before));
      changed = true;
    }
  }
  return { merged, conflicts, changed };
}

function referenceConflicts(
  merged: Indexed<CausalSyncResource>,
  base: Indexed<CausalSyncResource>,
  local: Indexed<SyncResourceContent>,
  remote: Indexed<CausalSyncResource>,
): CausalSyncConflict[] {
  const conflicts: CausalSyncConflict[] = [];
  for (const entry of merged.values()) {
    if (entry.state !== "live") continue;
    for (const reference of entry.references) {
      if (merged.get(resourceKey(reference))?.state !== "live")
        conflicts.push({
          ...conflict(entry, base, local, remote),
          reason: "missing-reference",
          reference,
        });
    }
  }
  return conflicts;
}

function publication(
  input: CausalSyncInput,
  resources: CausalSyncResource[],
): CausalSyncPlan {
  const nextRevision = (input.remote?.revision ?? 0) + 1;
  if (!Number.isSafeInteger(nextRevision))
    throw new Error("Causal sync revision is exhausted");
  if (
    input.commitId === input.remote?.commitId ||
    input.commitId === input.base?.commitId ||
    [...(input.base?.resources ?? []), ...(input.remote?.resources ?? [])].some(
      (entry) => entry.commitId === input.commitId,
    )
  )
    throw new Error("Causal sync publication requires a new commit identity");
  return {
    status: "publish",
    generation: {
      kind: "prompthub-causal-sync",
      schemaVersion: 1,
      syncId: input.syncId,
      revision: nextRevision,
      commitId: input.commitId,
      parentCommitId: input.remote?.commitId ?? null,
      deviceId: input.deviceId,
      resources: resources.sort(compareResources),
    },
  };
}

/** Pure planner: publication and local application require the owning coordinator. */
export function planCausalSync(
  raw: CausalSyncInput,
  selection?: CausalSyncSelection,
): CausalSyncPlan {
  const input: CausalSyncInput = {
    syncId: syncIdentity(raw.syncId, "sync identity"),
    deviceId: syncIdentity(raw.deviceId, "device identity"),
    commitId: syncIdentity(raw.commitId, "commit identity"),
    base: raw.base === null ? null : parseCausalSyncGeneration(raw.base),
    remote: raw.remote === null ? null : parseCausalSyncGeneration(raw.remote),
    local: parseLocalSyncInventory(raw.local),
  };
  const base = uniqueIndex(input.base?.resources ?? []);
  const local = uniqueIndex(input.local);
  const remote = uniqueIndex(input.remote?.resources ?? []);
  const problem = baselineProblem(input, local, remote);
  if (selection?.kind === "baseline") {
    if (!problem)
      throw new Error("Sync baseline selection requires a baseline problem");
    if (selection.choice === "remote" && !input.remote)
      throw new Error("Cannot adopt a missing remote baseline");
    const selected =
      selection.choice === "local"
        ? input.local
        : [...remote.values()].flatMap((entry) =>
            entry.state === "live"
              ? [
                  {
                    resourceType: entry.resourceType,
                    resourceId: entry.resourceId,
                    contentHash: entry.contentHash,
                    references: entry.references,
                  },
                ]
              : [],
          );
    const plan = planCausalSync({
      ...input,
      syncId: input.remote?.syncId ?? input.syncId,
      base: input.remote,
      local: selected,
    });
    // The selection is a planning input; application still compares the actual local inventory.
    if (
      plan.status === "unchanged" &&
      !sameInventory(local, uniqueIndex(plan.generation.resources))
    )
      return { ...plan, status: "apply" };
    return plan;
  }
  if (problem) return problem;
  const choices = resolutionChoices(input, selection);
  // First join has no deletion authority. A matching or empty local inventory
  // adopts the remote graph after checking its references.
  const merged =
    !input.base && input.remote
      ? { merged: new Map(remote), conflicts: [], changed: false }
      : mergeResources(input, base, local, remote, choices);
  const conflicts = [
    ...merged.conflicts,
    ...referenceConflicts(merged.merged, base, local, remote),
  ];
  if (conflicts.length > 0) return { status: "conflict", conflicts };
  if (!merged.changed && input.remote)
    return {
      status: sameInventory(local, remote) ? "unchanged" : "apply",
      generation: input.remote,
    };
  return publication(input, [...merged.merged.values()]);
}

function resolutionChoices(
  input: CausalSyncInput,
  selection?: CausalSyncSelection,
): Map<string, "local" | "remote"> {
  const choices = new Map<string, "local" | "remote">();
  if (!selection || selection.kind !== "conflicts") return choices;
  const plan = planCausalSync(input);
  if (plan.status !== "conflict")
    throw new Error("Sync conflict selection requires a conflict");
  const allowed = new Set(
    plan.conflicts.flatMap((entry) => [
      resourceKey(entry),
      ...(entry.reference ? [resourceKey(entry.reference)] : []),
    ]),
  );
  for (const entry of selection.choices) {
    const key = resourceKey(entry);
    if (
      !allowed.has(key) ||
      choices.has(key) ||
      !["local", "remote"].includes(entry.choice)
    )
      throw new Error("Invalid sync conflict selection");
    choices.set(key, entry.choice);
  }
  if (choices.size !== allowed.size)
    throw new Error("Sync resolution requires every conflicting resource");
  return choices;
}
