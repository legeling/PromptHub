import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewMode } from "../../../src/renderer/stores/prompt.store";
import { PromptViewContainers } from "../../../src/renderer/components/prompt/PromptViewContainers";
import { PromptWorkspaceContent } from "../../../src/renderer/components/layout/PromptWorkspaceContent";
import { renderWithI18n } from "../../helpers/i18n";

const workspaceState = vi.hoisted(() => ({
  uiViewMode: "prompt",
  promptViewMode: "graph" as ViewMode,
}));

vi.mock(
  "../../../src/renderer/components/layout/PromptWorkspaceContext",
  () => ({
    usePromptWorkspaceContext: () => ({
      stores: {
        preferences: { uiViewMode: workspaceState.uiViewMode },
        promptData: { viewMode: workspaceState.promptViewMode },
      },
    }),
  }),
);

vi.mock(
  "../../../src/renderer/components/layout/PromptWorkspaceCardRoute",
  () => ({ PromptWorkspaceCardRoute: () => <div data-testid="card-route" /> }),
);
vi.mock(
  "../../../src/renderer/components/layout/PromptWorkspaceViewRoutes",
  () => ({ PromptWorkspaceViewRoutes: () => <div data-testid="view-route" /> }),
);
vi.mock(
  "../../../src/renderer/components/layout/PromptWorkspaceDialogLayer",
  () => ({ PromptWorkspaceDialogLayer: () => <div data-testid="dialog-layer" /> }),
);
vi.mock("../../../src/renderer/components/skill/SkillManager", () => ({
  SkillManager: () => <div data-testid="skill-manager" />,
}));
vi.mock(
  "../../../src/renderer/components/prompt/PromptListHeader",
  () => ({ PromptListHeader: () => <div data-testid="prompt-list-header" /> }),
);
vi.mock("../../../src/renderer/components/prompt/PromptTableView", () => ({
  PromptTableView: () => <div data-testid="list-view" />,
}));
vi.mock("../../../src/renderer/components/prompt/PromptGalleryView", () => ({
  PromptGalleryView: () => <div data-testid="gallery-view" />,
}));
vi.mock("../../../src/renderer/components/prompt/PromptKanbanView", () => ({
  PromptKanbanView: () => <div data-testid="kanban-view" />,
}));
vi.mock("../../../src/renderer/components/prompt/PromptGraphView", () => ({
  PromptGraphView: () => <div data-testid="graph-view" />,
}));
vi.mock(
  "../../../src/renderer/components/prompt/ImageGenerationWorkbench",
  () => ({ ImageGenerationWorkbench: () => <div data-testid="generation-view" /> }),
);

const VIEW_TEST_IDS = [
  "list-view",
  "gallery-view",
  "kanban-view",
  "graph-view",
  "generation-view",
] as const;

function renderView(viewMode: ViewMode) {
  return renderWithI18n(
    <PromptViewContainers
      viewMode={viewMode}
      prompts={[]}
      relations={[]}
      selectedId={null}
      onGraphSelectPrompt={vi.fn()}
      sortedPrompts={[]}
      visiblePrompts={[]}
      highlightTerms={[]}
      cardActions={{
        onSelect: vi.fn(),
        onToggleFavorite: vi.fn(),
        onCopy: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAiTest: vi.fn(),
        onVersionHistory: vi.fn(),
        onViewDetail: vi.fn(),
        onContextMenu: vi.fn(),
      }}
      tableActions={{
        aiResults: {},
        collapsedPromptIds: new Set(),
        onCollapsedPromptIdsChange: vi.fn(),
        onBatchFavorite: vi.fn(),
        onBatchMove: vi.fn(),
        onBatchDelete: vi.fn(),
        onBatchTags: vi.fn(),
        onMovePrompt: vi.fn(),
      }}
    />,
    { language: "en" },
  );
}

describe("Prompt active view isolation", () => {
  beforeEach(() => {
    workspaceState.uiViewMode = "prompt";
    workspaceState.promptViewMode = "graph";
  });

  it.each([
    ["list", "list-view"],
    ["gallery", "gallery-view"],
    ["kanban", "kanban-view"],
    ["graph", "graph-view"],
    ["generation", "generation-view"],
  ] as const)("mounts only the active %s renderer", async (viewMode, activeId) => {
    const rendered = await renderView(viewMode);

    expect(await screen.findByTestId(activeId)).toBeInTheDocument();
    for (const testId of VIEW_TEST_IDS) {
      if (testId !== activeId) expect(screen.queryByTestId(testId)).toBeNull();
    }

    rendered.unmount();
  });

  it("leaves card mode to the dedicated card route", async () => {
    const rendered = await renderView("card");

    for (const testId of VIEW_TEST_IDS) {
      expect(screen.queryByTestId(testId)).toBeNull();
    }
    expect(screen.queryByTestId("prompt-list-header")).toBeNull();

    rendered.unmount();
  });

  it("unmounts the card workspace while a non-card view is active", async () => {
    const rendered = await renderWithI18n(<PromptWorkspaceContent />, {
      language: "en",
    });

    expect(screen.getByTestId("view-route")).toBeInTheDocument();
    expect(screen.queryByTestId("card-route")).toBeNull();
    expect(screen.getByTestId("dialog-layer")).toBeInTheDocument();

    workspaceState.promptViewMode = "card";
    rendered.rerender(<PromptWorkspaceContent />);

    expect(screen.getByTestId("card-route")).toBeInTheDocument();
    expect(screen.queryByTestId("view-route")).toBeNull();
    expect(screen.getByTestId("dialog-layer")).toBeInTheDocument();
  });
});
