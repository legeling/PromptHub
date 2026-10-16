import crypto from "node:crypto";
import type {
  CausalSyncGeneration,
  SyncResourceContent,
} from "@prompthub/shared/types/causal-sync";
import type { SyncTargetRow } from "@prompthub/db";
import { parseRemoteWriteCondition } from "@prompthub/shared/utils/remote-write-condition";
import {
  compareResources,
  parseCausalSyncGeneration,
  parseLocalSyncInventory,
  syncIdentity,
} from "./validation";

export interface CausalSyncOperation {
  operationId: string;
  mode: "publish" | "apply" | "unchanged";
  phase: "prepared" | "remote-confirmed";
  localInventoryHash: string;
  observedEtag: string | null;
  generation: CausalSyncGeneration;
}

export interface CausalSyncSessionState {
  targetId: string;
  deviceId: string;
  syncId: string;
  base: CausalSyncGeneration | null;
  pending: CausalSyncOperation | null;
}

export function inventoryHash(inventory: SyncResourceContent[]): string {
  const normalized = parseLocalSyncInventory(inventory).sort(compareResources);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function generationText(value: CausalSyncGeneration): string {
  const normalized = parseCausalSyncGeneration(value);
  normalized.resources.sort(compareResources);
  return JSON.stringify(normalized);
}

export function liveInventory(
  generation: CausalSyncGeneration,
): SyncResourceContent[] {
  return generation.resources.flatMap((entry) =>
    entry.state === "deleted"
      ? []
      : [
          {
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            contentHash: entry.contentHash,
            references: entry.references,
          },
        ],
  );
}

export function checkedEtag(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid sync observed ETag");
  parseRemoteWriteCondition({ ifMatch: value });
  return value;
}

function parseOperation(raw: unknown): CausalSyncOperation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("Invalid sync pending operation");
  // Validation below narrows each field before constructing the protocol value.
  const value = raw as Record<string, unknown>;
  const keys = [
    "operationId",
    "mode",
    "phase",
    "localInventoryHash",
    "observedEtag",
    "generation",
  ];
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    (value.mode !== "publish" &&
      value.mode !== "apply" &&
      value.mode !== "unchanged") ||
    (value.phase !== "prepared" && value.phase !== "remote-confirmed") ||
    (value.mode !== "publish" && value.phase !== "remote-confirmed") ||
    typeof value.localInventoryHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.localInventoryHash)
  )
    throw new Error("Invalid sync pending operation");
  const generation = parseCausalSyncGeneration(value.generation);
  const operationId = syncIdentity(
    value.operationId,
    "pending operation identity",
  );
  if (value.mode === "publish" && generation.commitId !== operationId)
    throw new Error("Invalid sync pending publication identity");
  return {
    operationId,
    mode: value.mode,
    phase: value.phase,
    localInventoryHash: value.localInventoryHash,
    observedEtag: checkedEtag(value.observedEtag),
    generation,
  };
}

export function parseSessionRow(row: SyncTargetRow): CausalSyncSessionState {
  const state = {
    targetId: syncIdentity(row.id, "target identity"),
    deviceId: syncIdentity(row.deviceId, "device identity"),
    syncId: syncIdentity(row.syncId, "sync identity"),
    base:
      row.baseJson === null
        ? null
        : parseCausalSyncGeneration(JSON.parse(row.baseJson)),
    pending:
      row.pendingJson === null
        ? null
        : parseOperation(JSON.parse(row.pendingJson)),
  };
  if (
    (state.base && state.base.syncId !== state.syncId) ||
    (state.pending && state.pending.generation.syncId !== state.syncId)
  )
    throw new Error("Stored sync identity is inconsistent");
  return state;
}

export function sessionRow(state: CausalSyncSessionState): SyncTargetRow {
  return {
    id: state.targetId,
    deviceId: state.deviceId,
    syncId: state.syncId,
    baseJson: state.base === null ? null : generationText(state.base),
    pendingJson: state.pending === null ? null : JSON.stringify(state.pending),
  };
}
