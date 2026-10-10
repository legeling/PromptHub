import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu } from "../ui/ContextMenu";
import { ImagePreviewModal } from "../ui/ImagePreviewModal";
import type { PromptWorkspaceDialogsProps } from "./prompt-workspace-dialog-types";

const VersionHistoryModal = lazy(() =>
  import("../prompt/VersionHistoryModal").then((module) => ({
    default: module.VersionHistoryModal,
  })),
);

function PromptVersionHistoryDialog({
  handleRestoreVersion,
  isVersionModalOpen,
  setIsVersionModalOpen,
  setVersionHistoryPrompt,
  versionHistoryPrompt,
}: Pick<
  PromptWorkspaceDialogsProps,
  | "handleRestoreVersion"
  | "isVersionModalOpen"
  | "setIsVersionModalOpen"
  | "setVersionHistoryPrompt"
  | "versionHistoryPrompt"
>) {
  if (!versionHistoryPrompt) return null;
  return (
    <Suspense fallback={null}>
      <VersionHistoryModal
        isOpen={isVersionModalOpen}
        onClose={() => {
          setIsVersionModalOpen(false);
          setVersionHistoryPrompt(null);
        }}
        prompt={versionHistoryPrompt}
        onRestore={handleRestoreVersion}
      />
    </Suspense>
  );
}

function PromptImagePreview({
  previewImage,
  selectedPrompt,
  setPreviewImage,
}: Pick<
  PromptWorkspaceDialogsProps,
  "previewImage" | "selectedPrompt" | "setPreviewImage"
>) {
  return (
    <ImagePreviewModal
      isOpen={!!previewImage}
      onClose={() => setPreviewImage(null)}
      imageSrc={previewImage}
      imageSources={selectedPrompt?.images}
    />
  );
}

function PromptDeleteConfirmation({
  confirmDelete,
  deleteConfirm,
  isDeletingPrompt,
  setDeleteConfirm,
}: Pick<
  PromptWorkspaceDialogsProps,
  "confirmDelete" | "deleteConfirm" | "isDeletingPrompt" | "setDeleteConfirm"
>) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      isOpen={deleteConfirm.isOpen}
      onClose={() => {
        if (!isDeletingPrompt) {
          setDeleteConfirm({ isOpen: false, prompt: null });
        }
      }}
      onConfirm={confirmDelete}
      isLoading={isDeletingPrompt}
      title={t("prompt.delete")}
      message={t("prompt.confirmDeletePrompt")}
      confirmText={t("common.confirm")}
      cancelText={t("common.cancel")}
      variant="destructive"
    />
  );
}

function PromptContextMenu({
  contextMenu,
  menuItems,
  setContextMenu,
}: Pick<
  PromptWorkspaceDialogsProps,
  "contextMenu" | "menuItems" | "setContextMenu"
>) {
  if (!contextMenu) return null;
  return (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={menuItems}
      onClose={() => setContextMenu(null)}
    />
  );
}

export function PromptWorkspaceSupplementDialogs(
  props: PromptWorkspaceDialogsProps,
) {
  return (
    <>
      <PromptVersionHistoryDialog {...props} />
      <PromptImagePreview {...props} />
      <PromptDeleteConfirmation {...props} />
      <PromptContextMenu {...props} />
    </>
  );
}
