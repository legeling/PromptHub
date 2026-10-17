import type {
  AIConfig,
  AITestResult,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatImageAttachment,
  ChatMessage,
  ChatMessageContentPart,
  MultiModelCompareResult,
  PromptRewriteInput,
  PromptRewriteResult,
  StreamCallbacks,
} from "./ai-types";

export type ChatCompletionExecutor = (
  config: AIConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
) => Promise<ChatCompletionResult>;

const SKILL_CREATOR_SYSTEM_PROMPT = `You are a Skill Creator that helps users create effective SKILL.md files following the Anthropic Agent Skills specification.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities by providing specialized knowledge, workflows, and tools. They transform Claude from a general-purpose agent into a specialized agent equipped with procedural knowledge.

## SKILL.md Structure

Every SKILL.md requires:
1. **YAML frontmatter** (between --- markers) with:
   - \`name\`: Human-friendly name (lowercase-with-hyphens, max 64 characters)
   - \`description\`: What the skill does and when to use it (max 200 characters) - CRITICAL: Claude uses this to determine when to invoke the skill
2. **Markdown body** with clear instructions

## Core Principles

1. **Concise is Key**: Only include information Claude doesn't already have. Challenge each piece: "Does Claude really need this?"
2. **Clear Description**: Include BOTH what the skill does AND specific triggers/contexts for when to use it
3. **Progressive Disclosure**: Keep SKILL.md lean (<500 lines), move detailed reference to separate files
4. **Appropriate Freedom**: Match instruction specificity to task fragility

## Output Format

Generate a complete SKILL.md with proper structure:

\`\`\`markdown
---
name: skill-name-here
description: Clear description of what this skill does and when to use it (max 200 chars)
---

# Skill Title

## Overview
Brief explanation of the skill's purpose.

## When to Use
- Trigger condition 1
- Trigger condition 2

## Instructions
1. Step 1
2. Step 2
...

## Examples (if helpful)
...

## Guidelines
- Important constraint 1
- Best practice 2
\`\`\`

## Important Rules

1. Use imperative/infinitive form in instructions
2. Be specific about when the skill should be used in the description
3. Include examples when they clarify usage
4. Focus each skill on one specific workflow
5. Do NOT include extraneous documentation (README, CHANGELOG, etc.)
6. Output ONLY the SKILL.md content, no additional explanation`;

const SKILL_POLISH_SYSTEM_PROMPT = `You are a SKILL.md editor. Your job is to polish and restructure existing skill content to follow the Anthropic Agent Skills specification — while strictly preserving ALL core capabilities, instructions, and intent written by the user.

## Rules

1. **PRESERVE everything the user wrote** — do NOT remove, weaken, or change any core instruction, capability, workflow step, or constraint. You are polishing, not rewriting.
2. **Add YAML frontmatter** if missing (name + description ≤200 chars)
3. **Restructure** into clear sections: Overview, When to Use, Instructions, Guidelines, Examples (only if helpful)
4. **Improve clarity** — fix grammar, use imperative form, add bullet points, improve formatting
5. **Keep it concise** — remove redundancy but never remove unique information
6. **Output ONLY the polished SKILL.md** — no explanations, no commentary, no code fences wrapping the entire output
7. **Use the same language as the user's content** — if the user wrote in Chinese, output in Chinese; if English, output in English

## Important

- If the content already has good structure, make minimal changes
- Never invent new capabilities the user didn't describe
- The description in frontmatter should accurately summarize what the user wrote`;

const PROMPT_REWRITE_SYSTEM_PROMPT = `You are an expert prompt editor working inside PromptHub.

Your job is to improve an existing prompt draft according to the user's instruction while preserving the original task intent.

Rules:
1. Preserve the original goal, intent, placeholders, and important constraints unless the user explicitly asks to change them.
2. Keep placeholders like {{variable}}, {{variable:example}}, template markers, markdown structure, and code fences intact unless the user explicitly asks to rewrite them.
3. Improve clarity, structure, specificity, output constraints, and consistency when useful.
4. Do NOT invent new product requirements, tools, or capabilities that were not implied by the current draft.
5. Do NOT modify title, tags, folder, images, videos, or bilingual fields.
6. Return STRICT JSON only. No markdown fences. No explanation outside JSON.
7. Only include fields that should change. Omit fields that should stay unchanged.

Return JSON with this shape only:
{
  "summary": "Short one-line summary of what changed",
  "description": "Optional updated description",
  "systemPrompt": "Optional updated system prompt",
  "userPrompt": "Optional updated user prompt",
  "notes": "Optional updated notes"
}`;

async function completeSkillWorkflow(
  complete: ChatCompletionExecutor,
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  streamCallbacks?: StreamCallbacks,
): Promise<string> {
  const result = await complete(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      temperature,
      maxTokens: 4096,
      stream: Boolean(streamCallbacks),
      streamCallbacks,
    },
  );
  return result.content;
}

export function generateSkillContentWithCompletion(
  complete: ChatCompletionExecutor,
  config: AIConfig,
  skillName: string,
  skillPurpose: string,
  streamCallbacks?: StreamCallbacks,
  customSystemPrompt?: string,
): Promise<string> {
  const userPrompt = `Create a SKILL.md file for the following skill:

**Skill Name**: ${skillName}
**Purpose/Description**: ${skillPurpose}

Generate a complete, well-structured SKILL.md following the Anthropic Agent Skills specification. Output ONLY the SKILL.md content (including the YAML frontmatter), no additional explanation.`;
  return completeSkillWorkflow(
    complete,
    config,
    customSystemPrompt || SKILL_CREATOR_SYSTEM_PROMPT,
    userPrompt,
    0.7,
    streamCallbacks,
  );
}

export function polishSkillContentWithCompletion(
  complete: ChatCompletionExecutor,
  config: AIConfig,
  existingContent: string,
  skillName?: string,
  streamCallbacks?: StreamCallbacks,
): Promise<string> {
  const userPrompt = `Please polish the following SKILL.md content. Preserve ALL core capabilities and instructions. Only improve structure, formatting, and readability according to the SKILL.md standard.

${skillName ? `**Skill Name**: ${skillName}\n` : ""}
**Existing Content**:
${existingContent}`;
  return completeSkillWorkflow(
    complete,
    config,
    SKILL_POLISH_SYSTEM_PROMPT,
    userPrompt,
    0.4,
    streamCallbacks,
  );
}

function buildRewriteUserPrompt(input: PromptRewriteInput): string {
  const guidance =
    input.promptType === "image"
      ? "Focus on visual clarity, subject detail, composition, style, lighting, and negative constraints when useful."
      : input.promptType === "video"
        ? "Focus on motion, shot progression, timing, pacing, camera movement, and temporal consistency when useful."
        : "Focus on instruction clarity, role setup, context, step-by-step structure, and output formatting when useful.";
  const draft = {
    description: input.description || "",
    systemPrompt: input.systemPrompt || "",
    userPrompt: input.userPrompt,
    notes: input.notes || "",
  };
  return `Please improve the following PromptHub draft according to the user's rewrite request.

Prompt type: ${input.promptType}
Prompt title: ${input.title}
Rewrite request:
${input.instruction}

Prompt-type guidance:
${guidance}

Current draft JSON:
${JSON.stringify(draft, null, 2)}`;
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readOptionalRewriteField(
  source: Record<string, unknown>,
  field: keyof PromptRewriteResult,
  target: PromptRewriteResult,
): void {
  if (!(field in source)) return;
  const value = source[field];
  if (typeof value !== "string") {
    throw new Error(`AI rewrite returned an invalid ${field} field`);
  }
  target[field] = value;
}

function parseRewriteResult(content: string): PromptRewriteResult {
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error("AI rewrite did not return valid JSON");
  const rewritten: PromptRewriteResult = {};
  if (typeof parsed.summary === "string" && parsed.summary.trim()) {
    rewritten.summary = parsed.summary.trim();
  }
  for (const field of [
    "description",
    "systemPrompt",
    "userPrompt",
    "notes",
  ] as const) {
    readOptionalRewriteField(parsed, field, rewritten);
  }
  if (
    rewritten.description === undefined &&
    rewritten.systemPrompt === undefined &&
    rewritten.userPrompt === undefined &&
    rewritten.notes === undefined
  ) {
    throw new Error("AI rewrite did not return any editable fields");
  }
  return rewritten;
}

export async function rewritePromptDraftWithCompletion(
  complete: ChatCompletionExecutor,
  config: AIConfig,
  input: PromptRewriteInput,
): Promise<PromptRewriteResult> {
  const result = await complete(
    config,
    [
      { role: "system", content: PROMPT_REWRITE_SYSTEM_PROMPT },
      { role: "user", content: buildRewriteUserPrompt(input) },
    ],
    { temperature: 0.4, maxTokens: 4096 },
  );
  if (!result.content) throw new Error("AI rewrite returned empty content");
  return parseRewriteResult(result.content);
}

async function compareSingleModel(
  complete: ChatCompletionExecutor,
  config: AIConfig,
  messages: ChatMessage[],
  options?: {
    stream?: boolean;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: ChatCompletionOptions["responseFormat"];
    streamCallbacksMap?: Map<string, StreamCallbacks>;
  },
): Promise<AITestResult> {
  const startedAt = Date.now();
  try {
    const result = await complete(config, messages, {
      responseFormat: options?.responseFormat,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      stream: options?.stream ?? config.chatParams?.stream ?? false,
      enableThinking: config.chatParams?.enableThinking ?? false,
      streamCallbacks: options?.streamCallbacksMap?.get(
        config.id || config.model,
      ),
    });
    return {
      id: config.id,
      success: true,
      response: result.content,
      thinkingContent: result.thinkingContent,
      latency: Date.now() - startedAt,
      model: config.model,
      provider: config.provider,
    };
  } catch (error) {
    return {
      id: config.id,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      latency: Date.now() - startedAt,
      model: config.model,
      provider: config.provider,
    };
  }
}

export async function multiModelCompareWithCompletion(
  complete: ChatCompletionExecutor,
  configs: AIConfig[],
  messages: ChatMessage[],
  options?: {
    stream?: boolean;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: ChatCompletionOptions["responseFormat"];
    streamCallbacksMap?: Map<string, StreamCallbacks>;
  },
): Promise<MultiModelCompareResult> {
  const startedAt = Date.now();
  const results = await Promise.all(
    configs.map((config) =>
      compareSingleModel(complete, config, messages, options),
    ),
  );
  return { messages, results, totalTime: Date.now() - startedAt };
}

function replacePromptVariables(
  template: string,
  variables?: Record<string, string>,
): string {
  if (!variables) return template;
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export function buildMessagesFromPrompt(
  systemPrompt: string | undefined,
  userPrompt: string,
  variables?: Record<string, string>,
  imageAttachments?: ChatImageAttachment[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({
      role: "system",
      content: replacePromptVariables(systemPrompt, variables),
    });
  }
  const processedUserPrompt = replacePromptVariables(userPrompt, variables);
  if (!imageAttachments?.length) {
    messages.push({ role: "user", content: processedUserPrompt });
    return messages;
  }
  const content: ChatMessageContentPart[] = [
    { type: "text", text: processedUserPrompt },
    ...imageAttachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${attachment.mimeType};base64,${attachment.base64}`,
      },
    })),
  ];
  messages.push({ role: "user", content });
  return messages;
}
