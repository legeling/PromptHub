import type { AgentProviderProfileExport } from "./agent";
import type { NotificationCategory } from "./notifications";

export type AgentAssetKind = "prompt" | "skill" | "mcp" | "plugin" | "rule";

export type CreatableAgentAssetKind = Exclude<AgentAssetKind, "rule">;

export type PromptQuickAddMode = "analyze" | "generate";

export type AgentAssetCommand =
  | { type: "asset:create"; asset: CreatableAgentAssetKind }
  | { type: "asset:manage"; asset: "rule" };

export type FutureAgentManagementCommand = { type: "agent:manage" };

export type AgentDeepLinkErrorCode =
  | "AGENT_DEEP_LINK_INVALID"
  | "AGENT_DEEP_LINK_TOO_LARGE"
  | "AGENT_DEEP_LINK_UNSUPPORTED"
  | "AGENT_DEEP_LINK_SENSITIVE_VALUE_REJECTED";

export type AgentDeepLinkCommand =
  | {
      type: "agent:import-provider";
      preview: AgentProviderProfileExport;
    }
  | {
      type: "agent:import-error";
      errorCode: AgentDeepLinkErrorCode;
    };

export type AppCommand =
  | { type: "notification:open"; category: NotificationCategory; module?: "skill" | "mcp" | "plugin" }
  | AgentAssetCommand
  | { type: "prompt:quick-add"; mode: PromptQuickAddMode }
  | { type: "settings:open" }
  | { type: "updater:open" }
  | FutureAgentManagementCommand
  | AgentDeepLinkCommand;
