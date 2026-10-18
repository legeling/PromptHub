import { useTranslation } from "react-i18next";
import { getWebContext } from "../../runtime";
import { HostedSkillPackageUpload } from "./HostedSkillPackageUpload";
import { CuboidIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { SkillUpdateSafetyReviewDialog } from "./SkillUpdateSafetyReviewDialog";
import {
  CreateSkillFullscreenEditor,
  CreateSkillMethodSelection,
} from "./CreateSkillEntryPanels";
import { CreateSkillAiDraftPanel } from "./CreateSkillAiDraftPanel";
import { CreateSkillGithubImportPanel } from "./CreateSkillGithubImportPanel";
import { CreateSkillLocalScanPanel } from "./CreateSkillLocalScanPanel";
import { CreateSkillManualEditor } from "./CreateSkillManualEditor";
import { CreateSkillModalFooters } from "./CreateSkillModalFooters";
import {
  type CreateSkillModalController,
  useCreateSkillModalController,
} from "./useCreateSkillModalController";

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateSkillModal({ isOpen, onClose }: CreateSkillModalProps) {
  const controller = useCreateSkillModalController({ isOpen, onClose });
  if (!controller) return null;
  if (controller.isNativeFullscreen && controller.mode === "manual") {
    return (
      <CreateSkillFullscreenEditor
        fileInputRef={controller.fileInputRef}
        instructions={controller.instructions}
        isLoading={controller.isLoading}
        name={controller.name}
        textareaRef={controller.textareaRef}
        onCreate={controller.handleManualCreate}
        onExit={controller.handleExitNativeFullscreen}
        onFileUpload={controller.handleFileUpload}
        onInstructionsChange={controller.setInstructions}
      />
    );
  }
  return <CreateSkillModalSurface controller={controller} />;
}

function CreateSkillModalSurface({
  controller,
}: {
  controller: CreateSkillModalController;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        data-testid="create-skill-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={controller.handleCloseRequest}
      />
      <div
        data-testid="create-skill-modal-container"
        className={`relative app-wallpaper-panel-strong rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-base flex flex-col transition-all min-h-0 ${getModalSize(controller)}`}
      >
        <CreateSkillModalHeader controller={controller} />
        <CreateSkillModalBody controller={controller} />
        <CreateSkillModalFooters controller={controller} />
      </div>
      <CreateSkillUnsavedChangesDialog controller={controller} />
      <SkillUpdateSafetyReviewDialog
        operation="install"
        review={controller.installReview?.review ?? null}
        trustSource={controller.trustReviewedInstallSource}
        isLoading={controller.isConfirmingInstallReview}
        t={controller.t}
        onTrustSourceChange={controller.setTrustReviewedInstallSource}
        onClose={controller.closeInstallReview}
        onConfirm={() => void controller.confirmInstallReview()}
      />
    </div>
  );
}

function getModalSize(controller: CreateSkillModalController): string {
  if (controller.mode === "manual")
    return controller.isFullscreen
      ? "w-[95vw] h-[95vh]"
      : "w-full max-w-2xl max-h-[90vh]";
  if (
    controller.mode === "github" ||
    (controller.mode === "scan" &&
      controller.scanDone &&
      controller.annotatedScanResults.length)
  )
    return "w-[min(92vw,1100px)] max-h-[92vh]";
  return "w-full max-w-lg max-h-[90vh]";
}

function CreateSkillModalHeader({
  controller,
}: {
  controller: CreateSkillModalController;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <CuboidIcon className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">
          {getModalTitle(controller, t)}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        {controller.mode === "manual" ? (
          <button
            type="button"
            onClick={() =>
              controller.setIsFullscreen((fullscreen) => !fullscreen)
            }
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            aria-label={
              controller.isFullscreen
                ? t("common.exitFullscreen", "Exit Fullscreen")
                : t("common.fullscreen", "Fullscreen")
            }
            title={
              controller.isFullscreen
                ? t("common.exitFullscreen", "Exit Fullscreen")
                : t("common.fullscreen", "Fullscreen")
            }
          >
            {controller.isFullscreen ? (
              <Minimize2Icon className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2Icon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={controller.handleCloseRequest}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          aria-label={t("common.close", "Close")}
        >
          <XIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function getModalTitle(
  controller: CreateSkillModalController,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (controller.mode === "select") return t("skill.addSkill", "Add Skill");
  if (controller.mode === "github")
    return t("skill.installFromGithub", "Install from Git Repository");
  if (controller.mode === "manual")
    return t("skill.createTitle", "Create Skill");
  if (controller.mode === "ai") return t("skill.aiCreate", "AI Draft");
  return t("skill.scanLocal", "Scan Local");
}

function CreateSkillModalBody({
  controller,
}: {
  controller: CreateSkillModalController;
}) {
  return (
    <div className={`p-6 ${getModalContentClassName(controller)}`}>
      {controller.error ? (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {controller.error}
        </div>
      ) : null}
      <CreateSkillModalModeContent controller={controller} />
    </div>
  );
}

function getModalContentClassName(
  controller: CreateSkillModalController,
): string {
  if (controller.mode === "manual") return "flex-1 overflow-y-auto";
  return controller.mode === "github" || controller.mode === "scan"
    ? "flex flex-1 min-h-0 flex-col overflow-hidden"
    : "";
}

function CreateSkillModalModeContent({
  controller,
}: {
  controller: CreateSkillModalController;
}) {
  if (controller.mode === "select")
    return (
      <>
        <CreateSkillMethodSelection
          canScanLocal={controller.runtimeCapabilities.skillLocalScan}
          onSelectGit={controller.enterGitHubMode}
          onSelectMode={controller.setMode}
        />
        {getWebContext()?.capabilities?.skillPackageImport && (
          <HostedSkillPackageUpload onComplete={controller.handleClose} />
        )}
      </>
    );
  if (controller.mode === "github")
    return <CreateSkillGithubImportPanel controller={controller} />;
  if (controller.mode === "manual")
    return <CreateSkillManualEditor controller={controller} />;
  if (controller.mode === "ai")
    return <CreateSkillAiDraftPanel controller={controller} />;
  return <CreateSkillLocalScanPanel controller={controller} />;
}

function CreateSkillUnsavedChangesDialog({
  controller,
}: {
  controller: CreateSkillModalController;
}) {
  return (
    <UnsavedChangesDialog
      isOpen={controller.showUnsavedDialog}
      onClose={() => controller.setShowUnsavedDialog(false)}
      onSave={() => {
        controller.setShowUnsavedDialog(false);
        void controller.handleManualCreate();
      }}
      onDiscard={() => {
        controller.setShowUnsavedDialog(false);
        controller.handleClose();
      }}
    />
  );
}
