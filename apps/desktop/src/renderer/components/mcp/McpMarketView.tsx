import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  StoreIcon,
} from "lucide-react";
import type { FormEvent, UIEvent } from "react";
import type {
  McpMarketSource,
  McpMarketTemplate,
} from "@prompthub/shared/types/mcp";
import { McpMarketDetailModal } from "./McpMarketDetailModal";
import {
  getMcpMarketSourceDescription,
  getMcpMarketSourceLabel,
  getMcpTemplateSourceLabel,
  OFFICIAL_MCP_SOURCE_ID,
} from "./mcp-market-labels";

interface McpMarketViewProps {
  error?: string | null;
  isLoading?: boolean;
  remoteTemplates?: McpMarketTemplate[];
  searchQuery?: string;
  templates: McpMarketTemplate[];
  sources: McpMarketSource[];
  selectedSourceId: string;
  installedNames: Set<string>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  totalCountIsLowerBound?: boolean;
  onInstall: (template: McpMarketTemplate | string) => Promise<void>;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  onSearchChange?: (query: string) => void;
}

function matchesTemplateSearch(
  template: McpMarketTemplate,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    template.displayName,
    template.name,
    template.description,
    template.packageName ?? "",
    template.runtime ?? "",
    template.repository ?? "",
    template.documentationUrl ?? "",
    ...template.tags,
  ]
    .join(" ")
    .toLowerCase();

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

/**
 * Curated MCP server gallery, styled after the Skill Store cards.
 * 内置 MCP 服务目录，样式对齐 Skill Store 卡片。
 */
export function McpMarketView({
  error,
  isLoading = false,
  remoteTemplates = [],
  searchQuery = "",
  templates,
  sources,
  selectedSourceId,
  installedNames,
  hasMore = false,
  isLoadingMore = false,
  totalCount,
  totalCountIsLowerBound = false,
  onInstall,
  onLoadMore,
  onRefresh,
  onSearchChange,
}: McpMarketViewProps) {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] =
    useState<McpMarketTemplate | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldContinueLoadingRef = useRef(false);

  useEffect(() => {
    setSearchDraft(searchQuery);
    shouldContinueLoadingRef.current = false;
  }, [searchQuery]);

  useEffect(() => {
    shouldContinueLoadingRef.current = false;
  }, [selectedSourceId]);

  const selectedSource = useMemo(
    () =>
      sources.find((source) => source.id === selectedSourceId) ??
      sources[0] ??
      null,
    [selectedSourceId, sources],
  );
  const isOfficialSource = selectedSource?.id === OFFICIAL_MCP_SOURCE_ID;
  const fallbackTemplates = useMemo(() => {
    if (!selectedSource || !isOfficialSource) {
      return [];
    }
    return templates.filter(
      (template) => template.source?.id === selectedSource.id,
    );
  }, [isOfficialSource, selectedSource, templates]);
  const localVisibleTemplates = useMemo(
    () =>
      fallbackTemplates.filter((template) =>
        matchesTemplateSearch(template, searchQuery),
      ),
    [fallbackTemplates, searchQuery],
  );
  const visibleTemplates = isOfficialSource
    ? localVisibleTemplates
    : remoteTemplates;
  const storeTitle = getMcpMarketSourceLabel(selectedSource, t);
  const storeSubtitle = getMcpMarketSourceDescription(selectedSource, t);
  const totalCountLabel =
    typeof totalCount === "number"
      ? `${totalCount}${totalCountIsLowerBound ? "+" : ""}`
      : null;
  const countTitle = totalCountLabel
    ? t("mcp.remoteStoreTotalCount", "{{total}} MCP servers", {
        total: totalCountLabel,
      })
    : t("mcp.remoteStoreCount", "{{count}} MCP servers", {
        count: visibleTemplates.length,
      });
  const loadedProgressLabel = totalCountLabel
    ? t("mcp.remoteStoreLoadedCount", "Loaded {{loaded}} / {{total}}", {
        loaded: visibleTemplates.length,
        total: totalCountLabel,
      })
    : null;
  const emptyStoreHint = isOfficialSource
    ? t(
        "mcp.emptyOfficialStoreHint",
        "The official store has no installable MCP servers yet. Use MCP Registry to browse community catalogs.",
      )
    : t(
        "mcp.emptyRemoteStoreHint",
        "No MCP servers are available from this source right now. Refresh or try a different search term.",
      );
  const shouldShowInitialLoading = isLoading && visibleTemplates.length === 0;
  const canLoadMore =
    hasMore && !isLoading && !isLoadingMore && Boolean(onLoadMore);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchChange?.(searchDraft.trim());
  };
  const maybeLoadMore = useCallback(
    (
      target: HTMLDivElement | null = scrollContainerRef.current,
      markContinuation = false,
    ) => {
      if (!canLoadMore || !target || !onLoadMore) {
        return;
      }
      const remaining =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining <= 480) {
        if (markContinuation) {
          shouldContinueLoadingRef.current = true;
        }
        onLoadMore();
      }
    },
    [canLoadMore, onLoadMore],
  );
  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      maybeLoadMore(event.currentTarget, true);
    },
    [maybeLoadMore],
  );

  useEffect(() => {
    if (shouldContinueLoadingRef.current) {
      maybeLoadMore();
    }
  }, [maybeLoadMore, visibleTemplates.length]);

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 app-wallpaper-panel-strong z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{storeTitle}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {storeSubtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2Icon className="h-3 w-3 animate-spin" />
                {t("mcp.loadingRemoteStore", "Loading remote MCP catalog...")}
              </span>
            ) : (
              <span>{countTitle}</span>
            )}
            {!isLoading && loadedProgressLabel ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                {loadedProgressLabel}
              </span>
            ) : null}
            {error && !isOfficialSource ? (
              <span className="text-destructive">
                {t(
                  "mcp.remoteStoreLoadFailed",
                  "Remote MCP catalog failed to load",
                )}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form onSubmit={submitSearch} className="relative w-64 max-w-[32vw]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t("mcp.searchStore", "Search MCP servers...")}
              aria-label={t("mcp.searchStore", "Search MCP servers...")}
              className="h-9 w-full rounded-xl border border-border bg-background/60 pl-9 pr-9 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
            {searchDraft ? (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  onSearchChange?.("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("common.clear", "Clear")}
              >
                ×
              </button>
            ) : null}
          </form>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background/60 px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <RefreshCwIcon
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {t("common.refresh", "Refresh")}
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        data-testid="mcp-store-scroll"
        className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8"
        onScroll={handleScroll}
      >
        {shouldShowInitialLoading ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
            <Loader2Icon className="mb-4 h-10 w-10 animate-spin opacity-60" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {t("mcp.loadingRemoteStore", "Loading remote MCP catalog...")}
            </h3>
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
            <StoreIcon className="mb-4 h-12 w-12 opacity-25" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {t("mcp.emptyStore", "No MCP servers")}
            </h3>
            <p className="max-w-md text-sm">{emptyStoreHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleTemplates.map((template, index) => {
              const installed = installedNames.has(template.name);
              return (
                <div
                  key={template.id}
                  style={{
                    animationDelay: `${Math.min(index, 12) * 30}ms`,
                    contentVisibility: "auto",
                    containIntrinsicSize: "86px",
                  }}
                  className="group relative flex items-center gap-3 p-3.5 app-wallpaper-surface border border-border rounded-xl hover:border-primary/40 transition-all animate-in fade-in slide-in-from-bottom-2 hover:shadow-md"
                >
                  <button
                    type="button"
                    aria-label={`${t("common.viewDetail", "View detail")}: ${template.displayName}`}
                    onClick={() => setSelectedTemplate(template)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ServerIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {template.displayName}
                      </h4>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {template.description}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/80 truncate">
                        {getMcpTemplateSourceLabel(template, selectedSource, t)}
                      </p>
                      <div
                        aria-hidden="true"
                        className="mt-2 flex flex-wrap gap-1"
                      >
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {template.transport}
                        </span>
                        {template.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>

                  <div className="shrink-0">
                    {installed ? (
                      <div
                        className="p-1.5 text-green-500"
                        title={t("common.installed", "Installed")}
                      >
                        <CheckIcon aria-hidden="true" className="w-4 h-4" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTemplate(template);
                        }}
                        aria-label={t("common.install", "Install")}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in disabled:opacity-50"
                        title={t("common.install", "Install")}
                      >
                        <PlusIcon aria-hidden="true" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {visibleTemplates.length > 0 && (hasMore || isLoadingMore) ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <button
              type="button"
              data-testid="mcp-store-load-more"
              onClick={onLoadMore}
              disabled={!hasMore || isLoading || isLoadingMore}
              className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg border border-border bg-background/70 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMore ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {isLoadingMore
                ? t("mcp.storeLoadingMore", "Loading more...")
                : t("mcp.loadMoreStoreServers", "Load more")}
            </button>
            <p className="text-[11px] text-muted-foreground">
              {t("mcp.storeScrollLoadHint", "Scroll down to load more")}
            </p>
          </div>
        ) : null}
      </div>

      {selectedTemplate ? (
        <McpMarketDetailModal
          template={selectedTemplate}
          isInstalled={installedNames.has(selectedTemplate.name)}
          onInstall={onInstall}
          onClose={() => setSelectedTemplate(null)}
        />
      ) : null}
    </div>
  );
}
