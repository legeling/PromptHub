import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  Grid2X2Icon,
  LayoutGridIcon,
  ListIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { useTranslation } from "react-i18next";

export type GenerationGalleryFilter = "current" | "all" | "favorite" | "failed";
export type GenerationGalleryDensity = "compact" | "large" | "list";

interface ImageGenerationGalleryToolbarProps {
  filter: GenerationGalleryFilter;
  onFilterChange: (filter: GenerationGalleryFilter) => void;
  selectedBatch?: GenerationBatchManifest;
  failedCount: number;
  sortNewest: boolean;
  onSortNewestChange: (sortNewest: boolean) => void;
  density: GenerationGalleryDensity;
  onDensityChange: (density: GenerationGalleryDensity) => void;
  onCancelBatch: () => void;
  onRetryFailed: () => void;
  onDeleteBatch: () => void;
}

function useDismissibleMenu(
  open: boolean,
  close: () => void,
  rootRef: React.RefObject<HTMLDivElement>,
) {
  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [close, open, rootRef]);
}

export function ImageGenerationGalleryToolbar(
  props: ImageGenerationGalleryToolbarProps,
) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissibleMenu(open, close, rootRef);

  const running = Boolean(
    props.selectedBatch &&
    ["queued", "running"].includes(props.selectedBatch.status),
  );
  const retryable = Boolean(
    props.selectedBatch &&
    !running &&
    props.selectedBatch.counts.failed + props.selectedBatch.counts.interrupted >
      0,
  );
  const filters = [
    [
      "current",
      t("generation.currentBatchTab", {
        done: props.selectedBatch?.counts.succeeded ?? 0,
        total: props.selectedBatch?.targetCount ?? 0,
      }),
    ],
    ["all", t("generation.allWorks")],
    ["favorite", t("generation.favorite")],
    ["failed", t("generation.failedCount", { count: props.failedCount })],
  ] as const;
  const densities = [
    ["compact", Grid2X2Icon, t("generation.compactGrid")],
    ["large", LayoutGridIcon, t("generation.largeGrid")],
    ["list", ListIcon, t("generation.listView")],
  ] as const;
  const sortLabel = props.sortNewest
    ? t("generation.latestFirst")
    : t("generation.oldestFirst");

  return (
    <div
      ref={rootRef}
      data-testid="generation-gallery-toolbar"
      className="relative shrink-0"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("generation.workbenchActions")}
        title={t("generation.workbenchActions")}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${open ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
      >
        <MoreHorizontalIcon className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("generation.workbenchActions")}
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-xl"
        >
          <div className="grid grid-cols-2 gap-1">
            {filters.map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => props.onFilterChange(value)}
                className={`flex h-9 items-center justify-between rounded-md px-2.5 text-left text-xs transition-colors ${props.filter === value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <span className="truncate">{label}</span>
                {props.filter === value && (
                  <CheckIcon
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="my-2 h-px bg-border" />
          <button
            type="button"
            onClick={() => props.onSortNewestChange(!props.sortNewest)}
            className="flex h-9 w-full items-center justify-between rounded-md px-2.5 text-sm hover:bg-accent hover:text-accent-foreground"
            aria-label={sortLabel}
          >
            <span>{sortLabel}</span>
            <CheckIcon
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {densities.map(([value, Icon, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => props.onDensityChange(value)}
                aria-label={label}
                aria-pressed={props.density === value}
                title={label}
                className={`relative flex h-9 items-center justify-center rounded-md ${props.density === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>

          {(running || retryable) && <div className="my-2 h-px bg-border" />}
          {running && (
            <button
              type="button"
              onClick={() => {
                props.onCancelBatch();
                close();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <SquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {t("generation.cancel")}
            </button>
          )}
          {retryable && (
            <button
              type="button"
              onClick={() => {
                props.onRetryFailed();
                close();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <RefreshCwIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {t("generation.retryFailed")}
            </button>
          )}
          {props.selectedBatch && (
            <button
              type="button"
              disabled={
                props.selectedBatch.counts.pending +
                  props.selectedBatch.counts.running >
                0
              }
              title={t(
                props.selectedBatch.counts.pending +
                  props.selectedBatch.counts.running >
                  0
                  ? "generation.cancelBeforeDelete"
                  : "generation.deleteBatch",
              )}
              onClick={() => {
                props.onDeleteBatch();
                close();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t("generation.deleteBatch")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
