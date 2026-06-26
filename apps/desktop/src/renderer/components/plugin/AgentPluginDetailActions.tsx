import type { TFunction } from "i18next";
import { DownloadIcon, FolderOpenIcon, Loader2Icon } from "lucide-react";

interface AgentPluginDetailActionsProps {
  isImporting?: boolean;
  isManaged?: boolean;
  onImport?: () => void | Promise<void>;
  onOpenFolder?: () => void | Promise<void>;
  onOpenManagedPlugin?: () => void | Promise<void>;
  t: TFunction;
}

export function AgentPluginDetailActions({
  isImporting = false,
  isManaged = false,
  onImport,
  onOpenFolder,
  onOpenManagedPlugin,
  t,
}: AgentPluginDetailActionsProps) {
  return (
    <>
      {isManaged ? (
        <button
          type="button"
          onClick={() => void onOpenManagedPlugin?.()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          title={t("plugin.openInMyPlugins", "Open in My Plugins")}
        >
          <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
          {t("plugin.openInMyPlugins", "Open in My Plugins")}
        </button>
      ) : onImport ? (
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={isImporting}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
          title={t("plugin.importToMyPlugins", "Import to My Plugins")}
        >
          {isImporting ? (
            <Loader2Icon aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadIcon aria-hidden="true" className="h-4 w-4" />
          )}
          {t("plugin.importToMyPlugins", "Import to My Plugins")}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t("plugin.openPluginFolder", "Open Plugin folder")}
        onClick={() => void onOpenFolder?.()}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        title={t("plugin.openPluginFolder", "Open Plugin folder")}
      >
        <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
        {t("common.open", "Open")}
      </button>
    </>
  );
}
