import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import { PromptListHeader } from "../../../src/renderer/components/prompt/PromptListHeader";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";

// Keep the real sidebar, view controls and stores; native dialogs are outside
// this renderer navigation contract and are never opened by these scenarios.
vi.mock("../../../src/renderer/components/resources/ResourcesModal", () => ({
  ResourcesModal: () => null,
}));
vi.mock("../../../src/renderer/components/folder", () => ({
  FolderModal: () => null,
  PrivateFolderUnlockModal: () => null,
}));
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const layouts = [
  { mode: "card", labelKey: "viewCard" },
  { mode: "gallery", labelKey: "viewGallery" },
  { mode: "kanban", labelKey: "viewKanban" },
  { mode: "list", labelKey: "viewList" },
] as const;
const filters = ["text", "image", "all"] as const;

describe("Prompt type filters and view layout", () => {
  beforeEach(() => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
      isWorkbenchSidebarExpanded: false,
    });
    usePromptStore.setState({
      prompts: [],
      viewMode: "card",
      promptTypeFilter: "all",
      filterTags: [],
      searchQuery: "",
    });
    useFolderStore.setState({
      folders: [],
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    });
    useSettingsStore.setState({
      desktopHomeModules: ["prompt"],
      promptTagCatalog: [],
    });
  });

  describe.each([false, true])("collapsed sidebar: %s", (collapsed) => {
    it.each(layouts)(
      "preserves $mode through every type filter",
      async (layout) => {
        useUIStore.setState({ isSidebarCollapsed: collapsed });
        const { i18n } = await renderWithI18n(
          <>
            <Sidebar currentPage="home" onNavigate={vi.fn()} />
            <PromptListHeader count={0} />
          </>,
          { settleAsyncEffects: true },
        );
        const layoutButton = screen.getByRole("button", {
          name: i18n.t(`prompt.${layout.labelKey}`),
        });
        fireEvent.click(layoutButton);

        for (const filter of filters) {
          const filterKey = collapsed
            ? `nav.${filter === "all" ? "allPrompts" : `${filter}Prompts`}`
            : `filter.${filter}`;
          fireEvent.click(
            screen.getByRole("button", { name: i18n.t(filterKey) }),
          );

          expect(usePromptStore.getState().promptTypeFilter).toBe(filter);
          expect(usePromptStore.getState().viewMode).toBe(layout.mode);
          expect(layoutButton).toHaveAttribute("aria-pressed", "true");
          if (!collapsed) {
            expect(
              screen.getByRole("button", { name: i18n.t(filterKey) }),
            ).toHaveAttribute("aria-pressed", "true");
          }
        }

        fireEvent.click(
          screen.getByRole("button", {
            name: i18n.t(
              layout.mode === "card" ? "prompt.viewList" : "prompt.viewCard",
            ),
          }),
        );
        expect(usePromptStore.getState().viewMode).toBe(
          layout.mode === "card" ? "list" : "card",
        );
        expect(usePromptStore.getState().promptTypeFilter).toBe("all");
      },
    );
  });

  it("returns from settings without resetting the layout or unrelated filters", async () => {
    usePromptStore.setState({
      viewMode: "list",
      searchQuery: "draft",
      filterTags: ["alpha"],
    });
    useFolderStore.setState({ selectedFolderId: "favorites" });
    const onNavigate = vi.fn();
    const { i18n } = await renderWithI18n(
      <Sidebar currentPage="settings" onNavigate={onNavigate} />,
      { settleAsyncEffects: true },
    );

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filter.text") }),
    );

    expect(usePromptStore.getState()).toMatchObject({
      viewMode: "list",
      promptTypeFilter: "text",
      searchQuery: "draft",
      filterTags: ["alpha"],
    });
    expect(useFolderStore.getState().selectedFolderId).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith("home");
  });

  describe.each(["graph", "generation"] as const)("leaving %s", (mode) => {
    it.each(filters)("still opens the %s collection", async (filter) => {
      usePromptStore.setState({ viewMode: mode });
      useUIStore.setState({ isWorkbenchSidebarExpanded: true });
      const { i18n } = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { settleAsyncEffects: true },
      );

      fireEvent.click(
        screen.getByRole("button", { name: i18n.t(`filter.${filter}`) }),
      );

      expect(usePromptStore.getState().viewMode).toBe("card");
      expect(usePromptStore.getState().promptTypeFilter).toBe(filter);
    });
  });
});
