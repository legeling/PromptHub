import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Persistence and store transitions are real. Prompt data and remote sync are
// outside this UI preference boundary and are not called by these scenarios.
vi.mock("../../../src/renderer/services/database", () => ({}));
vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

async function loadStore() {
  vi.resetModules();
  return (await import("../../../src/renderer/stores/prompt.store"))
    .usePromptStore;
}

describe("Prompt list layout preference", () => {
  beforeEach(() => localStorage.removeItem("prompt-store"));
  afterEach(() => vi.restoreAllMocks());

  it("reopens a special workspace without losing the last manual layout or sizing", async () => {
    const store = await loadStore();
    store.getState().setViewMode("gallery");
    store.getState().setGalleryImageSize("large");
    store.getState().setKanbanColumns(4);
    store.getState().setViewMode("graph");
    store.getState().setViewMode("generation");
    const reopened = await loadStore();
    expect(reopened.getState()).toMatchObject({
      viewMode: "generation",
      lastListViewMode: "gallery",
      galleryImageSize: "large",
      kanbanColumns: 4,
    });
    reopened.getState().returnToListView();
    expect(reopened.getState().viewMode).toBe("gallery");
    reopened.getState().setViewMode("list");
    reopened.getState().setViewMode("graph");
    reopened.getState().returnToListView();
    expect((await loadStore()).getState().viewMode).toBe("list");
  });

  it.each([
    {
      input: { viewMode: "kanban" },
      viewMode: "kanban",
      lastListViewMode: "kanban",
    },
    {
      input: { viewMode: "list", lastListViewMode: "gallery" },
      viewMode: "list",
      lastListViewMode: "list",
    },
    {
      input: { viewMode: "graph" },
      viewMode: "graph",
      lastListViewMode: "card",
    },
    {
      input: { viewMode: "generation", lastListViewMode: "list" },
      viewMode: "generation",
      lastListViewMode: "list",
    },
    {
      input: { viewMode: "graph", lastListViewMode: "invalid" },
      viewMode: "graph",
      lastListViewMode: "card",
    },
    {
      input: { viewMode: "invalid", lastListViewMode: "gallery" },
      viewMode: "gallery",
      lastListViewMode: "gallery",
    },
    {
      input: { viewMode: 42, lastListViewMode: null },
      viewMode: "card",
      lastListViewMode: "card",
    },
    { input: {}, viewMode: "card", lastListViewMode: "card" },
  ])(
    "restores legacy or invalid preference $input",
    async ({ input, viewMode, lastListViewMode }) => {
      localStorage.setItem(
        "prompt-store",
        JSON.stringify({ state: input, version: 0 }),
      );
      expect((await loadStore()).getState()).toMatchObject({
        viewMode,
        lastListViewMode,
      });
    },
  );

  it("does not overwrite a new selection with a repeated stale hydration", async () => {
    const store = await loadStore();
    store.getState().setViewMode("kanban");
    localStorage.setItem(
      "prompt-store",
      JSON.stringify({ state: { viewMode: "card" }, version: 0 }),
    );
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({
      viewMode: "kanban",
      lastListViewMode: "kanban",
    });
  });

  it("keeps the session choice and reports a storage write failure", async () => {
    const store = await loadStore();
    const error = new Error("Preference storage unavailable");
    const report = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw error;
    });
    store.getState().setViewMode("gallery");
    expect(store.getState()).toMatchObject({
      viewMode: "gallery",
      lastListViewMode: "gallery",
    });
    expect(report).toHaveBeenCalledWith(
      "Failed to persist Prompt view preferences:",
      error,
    );
  });

  it("reports corrupt persisted JSON without destroying it or blocking a new choice", async () => {
    localStorage.setItem("prompt-store", "{broken");
    const report = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const store = await loadStore();
    expect(report).toHaveBeenCalledWith(
      "Failed to restore Prompt view preferences:",
      expect.any(SyntaxError),
    );
    expect(localStorage.getItem("prompt-store")).toBe("{broken");
    expect(store.getState().viewMode).toBe("card");
    store.getState().setViewMode("list");
    expect((await loadStore()).getState().viewMode).toBe("list");
  });
});
