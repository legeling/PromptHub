import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dialog, ipcMain, safeStorage } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import {
  WORKSPACE_SNAPSHOT_CHUNK_BYTES,
  type WorkspaceSnapshotRequest,
  type WorkspaceSnapshotResponse,
} from "@prompthub/shared/types/workspace-snapshot";
import { getCacheDir, getUserDataPath } from "../runtime-paths";
import { closeDatabase, initDatabase } from "../database";
import { exportWorkspaceArchive } from "./workspace-snapshot-service";
import { restorePortableSnapshotArchive } from "./portable-snapshot-restore";

interface Session {
  ownerId?: number;
  file: string;
  mode: "capture" | "import";
  sizeBytes: number;
  written: number;
}

export function registerWorkspaceSnapshotIPC(
  scheduleRelaunch: (delayMs: number) => void,
  onDatabaseReopened?: () => void,
): void {
  const sessions = new Map<string, Session>();
  const owners = new Set<number>();
  function session(id: string): Session {
    const value = sessions.get(id);
    if (!value) throw new Error("Unknown workspace snapshot session");
    return value;
  }
  function dispose(id: string): void {
    const value = session(id);
    fs.rmSync(path.dirname(value.file), { recursive: true, force: true });
    sessions.delete(id);
  }
  async function execute(
    request: WorkspaceSnapshotRequest,
    sender?: Electron.WebContents,
  ): Promise<WorkspaceSnapshotResponse> {
    if (!request || typeof request !== "object")
      throw new Error("Invalid workspace snapshot request");
    if (request.action === "export") {
      const selected = await dialog.showSaveDialog({
        defaultPath: `prompthub-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });
      if (selected.canceled || !selected.filePath)
        return { success: true, canceled: true };
      await exportWorkspaceArchive(selected.filePath, onDatabaseReopened);
      return { success: true };
    }
    if (request.action === "capture" || request.action === "begin-import") {
      if (
        request.action === "begin-import" &&
        (!Number.isSafeInteger(request.sizeBytes) || request.sizeBytes < 1)
      )
        throw new Error("Invalid snapshot size");
      const id = crypto.randomUUID();
      const directory = path.join(getCacheDir(), "workspace-transfers", id);
      const file = path.join(directory, "snapshot.zip");
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      try {
        const counts =
          request.action === "capture"
            ? await exportWorkspaceArchive(file, onDatabaseReopened)
            : undefined;
        if (request.action === "begin-import")
          fs.writeFileSync(file, "", { flag: "wx", mode: 0o600 });
        const sizeBytes =
          request.action === "capture"
            ? fs.statSync(file).size
            : request.sizeBytes;
        if (sender?.isDestroyed()) throw new Error("Snapshot window closed");
        sessions.set(id, {
          ownerId: sender?.id,
          file,
          mode: request.action === "capture" ? "capture" : "import",
          sizeBytes,
          written: 0,
        });
        return { success: true, sessionId: id, sizeBytes, counts };
      } catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
      }
    }
    if (!("sessionId" in request) || typeof request.sessionId !== "string")
      throw new Error("Missing snapshot session");
    const value = session(request.sessionId);
    if (value.ownerId !== sender?.id)
      throw new Error("Snapshot session belongs to another window");
    if (request.action === "dispose") {
      dispose(request.sessionId);
      return { success: true };
    }
    if (request.action === "read") {
      if (
        value.mode !== "capture" ||
        !Number.isSafeInteger(request.offset) ||
        request.offset < 0 ||
        request.offset >= value.sizeBytes
      )
        throw new Error("Invalid snapshot offset");
      const fd = fs.openSync(value.file, "r");
      const buffer = Buffer.alloc(
        Math.min(
          WORKSPACE_SNAPSHOT_CHUNK_BYTES,
          value.sizeBytes - request.offset,
        ),
      );
      try {
        const count = fs.readSync(fd, buffer, 0, buffer.length, request.offset);
        if (count !== buffer.length) throw new Error("Snapshot truncated");
      } finally {
        fs.closeSync(fd);
      }
      return {
        success: true,
        sizeBytes: buffer.length,
        data: buffer.toString("base64"),
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      };
    }
    if (request.action === "append") {
      if (
        value.mode !== "import" ||
        request.offset !== value.written ||
        typeof request.data !== "string" ||
        request.data.length > Math.ceil(WORKSPACE_SNAPSHOT_CHUNK_BYTES / 3) * 4
      )
        throw new Error("Invalid snapshot chunk");
      const bytes = Buffer.from(request.data, "base64");
      if (
        bytes.length < 1 ||
        bytes.toString("base64") !== request.data ||
        value.written + bytes.length > value.sizeBytes ||
        crypto.createHash("sha256").update(bytes).digest("hex") !==
          request.sha256
      )
        throw new Error("Snapshot chunk integrity failed");
      fs.appendFileSync(value.file, bytes);
      value.written += bytes.length;
      return { success: true };
    }
    if (request.action === "restore") {
      if (value.mode !== "import" || value.written !== value.sizeBytes)
        throw new Error("Incomplete workspace snapshot");
      closeDatabase();
      const result = await restorePortableSnapshotArchive({
        archivePath: value.file,
        activeRoot: getUserDataPath(),
        cacheRoot: getCacheDir(),
        encryption: safeStorage,
      });
      if (result.success) scheduleRelaunch(500);
      else {
        initDatabase();
        onDatabaseReopened?.();
      }
      return result;
    }
    throw new Error("Unknown workspace snapshot action");
  }
  ipcMain.handle(
    IPC_CHANNELS.DATA_WORKSPACE_SNAPSHOT,
    async (event, request: WorkspaceSnapshotRequest) => {
      try {
        const sender = event.sender;
        if (sender && !owners.has(sender.id)) {
          owners.add(sender.id);
          sender.once("destroyed", () => {
            owners.delete(sender.id);
            for (const [id, value] of sessions)
              if (value.ownerId === sender.id) {
                try {
                  dispose(id);
                } catch (error) {
                  console.error("Snapshot session cleanup failed", error);
                }
              }
          });
        }
        return await execute(request, sender);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
