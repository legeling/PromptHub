import crypto from "node:crypto";
import { SyncTargetDB } from "@prompthub/db";
import type Database from "@prompthub/db/adapter";
import type {
  CausalSyncGeneration,
  CausalSyncPlan,
  SyncResourceContent,
  CausalSyncSelection,
} from "@prompthub/shared/types/causal-sync";
import { planCausalSync } from "./index";
import { syncIdentity } from "./validation";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import { publishSqliteEntries } from "../sqlite-entry-publication";
import {
  checkedEtag,
  generationText,
  inventoryHash,
  liveInventory,
  parseSessionRow,
  sessionRow,
  type CausalSyncOperation,
  type CausalSyncSessionState,
} from "./session-state";

export type {
  CausalSyncOperation,
  CausalSyncSessionState,
} from "./session-state";

export interface PrepareCausalSyncInput {
  syncId: string;
  deviceId: string;
  local: SyncResourceContent[];
  remote: CausalSyncGeneration | null;
  remoteEtag: string | null;
  selection?: CausalSyncSelection;
}

export type PrepareCausalSyncResult =
  | { status: "prepared" | "pending"; operation: CausalSyncOperation }
  | Extract<CausalSyncPlan, { status: "conflict" | "baseline-required" }>;

export interface ApplyCausalSyncFilesOptions {
  rootPath: string;
  entries: readonly CanonicalEntryMutation[];
  readLocal: () => SyncResourceContent[];
  /** SQL writes only; files are staged and committed by the publication owner. */
  apply: (generation: CausalSyncGeneration) => void;
}

class LocalSyncInventoryChanged extends Error {}

/** SQL metadata only. Domain snapshots and immutable payloads retain their own owners. */
export class CausalSyncSession {
  private readonly targets: SyncTargetDB;
  private readonly targetId: string;

  constructor(
    private readonly database: Database.Database,
    targetId: string,
  ) {
    this.targets = new SyncTargetDB(database);
    this.targetId = syncIdentity(targetId, "target identity");
  }

  state(): CausalSyncSessionState | null {
    const row = this.targets.get(this.targetId);
    return row ? parseSessionRow(row) : null;
  }

  prepare(input: PrepareCausalSyncInput): PrepareCausalSyncResult {
    return this.database.transaction(() => this.prepareInTransaction(input))();
  }

  private prepareInTransaction(
    input: PrepareCausalSyncInput,
  ): PrepareCausalSyncResult {
    const state = this.state() ?? {
      targetId: this.targetId,
      deviceId: syncIdentity(input.deviceId, "device identity"),
      syncId: syncIdentity(input.syncId, "sync identity"),
      base: null,
      pending: null,
    };
    if (state.deviceId !== input.deviceId)
      throw new Error("Sync device identity changed");
    if (state.syncId !== input.syncId && input.selection?.kind !== "baseline")
      return { status: "baseline-required", reason: "sync-identity-changed" };
    if (state.pending) return { status: "pending", operation: state.pending };
    const operationId = crypto.randomUUID();
    const plan = planCausalSync({
      syncId: state.syncId,
      deviceId: state.deviceId,
      commitId: operationId,
      base: state.base,
      local: input.local,
      remote: input.remote,
    }, input.selection);
    if (plan.status === "conflict" || plan.status === "baseline-required")
      return plan;
    const observedEtag = checkedEtag(input.remoteEtag);
    if ((input.remote !== null) !== (observedEtag !== null))
      throw new Error(
        "Sync remote generation requires its observed strong ETag",
      );
    const operation: CausalSyncOperation = {
      operationId,
      mode: plan.status,
      phase: plan.status === "publish" ? "prepared" : "remote-confirmed",
      localInventoryHash: inventoryHash(input.local),
      observedEtag,
      generation: plan.generation,
    };
    this.targets.put(sessionRow({ ...state,
      syncId: plan.generation.syncId,
      base: state.base?.syncId === plan.generation.syncId ? state.base : null,
      pending: operation }));
    return { status: "prepared", operation };
  }

  private pending(
    operationId: string,
  ): CausalSyncSessionState & { pending: CausalSyncOperation } {
    const state = this.state();
    if (!state?.pending || state.pending.operationId !== operationId)
      throw new Error("Sync operation is missing or was replaced");
    return { ...state, pending: state.pending };
  }

  /** Call only with a verified remote read or the exact successful conditional-write body. */
  confirmPublished(operationId: string, remote: CausalSyncGeneration): void {
    this.database.transaction(() => {
      const state = this.pending(operationId);
      if (generationText(remote) !== generationText(state.pending.generation))
        throw new Error(
          "Sync publication identity does not match remote generation",
        );
      state.pending.phase = "remote-confirmed";
      this.targets.put(sessionRow(state));
    })();
  }

  private confirmed(operationId: string) {
    const state = this.pending(operationId);
    if (state.pending.phase !== "remote-confirmed")
      throw new Error("Sync publication is not confirmed");
    return state;
  }

  private applyAndAdvance(
    operationId: string,
    readLocal: () => SyncResourceContent[],
    apply: (generation: CausalSyncGeneration) => void,
  ): void {
    const state = this.confirmed(operationId);
    const expected = inventoryHash(liveInventory(state.pending.generation));
    const completed = sessionRow({
      ...state,
      base: state.pending.generation,
      pending: null,
    });
    const result: unknown = apply(state.pending.generation);
    if (result !== undefined)
      throw new Error(
        "Sync local application must be synchronous and return void",
      );
    if (inventoryHash(readLocal()) !== expected)
      throw new Error(
        "Sync local application did not produce the complete generation",
      );
    this.targets.put(completed);
  }

  /** SQL-only completion. File-changing writes use completeWithFiles. */
  complete(
    operationId: string,
    readLocal: () => SyncResourceContent[],
    apply: (generation: CausalSyncGeneration) => void,
  ): { status: "committed" | "local-changed" } {
    return this.database.transaction(() => {
      const state = this.confirmed(operationId);
      if (inventoryHash(readLocal()) !== state.pending.localInventoryHash)
        return { status: "local-changed" as const };
      this.applyAndAdvance(operationId, readLocal, apply);
      return { status: "committed" as const };
    })();
  }

  /** One receipt decides domain rows, file replacements and the common baseline. */
  completeWithFiles(
    operationId: string,
    options: ApplyCausalSyncFilesOptions,
  ):
    | { status: "committed"; cleanupPending: boolean }
    | { status: "local-changed" } {
    this.confirmed(operationId);
    try {
      const result = publishSqliteEntries(this.database, {
        rootPath: options.rootPath,
        operationKey: "causal-sync",
        entries: options.entries,
        beforePublish: () => {
          const state = this.confirmed(operationId);
          if (
            inventoryHash(options.readLocal()) !==
            state.pending.localInventoryHash
          )
            throw new LocalSyncInventoryChanged(
              "Local sync inventory changed before application",
            );
        },
        commit: () =>
          this.applyAndAdvance(operationId, options.readLocal, options.apply),
      });
      return { status: "committed", cleanupPending: result.cleanupPending };
    } catch (error) {
      if (error instanceof LocalSyncInventoryChanged)
        return { status: "local-changed" };
      throw error;
    }
  }

  /** Keep the old common base when local edits require another three-way comparison. */
  releaseForReplan(operationId: string): void {
    this.database.transaction(() => {
      const state = this.pending(operationId);
      if (state.pending.phase !== "remote-confirmed")
        throw new Error("Sync publication is not confirmed");
      this.targets.put(sessionRow({ ...state, pending: null }));
    })();
  }

  /** A definitive conditional rejection permits replanning; an uncertain response does not. */
  recordConditionalConflict(operationId: string): void {
    this.database.transaction(() => {
      const state = this.pending(operationId);
      if (state.pending.phase !== "prepared")
        throw new Error("Confirmed sync publication cannot be rejected");
      this.targets.put(sessionRow({ ...state, pending: null }));
    })();
  }
}
