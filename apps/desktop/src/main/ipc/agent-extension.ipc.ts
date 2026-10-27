import path from "node:path";
import { getAgentExtensionCapability } from "@prompthub/shared/constants/agent-extension-capabilities";
import { app, ipcMain, safeStorage } from "electron";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  AgentExtensionScope,
  AgentExtensionRequest,
} from "@prompthub/shared/types";
import type Database from "../database/sqlite";
import { createAgentUserConfigFileService } from "../services/agent-user-config-files";
import { getAgentConfigContext } from "../services/agent-platform-context";
import { readProjectRoot } from "./agent-qwen-definition.ipc";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
  // IPC payloads are untrusted records, validated field by field below.
  return value as Record<string, unknown>;
}

function scope(value: unknown): AgentExtensionScope {
  const data = object(value);
  if (
    typeof data.agentId !== "string" ||
    !getAgentExtensionCapability(data.agentId)
  )
    throw new Error("AGENT_EXTENSION_UNSUPPORTED");
  if (
    data.scope === "local" &&
    !getAgentExtensionCapability(data.agentId)?.localHooks
  )
    throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
  if (
    !["user", "project", "local"].includes(String(data.scope)) ||
    (data.scope !== "user" &&
      (typeof data.projectId !== "string" || !data.projectId))
  )
    throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
  if (data.scope === "user") return { agentId: data.agentId, scope: "user" };
  return {
    agentId: data.agentId,
    scope: data.scope === "local" ? "local" : "project",
    projectId: String(data.projectId),
  };
}

function target(value: unknown): AgentExtensionRequest {
  const data = object(value);
  const selected = scope(value);
  if (
    (data.kind !== "subagent" && data.kind !== "hooks") ||
    typeof data.relativePath !== "string" ||
    (data.kind === "subagent" && selected.scope === "local")
  )
    throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
  if (
    data.kind === "hooks" &&
    data.relativePath !==
      (selected.scope === "local"
        ? "settings.local.json"
        : getAgentExtensionCapability(selected.agentId)?.hooksPath)
  )
    throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
  return { ...selected, kind: data.kind, relativePath: data.relativePath };
}

export function registerAgentExtensionIPC(
  database: Database.Database,
  service = createAgentExtensionsService(
    createAgentUserConfigFileService({
      backupRoot: path.join(app.getPath("userData"), "agent-config-backups"),
      encryption: safeStorage,
    }),
  ),
): void {
  function root(request: AgentExtensionScope): string {
    return request.scope === "user"
      ? path.resolve(
          getAgentConfigContext(request.agentId).rootPath,
          getAgentExtensionCapability(request.agentId)?.userRootRelativePath ??
            ".",
        )
      : path.join(
          readProjectRoot(database, request.projectId!),
          getAgentExtensionCapability(request.agentId)!.projectDirectory,
        );
  }
  ipcMain.handle(IPC_CHANNELS.AGENT_EXTENSIONS_LIST, (_, value: unknown) => {
    const request = scope(value);
    return service.list(root(request), request.agentId);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT_EXTENSION_READ, (_, value: unknown) => {
    const request = target(value);
    return service.read(root(request), request);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT_EXTENSION_WRITE, (_, value: unknown) => {
    const request = target(value);
    const data = object(value);
    if (
      typeof data.content !== "string" ||
      (data.expectedRevision !== undefined &&
        typeof data.expectedRevision !== "string")
    )
      throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
    return service.write(
      root(request),
      request,
      data.content,
      typeof data.expectedRevision === "string"
        ? data.expectedRevision
        : undefined,
    );
  });
  ipcMain.handle(IPC_CHANNELS.AGENT_EXTENSION_DELETE, (_, value: unknown) => {
    const request = target(value);
    const data = object(value);
    if (typeof data.expectedRevision !== "string" || !data.expectedRevision)
      throw new Error("AGENT_EXTENSION_REQUEST_INVALID");
    return service.remove(root(request), request, data.expectedRevision);
  });
}
