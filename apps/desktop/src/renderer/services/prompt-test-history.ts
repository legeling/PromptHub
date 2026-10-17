import type { PromptTestRunInput } from "@prompthub/shared/types/prompt-test-history";

/** Persist independently of the modal session; failures must not change the AI result. */
export async function recordPromptTestRun(
  input: PromptTestRunInput,
  onError: () => void,
): Promise<void> {
  try {
    const result = await window.api.prompt.testHistory.add(input);
    if (result.ok === false) throw new Error(result.error);
  } catch (error) {
    console.error("Saving prompt test history failed", error);
    onError();
  }
}
