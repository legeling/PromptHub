import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import { PromptListHeader } from "../../../src/renderer/components/prompt/PromptListHeader";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";

// Keep the real sidebar, view controls and stores. The unlock dialog double
// exercises navigation after success/cancel; it does not verify authentication.
vi.mock("../../../src/renderer/components/resources/ResourcesModal", () => ({
  ResourcesModal: () => null,
}));
vi.mock("../../../src/renderer/components/folder", () => ({
  FolderModal: () => null,
  PrivateFolderUnlockModal: ({
    onSuccess,
    onClose,
  }: {
    onSuccess: () => void;
    onClose: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onSuccess}>Unlock fixture</button>
      <button onClick={onClose}>Cancel unlock</button>
    </div>
  ),
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

function clickNavigation(name: string): void {
  // Folder drag handles also have role=button; activate the native selection button.
  const button = screen
    .getAllByRole("button", { name })
    .find((element) => element.tagName === "BUTTON");
  if (!button) throw new Error(`Navigation button missing: ${name}`);
  fireEvent.click(button);
}

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
      lastListViewMode: "card",
      viewModeRevision: 0,
      promptTypeFilter: "all",
      filterTags: [],
      searchQuery: "",
    });
    useFolderStore.setState({
      folders: ["Folder A", "Folder B"].map((name, order) => ({
        id: name,
        name,
        order,
        createdAt: "2026-10-17T00:00:00Z",
        updatedAt: "2026-10-17T00:00:00Z",
      })),
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    });
    useSettingsStore.setState({
      desktopHomeModules: ["prompt"],
      promptTagCatalog: [],
      isTagsSectionCollapsed: false,
      tagFilterMode: "single",
    });
  });

  it.each(layouts)(
    "keeps $mode through folders, favorites and tags",
    async (layout) => {
      useSettingsStore.setState({ promptTagCatalog: ["alpha"] });
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
      for (const name of [
        "Folder A",
        "Folder B",
        "Folder A",
        i18n.t("nav.favorites"),
      ]) {
        clickNavigation(name);
        expect(useFolderStore.getState().selectedFolderId).toBe(
          name === i18n.t("nav.favorites") ? "favorites" : name,
        );
        expect(layoutButton).toHaveAttribute("aria-pressed", "true");
      }
      fireEvent.click(screen.getByRole("button", { name: "alpha" }));
      expect(usePromptStore.getState().filterTags).toEqual(["alpha"]);
      expect(layoutButton).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "alpha" }));
      expect(usePromptStore.getState().filterTags).toEqual([]);
      expect(layoutButton).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("keeps gallery when clearing tags in the collapsed sidebar popover", async () => {
    useUIStore.setState({ isSidebarCollapsed: true });
    useSettingsStore.setState({ promptTagCatalog: ["alpha"] });
    usePromptStore.getState().setViewMode("gallery");
    usePromptStore.getState().setFilterTags(["alpha"]);
    const { i18n } = await renderWithI18n(
      <>
        <Sidebar currentPage="home" onNavigate={vi.fn()} />
        <PromptListHeader count={0} />
      </>,
      { settleAsyncEffects: true },
    );
    fireEvent.click(screen.getByTitle(i18n.t("nav.tags")));
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("common.clear") }),
    );
    expect(usePromptStore.getState().filterTags).toEqual([]);
    expect(
      screen.getByRole("button", { name: i18n.t("prompt.viewGallery") }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([true, false])(
    "preserves layout when private-folder unlock succeeds: %s",
    async (success) => {
      useFolderStore.setState({
        folders: [
          {
            id: "private",
            name: "Private folder",
            isPrivate: true,
            order: 0,
            createdAt: "2026-10-17T00:00:00Z",
            updatedAt: "2026-10-17T00:00:00Z",
          },
        ],
      });
      usePromptStore.getState().setViewMode("list");
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { settleAsyncEffects: true },
      );
      clickNavigation("Private folder");
      expect(useFolderStore.getState().selectedFolderId).toBeNull();
      expect(usePromptStore.getState().viewMode).toBe("list");
      fireEvent.click(
        screen.getByRole("button", {
          name: success ? "Unlock fixture" : "Cancel unlock",
        }),
      );
      expect(useFolderStore.getState().selectedFolderId).toBe(
        success ? "private" : null,
      );
      expect(usePromptStore.getState().viewMode).toBe("list");
    },
  );

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
      usePromptStore.getState().setViewMode("gallery");
      usePromptStore.getState().setViewMode(mode);
      useUIStore.setState({ isWorkbenchSidebarExpanded: true });
      const { i18n } = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { settleAsyncEffects: true },
      );

      fireEvent.click(
        screen.getByRole("button", { name: i18n.t(`filter.${filter}`) }),
      );

      expect(usePromptStore.getState().viewMode).toBe("gallery");
      expect(usePromptStore.getState().promptTypeFilter).toBe(filter);
    });
  });
});
