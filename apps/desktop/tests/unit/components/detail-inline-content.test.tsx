import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import { usePromptDetailInlineEditor } from "../../../src/renderer/components/layout/usePromptDetailInlineEditor";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

it("validates primary content rather than removed English translations during inline edits (#225)", async () => {
  const updatePrompt = vi.fn().mockResolvedValue(undefined);
  usePromptStore.setState({ updatePrompt });
  const prompt: Prompt = {
    id: "bilingual",
    title: "Policy",
    systemPrompt: "Primary policy",
    userPrompt: "",
    systemPromptEn: "English policy",
    userPromptEn: "English input",
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
  const { result } = renderHook(() =>
    usePromptDetailInlineEditor(prompt, true),
  );
  act(() => result.current.openDetailInlineEdit());
  act(() =>
    result.current.setDetailInlineDraft((draft) => ({
      ...draft,
      systemPrompt: "",
      userPrompt: "",
    })),
  );
  expect(result.current.hasDetailInlineContent).toBe(true);
  expect(result.current.canSaveDetailInlineEdit).toBe(true);
  await act(async () => result.current.saveDetailInlineEdit());
  expect(updatePrompt).toHaveBeenCalledWith("bilingual", {
    systemPromptEn: "",
    userPromptEn: "",
  });
});
