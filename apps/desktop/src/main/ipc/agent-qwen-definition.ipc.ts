import { ipcMain, shell } from "electron";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  AgentDefinitionListRequest,
  AgentDefinitionOpenRequest,
  SkillProject,
} from "@prompthub/shared/types";
import type Database from "../database/sqlite";
import { getAgentConfigContext } from "../services/agent-platform-context";
import {
  listQwenDefinitions,
  resolveQwenDefinitionPath,
} from "../services/agent-qwen-definition-service";

interface AgentQwenDefinitionIPCDependencies {
  listDefinitions: typeof listQwenDefinitions;
  openPath: (filePath: string) => Promise<string>;
  resolvePath: typeof resolveQwenDefinitionPath;
}

const DEFAULT_DEPENDENCIES: AgentQwenDefinitionIPCDependencies = {
  listDefinitions: listQwenDefinitions,
  openPath: (filePath) => shell.openPath(filePath),
  resolvePath: resolveQwenDefinitionPath,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\0-\x1f\x7f]/.test(value)
  );
}

function parseListRequest(value: unknown): AgentDefinitionListRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["agentId", "scope", "projectId"]) ||
    value.agentId !== "qwen" ||
    (value.scope !== "user" && value.scope !== "project") ||
    (value.scope === "user" && value.projectId !== undefined) ||
    (value.scope === "project" && !validProjectId(value.projectId))
  ) {
    throw new Error("AGENT_DEFINITION_REQUEST_INVALID");
  }
  return value as unknown as AgentDefinitionListRequest;
}

function parseOpenRequest(value: unknown): AgentDefinitionOpenRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "agentId",
      "scope",
      "projectId",
      "kind",
      "relativePath",
    ]) ||
    (value.kind !== "subagent" && value.kind !== "command") ||
    typeof value.relativePath !== "string"
  ) {
    throw new Error("AGENT_DEFINITION_REQUEST_INVALID");
  }
  parseListRequest({
    agentId: value.agentId,
    scope: value.scope,
    ...(value.projectId === undefined ? {} : { projectId: value.projectId }),
  });
  return value as unknown as AgentDefinitionOpenRequest;
}

function isSkillProject(value: unknown): value is SkillProject {
  return (
    isRecord(value) &&
    validProjectId(value.id) &&
    typeof value.name === "string" &&
    typeof value.rootPath === "string" &&
    Array.isArray(value.scanPaths) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function readProjectRoot(
  database: Database.Database,
  projectId: string,
): string {
  let parsed: unknown;
  try {
    const row = database
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("skillProjects") as { value: string } | undefined;
    parsed = row ? JSON.parse(row.value) : [];
  } catch {
    throw new Error("AGENT_DEFINITION_PROJECT_NOT_FOUND");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("AGENT_DEFINITION_PROJECT_NOT_FOUND");
  }
  const project = parsed.find(
    (candidate): candidate is SkillProject =>
      isSkillProject(candidate) && candidate.id === projectId,
  );
  if (!project) {
    throw new Error("AGENT_DEFINITION_PROJECT_NOT_FOUND");
  }
  return project.rootPath;
}

function resolveRoot(
  database: Database.Database,
  request: AgentDefinitionListRequest,
): string {
  return request.scope === "project"
    ? readProjectRoot(database, request.projectId!)
    : getAgentConfigContext("qwen").rootPath;
}

export function registerAgentQwenDefinitionIPC(
  database: Database.Database,
  dependencies: AgentQwenDefinitionIPCDependencies = DEFAULT_DEPENDENCIES,
): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_DEFINITIONS_LIST, async (_, value) => {
    const request = parseListRequest(value);
    return dependencies.listDefinitions({
      rootPath: resolveRoot(database, request),
      scope: request.scope,
    });
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_DEFINITION_OPEN, async (_, value) => {
    const request = parseOpenRequest(value);
    const filePath = await dependencies.resolvePath({
      rootPath: resolveRoot(database, request),
      scope: request.scope,
      kind: request.kind,
      relativePath: request.relativePath,
    });
    const error = await dependencies.openPath(filePath);
    if (error) throw new Error("AGENT_DEFINITION_OPEN_FAILED");
    return { opened: true };
  });
}
