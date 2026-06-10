import { DownloadIcon, FolderOpenIcon, Loader2Icon } from "lucide-react";
import type { TFunction } from "i18next";
import { PlatformIcon } from "../ui/PlatformIcon";

interface AgentSkillPreviewSidebarProps {
  installMode: "copy" | "symlink";
  isImporting?: boolean;
  isManaged?: boolean;
  onImport?: () => void | Promise<void>;
  onOpenFolder?: () => void | Promise<void>;
  onOpenSymlinkTarget?: () => void | Promise<void>;
  platformId: string;
  platformName: string;
  sourcePath: string;
  symlinkTargetPath?: string;
  t: TFunction;
}

export function AgentSkillPreviewSidebar({
  installMode,
  isImporting = false,
  isManaged = false,
  onImport,
  onOpenFolder,
  onOpenSymlinkTarget,
  platformId,
  platformName,
  sourcePath,
  symlinkTargetPath,
  t,
}: AgentSkillPreviewSidebarProps) {
  const showSymlinkTarget =
    installMode === "symlink" && Boolean(symlinkTargetPath);
  const shortcutTitle =
    installMode === "symlink"
      ? t("skill.openAgentShortcut", "Open agent shortcut")
      : t("skill.openLocalSource", "Open Local Skill Folder");

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
          {t("skill.agentSource", "Agent Source")}
        </h3>
        <div className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/70 ring-1 ring-border">
              <PlatformIcon platformId={platformId} size={24} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {platformName}
              </div>
              <div className="text-xs text-muted-foreground">
                {installMode === "symlink"
                  ? t("skill.symlink", "Symlink")
                  : t("skill.copyMode", "Copy")}
              </div>
            </div>
          </div>
          {isManaged ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {t("skill.inMySkills", "In My Skills")}
            </div>
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
                {t("skill.addToLibrary", "Import to My Skills")}
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
                {shortcutTitle}
              </div>
              <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                {sourcePath}
              </div>
            </div>
          </button>
          {showSymlinkTarget ? (
            <button
              type="button"
              onClick={() => void onOpenSymlinkTarget?.()}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
              title={symlinkTargetPath}
            >
              <FolderOpenIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {t(
                    "skill.openSourceSkillFolder",
                    "Open source Skill folder",
                  )}
                </div>
                <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {symlinkTargetPath}
                </div>
              </div>
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
