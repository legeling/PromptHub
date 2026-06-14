import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, PlusIcon, ServerIcon, StoreIcon } from "lucide-react";
import type {
  McpMarketSource,
  McpMarketTemplate,
} from "@prompthub/shared/types/mcp";
import { McpMarketDetailModal } from "./McpMarketDetailModal";

interface McpMarketViewProps {
  templates: McpMarketTemplate[];
  sources: McpMarketSource[];
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
  installedNames,
  onInstall,
}: McpMarketViewProps) {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] =
    useState<McpMarketTemplate | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState(ALL_MARKET_SOURCES);
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of templates) {
      const sourceId = template.source?.id ?? ALL_MARKET_SOURCES;
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
    }
    return counts;
  }, [templates]);
  const visibleTemplates = useMemo(() => {
    if (selectedSourceId === ALL_MARKET_SOURCES) {
      return templates;
    }
    return templates.filter(
      (template) => template.source?.id === selectedSourceId,
    );
  }, [selectedSourceId, templates]);

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedSourceId(ALL_MARKET_SOURCES)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedSourceId === ALL_MARKET_SOURCES
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border app-wallpaper-surface text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t("mcp.allSources", "All Sources")} · {templates.length}
          </button>
          {sources
            .filter((source) => sourceCounts.has(source.id))
            .map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setSelectedSourceId(source.id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedSourceId === source.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border app-wallpaper-surface text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {source.label} · {sourceCounts.get(source.id)}
              </button>
            ))}
        </div>

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
