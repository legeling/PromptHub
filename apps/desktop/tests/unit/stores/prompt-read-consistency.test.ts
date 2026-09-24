import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt, PromptSummary } from "@prompthub/shared/types";

const databaseMock = vi.hoisted(() => ({
  getAllPromptSummaries: vi.fn(),
  listPromptRelations: vi.fn(),
  listOutputFormatItems: vi.fn(),
  getPromptById: vi.fn(),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  movePrompts: vi.fn(),
  movePrompt: vi.fn(),
  listPromptRelationsByPromptId: vi.fn(),
  createPromptRelation: vi.fn(),
  updatePromptRelation: vi.fn(),
  deletePromptRelation: vi.fn(),
  createOutputFormatItem: vi.fn(),
  deleteOutputFormatItem: vi.fn(),
  reorderOutputFormatItem: vi.fn(),
  promptToSummary: vi.fn(
    (prompt: {
      id: string;
      title: string;
      tags?: string[];
      description?: string | null;
      promptType?: string;
      folderId?: string | null;
      parentId?: string | null;
      order?: number;
      images?: string[];
      videos?: string[];
      isFavorite?: boolean;
      isPinned?: boolean;
      usageCount?: number;
      version?: number;
      currentVersion?: number;
      createdAt?: string;
      updatedAt?: string;
    }) => ({
      id: prompt.id,
      title: prompt.title,
      description: prompt.description ?? "",
      promptType: prompt.promptType ?? "text",
      tags: prompt.tags ?? [],
      folderId: prompt.folderId ?? null,
      parentId: prompt.parentId ?? null,
      order: prompt.order ?? 0,
      images: prompt.images ?? [],
      videos: prompt.videos ?? [],
      isFavorite: prompt.isFavorite ?? false,
      isPinned: prompt.isPinned ?? false,
      usageCount: prompt.usageCount ?? 0,
      version: prompt.version ?? 1,
      currentVersion: prompt.currentVersion ?? 1,
      createdAt: prompt.createdAt ?? "2026-09-05T00:00:00.000Z",
      updatedAt: prompt.updatedAt ?? "2026-09-05T00:00:00.000Z",
    }),
  ),
}));

vi.mock("../../../src/renderer/services/database", () => databaseMock);
vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

import * as db from "../../../src/renderer/services/database";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";

const BASE_TIME = "2026-09-05T00:00:00.000Z";

function makePromptSummary(
  id: string,
  title = id,
  overrides: Partial<PromptSummary> = {},
): PromptSummary {
  return {
    id,
    title,
    description: "",
    promptType: "text",
    tags: [],
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

function makePrompt(
  id: string,
  title = id,
  overrides: Partial<Prompt> = {},
): Prompt {
  return {
    id,
    title,
    description: "",
    promptType: "text",
    systemPrompt: "",
    userPrompt: `${id} body`,
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resetStore() {
  usePromptStore.setState({
    prompts: [],
    promptDetailCache: {},
    relations: [],
    outputFormatItems: [],
    selectedId: null,
    selectedIds: [],
    lastSelectedId: null,
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
}

function resetDatabaseMocks() {
  vi.clearAllMocks();
  vi.mocked(db.getAllPromptSummaries).mockResolvedValue([]);
  vi.mocked(db.listPromptRelations).mockResolvedValue([]);
  vi.mocked(db.listOutputFormatItems).mockResolvedValue([]);
  vi.mocked(db.getPromptById).mockResolvedValue(undefined);
  vi.mocked(db.createPrompt).mockResolvedValue(makePrompt("created"));
  vi.mocked(db.updatePrompt).mockResolvedValue(makePrompt("updated"));
  vi.mocked(db.deletePrompt).mockResolvedValue(undefined);
  vi.mocked(db.movePrompts).mockResolvedValue(undefined);
  vi.mocked(db.movePrompt).mockResolvedValue(undefined);
  vi.mocked(db.createPromptRelation).mockResolvedValue({} as never);
  vi.mocked(db.updatePromptRelation).mockResolvedValue(null);
  vi.mocked(db.deletePromptRelation).mockResolvedValue(false);
  vi.mocked(db.createOutputFormatItem).mockResolvedValue({} as never);
  vi.mocked(db.deleteOutputFormatItem).mockResolvedValue(false);
  vi.mocked(db.reorderOutputFormatItem).mockResolvedValue(undefined);
}

describe("prompt store read consistency", () => {
  beforeEach(() => {
    resetDatabaseMocks();
    resetStore();
  });

  it("refreshes external changes, clears detail cache, and removes missing selections", async () => {
    const oldPrompt = makePrompt("prompt-old", "Old title");
    usePromptStore.setState({
      prompts: [makePromptSummary("prompt-old", "Old title")],
      promptDetailCache: { "prompt-old": oldPrompt },
      selectedId: "prompt-old",
      selectedIds: ["prompt-old"],
      lastSelectedId: "prompt-old",
    });
    vi.mocked(db.getAllPromptSummaries).mockResolvedValue([
      makePromptSummary("prompt-new", "New title"),
    ]);

    await usePromptStore.getState().fetchPrompts();

    expect(usePromptStore.getState().prompts).toEqual([
      makePromptSummary("prompt-new", "New title"),
    ]);
    expect(usePromptStore.getState().promptDetailCache).toEqual({});
    expect(usePromptStore.getState().selectedId).toBeNull();
    expect(usePromptStore.getState().selectedIds).toEqual([]);
    expect(usePromptStore.getState().lastSelectedId).toBeNull();

    const externallyUpdated = makePrompt("prompt-old", "External title");
    vi.mocked(db.getPromptById).mockResolvedValue(externallyUpdated);
    await expect(
      usePromptStore.getState().getPromptDetail("prompt-old"),
    ).resolves.toEqual(externallyUpdated);
    expect(db.getPromptById).toHaveBeenCalledWith("prompt-old");
  });

  it("keeps the latest fetch result and loading state when an older fetch settles late", async () => {
    const first = deferred<PromptSummary[]>();
    const second = deferred<PromptSummary[]>();
    vi.mocked(db.getAllPromptSummaries)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstFetch = usePromptStore.getState().fetchPrompts();
    const secondFetch = usePromptStore.getState().fetchPrompts();
    expect(usePromptStore.getState().isLoading).toBe(true);

    second.resolve([makePromptSummary("latest", "Latest")]);
    await secondFetch;
    expect(
      usePromptStore.getState().prompts.map((prompt) => prompt.id),
    ).toEqual(["latest"]);
    expect(usePromptStore.getState().isLoading).toBe(false);

    first.resolve([makePromptSummary("stale", "Stale")]);
    await firstFetch;
    expect(
      usePromptStore.getState().prompts.map((prompt) => prompt.id),
    ).toEqual(["latest"]);
    expect(usePromptStore.getState().isLoading).toBe(false);
  });

  it("fences a late list fetch after a prompt mutation", async () => {
    const pendingList = deferred<PromptSummary[]>();
    const before = makePrompt("prompt-1", "Before");
    const updated = makePrompt("prompt-1", "Updated");
    usePromptStore.setState({
      prompts: [makePromptSummary("prompt-1", "Before")],
      promptDetailCache: { "prompt-1": before },
    });
    vi.mocked(db.getAllPromptSummaries).mockReturnValue(pendingList.promise);
    vi.mocked(db.updatePrompt).mockResolvedValue(updated);

    const fetch = usePromptStore.getState().fetchPrompts();
    await usePromptStore.getState().updatePrompt("prompt-1", {
      title: "Updated",
    });
    expect(usePromptStore.getState().prompts[0].title).toBe("Updated");
    expect(usePromptStore.getState().promptDetailCache["prompt-1"]).toEqual(
      updated,
    );

    pendingList.resolve([makePromptSummary("prompt-1", "Stale list")]);
    await fetch;
    expect(usePromptStore.getState().prompts[0].title).toBe("Updated");
    expect(usePromptStore.getState().isLoading).toBe(false);
  });

  it("keeps valid state when the latest fetch fails", async () => {
    const validSummary = makePromptSummary("prompt-1", "Valid");
    const validDetail = makePrompt("prompt-1", "Valid");
    usePromptStore.setState({
      prompts: [validSummary],
      promptDetailCache: { "prompt-1": validDetail },
      selectedId: "prompt-1",
      selectedIds: ["prompt-1"],
      lastSelectedId: "prompt-1",
    });
    vi.mocked(db.getAllPromptSummaries).mockRejectedValue(
      new Error("database unavailable"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(usePromptStore.getState().fetchPrompts()).rejects.toThrow("database unavailable");

    expect(usePromptStore.getState().prompts).toEqual([validSummary]);
    expect(usePromptStore.getState().promptDetailCache).toEqual({
      "prompt-1": validDetail,
    });
    expect(usePromptStore.getState().selectedId).toBe("prompt-1");
    expect(usePromptStore.getState().isLoading).toBe(false);
    errorSpy.mockRestore();
  });

  it("merges same-generation detail requests and fences a late response after update", async () => {
    const pendingDetail = deferred<Prompt | undefined>();
    const oldDetail = makePrompt("prompt-1", "Old");
    const updatedDetail = makePrompt("prompt-1", "Updated");
    usePromptStore.setState({
      prompts: [makePromptSummary("prompt-1", "Old")],
    });
    vi.mocked(db.getPromptById).mockReturnValue(pendingDetail.promise);
    vi.mocked(db.updatePrompt).mockResolvedValue(updatedDetail);

    const firstRequest = usePromptStore.getState().getPromptDetail("prompt-1");
    const secondRequest = usePromptStore.getState().getPromptDetail("prompt-1");
    expect(db.getPromptById).toHaveBeenCalledTimes(1);

    await usePromptStore.getState().updatePrompt("prompt-1", {
      title: "Updated",
    });
    expect(usePromptStore.getState().promptDetailCache["prompt-1"]).toEqual(
      updatedDetail,
    );

    pendingDetail.resolve(oldDetail);
    await expect(firstRequest).resolves.toEqual(updatedDetail);
    await expect(secondRequest).resolves.toEqual(updatedDetail);
    expect(usePromptStore.getState().promptDetailCache["prompt-1"]).toEqual(
      updatedDetail,
    );
  });

  it("does not write a late detail response after delete", async () => {
    const pendingDetail = deferred<Prompt | undefined>();
    const oldDetail = makePrompt("prompt-delete", "To delete");
    usePromptStore.setState({
      prompts: [makePromptSummary("prompt-delete", "To delete")],
    });
    vi.mocked(db.getPromptById).mockReturnValue(pendingDetail.promise);

    const detailRequest = usePromptStore
      .getState()
      .getPromptDetail("prompt-delete");
    await usePromptStore.getState().deletePrompt("prompt-delete");
    expect(usePromptStore.getState().prompts).toEqual([]);
    expect(usePromptStore.getState().promptDetailCache).toEqual({});

    pendingDetail.resolve(oldDetail);
    await expect(detailRequest).resolves.toBeNull();
    expect(usePromptStore.getState().promptDetailCache).toEqual({});
  });

  it("fences an invalidated request when a replacement request completes first", async () => {
    const firstDetail = deferred<Prompt | undefined>();
    const replacementDetail = deferred<Prompt | undefined>();
    const updateResult = deferred<Prompt>();
    const oldDetail = makePrompt("prompt-aba", "Old");
    const replacement = makePrompt("prompt-aba", "Replacement");
    const updated = makePrompt("prompt-aba", "Updated");
    usePromptStore.setState({
      prompts: [makePromptSummary("prompt-aba", "Old")],
    });
    vi.mocked(db.getPromptById)
      .mockReturnValueOnce(firstDetail.promise)
      .mockReturnValueOnce(replacementDetail.promise);
    vi.mocked(db.updatePrompt).mockReturnValue(updateResult.promise);

    const firstRequest = usePromptStore
      .getState()
      .getPromptDetail("prompt-aba");
    const update = usePromptStore.getState().updatePrompt("prompt-aba", {
      title: "Updated",
    });
    const replacementRequest = usePromptStore
      .getState()
      .getPromptDetail("prompt-aba");

    replacementDetail.resolve(replacement);
    await expect(replacementRequest).resolves.toEqual(replacement);

    updateResult.resolve(updated);
    await update;
    expect(usePromptStore.getState().promptDetailCache["prompt-aba"]).toEqual(
      updated,
    );

    firstDetail.resolve(oldDetail);
    await expect(firstRequest).resolves.toEqual(updated);
    expect(usePromptStore.getState().promptDetailCache["prompt-aba"]).toEqual(
      updated,
    );
  });

  it("bounds the detail cache to 100 entries", async () => {
    vi.mocked(db.getPromptById).mockImplementation((id: string) =>
      Promise.resolve(makePrompt(id)),
    );

    for (let index = 0; index <= 100; index += 1) {
      await usePromptStore.getState().getPromptDetail(`prompt-${index}`);
    }

    const cache = usePromptStore.getState().promptDetailCache;
    expect(Object.keys(cache)).toHaveLength(100);
    expect(cache["prompt-0"]).toBeUndefined();
    expect(cache["prompt-100"]).toEqual(makePrompt("prompt-100"));
  });

  it("limits distinct in-flight detail requests before calling the database", async () => {
    const ids = Array.from(
      { length: 100 },
      (_, index) => `prompt-in-flight-${index}`,
    );
    const pendingDetails = ids.map(() => deferred<Prompt | undefined>());
    vi.mocked(db.getPromptById).mockImplementation((id: string) => {
      const index = ids.indexOf(id);
      return pendingDetails[index].promise;
    });

    const pendingRequests = ids.map((id) =>
      usePromptStore.getState().getPromptDetail(id),
    );
    expect(db.getPromptById).toHaveBeenCalledTimes(100);

    await expect(
      usePromptStore.getState().getPromptDetail("prompt-in-flight-overflow"),
    ).rejects.toThrow("maximum 100");
    expect(db.getPromptById).toHaveBeenCalledTimes(100);

    pendingDetails.forEach((detail, index) => {
      detail.resolve(makePrompt(ids[index]));
    });
    await Promise.all(pendingRequests);
  });

  it("also bounds superseded requests for the same id", async () => {
    const pending = deferred<Prompt | undefined>();
    vi.mocked(db.getPromptById).mockReturnValue(pending.promise);
    const requests: Array<Promise<Prompt | null>> = [];
    for (let index = 0; index < 100; index += 1) {
      await usePromptStore.getState().fetchPrompts();
      requests.push(usePromptStore.getState().getPromptDetail("repeated-id"));
    }
    await usePromptStore.getState().fetchPrompts();
    await expect(
      usePromptStore.getState().getPromptDetail("repeated-id"),
    ).rejects.toThrow("maximum 100");
    expect(db.getPromptById).toHaveBeenCalledTimes(100);
    pending.resolve(makePrompt("repeated-id"));
    await Promise.all(requests);
  });
});
