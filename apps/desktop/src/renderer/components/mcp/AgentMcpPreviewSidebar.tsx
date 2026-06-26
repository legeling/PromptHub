import {
  ArrowUpIcon,
  FileJsonIcon,
  FolderOpenIcon,
  Loader2Icon,
  ServerIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { PlatformIcon } from "../ui/PlatformIcon";

type AgentMcpSourceIconVariant = "platform" | "project";

interface AgentMcpPreviewSidebarProps {
  iconVariant?: AgentMcpSourceIconVariant;
  isImporting?: boolean;
  isManaged?: boolean;
  openConfigLabel?: string;
  onImport?: () => void | Promise<void>;
  onOpenAgentConfig?: () => void | Promise<void>;
  onOpenManagedMcp?: () => void | Promise<void>;
  platformId: string;
  platformName: string;
  sectionTitle?: string;
  sourcePath: string;
  t: TFunction;
}

function AgentMcpSourceIcon({
  iconVariant,
  platformId,
}: {
  iconVariant: AgentMcpSourceIconVariant;
  platformId: string;
}) {
  if (iconVariant === "project") {
    return (
      <FolderOpenIcon aria-hidden="true" className="h-6 w-6 text-primary" />
    );
  }

  return <PlatformIcon platformId={platformId} size={24} />;
}

/**
 * Agent-side MCP source panel. Mirrors AgentSkillPreviewSidebar so users can
 * review an agent MCP entry before explicitly importing or opening it.
 */
export function AgentMcpPreviewSidebar({
  iconVariant = "platform",
  isImporting = false,
  isManaged = false,
  openConfigLabel,
  onImport,
  onOpenAgentConfig,
  onOpenManagedMcp,
  platformId,
  platformName,
  sectionTitle,
  sourcePath,
  t,
}: AgentMcpPreviewSidebarProps) {
  const resolvedSectionTitle = sectionTitle ?? t("mcp.agentMcp", "Agent MCP");
  const resolvedOpenConfigLabel =
    openConfigLabel ?? t("mcp.openAgentConfig", "Open agent config");

  return (
    <div data-testid="mcp-agent-source-sidebar" className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {resolvedSectionTitle}
        </h3>
        <div className="app-wallpaper-panel space-y-4 rounded-2xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div
              data-testid="mcp-agent-source-icon-shell"
              data-icon-variant={iconVariant}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/70 ring-1 ring-border"
            >
              <AgentMcpSourceIcon
                iconVariant={iconVariant}
                platformId={platformId}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {platformName}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("mcp.configFile", "Config file")}
              </div>
            </div>
          </div>

          {isManaged ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {t("mcp.managedByPromptHub", "Managed in PromptHub")}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {t("mcp.notInLibrary", "Not in PromptHub library")}
            </div>
          )}

          {!isManaged && onImport ? (
            <button
              type="button"
              onClick={() => void onImport()}
              disabled={isImporting}
              className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-left text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isImporting ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 animate-spin"
                />
              ) : (
                <ArrowUpIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
              )}
              <span className="text-sm font-semibold">
                {t("mcp.importToMyMcp", "Import to My MCP")}
              </span>
            </button>
          ) : null}

          {isManaged ? (
            <button
              type="button"
              onClick={() => void onOpenManagedMcp?.()}
              aria-label={t("mcp.openInMyMcp", "Open in My MCP")}
              title={t("mcp.openInMyMcp", "Open in My MCP")}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
            >
              <ServerIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {t("mcp.openInMyMcp", "Open in My MCP")}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("mcp.managedByPromptHub", "Managed in PromptHub")}
                </div>
              </div>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void onOpenAgentConfig?.()}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
            title={sourcePath}
            aria-label={resolvedOpenConfigLabel}
          >
            <FileJsonIcon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-primary"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {t("mcp.configFile", "Config file")}
              </div>
              <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                {sourcePath}
              </div>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
