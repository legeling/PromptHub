import type { Prompt } from "@prompthub/shared/types";
export { copyTextToClipboard } from "../../utils/clipboard";
import { parsePromptVariables } from "./prompt-modal-utils";

const SYSTEM_VARIABLES = new Set([
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_DATETIME",
  "CURRENT_YEAR",
  "CURRENT_MONTH",
  "CURRENT_DAY",
  "CURRENT_WEEKDAY",
]);

export interface ResolvedPromptContent {
  systemPrompt?: string;
  userPrompt: string;
}

export function resolvePromptContentByLanguage(
  prompt: Prompt,
  showEnglish: boolean,
): ResolvedPromptContent {
  return {
    systemPrompt: showEnglish
      ? (prompt.systemPromptEn || prompt.systemPrompt)
      : prompt.systemPrompt,
    userPrompt: showEnglish
      ? (prompt.userPromptEn || prompt.userPrompt)
      : prompt.userPrompt,
  };
}

export function hasUserDefinedPromptVariables(
  systemPrompt?: string,
  userPrompt?: string,
): boolean {
  const combined = `${systemPrompt || ""}\n${userPrompt || ""}`;
  return parsePromptVariables(combined).some(
    (variable) => !SYSTEM_VARIABLES.has(variable.name),
  );
}

export function buildPromptCopyText({
  userPrompt,
}: ResolvedPromptContent): string {
  return userPrompt;
}
