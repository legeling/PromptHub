import { DownloadIcon, FolderOpenIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlatformIcon } from "../ui/PlatformIcon";

interface AgentPluginPreviewSidebarProps {
  isImporting?: boolean;
  isManaged?: boolean;
  onImport?: () => void | Promise<void>;
  onOpenFolder?: () => void | Promise<void>;
  onOpenManagedPlugin?: () => void | Promise<void>;
  platformId: string;
  platformName: string;
  sourcePath: string;
}

export function AgentPluginPreviewSidebar({
  isImporting = false,
  isManaged = false,
  onImport,
  onOpenFolder,
  onOpenManagedPlugin,
  platformId,
  platformName,
  sourcePath,
}: AgentPluginPreviewSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t("plugin.agentSource", "Agent source")}
        </h3>
        <div className="app-wallpaper-panel space-y-4 rounded-2xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/70 ring-1 ring-border">
              <PlatformIcon platformId={platformId} size={24} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {platformName}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("plugin.inAgentPluginTarget", "Installed in Agent")}
              </div>
            </div>
          </div>
          {isManaged ? (
            <button
              type="button"
              onClick={() => void onOpenManagedPlugin?.()}
              className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-left text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
            >
              <FolderOpenIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="text-sm font-semibold">
                {t("plugin.openInMyPlugins", "Open in My Plugins")}
              </span>
            </button>
          ) : onImport ? (
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
                <DownloadIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
              )}
              <span className="text-sm font-semibold">
                {t("plugin.importToMyPlugins", "Import to My Plugins")}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onOpenFolder?.()}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
            title={sourcePath}
          >
            <FolderOpenIcon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-primary"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {t("plugin.openPluginFolder", "Open Plugin folder")}
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
