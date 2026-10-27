import {
  validateWorkspacePublication,
  retainPreviousWorkspaceManifest,
  pruneWorkspaceHistory,
  listWorkspaceHistory,
} from "../services/workspace-backup-history.js";
import { fsyncDirectory } from "../services/atomic-json-file.js";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import { getBackupsDir } from "../runtime-paths.js";
import { getAuthUser } from "../middleware/auth.js";
import { readRequestBytesBody } from "../utils/validation.js";

export const MAX_DESKTOP_BACKUP_REQUEST_BYTES = 50 * 1024 * 1024;
export const workspaceBackups = new Hono();
function target(userId: string, name: string): string {
  if (
    name !== "manifest.json" &&
    !/^data\.json\.workspace-[a-f0-9-]{36}-[0-9]+-[a-f0-9]{64}$/.test(name)
  )
    throw new Error("Invalid workspace object name");
  const root = getBackupsDir();
  const file = path.join(
    root,
    "workspace",
    createHash("sha256").update(userId).digest("hex"),
    name,
  );
  assertStoragePathComponentsSafe(root, file);
  return file;
}
export function listWorkspaceBackups(
  userId: string,
): ReturnType<typeof listWorkspaceHistory> {
  return listWorkspaceHistory(path.dirname(target(userId, "manifest.json")));
}
function etag(content: Buffer): string {
  return `"${createHash("sha256").update(content).digest("hex")}"`;
}
workspaceBackups.get("/:name", (c) => {
  try {
    const file = target(getAuthUser(c).userId, c.req.param("name"));
    if (!fs.existsSync(file)) return c.text("Not found", 404);
    const content = fs.readFileSync(file);
    c.header("ETag", etag(content));
    return c.text(content.toString("utf8"));
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : "Invalid backup",
      400,
    );
  }
});
workspaceBackups.put("/:name", async (c) => {
  const input = await readRequestBytesBody(c, {
    maxBytes: MAX_DESKTOP_BACKUP_REQUEST_BYTES,
  });
  if (!input.success) return input.response;
  let temporary: string | undefined;
  try {
    const file = target(getAuthUser(c).userId, c.req.param("name"));
    const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (
      (c.req.header("If-None-Match") === "*" && previous) ||
      (c.req.header("If-Match") &&
        (!previous || etag(previous) !== c.req.header("If-Match")))
    )
      return c.text("Backup changed", 412);
    const manifest =
      c.req.param("name") === "manifest.json"
        ? validateWorkspacePublication(
            path.dirname(file),
            Buffer.from(input.bytes),
          )
        : null;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (manifest) retainPreviousWorkspaceManifest(path.dirname(file), previous);
    temporary = `${file}.${randomUUID()}.tmp`;
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, input.bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
    fsyncDirectory(path.dirname(file));
    if (manifest) {
      try {
        pruneWorkspaceHistory(path.dirname(file), manifest);
      } catch (error) {
        console.warn("Workspace backup history cleanup failed", error);
      }
    }
    c.header("ETag", etag(Buffer.from(input.bytes)));
    return c.text("Stored");
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : "Backup storage failed",
      400,
    );
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
  }
});
workspaceBackups.delete("/:name", (c) => {
  try {
    const file = target(getAuthUser(c).userId, c.req.param("name"));
    if (c.req.param("name") === "manifest.json")
      return c.text("Cannot delete backup HEAD", 400);
    fs.rmSync(file, { force: true });
    return c.text("Deleted");
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : "Backup deletion failed",
      400,
    );
  }
});
