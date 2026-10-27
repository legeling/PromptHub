import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";
import { claudeAgentDefinition } from "@prompthub/shared/constants/agent-definitions/claude";
import { deepseekHarnessAgentDefinition } from "@prompthub/shared/constants/agent-definitions/deepseek-harness";
import { copilotAgentDefinition } from "@prompthub/shared/constants/agent-definitions/copilot";
import { cursorAgentDefinition } from "@prompthub/shared/constants/agent-definitions/cursor";
import { cherryStudioAgentDefinition } from "@prompthub/shared/constants/agent-definitions/cherry-studio";
import { doubaoAgentDefinition } from "@prompthub/shared/constants/agent-definitions/doubao";
import { windsurfAgentDefinition } from "@prompthub/shared/constants/agent-definitions/windsurf";
import { kiroAgentDefinition } from "@prompthub/shared/constants/agent-definitions/kiro";
import { geminiAgentDefinition } from "@prompthub/shared/constants/agent-definitions/gemini";
import { antigravityAgentDefinition } from "@prompthub/shared/constants/agent-definitions/antigravity";
import { antigravityCliAgentDefinition } from "@prompthub/shared/constants/agent-definitions/antigravity-cli";
import { traeAgentDefinition } from "@prompthub/shared/constants/agent-definitions/trae";
import { traeCnAgentDefinition } from "@prompthub/shared/constants/agent-definitions/trae-cn";
import { traeWorkAgentDefinition } from "@prompthub/shared/constants/agent-definitions/trae-work";
import { traeWorkCnAgentDefinition } from "@prompthub/shared/constants/agent-definitions/trae-work-cn";
import { opencodeAgentDefinition } from "@prompthub/shared/constants/agent-definitions/opencode";
import { piAgentDefinition } from "@prompthub/shared/constants/agent-definitions/pi";
import { ohMyPiAgentDefinition } from "@prompthub/shared/constants/agent-definitions/oh-my-pi";
import { clineAgentDefinition } from "@prompthub/shared/constants/agent-definitions/cline";
import { codexAgentDefinition } from "@prompthub/shared/constants/agent-definitions/codex";
import { kimiAgentDefinition } from "@prompthub/shared/constants/agent-definitions/kimi";
import { reasonixAgentDefinition } from "@prompthub/shared/constants/agent-definitions/reasonix";
import { augmentAgentDefinition } from "@prompthub/shared/constants/agent-definitions/augment";
import { zcodeAgentDefinition } from "@prompthub/shared/constants/agent-definitions/zcode";
import { grokAgentDefinition } from "@prompthub/shared/constants/agent-definitions/grok";
import { qwenAgentDefinition } from "@prompthub/shared/constants/agent-definitions/qwen";
import { qwenWorkAgentDefinition } from "@prompthub/shared/constants/agent-definitions/qwen-work";
import { kiloAgentDefinition } from "@prompthub/shared/constants/agent-definitions/kilo";
import { ampAgentDefinition } from "@prompthub/shared/constants/agent-definitions/amp";
import { openclawAgentDefinition } from "@prompthub/shared/constants/agent-definitions/openclaw";
import { copawAgentDefinition } from "@prompthub/shared/constants/agent-definitions/copaw";
import { autoclawAgentDefinition } from "@prompthub/shared/constants/agent-definitions/autoclaw";
import { nanoclawAgentDefinition } from "@prompthub/shared/constants/agent-definitions/nanoclaw";
import { qclawAgentDefinition } from "@prompthub/shared/constants/agent-definitions/qclaw";
import { qoderAgentDefinition } from "@prompthub/shared/constants/agent-definitions/qoder";
import { qoderworkAgentDefinition } from "@prompthub/shared/constants/agent-definitions/qoderwork";
import { hermesAgentDefinition } from "@prompthub/shared/constants/agent-definitions/hermes";
import { codebuddyAgentDefinition } from "@prompthub/shared/constants/agent-definitions/codebuddy";
import { workbuddyAgentDefinition } from "@prompthub/shared/constants/agent-definitions/workbuddy";

export const AGENT_DEFINITIONS: AgentPlatformDefinition[] = [
  claudeAgentDefinition,
  deepseekHarnessAgentDefinition,
  copilotAgentDefinition,
  cursorAgentDefinition,
  cherryStudioAgentDefinition,
  doubaoAgentDefinition,
  windsurfAgentDefinition,
  kiroAgentDefinition,
  geminiAgentDefinition,
  antigravityAgentDefinition,
  antigravityCliAgentDefinition,
  traeAgentDefinition,
  traeCnAgentDefinition,
  traeWorkAgentDefinition,
  traeWorkCnAgentDefinition,
  opencodeAgentDefinition,
  piAgentDefinition,
  ohMyPiAgentDefinition,
  clineAgentDefinition,
  codexAgentDefinition,
  kimiAgentDefinition,
  reasonixAgentDefinition,
  augmentAgentDefinition,
  zcodeAgentDefinition,
  grokAgentDefinition,
  qwenAgentDefinition,
  qwenWorkAgentDefinition,
  kiloAgentDefinition,
  ampAgentDefinition,
  openclawAgentDefinition,
  copawAgentDefinition,
  autoclawAgentDefinition,
  nanoclawAgentDefinition,
  qclawAgentDefinition,
  qoderAgentDefinition,
  qoderworkAgentDefinition,
  hermesAgentDefinition,
  codebuddyAgentDefinition,
  workbuddyAgentDefinition,
];

const definitionsById = new Map<string, AgentPlatformDefinition>(
  AGENT_DEFINITIONS.map((definition) => [definition.platform.id, definition]),
);

export function getAgentDefinitionById(
  id: string,
): AgentPlatformDefinition | undefined {
  return definitionsById.get(id);
}
