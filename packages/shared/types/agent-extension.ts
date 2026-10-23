import type { SkillLocalFileEntry } from "./skill";

export interface AgentExtensionScope {
  agentId: string;
  scope: "user" | "project" | "local";
  projectId?: string;
}

export interface AgentExtensionTarget {
  agentId: string;
  kind: "subagent" | "hooks";
  relativePath: string;
}

export type AgentExtensionRequest = AgentExtensionScope & AgentExtensionTarget;
export interface AgentExtensionWriteRequest extends AgentExtensionRequest {
  content: string;
  expectedRevision?: string;
}
export interface AgentExtensionDeleteRequest extends AgentExtensionRequest {
  expectedRevision: string;
}
export type AgentExtensionDocument = SkillLocalFileEntry;
