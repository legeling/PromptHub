import os from "node:os";

import type { AgentSessionIndexDB } from "@prompthub/db";
import type { AgentSessionIndexOperations } from "../ipc/agent-session-index.ipc";
import { createAgentSessionIndexService } from "./agent-session-index-service";
import { createAgentSessionService } from "./agent-session-service";
import {
  getAgentConfigContext,
  getClaudeNativeConfigDirectory,
} from "./agent-platform-context";

function rootOption(agentId: string, rootPath: string) {
  switch (agentId) {
    case "claude": {
      const configuredRoot = getClaudeNativeConfigDirectory(rootPath);
      return {
        ...(configuredRoot ? { claudeConfigDir: configuredRoot } : {}),
      };
    }
    case "copilot":
      return { copilotRootDir: rootPath };
    case "cline":
      return { clineRootDir: rootPath };
    case "cursor":
      return { cursorRootDir: rootPath };
    case "codex":
      return { codexRootDir: rootPath };
    case "grok":
      return { grokRootDir: rootPath };
    case "kimi":
      return { kimiRootDir: rootPath };
    case "openclaw":
      return { openclawRootDir: rootPath };
    case "pi":
      return { piRootDir: rootPath };
    case "oh-my-pi":
      return { ohMyPiRootDir: rootPath };
    case "kiro":
      return { kiroRootDir: rootPath };
    default:
      return {};
  }
}

export function createAgentSessionIndexOperations(
  index: AgentSessionIndexDB,
  agentId: string,
): AgentSessionIndexOperations {
  const reader = createAgentSessionReader(agentId);
  return createAgentSessionIndexService({ index, reader });
}

function createAgentSessionReader(agentId: string) {
  const context = getAgentConfigContext(agentId);
  return createAgentSessionService({
    homeDir: os.homedir(),
    ...rootOption(agentId, context.rootPath),
  });
}

export function resolveAgentSessionIndexSource(agentId: string) {
  if (agentId !== "claude" && agentId !== "gemini") return null;

  const reader =
    agentId === "claude"
      ? createAgentSessionReader(agentId)
      : createAgentSessionService({
          homeDir: os.homedir(),
        });
  return reader.getIndexSource(agentId);
}
