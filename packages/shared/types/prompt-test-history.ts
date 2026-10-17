export interface PromptTestOutput {
  model: string;
  provider: string;
  success: boolean;
  response: string;
  thinkingContent: string;
  error: string;
  latency: number;
}

export interface PromptTestRunInput {
  promptId: string;
  promptVersion: number;
  mode: "single" | "compare";
  systemPrompt: string;
  userPrompt: string;
  outputFormat: string;
  attachmentNames: string[];
  results: PromptTestOutput[];
}

export interface PromptTestRun extends PromptTestRunInput {
  id: string;
  createdAt: number;
}

export interface PromptTestRunSummary {
  id: string;
  createdAt: number;
  mode: "single" | "compare";
  models: string[];
  successCount: number;
  resultCount: number;
}

export type PromptTestHistoryReply<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
