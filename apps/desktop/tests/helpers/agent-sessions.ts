import type {
  AgentSessionEntry,
  AgentSessionMetadata,
  ManagedAgentSummary,
} from "@prompthub/shared/types";

export const sessionPanelAgent: ManagedAgentSummary = {
  id: "codex",
  name: "ChatGPT",
  icon: "codex",
  isCustom: false,
  isConfigured: true,
  isDetected: true,
  isPinned: false,
  launchable: true,
  status: "installed",
  paths: {
    root: "/Users/test/.codex",
    skills: "/Users/test/.codex/skills",
    configFiles: [],
    configFileRelativePaths: [],
  },
  capabilities: {
    overview: { status: "supported" },
    provider: { status: "unsupported" },
    appearance: { status: "unsupported" },
    assets: { status: "unsupported" },
    configFiles: { status: "unsupported" },
    sessions: { status: "supported" },
    usage: { status: "unsupported" },
    maintenance: { status: "unsupported" },
  },
};

export function sessionMetadata(index: number): AgentSessionMetadata {
  return {
    id: `session-${index}`,
    title: `Session ${index}`,
    projectLabel: "PromptHub",
    projectPath: "/workspace/PromptHub",
    createdAt: index,
    updatedAt: index,
    model: null,
    messageCount: 120,
    sourcePath: null,
    resume: null,
  };
}

export function sessionEntry(index: number): AgentSessionEntry {
  return {
    id: `entry-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    timestamp: index,
    text: `Message ${index}`,
  };
}
