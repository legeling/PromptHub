import { WORKSPACE_SNAPSHOT_CHUNK_BYTES } from "../types/workspace-snapshot";
export const WORKSPACE_BACKUP_KIND = "prompthub-workspace-backup";
export interface WorkspaceBackupChunk {
  objectId: string;
  hash: string;
  sizeBytes: number;
}
export interface WorkspaceBackupManifest {
  counts: Record<string, number>;
  kind: typeof WORKSPACE_BACKUP_KIND;
  version: 1;
  updatedAt: string;
  sizeBytes: number;
  encrypted: boolean;
  chunks: WorkspaceBackupChunk[];
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid workspace backup manifest");
  return value as Record<string, unknown>; // Shape checked at the transport boundary.
}
export function parseWorkspaceBackupManifest(
  text: string,
): WorkspaceBackupManifest | null {
  const value = record(JSON.parse(text));
  if (value.kind !== WORKSPACE_BACKUP_KIND) return null;
  if (
    value.version !== 1 ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    typeof value.sizeBytes !== "number" ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 1 ||
    typeof value.encrypted !== "boolean" ||
    !Array.isArray(value.chunks) ||
    value.chunks.length !==
      Math.ceil(value.sizeBytes / WORKSPACE_SNAPSHOT_CHUNK_BYTES)
  )
    throw new Error("Unsupported or invalid workspace backup manifest");
  const counts = record(value.counts);
  if (
    Object.values(counts).some(
      (count) =>
        typeof count !== "number" || !Number.isSafeInteger(count) || count < 0,
    )
  )
    throw new Error("Invalid snapshot counts");
  let total = 0;
  const chunks = value.chunks.map((input, index) => {
    const chunk = record(input);
    if (
      typeof chunk.objectId !== "string" ||
      !/^[a-f0-9-]{36}-[0-9]+-[a-f0-9]{64}$/.test(chunk.objectId) ||
      typeof chunk.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(chunk.hash) ||
      !chunk.objectId.endsWith(chunk.hash) ||
      typeof chunk.sizeBytes !== "number" ||
      chunk.sizeBytes !==
        Math.min(
          WORKSPACE_SNAPSHOT_CHUNK_BYTES,
          Number(value.sizeBytes) - index * WORKSPACE_SNAPSHOT_CHUNK_BYTES,
        )
    )
      throw new Error("Invalid workspace backup chunk reference");
    total += chunk.sizeBytes;
    return {
      objectId: chunk.objectId,
      hash: chunk.hash,
      sizeBytes: chunk.sizeBytes,
    };
  });
  if (total !== value.sizeBytes)
    throw new Error("Incomplete workspace backup manifest");
  return {
    counts: counts as Record<string, number>,
    kind: WORKSPACE_BACKUP_KIND,
    version: 1,
    updatedAt: value.updatedAt,
    sizeBytes: value.sizeBytes,
    encrypted: value.encrypted,
    chunks,
  };
}
