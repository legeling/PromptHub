import { randomUUID } from "node:crypto";
import { PromptTestHistoryDB } from "@prompthub/db/prompt-test-history";
import type {
  PromptTestOutput,
  PromptTestRun,
  PromptTestRunInput,
  PromptTestRunSummary,
} from "@prompthub/shared/types/prompt-test-history";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid test history object");
  // Runtime object validation precedes property access at this IPC boundary.
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error("Invalid test history text");
  return value;
}

function identity(value: unknown): string {
  const result = string(value);
  if (!result.trim() || result.length > 200)
    throw new Error("Invalid test history identity");
  return result;
}

function output(value: unknown): PromptTestOutput {
  const entry = object(value);
  if (
    typeof entry.success !== "boolean" ||
    typeof entry.latency !== "number" ||
    !Number.isFinite(entry.latency) ||
    entry.latency < 0
  )
    throw new Error("Invalid test history result");
  return {
    model: identity(entry.model),
    provider: identity(entry.provider),
    success: entry.success,
    response: string(entry.response),
    thinkingContent: string(entry.thinkingContent),
    error: string(entry.error),
    latency: entry.latency,
  };
}

function parseInput(value: unknown): PromptTestRunInput {
  const entry = object(value);
  if (Buffer.byteLength(JSON.stringify(entry), "utf8") > 2 * 1024 * 1024)
    throw new Error("Test history snapshot exceeds 2 MiB");
  if (entry.mode !== "single" && entry.mode !== "compare")
    throw new Error("Invalid test history mode");
  if (
    typeof entry.promptVersion !== "number" ||
    !Number.isSafeInteger(entry.promptVersion) ||
    entry.promptVersion < 1
  )
    throw new Error("Invalid prompt version");
  if (
    !Array.isArray(entry.results) ||
    !entry.results.length ||
    entry.results.length > 32
  )
    throw new Error("Invalid test result count");
  if (!Array.isArray(entry.attachmentNames) || entry.attachmentNames.length > 8)
    throw new Error("Invalid attachment names");
  return {
    promptId: identity(entry.promptId),
    promptVersion: entry.promptVersion,
    mode: entry.mode,
    systemPrompt: string(entry.systemPrompt),
    userPrompt: string(entry.userPrompt),
    outputFormat: string(entry.outputFormat),
    attachmentNames: entry.attachmentNames.map(string),
    results: entry.results.map(output),
  };
}

export class PromptTestHistoryService {
  constructor(private readonly db: PromptTestHistoryDB) {}
  add(value: unknown): PromptTestRun {
    return this.db.add({
      ...parseInput(value),
      id: randomUUID(),
      createdAt: Date.now(),
    });
  }
  list(promptId: unknown, offset: unknown = 0): PromptTestRunSummary[] {
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      throw new Error("Invalid history offset");
    return this.db.list(identity(promptId), offset);
  }
  get(promptId: unknown, id: unknown): PromptTestRun | null {
    return this.db.get(identity(promptId), identity(id));
  }
  delete(promptId: unknown, id: unknown): void {
    this.db.delete(identity(promptId), identity(id));
  }
}
