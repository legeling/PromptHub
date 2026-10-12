import { Fragment, useCallback, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  FolderIcon,
  MoreHorizontalIcon,
  StarIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useFolderStore } from "../../stores/folder.store";
import { PromptBatchMenu, BATCH_MENU_ITEM } from "./PromptBatchMenu";

export interface PromptBatchActionBarProps {
  layout: "card" | "gallery" | "table";
  selectedIds: string[];
  totalCount: number;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onClear: () => void;
  onFavorite: (ids: string[], favorite: boolean) => void;
  onMove: (ids: string[], folderId: string | undefined) => void;
  onDelete: (ids: string[]) => void;
  onTag?: (ids: string[]) => void;
}

const TEXT_BUTTON =
  "h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function PromptBatchSelectionControls({
  layout,
  selectedIds,
  totalCount,
  onSelectAll,
  onInvertSelection,
}: Pick<
  PromptBatchActionBarProps,
  "layout" | "selectedIds" | "totalCount" | "onSelectAll" | "onInvertSelection"
>): ReactElement {
  const { t } = useTranslation();
  const denominator = t("prompt.selectedOfTotal", {
    selected: selectedIds.length,
    total: totalCount,
  });
  if (layout === "card") {
    return (
      <PromptBatchMenu
        label={denominator}
        className="min-w-0 flex-1"
        trigger={
          <>
            <span className="truncate text-primary">
              {t("prompt.selected", { count: selectedIds.length })}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
            />
          </>
        }
      >
        {(close) => (
          <>
            <button
              type="button"
              role="menuitem"
              className={BATCH_MENU_ITEM}
              onClick={() => {
                close();
                onSelectAll();
              }}
            >
              {t("prompt.selectAll")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={BATCH_MENU_ITEM}
              onClick={() => {
                close();
                onInvertSelection();
              }}
            >
              {t("prompt.invertSelection")}
            </button>
          </>
        )}
      </PromptBatchMenu>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
      <span
        className="truncate text-xs font-medium text-primary"
        title={denominator}
      >
        {denominator}
      </span>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onSelectAll} className={TEXT_BUTTON}>
          {t("prompt.selectAll")}
        </button>
        <button
          type="button"
          onClick={onInvertSelection}
          className={TEXT_BUTTON}
        >
          {t("prompt.invertSelection")}
        </button>
      </div>
    </div>
  );
}

function PromptBatchActions(props: PromptBatchActionBarProps): ReactElement {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const [showFolders, setShowFolders] = useState(false);
  const { selectedIds, onTag, onFavorite, onMove, onDelete, layout } = props;
  const resetFolders = useCallback(() => setShowFolders(false), []);
  const iconClass = "h-4 w-4 shrink-0";
  return (
    <PromptBatchMenu
      label={t("prompt.batchActions")}
      align="right"
      onClose={resetFolders}
      trigger={
        layout === "card" ? (
          <MoreHorizontalIcon aria-hidden="true" className={iconClass} />
        ) : (
          <>
            <span>{t("prompt.batchActions")}</span>
            <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5" />
          </>
        )
      }
    >
      {(close) =>
        showFolders ? (
          <Fragment key="folders">
            <button
              type="button"
              role="menuitem"
              autoFocus
              className={BATCH_MENU_ITEM}
              onClick={() => setShowFolders(false)}
            >
              <ArrowLeftIcon aria-hidden="true" className={iconClass} />
              {t("common.back")}
            </button>
            <div role="separator" className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              className={BATCH_MENU_ITEM}
              onClick={() => {
                close();
                onMove(selectedIds, undefined);
              }}
            >
              {t("prompt.noFolder")}
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                role="menuitem"
                className={BATCH_MENU_ITEM}
                onClick={() => {
                  close();
                  onMove(selectedIds, folder.id);
                }}
              >
                <FolderIcon aria-hidden="true" className={iconClass} />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </Fragment>
        ) : (
          <Fragment key="actions">
            {onTag ? (
              <button
                type="button"
                role="menuitem"
                autoFocus
                className={BATCH_MENU_ITEM}
                onClick={() => {
                  close();
                  onTag(selectedIds);
                }}
              >
                <TagsIcon aria-hidden="true" className={iconClass} />
                {t("prompt.batchTags")}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              autoFocus={!onTag}
              className={BATCH_MENU_ITEM}
              onClick={() => {
                close();
                onFavorite(selectedIds, true);
              }}
            >
              <StarIcon aria-hidden="true" className={iconClass} />
              {t("prompt.batchFavorite")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={BATCH_MENU_ITEM}
              onClick={() => setShowFolders(true)}
            >
              <FolderIcon aria-hidden="true" className={iconClass} />
              {t("prompt.batchMove")}
            </button>
            <div role="separator" className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              className={`${BATCH_MENU_ITEM} text-destructive`}
              onClick={() => {
                close();
                onDelete(selectedIds);
              }}
            >
              <Trash2Icon aria-hidden="true" className={iconClass} />
              {t("prompt.batchDelete")}
            </button>
          </Fragment>
        )
      }
    </PromptBatchMenu>
  );
}

export function PromptBatchActionBar(
  props: PromptBatchActionBarProps,
): ReactElement | null {
  const { t } = useTranslation();
  if (props.selectedIds.length === 0) return null;
  const layoutClass =
    props.layout === "table"
      ? "min-w-0 flex-1"
      : "shrink-0 border-b border-border px-3 py-1.5";
  return (
    <div
      role="toolbar"
      aria-label={t("prompt.batchActions")}
      className={`flex items-center gap-2 ${layoutClass}`}
    >
      <PromptBatchSelectionControls {...props} />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <PromptBatchActions {...props} />
        <button
          type="button"
          onClick={props.onClear}
          title={t("prompt.clearSelection")}
          aria-label={t("prompt.clearSelection")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <XIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
