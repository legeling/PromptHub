import { ipcMain } from "electron";
import type { CoreMcpLibraryService } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type { McpVersionListOptions } from "@prompthub/shared/types/mcp";

function identifier(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\0/\\]/u.test(value))
    throw new Error("MCP version server identifier is invalid");
  return value;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new Error("MCP version number is invalid");
  return value;
}
function note(value: unknown): string {
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error("MCP version note is invalid");
  return value;
}
function pagination(value: unknown): McpVersionListOptions | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("MCP version pagination is invalid");
  const record = value as Record<string, unknown>; // IPC data requires validation before narrowing.
  if (Object.keys(record).some((k) => k !== "offset" && k !== "limit"))
    throw new Error("MCP version pagination is invalid");
  if (
    (record.offset !== undefined &&
      (typeof record.offset !== "number" ||
        !Number.isSafeInteger(record.offset) ||
        record.offset < 0)) ||
    (record.limit !== undefined &&
      (typeof record.limit !== "number" ||
        !Number.isSafeInteger(record.limit) ||
        record.limit < 1))
  )
    throw new Error("MCP version pagination is invalid");
  return {
    offset: typeof record.offset === "number" ? record.offset : undefined,
    limit: typeof record.limit === "number" ? record.limit : undefined,
  };
}
export function registerMcpVersionIPC(service: CoreMcpLibraryService): void {
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_LIST,
    (_event, id: unknown, options: unknown) =>
      service.listVersions(identifier(id), pagination(options)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_GET,
    (_event, id: unknown, number: unknown) =>
      service.getVersion(identifier(id), version(number)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_COMPARE,
    (_event, id: unknown, from: unknown, to: unknown) =>
      service.compareVersions(identifier(id), version(from), version(to)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_CREATE,
    (_event, id: unknown, message: unknown) =>
      service.createVersion(
        identifier(id),
        message === undefined ? undefined : note(message),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_RESTORE,
    (_event, id: unknown, number: unknown) =>
      service.restoreVersion(identifier(id), version(number)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_NOTE,
    (_event, id: unknown, number: unknown, message: unknown) =>
      service.updateVersionNote(identifier(id), version(number), note(message)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_VERSION_DELETE,
    (_event, id: unknown, number: unknown) =>
      service.deleteVersion(identifier(id), version(number)),
  );
}
