import type { SkillSafetyScanInput } from "@prompthub/shared/types";
import { useSettingsStore } from "../stores/settings.store";
import { getSafetyScanAIConfig } from "../stores/skill/skill-store-domain";

/** Explicit, advisory-only assessment. Business mutations must not call this. */
export function runSkillContentSafetyScan(input: SkillSafetyScanInput) {
  const settings = useSettingsStore.getState();
  if (!settings.skillSafetyScanEnabled) {
    return Promise.reject(new Error("SAFETY_SCAN_DISABLED"));
  }
  const method = settings.skillSafetyScanMethod;
  return window.api.skill.scanSafety({
    enabled: true,
    method,
    name: input.name,
    content: input.content,
    localRepoPath: input.localRepoPath,
    aiConfig:
      method === "ai" ? getSafetyScanAIConfig(settings.aiModels) : undefined,
  });
}
