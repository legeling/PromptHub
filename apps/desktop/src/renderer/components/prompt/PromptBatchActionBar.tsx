import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  FolderIcon,
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
  "h-8 shrink-0 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const NEUTRAL_BUTTON =
  "text-muted-foreground hover:bg-accent hover:text-foreground";

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
        <button
          type="button"
          onClick={onSelectAll}
          className={`${TEXT_BUTTON} ${NEUTRAL_BUTTON}`}
        >
          {t("prompt.selectAll")}
        </button>
        <button
          type="button"
          onClick={onInvertSelection}
          className={`${TEXT_BUTTON} ${NEUTRAL_BUTTON}`}
        >
          {t("prompt.invertSelection")}
        </button>
      </div>
    </div>
  );
}

function PromptBatchMoveAction({
  selectedIds,
  onMove,
}: Pick<PromptBatchActionBarProps, "selectedIds" | "onMove">): ReactElement {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  return (
    <PromptBatchMenu
      label={t("prompt.batchMove")}
      disabled={selectedIds.length === 0}
      align="right"
      trigger={<FolderIcon aria-hidden="true" className="h-4 w-4 shrink-0" />}
    >
      {(close) => (
        <>
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
              <FolderIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        </>
      )}
    </PromptBatchMenu>
  );
}

const ACTION_BUTTON = `${TEXT_BUTTON} inline-flex w-8 items-center justify-center disabled:opacity-40 disabled:pointer-events-none`;

function PromptBatchActions({
  selectedIds,
  onTag,
  onFavorite,
  onMove,
  onDelete,
}: PromptBatchActionBarProps): ReactElement {
  const { t } = useTranslation();
  const disabled = selectedIds.length === 0;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        title={t("prompt.batchFavorite")}
        aria-label={t("prompt.batchFavorite")}
        className={`${ACTION_BUTTON} ${NEUTRAL_BUTTON}`}
        onClick={() => onFavorite(selectedIds, true)}
      >
        <StarIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
      </button>
      <PromptBatchMoveAction selectedIds={selectedIds} onMove={onMove} />
      {onTag && (
        <button
          type="button"
          disabled={disabled}
          title={t("prompt.batchTags")}
          aria-label={t("prompt.batchTags")}
          className={`${ACTION_BUTTON} ${NEUTRAL_BUTTON}`}
          onClick={() => onTag(selectedIds)}
        >
          <TagsIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        title={t("prompt.batchDelete")}
        aria-label={t("prompt.batchDelete")}
        className={`${ACTION_BUTTON} text-destructive hover:text-destructive hover:bg-destructive/10`}
        onClick={() => onDelete(selectedIds)}
      >
        <Trash2Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      </button>
    </div>
  );
}

export function PromptBatchActionBar(
  props: PromptBatchActionBarProps,
): ReactElement | null {
  const { t } = useTranslation();

  const layoutClass =
    props.layout === "table"
      ? "min-w-0 flex-1"
      : "shrink-0 border-b border-border px-3 py-1.5";
  return (
    <div
      role="toolbar"
      aria-label={t("prompt.batchActions")}
      className={`flex flex-wrap items-center gap-1 ${layoutClass}`}
    >
      <PromptBatchSelectionControls {...props} />
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
  );
}
