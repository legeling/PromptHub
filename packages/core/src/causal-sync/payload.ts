import type { SyncResourceIdentity } from "@prompthub/shared/types/causal-sync";
import { syncPayloadHash, type CausalSyncPayload } from "./workflow";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}

export function syncPayload(
  resourceType: string,
  resourceId: string,
  value: unknown,
  references: SyncResourceIdentity[] = [],
): CausalSyncPayload {
  const text = JSON.stringify(stable(value));
  if (text === undefined) throw new Error("Sync payload is not serializable");
  return {
    resourceType,
    resourceId,
    references,
    text,
    contentHash: syncPayloadHash(text),
  };
}

export function syncPayloadRecord(
  resource: CausalSyncPayload,
): Record<string, unknown> {
  const value: unknown = JSON.parse(resource.text);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid sync resource payload");
  return value as Record<string, unknown>; // Object shape checked at the transport boundary.
}
