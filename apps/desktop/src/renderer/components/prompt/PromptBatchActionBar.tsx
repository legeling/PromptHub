import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderIcon,
  StarIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
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

const ICON_BUTTON =
  "w-8 h-8 flex items-center justify-center rounded-lg border transition-colors";

/**
 * Batch actions bar shared by the table, gallery and card prompt views.
 * 表格 / 画廊 / 卡片视图共用的批量操作栏。
 *
 * Extracted from PromptTableView (v0.6.2) with unchanged action semantics;
 * adds the selection denominator and restores the v0.6.0 batch-tag entry
 * that was lost while replaying fork customizations on the upstream 0.5.9
 * container.
 *
 * Post-delivery feedback fix: buttons are icon-only on a single nowrap row so
 * the bar stays one line tall even in the narrow card-view pane; full labels
 * remain available via tooltip and accessible names.
 * 交付后反馈修正：按钮改为单行纯图标（窄面板不再竖排堆叠），
 * 完整文案保留在悬停提示与无障碍名称中。
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

  const tagLabel = t("prompt.batchTags");
  const favoriteLabel = t("prompt.batchFavorite");
  const moveLabel = t("prompt.batchMove");
  const deleteLabel = t("prompt.batchDelete");
  const clearLabel = t("prompt.clearSelection");

  return (
    <div className="flex flex-nowrap items-center gap-2 px-3 py-1.5">
      <span className="text-xs text-primary font-medium whitespace-nowrap">
        {t("prompt.selectedOfTotal", {
          selected: selectedIds.length,
          total: totalCount,
        })}
      </span>
      <div className="flex items-center gap-1.5 ml-auto flex-nowrap">
        {onTag ? (
          <button
            type="button"
            onClick={() => onTag(selectedIds)}
            title={tagLabel}
            aria-label={tagLabel}
            className={`${ICON_BUTTON} border-primary/30 text-primary hover:bg-primary/10`}
          >
            <TagsIcon aria-hidden="true" className="w-4 h-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onFavorite(selectedIds, true)}
          title={favoriteLabel}
          aria-label={favoriteLabel}
          className={`${ICON_BUTTON} border-yellow-500/30 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10`}
        >
          <StarIcon aria-hidden="true" className="w-4 h-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFolderMenu((current) => !current)}
            aria-expanded={showFolderMenu}
            title={moveLabel}
            aria-label={moveLabel}
            className={`${ICON_BUTTON} border-primary/30 text-primary hover:bg-primary/10`}
          >
            <FolderIcon aria-hidden="true" className="w-4 h-4" />
          </button>
          {showFolderMenu && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
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
          title={deleteLabel}
          aria-label={deleteLabel}
          className={`${ICON_BUTTON} border-destructive/30 text-destructive hover:bg-destructive/10`}
        >
          <Trash2Icon aria-hidden="true" className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          title={clearLabel}
          aria-label={clearLabel}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
        >
          <XIcon aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
