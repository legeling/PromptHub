import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  ServerIcon,
  StoreIcon,
} from "lucide-react";
import type {
  McpMarketSource,
  McpMarketTemplate,
} from "@prompthub/shared/types/mcp";
import { McpMarketDetailModal } from "./McpMarketDetailModal";

interface McpMarketViewProps {
  templates: McpMarketTemplate[];
  sources: McpMarketSource[];
  selectedSourceId: string;
  installedNames: Set<string>;
  onInstall: (templateId: string) => Promise<void>;
}

const ALL_MARKET_SOURCES = "all";

/**
 * Curated MCP template gallery, styled after the Skill Store cards.
 * 内置 MCP 模板市场，样式对齐 Skill Store 卡片。
 */
export function McpMarketView({
  templates,
  sources,
  selectedSourceId,
  installedNames,
  onInstall,
}: McpMarketViewProps) {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] =
    useState<McpMarketTemplate | null>(null);
  const visibleTemplates = useMemo(() => {
    if (selectedSourceId === ALL_MARKET_SOURCES) {
      return templates;
    }
    return templates.filter(
      (template) => template.source?.id === selectedSourceId,
    );
  }, [selectedSourceId, templates]);
  const selectedSource = useMemo(
    () =>
      selectedSourceId === ALL_MARKET_SOURCES
        ? null
        : (sources.find((source) => source.id === selectedSourceId) ?? null),
    [selectedSourceId, sources],
  );
  const selectedSourceHasTemplates =
    selectedSource !== null && visibleTemplates.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 app-wallpaper-panel-strong z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {t("mcp.officialMcpStore", "Official MCP Store")}
            </h2>
            <span className="shrink-0 rounded-full bg-accent/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-white/5">
              {visibleTemplates.length} / {templates.length}{" "}
              {t("mcp.templatesCount", "templates")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("mcp.mcpStoreSubtitle", "Install curated MCP templates")}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {selectedSource && !selectedSourceHasTemplates ? (
          <div className="app-wallpaper-panel mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border p-6 text-left">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <StoreIcon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("mcp.externalCatalog", "External MCP directory")}
                  </h3>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t(
                      `mcp.trust.${selectedSource.trustLevel}`,
                      selectedSource.trustLevel,
                    )}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedSource.description ??
                    t(
                      "mcp.externalCatalogFallback",
                      "Browse this external MCP directory for more servers.",
                    )}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-sm text-foreground">
                {t(
                  "mcp.externalCatalogHint",
                  "This source is a browsable MCP directory, not a built-in PromptHub template list yet. Open it, choose a server, then import its command, JSON config, URL, or local source folder back into My MCP.",
                )}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {selectedSource.url}
              </p>
            </div>

            <div className="flex justify-end">
              <a
                href={selectedSource.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("mcp.openMcpDirectory", "Open MCP directory")}
                <ExternalLinkIcon className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : visibleTemplates.length === 0 ? (
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
