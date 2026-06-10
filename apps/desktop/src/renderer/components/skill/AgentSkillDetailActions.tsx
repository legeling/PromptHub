import type { TFunction } from "i18next";
import {
  ArrowUpIcon,
  FolderOpenIcon,
  Loader2Icon,
  TrashIcon,
} from "lucide-react";

interface AgentSkillDetailActionsProps {
  isImporting?: boolean;
  isManaged?: boolean;
  isUninstallDisabled?: boolean;
  isUninstalling?: boolean;
  onImport?: () => void | Promise<void>;
  onOpenFolder?: () => void | Promise<void>;
  onOpenManagedSkill?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
  t: TFunction;
  uninstallDisabledReason?: string;
}

export function AgentSkillDetailActions({
  isImporting = false,
  isManaged = false,
  isUninstallDisabled = false,
  isUninstalling = false,
  onImport,
  onOpenFolder,
  onOpenManagedSkill,
  onUninstall,
  t,
  uninstallDisabledReason,
}: AgentSkillDetailActionsProps) {
  return (
    <>
      {isManaged ? (
        <button
          type="button"
          onClick={() => void onOpenManagedSkill?.()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          title={t("skill.openInMySkills", "Open in My Skills")}
        >
          <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
          {t("skill.openInMySkills", "Open in My Skills")}
        </button>
      ) : onImport ? (
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={isImporting}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
          title={t("skill.addToLibrary", "Import to My Skills")}
        >
          {isImporting ? (
            <Loader2Icon
              aria-hidden="true"
              className="h-4 w-4 animate-spin"
            />
          ) : (
            <ArrowUpIcon aria-hidden="true" className="h-4 w-4" />
          )}
          {t("skill.addToLibrary", "Import to My Skills")}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t("skill.openLocalSource", "Open Local Skill Folder")}
        onClick={() => void onOpenFolder?.()}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        title={t("skill.openLocalSource", "Open Local Skill Folder")}
      >
        <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
        {t("common.open", "Open")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!isUninstallDisabled) {
            void onUninstall?.();
          }
        }}
        disabled={isUninstallDisabled || isUninstalling}
        className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-60"
        title={
          isUninstallDisabled && uninstallDisabledReason
            ? uninstallDisabledReason
            : t("common.uninstall", "Uninstall")
        }
      >
        <TrashIcon aria-hidden="true" className="h-4 w-4" />
        {t("common.uninstall", "Uninstall")}
      </button>
    </>
  );
}
