import type { ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resourcePageNumbers } from "@prompthub/shared/utils/resource-library";
import { RESOURCE_PAGE_SIZES } from "@prompthub/shared/constants/resource-library";

interface Props {
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function ResourceLibraryPagination(props: Props): ReactElement | null {
  const { t } = useTranslation();
  if (!props.total) return null;
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const page = Math.min(pages, Math.max(1, props.currentPage));
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
      <div className="text-sm text-muted-foreground">
        {t("skill.paginationSummary", {
          start: (page - 1) * props.pageSize + 1,
          end: Math.min(page * props.pageSize, props.total),
          total: props.total,
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("prompt.pageSize")}
          <select
            value={props.pageSize}
            onChange={(event) =>
              props.onPageSizeChange(Number(event.target.value))
            }
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
          >
            {Array.from(new Set([...RESOURCE_PAGE_SIZES, props.pageSize]))
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
          </select>
        </label>
        <nav
          aria-label={t("resourceLibrary.pagination")}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label={t("common.previous")}
            disabled={page === 1}
            onClick={() => props.onPageChange(page - 1)}
            className="rounded-md p-1.5 hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
          </button>
          {resourcePageNumbers(page, pages).map((value) => (
            <button
              key={value}
              type="button"
              aria-current={page === value ? "page" : undefined}
              onClick={() => props.onPageChange(value)}
              className={`h-8 w-8 rounded-md text-sm ${page === value ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            aria-label={t("common.next")}
            disabled={page === pages}
            onClick={() => props.onPageChange(page + 1)}
            className="rounded-md p-1.5 hover:bg-accent disabled:opacity-40"
          >
            <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
