import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

vi.mock("../../../src/renderer/services/database", () => ({
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  movePrompts: vi.fn(),
  deletePrompt: vi.fn(),
  getAllPrompts: vi.fn().mockResolvedValue([]),
}));

import { scheduleAllSaveSync } from "../../../src/renderer/services/webdav-save-sync";
import * as db from "../../../src/renderer/services/database";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";

describe("prompt store save-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePromptStore.setState({
      prompts: [],
      selectedId: null,
      selectedIds: [],
      lastSelectedId: null,
      selectionRevision: 0,
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      viewMode: "card",
      galleryImageSize: "medium",
      kanbanColumns: 3,
    });
  });

  it("schedules save-sync for prompt creation", async () => {
    vi.mocked(db.createPrompt).mockResolvedValue({
      id: "prompt-1",
      title: "New Prompt",
      description: "",
      promptType: "text",
      systemPrompt: "",
      userPrompt: "Hello",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      usageCount: 0,
      currentVersion: 1,
      version: 1,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    } as never);

    await usePromptStore.getState().createPrompt({
      title: "New Prompt",
      promptType: "text",
      userPrompt: "Hello",
      variables: [],
      tags: [],
    });

    expect(scheduleAllSaveSync).toHaveBeenCalledWith("prompt:create");
  });

  it("does not schedule save-sync for usage-count only updates", async () => {
    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt",
          description: "",
          promptType: "text",
          systemPrompt: "",
          userPrompt: "Hello",
          variables: [],
          tags: [],
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          currentVersion: 1,
          version: 1,
          createdAt: "2026-05-11T00:00:00.000Z",
          updatedAt: "2026-05-11T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(db.updatePrompt).mockResolvedValue({
      ...usePromptStore.getState().prompts[0],
      usageCount: 1,
    } as never);

    await usePromptStore.getState().incrementUsageCount("prompt-1");

    expect(scheduleAllSaveSync).not.toHaveBeenCalled();
  });

  it("keeps lastSelectedId when the current selection is cleared", () => {
    usePromptStore.getState().selectPrompt("prompt-1");
    usePromptStore.getState().selectPrompt(null);

    expect(usePromptStore.getState().selectedId).toBeNull();
    expect(usePromptStore.getState().selectedIds).toEqual([]);
    expect(usePromptStore.getState().lastSelectedId).toBe("prompt-1");
  });

  it("bumps selectionRevision for every explicit single selection and leaves multi-select unchanged", () => {
    const before = usePromptStore.getState().selectionRevision;
    usePromptStore.getState().selectPrompt("prompt-1");
    const first = usePromptStore.getState().selectionRevision;
    expect(first).toBe(before + 1);
    // repeat click on the already selected prompt still counts as an interaction
    usePromptStore.getState().selectPrompt("prompt-1");
    expect(usePromptStore.getState().selectionRevision).toBe(first + 1);
    usePromptStore.getState().setSelectedIds(["prompt-1", "prompt-2"]);
    expect(usePromptStore.getState().selectionRevision).toBe(first + 1);
    usePromptStore.getState().setSelectedIds(["prompt-2"]);
    expect(usePromptStore.getState().selectionRevision).toBe(first + 2);
    usePromptStore.getState().selectPrompt(null);
    expect(usePromptStore.getState().selectionRevision).toBe(first + 2);
  });

  it("updates lastSelectedId only for single explicit selections", () => {
    usePromptStore.getState().selectPrompt("prompt-1");
    usePromptStore.getState().setSelectedIds(["prompt-1", "prompt-2"]);

    expect(usePromptStore.getState().selectedId).toBe("prompt-1");
    expect(usePromptStore.getState().lastSelectedId).toBe("prompt-1");

    usePromptStore.getState().setSelectedIds(["prompt-2"]);

    expect(usePromptStore.getState().selectedId).toBe("prompt-2");
    expect(usePromptStore.getState().lastSelectedId).toBe("prompt-2");
  });
});
