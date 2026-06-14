import type { TFunction } from "i18next";
import {
  ArrowUpIcon,
  FileJsonIcon,
  Loader2Icon,
  ServerIcon,
  TrashIcon,
} from "lucide-react";

interface AgentMcpDetailActionsProps {
  isImporting?: boolean;
  isManaged?: boolean;
  isUninstalling?: boolean;
  onImport?: () => void | Promise<void>;
  onOpenAgentConfig?: () => void | Promise<void>;
  onOpenManagedMcp?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
  t: TFunction;
}

export function AgentMcpDetailActions({
  isImporting = false,
  isManaged = false,
  isUninstalling = false,
  onImport,
  onOpenAgentConfig,
  onOpenManagedMcp,
  onUninstall,
  t,
}: AgentMcpDetailActionsProps) {
  return (
    <>
      {isManaged ? (
        <button
          type="button"
          onClick={() => void onOpenManagedMcp?.()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          title={t("mcp.openInMyMcp", "Open in My MCP")}
        >
          <ServerIcon aria-hidden="true" className="h-4 w-4" />
          {t("mcp.openInMyMcp", "Open in My MCP")}
        </button>
      ) : onImport ? (
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={isImporting}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
          title={t("mcp.importToMyMcp", "Import to My MCP")}
        >
          {isImporting ? (
            <Loader2Icon
              aria-hidden="true"
              className="h-4 w-4 animate-spin"
            />
          ) : (
            <ArrowUpIcon aria-hidden="true" className="h-4 w-4" />
          )}
          {t("mcp.importToMyMcp", "Import to My MCP")}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t("mcp.openAgentConfig", "Open agent config")}
        onClick={() => void onOpenAgentConfig?.()}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        title={t("mcp.openAgentConfig", "Open agent config")}
      >
        <FileJsonIcon aria-hidden="true" className="h-4 w-4" />
        {t("mcp.configFile", "Config file")}
      </button>
      <button
        type="button"
        onClick={() => void onUninstall?.()}
        disabled={isUninstalling}
        className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-60"
        title={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
      >
        {isUninstalling ? (
          <Loader2Icon aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <TrashIcon aria-hidden="true" className="h-4 w-4" />
        )}
        {t("mcp.uninstallFromAgent", "Uninstall from Agent")}
      </button>
    </>
  );
}
