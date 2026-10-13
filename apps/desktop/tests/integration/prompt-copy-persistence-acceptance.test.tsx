/** @vitest-environment jsdom */
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OutputFormatItem, Prompt } from "@prompthub/shared/types";
import { promptToSummary } from "@prompthub/shared/utils/prompt-summary";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { usePromptWorkspaceCopyFlow } from "../../src/renderer/components/layout/usePromptWorkspaceCopyFlow";

let runtime: SkillTestRuntime;
let originalClipboard: PropertyDescriptor | undefined;
let clipboardText: string;
let clipboardWrites: number;
let rejectClipboard: boolean;
let copiedCount: number;
let toastCount: number;
const i18n = createInstance();

function registerDomain(): void {
  const database = getDatabase();
  registerPromptIPC(new PromptDB(database), new FolderDB(database), database);
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerDomain();
  await i18n.init({ lng: "en", initImmediate: false, resources: {} });
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  clipboardText = "Unchanged clipboard";
  clipboardWrites = copiedCount = toastCount = 0;
  rejectClipboard = false;
  // Only the OS clipboard transport is replaced; formatting, hydration,
  // attribution, IPC, SQLite and durable publication remain production code.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (rejectClipboard) throw new Error("Injected clipboard denial");
        clipboardText = text;
        clipboardWrites += 1;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  runtime?.dispose();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

async function incrementUsageCount(id: string): Promise<void> {
  const prompt: Prompt | null = await promptApi.get(id);
  if (!prompt) throw new Error(`Copy source disappeared: ${id}`);
  await promptApi.update(id, { usageCount: prompt.usageCount + 1 });
}

const triggerCopied = (): void => {
  copiedCount += 1;
};
const showToast = (): void => {
  toastCount += 1;
};

function copyFlow(
  prompts: Prompt[],
  outputFormatItems: OutputFormatItem[],
  showEnglish = false,
) {
  const promptById = new Map(
    prompts.map((prompt) => [prompt.id, promptToSummary(prompt)]),
  );
  return renderHook(() => {
    const [copyPrompt, setCopyPrompt] = useState<Prompt | null>(null);
    const [copyPromptQueue, setCopyPromptQueue] = useState<Prompt[]>([]);
    const [copyPromptQueueIndex, setCopyPromptQueueIndex] = useState(-1);
    const [copyPromptResults, setCopyPromptResults] = useState<string[]>([]);
    const [copyPromptSourceId, setCopyPromptSourceId] = useState<string | null>(
      null,
    );
    const [isOpen, setIsCopyVariableModalOpen] = useState(false);
    const flow = usePromptWorkspaceCopyFlow({
      copy: {
        copyPromptQueue,
        copyPromptQueueIndex,
        copyPromptResults,
        copyPromptSourceId,
        setCopyPrompt,
        setCopyPromptQueue,
        setCopyPromptQueueIndex,
        setCopyPromptResults,
        setCopyPromptSourceId,
        setIsCopyVariableModalOpen,
      },
      getPromptDetail: promptApi.get,
      incrementUsageCount,
      outputFormatItems,
      promptById,
      showCopyNotification: false,
      showEnglish,
      showToast,
      t: i18n.t,
      triggerCopied,
    });
    return {
      ...flow,
      copyPrompt,
      copyPromptQueue,
      copyPromptResults,
      copyPromptSourceId,
      isOpen,
    };
  });
}

async function reopen(): Promise<void> {
  await runtime.reopen();
  registerDomain();
}

describe("#192 copy flow with real prompt persistence", () => {
  it.each([false, true])(
    "hydrates ordered output targets, copies once and persists source-only usage (English=%s)",
    async (english) => {
      const source: Prompt = await promptApi.create({
        title: "Source",
        userPrompt: "Raw source",
      });
      const first: Prompt = await promptApi.create({
        title: "First",
        userPrompt: "First output",
        userPromptEn: "First English",
      });
      const second: Prompt = await promptApi.create({
        title: "Second",
        userPrompt: "Second output",
        userPromptEn: "Second English",
      });
      await promptApi.createOutputFormat({
        sourcePromptId: source.id,
        targetPromptId: second.id,
        sortOrder: 0,
      });
      await promptApi.createOutputFormat({
        sourcePromptId: source.id,
        targetPromptId: first.id,
        sortOrder: 1,
      });
      const mapping: OutputFormatItem[] = await promptApi.listOutputFormat({
        sourcePromptId: source.id,
      });
      const { result } = copyFlow([source, first, second], mapping, english);
      await act(() => result.current.handleCopyPrompt(source));
      await waitFor(() => expect(copiedCount).toBe(1));
      expect(clipboardText).toBe(
        english
          ? "Second English\n\nFirst English"
          : "Second output\n\nFirst output",
      );
      expect(clipboardWrites).toBe(1);
      expect(toastCount).toBe(1);
      expect(result.current).toMatchObject({
        copyPrompt: null,
        copyPromptQueue: [],
        copyPromptResults: [],
        copyPromptSourceId: null,
        isOpen: false,
      });
      await reopen();
      expect(await promptApi.get(source.id)).toMatchObject({
        userPrompt: "Raw source",
        usageCount: 1,
      });
      expect(await promptApi.get(first.id)).toMatchObject({
        userPrompt: "First output",
        usageCount: 0,
      });
      expect(await promptApi.get(second.id)).toMatchObject({
        userPrompt: "Second output",
        usageCount: 0,
      });
      expect(
        await promptApi.listOutputFormat({ sourcePromptId: source.id }),
      ).toEqual(mapping);
    },
  );

  it("detects mapped variables without writing partial content or attributing usage", async () => {
    const source: Prompt = await promptApi.create({
      title: "Variable source",
      userPrompt: "Raw source",
    });
    const target: Prompt = await promptApi.create({
      title: "Variable target",
      userPrompt: "Topic {{topic}}",
    });
    await promptApi.createOutputFormat({
      sourcePromptId: source.id,
      targetPromptId: target.id,
      sortOrder: 0,
    });
    const items: OutputFormatItem[] = await promptApi.listOutputFormat({
      sourcePromptId: source.id,
    });
    const { result } = copyFlow([source, target], items);
    await act(() => result.current.handleCopyPrompt(source));
    expect(result.current).toMatchObject({
      isOpen: true,
      copyPrompt: target,
      copyPromptSourceId: source.id,
    });
    expect(clipboardText).toBe("Unchanged clipboard");
    expect(clipboardWrites + copiedCount + toastCount).toBe(0);
    await reopen();
    expect(await promptApi.get(source.id)).toMatchObject({ usageCount: 0 });
    expect(await promptApi.get(target.id)).toMatchObject({ usageCount: 0 });
  });

  it("does not mark a failed clipboard write as successful and supports a later retry", async () => {
    const source: Prompt = await promptApi.create({
      title: "Retry source",
      userPrompt: "Retry output",
    });
    const { result } = copyFlow([source], []);
    rejectClipboard = true;
    await act(async () => {
      await expect(result.current.handleCopyPrompt(source)).rejects.toThrow();
    });
    expect(clipboardWrites + copiedCount + toastCount).toBe(0);
    expect(await promptApi.get(source.id)).toMatchObject({ usageCount: 0 });
    rejectClipboard = false;
    await act(() => result.current.handleCopyPrompt(source));
    expect(clipboardText).toBe("Retry output");
    expect(clipboardWrites).toBe(1);
    await reopen();
    expect(await promptApi.get(source.id)).toMatchObject({ usageCount: 1 });
  });
});
