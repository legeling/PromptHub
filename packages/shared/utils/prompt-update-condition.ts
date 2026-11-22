import type { Prompt } from "../types/prompt";

export type PromptUpdateCondition = Pick<
  Prompt,
  "updatedAt" | "title" | "tags"
>;
export const PROMPT_UPDATE_CONFLICT = "PROMPT_UPDATE_CONFLICT";

export function capturePromptUpdateCondition({
  updatedAt,
  title,
  tags,
}: PromptUpdateCondition): PromptUpdateCondition {
  return { updatedAt, title, tags: [...tags] };
}

export function matchesPromptUpdateCondition(
  current: PromptUpdateCondition | null,
  expected: PromptUpdateCondition,
): boolean {
  return Boolean(
    current &&
    expected &&
    current.updatedAt === expected.updatedAt &&
    current.title === expected.title &&
    Array.isArray(expected.tags) &&
    current.tags.length === expected.tags.length &&
    current.tags.every((tag, index) => tag === expected.tags[index]),
  );
}

// Electron wraps handler errors with the channel name and preserves the message.
export function isPromptUpdateConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.endsWith(PROMPT_UPDATE_CONFLICT)
  );
}
