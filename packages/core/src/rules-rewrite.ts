import type {
  RuleRewriteRequest,
  RuleRewriteResult,
} from "@prompthub/shared/types";

import { chatCompletion } from "./ai-client";

export function buildRuleRewritePrompt(payload: RuleRewriteRequest): string {
  return [
    `You are editing a rules file for ${payload.platformName}.`,
    `Target file: ${payload.fileName}`,
    "Rewrite the rules file based on the user's instruction.",
    "IMPORTANT: Only return the final file content. Do not include introductory or concluding conversational text.",
    "Preserve useful existing structure when possible.",
    "Return valid markdown only.",
    "User instruction:",
    payload.instruction.trim(),
    "Current content:",
    payload.currentContent.trim() || "(empty)",
  ].join("\n\n");
}

export async function rewriteRuleWithAi(
  payload: RuleRewriteRequest,
  transport?: Parameters<typeof chatCompletion>[3],
): Promise<RuleRewriteResult> {
  if (!payload.aiConfig || !payload.aiConfig.apiKey) {
    throw new Error("AI API Key is not configured. Please set it in Settings.");
  }

  const messages = [
    {
      role: "system" as const,
      content:
        "You are an expert AI Rules engineer. Rewrite local AI rules files (e.g., .cursorrules, AGENTS.md, etc.) according to the user instructions. Maintain high quality, concise, and professional tone. Return ONLY the final production-ready markdown content. DO NOT wrap the output in markdown formatting blocks like ```markdown.",
    },
    {
      role: "user" as const,
      content: buildRuleRewritePrompt(payload),
    },
  ];

  const result = await chatCompletion(payload.aiConfig, messages, {
    temperature: 0.3,
    maxTokens: 4096,
  }, transport);

  const content = result.content?.trim();
  if (!content) {
    throw new Error("Rules AI rewrite returned empty content");
  }

  return {
    content,
    summary: "AI rewrite generated a new draft.",
  };
}
