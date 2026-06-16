import { useEffect, useMemo, useState } from "react";
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
import type { FormEvent } from "react";
import type {
  McpMarketSource,
  McpMarketTemplate,
} from "@prompthub/shared/types/mcp";
import { McpMarketDetailModal } from "./McpMarketDetailModal";

interface McpMarketViewProps {
  error?: string | null;
  isLoading?: boolean;
  remoteTemplates?: McpMarketTemplate[];
  searchQuery?: string;
  templates: McpMarketTemplate[];
  sources: McpMarketSource[];
  selectedSourceId: string;
  installedNames: Set<string>;
  totalCount?: number;
  onInstall: (template: McpMarketTemplate | string) => Promise<void>;
  onRefresh?: () => void;
  onSearchChange?: (query: string) => void;
}

/**
 * Curated MCP template gallery, styled after the Skill Store cards.
 * 内置 MCP 模板市场，样式对齐 Skill Store 卡片。
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
  totalCount,
  onInstall,
  onRefresh,
  onSearchChange,
}: McpMarketViewProps) {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] =
    useState<McpMarketTemplate | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  const selectedSource = useMemo(
    () =>
      sources.find((source) => source.id === selectedSourceId) ??
      sources[0] ??
      null,
    [selectedSourceId, sources],
  );
  const fallbackTemplates = useMemo(() => {
    if (!selectedSource) {
      return templates;
    }
    return templates.filter(
      (template) => template.source?.id === selectedSource.id,
    );
  }, [selectedSource, templates]);
  const visibleTemplates =
    remoteTemplates.length > 0 ? remoteTemplates : fallbackTemplates;
  const storeTitle =
    selectedSource?.label ?? t("mcp.mcpStore", "MCP Store");
  const storeSubtitle =
    selectedSource?.description ??
    t(
      "mcp.mcpStoreSubtitle",
      "Install ready-to-use MCP templates from the selected channel.",
    );
  const countLabel =
    typeof totalCount === "number" && totalCount > visibleTemplates.length
      ? `${visibleTemplates.length} / ${totalCount}`
      : `${visibleTemplates.length}`;
  const countTitle =
    typeof totalCount === "number" && totalCount > visibleTemplates.length
      ? countLabel
      : t("mcp.remoteStoreCount", "{{count}} MCP servers", {
          count: visibleTemplates.length,
        });
  const isUsingFallback = remoteTemplates.length === 0 && fallbackTemplates.length > 0;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchChange?.(searchDraft.trim());
  };

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 app-wallpaper-panel-strong z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {storeTitle}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {storeSubtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2Icon className="h-3 w-3 animate-spin" />
                {t("mcp.loadingRemoteStore", "Loading remote catalog...")}
              </span>
            ) : (
              <span>{countTitle}</span>
            )}
            {isUsingFallback ? (
              <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5">
                {t("mcp.remoteStoreFallback", "Showing built-in fallback")}
              </span>
            ) : null}
            {error ? (
              <span className="text-destructive">
                {t("mcp.remoteStoreLoadFailed", "Remote catalog failed to load")}
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

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {visibleTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
            <StoreIcon className="mb-4 h-12 w-12 opacity-25" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {t("mcp.emptyStore", "No MCP templates")}
            </h3>
            <p className="max-w-md text-sm">
              {t(
                "mcp.emptyStoreHint",
                "Curated MCP templates will appear here when available.",
              )}
            </p>
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
                        {template.source?.label ?? selectedSource?.label}
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
