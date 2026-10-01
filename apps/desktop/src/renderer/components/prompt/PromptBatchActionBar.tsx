import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderIcon,
  StarIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import { useFolderStore } from "../../stores/folder.store";

export interface PromptBatchActionBarProps {
  selectedIds: string[];
  totalCount: number;
  onClear: () => void;
  onFavorite: (ids: string[], favorite: boolean) => void;
  onMove: (ids: string[], folderId: string | undefined) => void;
  onDelete: (ids: string[]) => void;
  /** When provided (e.g. wired to openQuickTagForIds), renders the tag entry. */
  onTag?: (ids: string[]) => void;
}

/**
 * Batch actions bar shared by the table, gallery and card prompt views.
 * 表格 / 画廊 / 卡片视图共用的批量操作栏。
 *
 * Extracted from PromptTableView (v0.6.2) with unchanged action semantics;
 * adds the selection denominator and restores the v0.6.0 batch-tag entry
 * that was lost while replaying fork customizations on the upstream 0.5.9
 * container.
 */
export function PromptBatchActionBar({
  selectedIds,
  totalCount,
  onClear,
  onFavorite,
  onMove,
  onDelete,
  onTag,
}: PromptBatchActionBarProps) {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="text-sm text-primary font-medium whitespace-nowrap">
        {t("prompt.selectedOfTotal", {
          selected: selectedIds.length,
          total: totalCount,
        })}
      </span>
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        {onTag ? (
          <button
            type="button"
            onClick={() => onTag(selectedIds)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <TagsIcon aria-hidden="true" className="w-4 h-4" />
            {t("prompt.batchTags")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onFavorite(selectedIds, true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-yellow-500/30 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
        >
          <StarIcon aria-hidden="true" className="w-4 h-4" />
          {t("prompt.batchFavorite")}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFolderMenu((current) => !current)}
            aria-expanded={showFolderMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <FolderIcon aria-hidden="true" className="w-4 h-4" />
            {t("prompt.batchMove")}
          </button>
          {showFolderMenu && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onMove(selectedIds, undefined);
                    setShowFolderMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors rounded-md"
                >
                  {t("prompt.noFolder")}
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      onMove(selectedIds, folder.id);
                      setShowFolderMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 rounded-md"
                  >
                    <span>{folder.icon}</span>
                    <span>{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(selectedIds)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2Icon aria-hidden="true" className="w-4 h-4" />
          {t("prompt.batchDelete")}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:bg-accent transition-colors"
        >
          {t("prompt.clearSelection")}
        </button>
      </div>
    </div>
  );
}
