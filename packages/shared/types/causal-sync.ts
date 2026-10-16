/** Sync metadata references complete domain-owned resources, never editable rows. */
export interface SyncResourceIdentity {
  resourceType: string;
  resourceId: string;
}

export interface SyncResourceContent extends SyncResourceIdentity {
  contentHash: string;
  references: SyncResourceIdentity[];
}

interface SyncResourceRevision {
  revision: number;
  commitId: string;
  deviceId: string;
}

export type CausalSyncResource = SyncResourceRevision &
  (
    | (SyncResourceContent & { state: "live" })
    | (SyncResourceIdentity & {
        state: "deleted";
        previousContentHash: string;
      })
  );

export interface CausalSyncGeneration {
  kind: "prompthub-causal-sync";
  schemaVersion: 1;
  syncId: string;
  revision: number;
  commitId: string;
  parentCommitId: string | null;
  deviceId: string;
  resources: CausalSyncResource[];
}

export interface CausalSyncConflict extends SyncResourceIdentity {
  reason: "concurrent-change" | "missing-reference";
  base: CausalSyncResource | null;
  local: SyncResourceContent | null;
  remote: CausalSyncResource | null;
  reference?: SyncResourceIdentity;
}

export type CausalSyncPlan =
  | {
      status: "publish" | "apply" | "unchanged";
      generation: CausalSyncGeneration;
    }
  | { status: "conflict"; conflicts: CausalSyncConflict[] }
  | {
      status: "baseline-required";
      reason:
        | "unrelated-local-data"
        | "sync-identity-changed"
        | "remote-missing"
        | "remote-history-missing"
        | "remote-revision-diverged";
    };

export interface CausalSyncInput {
  syncId: string;
  deviceId: string;
  commitId: string;
  base: CausalSyncGeneration | null;
  /** Complete, consistent local inventory. An absent base resource is deleted. */
  local: SyncResourceContent[];
  remote: CausalSyncGeneration | null;
}

export type CausalSyncSelection =
  | { kind: "baseline"; choice: "local" | "remote" }
  | { kind: "conflicts"; choices: Array<SyncResourceIdentity & { choice: "local" | "remote" }> };

export type CausalSyncResolution = CausalSyncSelection & { token: string };

export type CausalSyncReview = Extract<CausalSyncPlan, { status: "conflict" | "baseline-required" }> & { token: string; labels?: Record<string, string> };

export interface DesktopCausalSyncRequest {
  provider: "webdav" | "s3";
  resolution?: CausalSyncResolution;
}

export type DesktopCausalSyncResult =
  | CausalSyncReview
  | { status: "committed"; localChanged: boolean; cleanupPending: boolean }
  | { status: "unsupported"; reason: string }
  | { status: "review-changed" | "local-changed" | "remote-changed" | "uncertain" }
  | { status: "failed"; error: string };
