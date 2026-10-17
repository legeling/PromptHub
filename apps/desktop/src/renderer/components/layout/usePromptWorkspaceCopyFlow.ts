import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  OutputFormatItem,
  Prompt,
  PromptSummary,
} from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import {
  buildPromptCopyText,
  copyTextToClipboard,
  hasUserDefinedPromptVariables,
  resolvePromptContentByLanguage,
} from "../prompt/prompt-copy-utils";

interface CopyState {
  copyPromptQueue: Prompt[];
  copyPromptQueueIndex: number;
  copyPromptResults: string[];
  copyPromptSourceId: string | null;
  setCopyPrompt: Dispatch<SetStateAction<Prompt | null>>;
  setCopyPromptQueue: Dispatch<SetStateAction<Prompt[]>>;
  setCopyPromptQueueIndex: Dispatch<SetStateAction<number>>;
  setCopyPromptResults: Dispatch<SetStateAction<string[]>>;
  setCopyPromptSourceId: Dispatch<SetStateAction<string | null>>;
  setIsCopyVariableModalOpen: Dispatch<SetStateAction<boolean>>;
}

interface PromptCopyFlowParams {
  copy: CopyState;
  getPromptDetail: (id: string) => Promise<Prompt | null>;
  incrementUsageCount: (id: string) => Promise<void>;
  outputFormatItems: OutputFormatItem[];
  promptById: Map<string, PromptSummary>;
  showCopyNotification: boolean;
  showEnglish: boolean;
  showToast: (
    message: string,
    variant: "success",
    enabled?: boolean,
  ) => void;
  t: TFunction;
  triggerCopied: () => void;
}

export function getPromptCopyPlan(
  prompt: Prompt,
  items: OutputFormatItem[],
  promptById: Map<string, PromptSummary>,
): { sourcePromptId: string; prompts: PromptSummary[] } {
  const configured = items
    .filter((item) => item.sourcePromptId === prompt.id)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.localeCompare(right.createdAt),
    );
  if (configured.length === 0) {
    return { sourcePromptId: prompt.id, prompts: [prompt] };
  }
  const queue = configured
    .map((item) =>
      item.targetPromptId
        ? (promptById.get(item.targetPromptId) ?? null)
        : prompt,
    )
    .filter((item): item is PromptSummary => item !== null);
  return {
    sourcePromptId: prompt.id,
    prompts: queue.length > 0 ? queue : [prompt],
  };
}

function usePromptCopyHandler(params: PromptCopyFlowParams) {
  return useCallback(
    async (prompt: PromptSummary) => {
      // The list projection does not carry content; hydrate the full detail
      // before building the copy plan (variable replacement needs userPrompt).
      // 列表投影不含内容，先按需加载完整详情再构建复制计划。
      const detail: Prompt =
        "userPrompt" in prompt && prompt.userPrompt !== undefined
          ? (prompt as Prompt)
          : ((await params.getPromptDetail(prompt.id)) ?? (prompt as Prompt));
      const plan = getPromptCopyPlan(
        detail,
        params.outputFormatItems,
        params.promptById,
      );
      if (plan.prompts.length > 1) {
        // Hydrate every queue item so the variable dialog can resolve content.
        // 逐项加载完整详情，供变量弹窗解析内容。
        const hydrated: Prompt[] = await Promise.all(
          plan.prompts.map(async (item) => {
            if ("userPrompt" in item && item.userPrompt !== undefined)
              return item as Prompt;
            return (await params.getPromptDetail(item.id)) ?? (item as Prompt);
          }),
        );
        return startCopyQueue(hydrated, plan.sourcePromptId, params.copy);
      }
      // Single-target copy: hydrate the target (source attribution stays the
      // source prompt id).
      // 单目标复制：按需加载目标内容，来源归属仍为源 prompt。
      const single = plan.prompts[0];
      const singleDetail: Prompt =
        "userPrompt" in single && single.userPrompt !== undefined
          ? (single as Prompt)
          : ((await params.getPromptDetail(single.id)) ?? (single as Prompt));
      await copySinglePrompt(singleDetail, plan.sourcePromptId, params);
    },
    [params],
  );
}

function startCopyQueue(queue: Prompt[], sourceId: string, state: CopyState) {
  state.setCopyPromptQueue(queue);
  state.setCopyPromptResults(new Array(queue.length).fill(""));
  state.setCopyPromptQueueIndex(0);
  state.setCopyPromptSourceId(sourceId);
}

async function copySinglePrompt(
  prompt: Prompt,
  sourcePromptId: string,
  params: PromptCopyFlowParams,
) {
  const resolvedPrompt = resolvePromptContentByLanguage(
    prompt,
    params.showEnglish,
  );
  if (hasUserDefinedPromptVariables(undefined, resolvedPrompt.userPrompt)) {
    params.copy.setCopyPrompt(prompt);
    params.copy.setCopyPromptSourceId(sourcePromptId);
    params.copy.setIsCopyVariableModalOpen(true);
    return;
  }
  await copyTextToClipboard(buildPromptCopyText(resolvedPrompt));
  await params.incrementUsageCount(sourcePromptId);
  params.triggerCopied();
  params.showToast(
    params.t("toast.copied"),
    "success",
    params.showCopyNotification,
  );
}

function useCopyQueueProcessor(params: PromptCopyFlowParams) {
  useEffect(() => {
    if (canProcessCopyQueue(params.copy)) void processCopyQueue(params);
  }, [
    params.copy.copyPromptQueue,
    params.copy.copyPromptQueueIndex,
    params.copy.copyPromptResults,
    params.copy.copyPromptSourceId,
    params.incrementUsageCount,
    params.showCopyNotification,
    params.showEnglish,
    params.showToast,
    params.t,
    params.triggerCopied,
  ]);
}

function canProcessCopyQueue(state: CopyState) {
  return state.copyPromptQueue.length > 0 && state.copyPromptQueueIndex >= 0;
}

async function processCopyQueue(params: PromptCopyFlowParams) {
  if (isCopyQueueComplete(params.copy)) return finishCopyQueue(params);
  const prompt = params.copy.copyPromptQueue[params.copy.copyPromptQueueIndex];
  const resolved = resolvePromptContentByLanguage(prompt, params.showEnglish);
  if (hasUserDefinedPromptVariables(undefined, resolved.userPrompt))
    return requestCopyVariables(prompt, params.copy);
  appendCopyQueueResult(buildPromptCopyText(resolved), params.copy);
}

function isCopyQueueComplete(state: CopyState) {
  return state.copyPromptQueueIndex >= state.copyPromptQueue.length;
}

async function finishCopyQueue(params: PromptCopyFlowParams) {
  const text = params.copy.copyPromptResults
    .filter((item) => item.trim())
    .join("\n\n");
  try {
    await copyTextToClipboard(text);
    if (params.copy.copyPromptSourceId)
      await params.incrementUsageCount(params.copy.copyPromptSourceId);
    params.triggerCopied();
    params.showToast(
      params.t("toast.copied"),
      "success",
      params.showCopyNotification,
    );
  } finally {
    resetCopyQueue(params.copy);
  }
}

function requestCopyVariables(prompt: Prompt, state: CopyState) {
  state.setCopyPrompt(prompt);
  state.setIsCopyVariableModalOpen(true);
}

function appendCopyQueueResult(result: string, state: CopyState) {
  state.setCopyPromptResults((items) =>
    replaceCopyQueueResult(items, state.copyPromptQueueIndex, result),
  );
  state.setCopyPromptQueueIndex((index) => index + 1);
}

function replaceCopyQueueResult(
  items: string[],
  index: number,
  result: string,
) {
  const next = [...items];
  next[index] = result;
  return next;
}

function resetCopyQueue(state: CopyState) {
  state.setIsCopyVariableModalOpen(false);
  state.setCopyPrompt(null);
  state.setCopyPromptQueue([]);
  state.setCopyPromptResults([]);
  state.setCopyPromptQueueIndex(-1);
  state.setCopyPromptSourceId(null);
}

export function usePromptWorkspaceCopyFlow(params: PromptCopyFlowParams) {
  useCopyQueueProcessor(params);
  return { handleCopyPrompt: usePromptCopyHandler(params) };
}
