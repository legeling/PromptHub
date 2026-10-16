import type {
  RemoteTextStorage,
  RemoteUploadResult,
  RemoteWriteCondition,
} from "@prompthub/shared/types/remote-sync";
import { parseRemoteWriteCondition } from "@prompthub/shared/utils/remote-write-condition";

export type ConditionalPublicationCapability =
  | { supported: true }
  | {
      supported: false;
      reason:
        | "probe-unavailable"
        | "condition-not-enforced"
        | "missing-strong-etag";
    }
  | { supported: false; reason: "probe-cleanup-failed"; probePath: string };

export type RemotePublicationResult =
  | { status: "published"; etag?: string }
  | { status: "conflict" }
  | { status: "uncertain"; error?: string };

function strongCondition(etag: string | undefined): RemoteWriteCondition {
  if (etag === undefined)
    throw new Error("Remote publication requires a strong ETag");
  const condition = parseRemoteWriteCondition({ ifMatch: etag });
  if (!condition) throw new Error("Remote publication requires a strong ETag");
  return condition;
}

async function checkProbe(
  store: RemoteTextStorage,
  path: string,
  initial: string,
): Promise<ConditionalPublicationCapability> {
  const base = await store.downloadText(path);
  if (!base.success || base.data !== initial)
    return { supported: false, reason: "probe-unavailable" };
  let condition: RemoteWriteCondition;
  try {
    condition = strongCondition(base.etag);
  } catch {
    return { supported: false, reason: "missing-strong-etag" };
  }
  const duplicate = await store.uploadText(path, `${initial}:duplicate`, {
    ifNoneMatch: "*",
  });
  if (duplicate.success || !duplicate.conflict)
    return { supported: false, reason: "condition-not-enforced" };
  if ((await store.downloadText(path)).data !== initial)
    return { supported: false, reason: "condition-not-enforced" };
  const next = `${initial}:next`;
  const advance = await store.uploadText(path, next, condition);
  const advanced = await store.downloadText(path);
  if (
    !advance.success ||
    !advanced.success ||
    advanced.data !== next ||
    advanced.etag === base.etag
  )
    return { supported: false, reason: "condition-not-enforced" };
  try {
    strongCondition(advanced.etag);
  } catch {
    return { supported: false, reason: "missing-strong-etag" };
  }
  const stale = await store.uploadText(path, `${initial}:stale`, condition);
  const preserved = await store.downloadText(path);
  return !stale.success &&
    stale.conflict &&
    preserved.success &&
    preserved.data === next
    ? { supported: true }
    : { supported: false, reason: "condition-not-enforced" };
}

/** The probe has a unique owned name in an already-prepared remote directory. */
export async function verifyConditionalPublication(
  store: RemoteTextStorage,
  manifestPath: string,
): Promise<ConditionalPublicationCapability> {
  const identity = crypto.randomUUID();
  const probePath = `${manifestPath}.probe.${identity}`;
  let attempted = false;
  let result: ConditionalPublicationCapability = {
    supported: false,
    reason: "probe-unavailable",
  };
  try {
    attempted = true;
    const created = await store.uploadText(probePath, identity, {
      ifNoneMatch: "*",
    });
    // A rejected create is not ours. An uncertain create may still need cleanup.
    if (created.conflict) attempted = false;
    if (created.success) result = await checkProbe(store, probePath, identity);
  } catch {
    result = { supported: false, reason: "probe-unavailable" };
  }
  if (attempted) {
    try {
      if (!(await store.deleteText(probePath)).success)
        return { supported: false, reason: "probe-cleanup-failed", probePath };
    } catch {
      return { supported: false, reason: "probe-cleanup-failed", probePath };
    }
  }
  return result;
}

/** Only use after the target has passed conditional-publication verification. */
export async function publishObservedRemoteText(
  store: Pick<RemoteTextStorage, "uploadText" | "downloadText">,
  path: string,
  candidate: string,
  observed: { data?: string; etag?: string } | null,
): Promise<RemotePublicationResult> {
  const condition =
    observed === null
      ? { ifNoneMatch: "*" as const }
      : strongCondition(observed.etag);
  let outcome: RemoteUploadResult;
  try {
    outcome = await store.uploadText(path, candidate, condition);
  } catch (error) {
    outcome = {
      success: false,
      error:
        error instanceof Error ? error.message : "Remote publication failed",
    };
  }
  if (outcome.success) return { status: "published", etag: outcome.etag };
  if (outcome.conflict) return { status: "conflict" };
  // A lost acknowledgement is reconciled by exact generation bytes, never a
  // second write. Other data cannot establish whether this generation committed.
  try {
    const current = await store.downloadText(path);
    if (current.success && current.data === candidate)
      return { status: "published", etag: current.etag };
  } catch {
    return { status: "uncertain", error: outcome.error };
  }
  return { status: "uncertain", error: outcome.error };
}
