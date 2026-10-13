export interface PromptContentFields {
  systemPrompt?: string | null;
  userPrompt?: string | null;
}

export class PromptContentValidationError extends Error {
  constructor() {
    super(
      "At least one of systemPrompt or userPrompt must contain non-whitespace text.",
    );
    this.name = "PromptContentValidationError";
  }
}

export function hasPromptContent(content: PromptContentFields): boolean {
  return (
    (typeof content.systemPrompt === "string" &&
      content.systemPrompt.trim().length > 0) ||
    (typeof content.userPrompt === "string" &&
      content.userPrompt.trim().length > 0)
  );
}

export function assertPromptContent(content: PromptContentFields): void {
  if (!hasPromptContent(content)) throw new PromptContentValidationError();
}
