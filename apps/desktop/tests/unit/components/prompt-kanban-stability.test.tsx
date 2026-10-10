import { Profiler } from "react";
import {
  act,
  fireEvent,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import { PromptKanbanView } from "../../../src/renderer/components/prompt/PromptKanbanView";
import { promptToSummary } from "../../../src/renderer/services/database";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptDetail } from "../../../src/renderer/hooks/usePromptDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const viewport = vi.hoisted(() => ({ firstRow: 0, rowCount: 2 }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string | number;
  }) => ({
    getTotalSize: () => options.count * options.estimateSize(0),
    getVirtualItems: () =>
      Array.from(
        {
          length: Math.min(
            viewport.rowCount,
            options.count - viewport.firstRow,
          ),
        },
        (_, offset) => {
          const index = viewport.firstRow + offset;
          const size = options.estimateSize(index);
          return {
            index,
            key: options.getItemKey(index),
            start: index * size,
            size,
          };
        },
      ),
    measureElement: () => undefined,
  }),
}));

function makePrompt(index: number): Prompt {
  return {
    id: `kanban-${index}`,
    title: `Card ${index}`,
    promptType: "text",
    userPrompt: `User body ${index}`,
    systemPrompt: `System body ${index}`,
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
}

const prompts = Array.from({ length: 116 }, (_, index) => makePrompt(index));
const summaries = prompts.map(promptToSummary);
const read = vi.fn<(id: string) => Promise<Prompt | undefined>>();
const viewProps = {
  prompts: summaries,
  onSelect: vi.fn(),
  onToggleFavorite: vi.fn(),
  onCopy: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onAiTest: vi.fn(),
  onVersionHistory: vi.fn(),
  onViewDetail: vi.fn(),
  onContextMenu: vi.fn(),
};

describe("Kanban viewport stability", () => {
  beforeEach(() => {
    viewport.firstRow = 0;
    read
      .mockReset()
      .mockImplementation(async (id) =>
        prompts.find((prompt) => prompt.id === id),
      );
    installWindowMocks({ api: { prompt: { get: read } } });
    usePromptStore.setState({
      prompts: summaries,
      promptDetailCache: {},
      kanbanColumns: 3,
    });
    useFolderStore.setState({ folders: [] });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(832);
  });

  it("loads only mounted cards in a 116-prompt board and stays idle after cache writes", async () => {
    const commits = vi.fn();
    const { rerender, unmount } = await renderWithI18n(
      <Profiler id="kanban" onRender={commits}>
        <PromptKanbanView {...viewProps} />
      </Profiler>,
      { language: "en", settleAsyncEffects: true },
    );
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(read.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining(summaries.slice(0, 6).map((prompt) => prompt.id)),
    );
    expect(read).toHaveBeenCalledTimes(6);
    expect(screen.getByText("User body 0")).toBeVisible();

    const settledCommits = commits.mock.calls.length;
    await act(async () => {
      for (const detail of prompts.slice(6, 26)) {
        usePromptStore.setState((state) => ({
          promptDetailCache: {
            ...state.promptDetailCache,
            [detail.id]: detail,
          },
        }));
      }
    });
    expect(read).toHaveBeenCalledTimes(6);
    expect(commits).toHaveBeenCalledTimes(settledCommits);
    console.info(
      "kanban-viewport-probe",
      JSON.stringify({
        prompts: prompts.length,
        mountedCards: screen.getAllByRole("article").length,
        detailReads: read.mock.calls.length,
        unrelatedCacheWrites: 20,
        additionalCommits: commits.mock.calls.length - settledCommits,
      }),
    );

    viewport.firstRow = 2;
    await act(async () => {
      rerender(<PromptKanbanView {...viewProps} />);
    });
    expect(screen.getByText("User body 6")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(6);
    unmount();
  });

  it("retains loaded text when cache eviction requires another visible read", async () => {
    await renderWithI18n(<PromptKanbanView {...viewProps} />, {
      language: "en",
      settleAsyncEffects: true,
    });
    let resolveRead: (prompt: Prompt | undefined) => void = () => undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    await act(async () => {
      usePromptStore.setState((state) => {
        const cache = { ...state.promptDetailCache };
        delete cache[prompts[0].id];
        return { promptDetailCache: cache };
      });
    });
    expect(screen.getByText("User body 0")).toBeVisible();
    expect(
      within(screen.getByRole("article", { name: "Card 0" })).queryByRole(
        "status",
      ),
    ).toBeNull();
    await act(async () => {
      resolveRead(prompts[0]);
    });
    expect(read).toHaveBeenCalledTimes(7);
    expect(screen.getByText("User body 0")).toBeVisible();
  });

  it("uses three columns at the available width and includes a vertical gap in measured rows", async () => {
    const { container } = await renderWithI18n(
      <PromptKanbanView {...viewProps} />,
      { language: "en", settleAsyncEffects: true },
    );
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-index]"),
    );
    expect(rows).toHaveLength(viewport.rowCount);
    const grid = rows[0].querySelector<HTMLElement>(".grid");
    expect(grid).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    });
    expect(Number.parseFloat(rows[0].style.paddingBottom)).toBeGreaterThan(0);
    expect(rows[0].style.paddingBottom).toBe(grid?.style.gap);
  });

  it("translates preview labels and exposes a failed read with an explicit retry", async () => {
    read.mockRejectedValueOnce(new Error("Synthetic detail failure"));
    const { container } = await renderWithI18n(
      <PromptKanbanView {...viewProps} />,
      { language: "zh", settleAsyncEffects: true },
    );
    expect(container.textContent).not.toContain("PromptSummary");
    expect(screen.getAllByText("系统提示词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("用户提示词").length).toBeGreaterThan(0);
    const failed = screen.getByRole("article", { name: "Card 0" });
    const retry = within(failed).getByRole("button", { name: "重试" });
    expect(read).toHaveBeenCalledTimes(6);
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(within(failed).getByText("User body 0")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(7);
  });

  it("finishes loading when the request populates the shared cache", async () => {
    const { result } = renderHook(() => usePromptDetail(prompts[0].id));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.prompt?.userPrompt).toBe("User body 0");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard focus on the favorite action after its label changes", async () => {
    const { rerender } = await renderWithI18n(
      <PromptKanbanView {...viewProps} prompts={summaries.slice(0, 1)} />,
      { language: "en", settleAsyncEffects: true },
    );
    screen.getByRole("button", { name: "Add to Favorites" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Add to Favorites" }));
    await act(async () => {
      rerender(<PromptKanbanView {...viewProps} prompts={[{ ...summaries[0], isFavorite: true }]} />);
    });
    expect(screen.getByRole("button", { name: "Remove from Favorites" })).toHaveFocus();
  });
});
