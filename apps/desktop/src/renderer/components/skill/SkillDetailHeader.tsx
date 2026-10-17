import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FolderOpenIcon,
  HistoryIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  StarIcon,
  TrashIcon,
  GlobeIcon,
} from "lucide-react";
import type { Skill } from "@prompthub/shared/types";
import { AgentSkillDetailActions } from "./AgentSkillDetailActions";
import { SkillIcon } from "./SkillIcon";
import { PlatformIcon } from "../ui/PlatformIcon";
import type {
  SkillAgentDetailActions,
  SkillAgentDetailContext,
  SkillProjectDetailActions,
} from "./skill-detail-types";
import type { ProjectDetailSkillContext } from "./project-detail-adapter";

interface SourceUpdateHeaderState {
  buttonLabel: string;
  checking: boolean;
  hasMetadata: boolean;
  updating: boolean;
  onCheck: () => void | Promise<void>;
}

interface SkillDetailHeaderProps {
  agentActions?: SkillAgentDetailActions | null;
  agentContext?: SkillAgentDetailContext | null;
  currentVersion: number;
  isCreatingSnapshot: boolean;
  isExternalDetail: boolean;
  isProjectDetail: boolean;
  projectActions?: SkillProjectDetailActions | null;
  projectContext?: ProjectDetailSkillContext | null;
  selectedSkill: Skill;
  snapshotLabel: string;
  sourceUpdate: SourceUpdateHeaderState;
  onBack: () => void;
  onCopyTitle: () => void | Promise<void>;
  onDelete: () => void;
  onEdit: () => void;
  onOpenSnapshot: () => void;
  onOpenVersionHistory: () => void;
  onToggleFavorite: () => void;
}

export function SkillDetailHeader({
  agentActions,
  agentContext,
  currentVersion,
  isCreatingSnapshot,
  isExternalDetail,
  isProjectDetail,
  projectActions,
  projectContext,
  selectedSkill,
  snapshotLabel,
  sourceUpdate,
  onBack,
  onCopyTitle,
  onDelete,
  onEdit,
  onOpenSnapshot,
  onOpenVersionHistory,
  onToggleFavorite,
}: SkillDetailHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 app-wallpaper-panel-strong z-10">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-press-in"
          aria-label={t("common.back", "Back")}
          title={t("common.back", "Back")}
        >
          <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
        </button>
        <SkillIcon
          iconUrl={selectedSkill.icon_url}
          iconEmoji={selectedSkill.icon_emoji}
          backgroundColor={selectedSkill.icon_background}
          name={selectedSkill.name}
          size="lg"
        />
        <div>
          <h2 className="leading-tight">
            <button
              type="button"
              className="block max-w-full cursor-default rounded-md text-left text-xl font-bold text-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => void onCopyTitle()}
              title={t("skill.copyTitle", {
                name: selectedSkill.name,
                defaultValue: "Copy title: {{name}}",
              })}
              aria-label={t("skill.copyTitle", {
                name: selectedSkill.name,
                defaultValue: "Copy title: {{name}}",
              })}
            >
              {selectedSkill.name}
            </button>
          </h2>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <GlobeIcon className="w-3.5 h-3.5" aria-hidden="true" />
              {selectedSkill.author || t("skill.localStorage")}
            </div>
            {!isExternalDetail ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {t("skill.currentVersion", "Version")} v{currentVersion}
              </span>
            ) : null}
            {agentContext ? <AgentBadges context={agentContext} /> : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isProjectDetail && projectContext ? (
          <ProjectHeaderActions
            actions={projectActions}
            context={projectContext}
            skill={selectedSkill}
          />
        ) : null}
        {agentContext ? (
          <AgentSkillDetailActions
            isImporting={agentActions?.isImporting}
            isManaged={agentContext.isManaged}
            isUninstallDisabled={agentContext.isPlatformBuiltin}
            isUninstalling={agentActions?.isUninstalling}
            onImport={agentActions?.onImport}
            onOpenFolder={agentActions?.onOpenFolder}
            onOpenManagedSkill={agentActions?.onOpenManagedSkill}
            onUninstall={agentActions?.onUninstall}
            t={t}
            uninstallDisabledReason={t(
              "skill.platformBuiltinCannotUninstall",
              "Built-in skills cannot be removed from this agent.",
            )}
          />
        ) : null}
        {agentContext?.isManaged && !agentContext.isPlatformBuiltin ? (
          <SourceUpdateHeaderAction sourceUpdate={sourceUpdate} />
        ) : null}
        {!isExternalDetail ? (
          <ManagedSkillHeaderActions
            isCreatingSnapshot={isCreatingSnapshot}
            selectedSkill={selectedSkill}
            snapshotLabel={snapshotLabel}
            sourceUpdate={sourceUpdate}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpenSnapshot={onOpenSnapshot}
            onOpenVersionHistory={onOpenVersionHistory}
            onToggleFavorite={onToggleFavorite}
          />
        ) : null}
      </div>
    </div>
  );
}

function AgentBadges({ context }: { context: SkillAgentDetailContext }) {
  const { t } = useTranslation();
  return (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <span aria-hidden="true">
          <PlatformIcon platformId={context.platformId} size={14} />
        </span>
        {context.platformName}
      </span>
      {context.isPlatformBuiltin ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
          {t("skill.platformBuiltin", "Built-in")}
        </span>
      ) : null}
    </>
  );
}

function ProjectHeaderActions({
  actions,
  context,
  skill,
}: {
  actions?: SkillProjectDetailActions | null;
  context: ProjectDetailSkillContext;
  skill: Skill;
}) {
  const { t } = useTranslation();
  return (
    <>
      {context.importedSkill ? (
        <button
          type="button"
          onClick={() => void actions?.onOpenManagedSkill?.()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          title={t("skill.openInMySkills", "Open in My Skills")}
        >
          <FolderOpenIcon className="h-4 w-4" aria-hidden="true" />
          {t("skill.openInMySkills", "Open in My Skills")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() =>
          void window.electron?.openPath?.(
            skill.local_repo_path || skill.source_url || "",
          )
        }
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        title={t("skill.openLocalSource", "Open Local Skill Folder")}
      >
        <FolderOpenIcon className="h-4 w-4" aria-hidden="true" />
        {t("common.open", "Open")}
      </button>
      {actions?.onRemoveFromProject ? (
        <button
          type="button"
          onClick={() => void actions.onRemoveFromProject?.()}
          disabled={actions.isRemoving}
          className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-60"
          title={t("skill.removeFromProject", "Remove from Project")}
        >
          {actions.isRemoving ? (
            <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
          )}
          {t("skill.removeFromProject", "Remove from Project")}
        </button>
      ) : null}
    </>
  );
}

function ManagedSkillHeaderActions({
  isCreatingSnapshot,
  selectedSkill,
  snapshotLabel,
  sourceUpdate,
  onDelete,
  onEdit,
  onOpenSnapshot,
  onOpenVersionHistory,
  onToggleFavorite,
}: Pick<
  SkillDetailHeaderProps,
  | "isCreatingSnapshot"
  | "selectedSkill"
  | "snapshotLabel"
  | "sourceUpdate"
  | "onDelete"
  | "onEdit"
  | "onOpenSnapshot"
  | "onOpenVersionHistory"
  | "onToggleFavorite"
>) {
  const { t } = useTranslation();
  return (
    <>
      <SourceUpdateHeaderAction sourceUpdate={sourceUpdate} iconOnly />
      <IconAction
        onClick={onOpenSnapshot}
        disabled={isCreatingSnapshot}
        busy={isCreatingSnapshot}
        label={t("skill.snapshot", "Snapshot")}
        title={snapshotLabel}
        icon={
          isCreatingSnapshot ? (
            <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon className="h-5 w-5" aria-hidden="true" />
          )
        }
      />
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={
          selectedSkill.is_favorite
            ? t("skill.removeFavorite", "Remove Favorite")
            : t("skill.addFavorite", "Add to Favorites")
        }
        aria-pressed={selectedSkill.is_favorite}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-press-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          selectedSkill.is_favorite
            ? "text-yellow-500 hover:text-yellow-600"
            : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
        }`}
        title={
          selectedSkill.is_favorite
            ? t("skill.removeFavorite", "Remove Favorite")
            : t("skill.addFavorite", "Add to Favorites")
        }
      >
        <StarIcon
          className={`w-5 h-5 ${selectedSkill.is_favorite ? "fill-current" : ""}`}
          aria-hidden="true"
        />
      </button>
      <IconAction
        label={t("skill.versionHistory", "Version History")}
        onClick={onOpenVersionHistory}
        icon={<HistoryIcon className="w-5 h-5" aria-hidden="true" />}
      />
      <IconAction
        label={t("skill.edit", "Edit Skill")}
        onClick={onEdit}
        icon={<PencilIcon className="w-5 h-5" aria-hidden="true" />}
      />
      <IconAction
        destructive
        label={t("common.delete", "Delete")}
        onClick={onDelete}
        icon={<TrashIcon className="w-5 h-5" aria-hidden="true" />}
      />
    </>
  );
}

function SourceUpdateHeaderAction({
  sourceUpdate,
  iconOnly = false,
}: {
  sourceUpdate: SourceUpdateHeaderState;
  iconOnly?: boolean;
}) {
  if (!sourceUpdate.hasMetadata) return null;

  if (iconOnly) {
    const busy = sourceUpdate.checking || sourceUpdate.updating;
    return (
      <IconAction
        label={sourceUpdate.buttonLabel}
        onClick={() => void sourceUpdate.onCheck()}
        disabled={busy}
        busy={busy}
        icon={
          busy ? (
            <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
          )
        }
      />
    );
  }

  return <SourceUpdateTextAction sourceUpdate={sourceUpdate} />;
}

function SourceUpdateTextAction({
  sourceUpdate,
}: {
  sourceUpdate: SourceUpdateHeaderState;
}) {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        onClick={() => void sourceUpdate.onCheck()}
        disabled={sourceUpdate.checking || sourceUpdate.updating}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
        title={sourceUpdate.buttonLabel}
        aria-label={sourceUpdate.buttonLabel}
      >
        {sourceUpdate.checking || sourceUpdate.updating ? (
          <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {sourceUpdate.checking
          ? t("skill.checkingUpdates", "Checking")
          : sourceUpdate.updating
            ? t("skill.updatingFromSource", "Updating")
            : t("skill.checkSourceUpdates", "Check Updates")}
      </button>
    </>
  );
}

function IconAction({
  destructive = false,
  disabled = false,
  busy = false,
  icon,
  label,
  title = label,
  onClick,
}: {
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon: React.ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground rounded-full transition-all active:scale-press-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 ${
        destructive
          ? "hover:text-destructive hover:bg-destructive/10"
          : "hover:text-primary hover:bg-primary/10"
      }`}
      aria-label={label}
      title={title}
    >
      {icon}
    </button>
  );
}
