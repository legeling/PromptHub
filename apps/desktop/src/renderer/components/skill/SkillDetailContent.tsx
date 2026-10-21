import { lazy, Suspense, type ComponentProps, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react";
import type { Skill } from "@prompthub/shared/types";
import {
  DETAIL_PAGE_CONTENT_CLASS,
  DETAIL_PAGE_PREVIEW_GRID_CLASS,
} from "../layout/detailPageLayout";
import { Spinner, Textarea } from "../ui";
import { AgentSkillPreviewSidebar } from "./AgentSkillPreviewSidebar";
import { ProjectSkillPreviewSidebar } from "./ProjectSkillPreviewSidebar";
import { SkillCodePane } from "./SkillCodePane";
import { SkillPlatformPanel } from "./SkillPlatformPanel";
import { SkillPreviewPane } from "./SkillPreviewPane";
import type { ProjectDetailSkillContext } from "./project-detail-adapter";
import type {
  SkillAgentDetailActions,
  SkillAgentDetailContext,
  SkillDetailTab,
  SkillProjectDetailActions,
} from "./skill-detail-types";

const LazySkillFileEditor = lazy(() =>
  import("./SkillFileEditor").then((module) => ({
    default: module.SkillFileEditor,
  })),
);

interface SkillDetailContentProps {
  activeTab: SkillDetailTab;
  agentActions?: SkillAgentDetailActions | null;
  agentContext?: SkillAgentDetailContext | null;
  canEditFiles: boolean;
  codePaneProps: ComponentProps<typeof SkillCodePane>;
  contentScrollRef: RefObject<HTMLDivElement>;
  draftUserNotes: string;
  isEditingUserNotes: boolean;
  isExternalDetail: boolean;
  isLoadingUserNotes: boolean;
  isProjectDetail: boolean;
  isSavingUserNotes: boolean;
  platformPanelProps: ComponentProps<typeof SkillPlatformPanel>;
  previewPaneProps: ComponentProps<typeof SkillPreviewPane>;
  projectActions?: SkillProjectDetailActions | null;
  projectContext?: ProjectDetailSkillContext | null;
  selectedSkill: Skill;
  showBackToTop: boolean;
  userNotes: string;
  onCancelUserNotes: () => void;
  onContentScroll: () => void;
  onEditUserNotes: () => void;
  onFileEditorUnsavedChange: (hasUnsaved: boolean) => void;
  onReloadSkills: () => void | Promise<void>;
  onSaveUserNotes: () => void | Promise<void>;
  onScrollToTop: () => void;
  onUserNotesChange: (value: string) => void;
}

export function SkillDetailContent({
  activeTab,
  agentActions,
  agentContext,
  canEditFiles,
  codePaneProps,
  contentScrollRef,
  draftUserNotes,
  isEditingUserNotes,
  isExternalDetail,
  isLoadingUserNotes,
  isProjectDetail,
  isSavingUserNotes,
  platformPanelProps,
  previewPaneProps,
  projectActions,
  projectContext,
  selectedSkill,
  showBackToTop,
  userNotes,
  onCancelUserNotes,
  onContentScroll,
  onEditUserNotes,
  onFileEditorUnsavedChange,
  onReloadSkills,
  onSaveUserNotes,
  onScrollToTop,
  onUserNotesChange,
}: SkillDetailContentProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        ref={contentScrollRef}
        onScroll={onContentScroll}
        className={`flex-1 flex flex-col ${
          canEditFiles && activeTab === "files"
            ? "overflow-hidden"
            : "overflow-y-auto"
        }`}
      >
        {canEditFiles && activeTab === "files" ? (
          <div className="flex-1 flex flex-col app-wallpaper-panel min-h-0 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center">
                  <Spinner
                    size="lg"
                    tone="muted"
                    label={t("common.loading", "Loading...")}
                  />
                </div>
              }
            >
              <LazySkillFileEditor
                skillId={selectedSkill.id}
                currentVersion={selectedSkill.currentVersion}
                localPath={
                  isExternalDetail ? selectedSkill.local_repo_path : undefined
                }
                skillName={selectedSkill.name}
                isOpen
                onSave={() =>
                  isExternalDetail ? Promise.resolve() : onReloadSkills()
                }
                onUnsavedChange={onFileEditorUnsavedChange}
                mode="inline"
              />
            </Suspense>
          </div>
        ) : (
          <div className={DETAIL_PAGE_CONTENT_CLASS}>
            {activeTab === "preview" ? (
              <div
                data-testid="skill-detail-preview-layout"
                className={DETAIL_PAGE_PREVIEW_GRID_CLASS}
              >
                <SkillPreviewPane {...previewPaneProps} />
                {!isExternalDetail ? (
                  <div className="space-y-6">
                    <UserNotesSection
                      draft={draftUserNotes}
                      isEditing={isEditingUserNotes}
                      isLoading={isLoadingUserNotes}
                      isSaving={isSavingUserNotes}
                      notes={userNotes}
                      onCancel={onCancelUserNotes}
                      onChange={onUserNotesChange}
                      onEdit={onEditUserNotes}
                      onSave={onSaveUserNotes}
                    />
                    <SkillPlatformPanel {...platformPanelProps} />
                  </div>
                ) : isProjectDetail ? (
                  <ProjectSkillPreviewSidebar
                    deployTargets={projectContext?.projectDeployTargets ?? []}
                    isDeploying={Boolean(projectActions?.isDeploying)}
                    isImporting={Boolean(projectActions?.isImporting)}
                    isImported={Boolean(projectContext?.importedSkill)}
                    isRemoving={Boolean(projectActions?.isRemoving)}
                    isImportAvailable={
                      typeof projectActions?.onImport === "function"
                    }
                    onAddDeployTarget={
                      projectActions?.onAddDeployTarget ?? (() => undefined)
                    }
                    onDeploy={
                      projectActions?.onDeployToProjectTargets ??
                      (() => undefined)
                    }
                    onImport={projectActions?.onImport ?? (() => undefined)}
                    onRemoveFromProject={projectActions?.onRemoveFromProject}
                    selectedSkill={selectedSkill}
                    sourcePath={
                      selectedSkill.local_repo_path ||
                      selectedSkill.source_url ||
                      ""
                    }
                    symlinkTargetPath={
                      projectContext?.scannedSkill?.installMode === "symlink"
                        ? projectContext.scannedSkill.symlinkTargetPath
                        : undefined
                    }
                    t={t}
                  />
                ) : agentContext ? (
                  <AgentSkillPreviewSidebar
                    installMode={agentContext.installMode}
                    isImporting={Boolean(agentActions?.isImporting)}
                    isManaged={agentContext.isManaged}
                    onImport={agentActions?.onImport}
                    onOpenFolder={agentActions?.onOpenFolder}
                    onOpenSymlinkTarget={agentActions?.onOpenSymlinkTarget}
                    platformId={agentContext.platformId}
                    platformName={agentContext.platformName}
                    sourcePath={agentContext.sourcePath}
                    symlinkTargetPath={agentContext.symlinkTargetPath}
                    t={t}
                  />
                ) : null}
              </div>
            ) : (
              <SkillCodePane {...codePaneProps} />
            )}
          </div>
        )}
      </div>
      {showBackToTop && activeTab !== "files" ? (
        <button
          type="button"
          onClick={onScrollToTop}
          className="absolute bottom-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border app-wallpaper-surface px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-all duration-base hover:-translate-x-1/2 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-primary hover:shadow-xl"
        >
          <ArrowUpIcon className="w-4 h-4" aria-hidden="true" />
          {t("common.backToTop", "Back to Top")}
        </button>
      ) : null}
    </>
  );
}

function UserNotesSection({
  draft,
  isEditing,
  isLoading,
  isSaving,
  notes,
  onCancel,
  onChange,
  onEdit,
  onSave,
}: {
  draft: string;
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  notes: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <StickyNoteIcon className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="truncate text-xs font-semibold uppercase tracking-[0.3em]">
            {t("skill.userNotes", "Personal Notes")}
          </h3>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={isSaving}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              aria-label={t("common.save", "Save")}
              title={t("common.save", "Save")}
            >
              {isSaving ? (
                <Loader2Icon
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SaveIcon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              aria-label={t("common.cancel", "Cancel")}
              title={t("common.cancel", "Cancel")}
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-50"
            aria-label={t("skill.editUserNotes", "Edit notes")}
            title={t("skill.editUserNotes", "Edit notes")}
          >
            {isLoading ? (
              <Loader2Icon
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <PencilIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <div
        data-testid="skill-user-notes-card"
        className="app-wallpaper-panel rounded-2xl border border-border p-4"
      >
        {isEditing ? (
          <Textarea
            aria-label={t("skill.userNotes", "Personal Notes")}
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t(
              "skill.userNotesPlaceholder",
              "Add private notes for this skill...",
            )}
            rows={5}
            disabled={isSaving}
            className="min-h-[120px] resize-y"
          />
        ) : notes.trim() ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
            {notes}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("skill.userNotesEmpty", "No personal notes yet.")}
          </p>
        )}
      </div>
    </section>
  );
}
