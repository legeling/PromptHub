import { useWorkspaceDraft } from "../../hooks/useWorkspaceDraft";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { getRuntimeCapabilities } from "../../runtime";
import { getExistingSkillTags } from "./skill-modal-utils";
import {
  getImportModeButtonStyle,
  getRegistrySelectionKey,
  sanitizeSkillName,
  type CreateMode,
} from "./create-skill-modal-utils";
import { useCreateSkillGithubImport } from "./useCreateSkillGithubImport";
import { useCreateSkillLocalScan } from "./useCreateSkillLocalScan";
import { useCreateSkillManualForm } from "./useCreateSkillManualForm";
import { useSkillPackageInstall } from "./useSkillPackageInstall";

export { getImportModeButtonStyle, getRegistrySelectionKey, sanitizeSkillName };
export type { CreateMode } from "./create-skill-modal-utils";

interface CreateSkillModalControllerOptions {
  isOpen: boolean;
  onClose: () => void;
}

export function useCreateSkillModalController({
  isOpen,
  onClose,
}: CreateSkillModalControllerOptions) {
  const { t } = useTranslation();
  const runtimeCapabilities = getRuntimeCapabilities();
  const createSkill = useSkillStore((state) => state.createSkill);
  const installOperation = useSkillPackageInstall();
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const existingSkills = useSkillStore((state) => state.skills);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const [mode, setMode] = useState<CreateMode>("select");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const manual = useCreateSkillManualForm({
    aiModels,
    createSkill,
    setError,
    setIsGenerating,
    setIsLoading,
    setMode,
    t,
  });
  const github = useCreateSkillGithubImport({
    existingSkills,
    installRegistrySkill: installOperation.install,
    setError,
    setIsLoading,
    t,
  });
  const localScan = useCreateSkillLocalScan({
    existingSkills,
    importScannedSkills,
    setError,
    setIsLoading,
    t,
  });
  const confirmInstallReview = useCallback(async () => {
    const pendingName = installOperation.pendingReview?.skill.name;
    const result = await installOperation.confirmReview();
    if (result?.status === "installed" && pendingName) {
      github.setGithubImportNotice(
        t(
          "skill.githubImportReviewedInstalled",
          "Installed after review: {{name}}",
          { name: pendingName },
        ),
      );
    }
    return result;
  }, [github, installOperation, t]);
  const existingTags = useMemo(
    () => getExistingSkillTags(existingSkills),
    [existingSkills],
  );

  const handleEnterNativeFullscreen = useCallback(() => {
    manual.setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  }, [manual]);
  const handleExitNativeFullscreen = useCallback(() => {
    manual.setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  }, [manual]);
  useNativeFullscreenEscape(
    isOpen,
    manual.isNativeFullscreen,
    handleExitNativeFullscreen,
  );

  const handleClose = useCallback(() => {
    setMode("select");
    setError(null);
    setShowUnsavedDialog(false);
    setIsGenerating(false);
    github.resetGitHubImportState();
    manual.reset();
    localScan.reset();
    installOperation.resetReviews();
    onClose();
  }, [github, installOperation, localScan, manual, onClose]);
  useWorkspaceDraft("skill", {
    dirty:
      isOpen &&
      manual.hasUnsavedChanges() &&
      (mode === "manual" || mode === "ai"),
    saving: isOpen && (isLoading || isGenerating),
    discard: handleClose,
  });
  const handleCloseRequest = useCallback(() => {
    if (manual.hasUnsavedChanges() && (mode === "manual" || mode === "ai")) {
      setShowUnsavedDialog(true);
      return;
    }
    handleClose();
  }, [handleClose, manual, mode]);
  const enterGitHubMode = useCallback(() => {
    github.resetGitHubImportState();
    setMode("github");
  }, [github]);
  const handleManualCreate = useCompletionClose(
    manual.createSkill,
    handleClose,
  );
  const handleImportSelectedGitHubSkills = useCompletionClose(
    github.importSelected,
    handleClose,
  );
  const handleImportSelected = useCompletionClose(
    localScan.importSelected,
    handleClose,
  );
  const handleImportFromAgentSkills = useCallback(() => {
    setStoreView("agents");
    selectSkill(null);
    handleClose();
  }, [handleClose, selectSkill, setStoreView]);
  const handleChooseLocalSkillFolder = useCallback(async () => {
    const selectedFolder = await window.electron?.selectFolder?.();
    if (selectedFolder) await localScan.handleScanLocal([selectedFolder]);
  }, [localScan]);

  if (!isOpen) return null;
  return {
    t,
    runtimeCapabilities,
    mode,
    setMode,
    isLoading,
    isGenerating,
    error,
    setError,
    showUnsavedDialog,
    setShowUnsavedDialog,
    ...github,
    ...manual,
    ...localScan,
    installReview: installOperation.pendingReview,
    installReviewCount: installOperation.pendingReviewCount,
    trustReviewedInstallSource: installOperation.trustReviewedSource,
    setTrustReviewedInstallSource: installOperation.setTrustReviewedSource,
    isConfirmingInstallReview: installOperation.isConfirmingReview,
    confirmInstallReview,
    closeInstallReview: installOperation.closeReview,
    existingTags,
    handleEnterNativeFullscreen,
    handleExitNativeFullscreen,
    handleCloseRequest,
    handleClose,
    enterGitHubMode,
    handleManualCreate,
    handleImportSelectedGitHubSkills,
    handleImportFromAgentSkills,
    handleChooseLocalSkillFolder,
    handleImportSelected,
    handleGitHubInstall: github.scanRepository,
  };
}

function useNativeFullscreenEscape(
  isOpen: boolean,
  isNativeFullscreen: boolean,
  onExit: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isNativeFullscreen) onExit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNativeFullscreen, isOpen, onExit]);
}

function useCompletionClose(
  action: () => Promise<boolean>,
  onComplete: () => void,
) {
  return useCallback(async () => {
    if (await action()) onComplete();
  }, [action, onComplete]);
}

export type CreateSkillModalController = NonNullable<
  ReturnType<typeof useCreateSkillModalController>
>;
