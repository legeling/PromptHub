import { useTranslation } from "react-i18next";
import { InboxIcon, SearchXIcon } from "lucide-react";
import { usePromptStore } from "../../stores/prompt.store";
import { useFolderStore } from "../../stores/folder.store";
import { Button } from "../ui";

/**
 * Shared empty state for the prompt list views (card / table / gallery).
 * 提示词列表（卡片 / 表格 / 画廊）共享空态。
 *
 * v0.6.3 #74-style guidance: when the list is empty because of active
 * filters (search keyword, tag filters, folder selection) the state explains
 * the cause and offers a one-click "clear all filters"; when the library is
 * genuinely empty it offers the create action through the existing
 * `shortcut:newPrompt` event path (same as the toolbar button).
 * 有筛选时给出归因与一键清除；空库时给出新建引导。
 */
export function PromptListEmptyState() {
  const { t } = useTranslation();
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const filterTags = usePromptStore((state) => state.filterTags);
  const setSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const clearFilterTags = usePromptStore((state) => state.clearFilterTags);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const selectFolder = useFolderStore((state) => state.selectFolder);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    filterTags.length > 0 ||
    selectedFolderId !== null;

  const clearAllFilters = () => {
    setSearchQuery("");
    clearFilterTags();
    selectFolder(null);
  };

  const openCreateModal = () => {
    window.dispatchEvent(new CustomEvent("shortcut:newPrompt"));
  };

  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <SearchXIcon aria-hidden="true" className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {t("prompt.emptyFilteredTitle")}
        </p>
        <Button variant="primary" size="sm" onClick={clearAllFilters}>
          {t("prompt.emptyFilteredClear")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <InboxIcon aria-hidden="true" className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {t("prompt.emptyLibraryTitle")}
      </p>
      <Button variant="primary" size="sm" onClick={openCreateModal}>
        {t("prompt.emptyLibraryCreate")}
      </Button>
    </div>
  );
}
