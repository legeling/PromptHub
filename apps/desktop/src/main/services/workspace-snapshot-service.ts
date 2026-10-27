import { workspaceSnapshotPreview } from "./workspace-snapshot-preview";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createWorkspaceSnapshot } from "@prompthub/core/workspace-snapshot";
import { closeDatabase, initDatabase } from "../database";
import { getUserDataPath, getCacheDir } from "../runtime-paths";
import { writeSnapshotZip } from "./portable-snapshot-archive";

export async function exportWorkspaceArchive(
  destinationPath: string,
  onDatabaseReopened?: () => void,
): Promise<Record<string, number>> {
  const snapshotPath = path.join(
    getCacheDir(),
    "workspace-snapshots",
    crypto.randomUUID(),
  );
  try {
    // Capture is synchronous under maintenance ownership. Reopen before yielding
    // to compression so ordinary IPC reads/writes do not encounter a closed DB.
    closeDatabase();
    let failure: unknown;
    let snapshot: ReturnType<typeof createWorkspaceSnapshot> | undefined;
    try {
      snapshot = createWorkspaceSnapshot({
        activeRoot: getUserDataPath(),
        destinationPath: snapshotPath,
      });
    } catch (error) {
      failure = error;
    }
    try {
      initDatabase();
      onDatabaseReopened?.();
    } catch (error) {
      throw failure
        ? new AggregateError(
            [failure, error],
            "Snapshot export and reopen failed",
          )
        : error;
    }
    if (failure) throw failure;
    if (!snapshot) throw new Error("Snapshot capture did not complete");
    const counts = workspaceSnapshotPreview(snapshot).counts;
    await writeSnapshotZip(snapshotPath, destinationPath);
    return counts;
  } finally {
    fs.rmSync(snapshotPath, { recursive: true, force: true });
  }
}
