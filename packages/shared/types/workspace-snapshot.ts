/** Bounded transport buffer; independent of user workspace size. */
export const WORKSPACE_SNAPSHOT_CHUNK_BYTES = 1024 * 1024;
export type WorkspaceSnapshotRequest =
  | { action: "export" }
  | { action: "capture" }
  | { action: "read"; sessionId: string; offset: number }
  | { action: "begin-import"; sizeBytes: number }
  | {
      action: "append";
      sessionId: string;
      offset: number;
      data: string;
      sha256: string;
    }
  | { action: "restore"; sessionId: string }
  | { action: "dispose"; sessionId: string };
export interface WorkspaceSnapshotResponse {
  success: boolean;
  error?: string;
  canceled?: boolean;
  sessionId?: string;
  counts?: Record<string, number>;
  sizeBytes?: number;
  data?: string;
  sha256?: string;
  needsRestart?: boolean;
}
