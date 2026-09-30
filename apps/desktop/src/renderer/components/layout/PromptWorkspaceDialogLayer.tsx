import type { PromptWorkspaceDialogsProps } from "./prompt-workspace-dialog-types";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";
import { PromptWorkspaceDialogs } from "./PromptWorkspaceDialogs";

type Controller = ReturnType<typeof usePromptWorkspaceContext>;
type DialogModalStateProps = Pick<
  PromptWorkspaceDialogsProps,
  | "confirmDelete"
  | "contextMenu"
  | "deleteConfirm"
  | "detailPrompt"
  | "editingPrompt"
  | "isAiTestModalOpen"
  | "isDetailModalOpen"
  | "isVersionModalOpen"
  | "previewImage"
  | "quickRewritePrompt"
  | "quickTagPrompts"
  | "versionHistoryPrompt"
>;
type DialogModalSetterProps = Pick<
  PromptWorkspaceDialogsProps,
  | "setContextMenu"
  | "setDeleteConfirm"
  | "setDetailPrompt"
  | "setEditingPrompt"
  | "setIsAiTestModalOpen"
  | "setIsDetailModalOpen"
  | "setIsVersionModalOpen"
  | "setPreviewImage"
  | "setQuickRewritePrompt"
  | "setQuickTagPrompts"
  | "setVersionHistoryPrompt"
>;

function getDialogModalProps(controller: Controller) {
  return {
    ...getDialogModalState(controller),
    ...getDialogModalSetters(controller),
  };
}

function getDialogModalState(controller: Controller): DialogModalStateProps {
  const { actions, state } = controller;
  return {
    confirmDelete: actions.confirmDelete,
    contextMenu: state.dialogs.contextMenu,
    deleteConfirm: state.dialogs.deleteConfirm,
    detailPrompt: state.dialogs.detailPrompt,
    editingPrompt: state.dialogs.editingPrompt,
    isAiTestModalOpen: state.ai.isAiTestModalOpen,
    isDetailModalOpen: state.dialogs.isDetailModalOpen,
    isVersionModalOpen: state.dialogs.isVersionModalOpen,
    previewImage: state.dialogs.previewImage,
    quickRewritePrompt: state.dialogs.quickRewritePrompt,
    quickTagPrompts: state.dialogs.quickTagPrompts,
    versionHistoryPrompt: state.dialogs.versionHistoryPrompt,
  };
}

function getDialogModalSetters(controller: Controller): DialogModalSetterProps {
  const { state } = controller;
  return {
    setContextMenu: state.dialogs.setContextMenu,
    setDeleteConfirm: state.dialogs.setDeleteConfirm,
    setDetailPrompt: state.dialogs.setDetailPrompt,
    setEditingPrompt: state.dialogs.setEditingPrompt,
    setIsAiTestModalOpen: state.ai.setIsAiTestModalOpen,
    setIsDetailModalOpen: state.dialogs.setIsDetailModalOpen,
    setIsVersionModalOpen: state.dialogs.setIsVersionModalOpen,
    setPreviewImage: state.dialogs.setPreviewImage,
    setQuickRewritePrompt: state.dialogs.setQuickRewritePrompt,
    setQuickTagPrompts: state.dialogs.setQuickTagPrompts,
    setVersionHistoryPrompt: state.dialogs.setVersionHistoryPrompt,
  };
}

function getDialogCopyProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDialogsProps,
  | "copyPrompt"
  | "copyPromptQueue"
  | "copyPromptQueueIndex"
  | "isCopyVariableModalOpen"
  | "isVariableModalOpen"
  | "setCopyPrompt"
  | "setCopyPromptQueue"
  | "setCopyPromptQueueIndex"
  | "setCopyPromptResults"
  | "setCopyPromptSourceId"
  | "setIsCopyVariableModalOpen"
  | "setIsVariableModalOpen"
  | "showEnglish"
  | "triggerCopied"
> {
  const { state } = controller;
  return {
    copyPrompt: state.copy.copyPrompt,
    copyPromptQueue: state.copy.copyPromptQueue,
    copyPromptQueueIndex: state.copy.copyPromptQueueIndex,
    isCopyVariableModalOpen: state.copy.isCopyVariableModalOpen,
    isVariableModalOpen: state.copy.isVariableModalOpen,
    setCopyPrompt: state.copy.setCopyPrompt,
    setCopyPromptQueue: state.copy.setCopyPromptQueue,
    setCopyPromptQueueIndex: state.copy.setCopyPromptQueueIndex,
    setCopyPromptResults: state.copy.setCopyPromptResults,
    setCopyPromptSourceId: state.copy.setCopyPromptSourceId,
    setIsCopyVariableModalOpen: state.copy.setIsCopyVariableModalOpen,
    setIsVariableModalOpen: state.copy.setIsVariableModalOpen,
    showEnglish: state.detail.showEnglish,
    triggerCopied: state.triggerCopied,
  };
}

function getDialogAiProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDialogsProps,
  | "aiTestInitialMode"
  | "aiTestPrompt"
  | "handleSaveAiResponse"
  | "handleUsageIncrement"
  | "isAiTestVariableModalOpen"
  | "isComparingModels"
  | "isCompareVariableModalOpen"
  | "isTestingAI"
  | "runAiTest"
  | "runModelCompare"
  | "selectedPrompt"
  | "setAiTestPrompt"
  | "setIsAiTestVariableModalOpen"
  | "setIsCompareVariableModalOpen"
> {
  const { actions, ai, derived, state } = controller;
  return {
    aiTestInitialMode: state.ai.aiTestInitialMode,
    aiTestPrompt: state.ai.aiTestPrompt,
    handleSaveAiResponse: actions.handleSaveAiResponse,
    handleUsageIncrement: actions.handleAiUsageIncrement,
    isAiTestVariableModalOpen: ai.isAiTestVariableModalOpen,
    isComparingModels: ai.isComparingModels,
    isCompareVariableModalOpen: ai.isCompareVariableModalOpen,
    isTestingAI: ai.isTestingAI,
    runAiTest: ai.runAiTest,
    runModelCompare: ai.runModelCompare,
    selectedPrompt: derived.selectedPrompt,
    setAiTestPrompt: state.ai.setAiTestPrompt,
    setIsAiTestVariableModalOpen: ai.setIsAiTestVariableModalOpen,
    setIsCompareVariableModalOpen: ai.setIsCompareVariableModalOpen,
  };
}

function getDialogActionProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDialogsProps,
  | "handleCopyPrompt"
  | "handleRestoreVersion"
  | "menuItems"
  | "onCreateRelation"
  | "onDeleteRelation"
> {
  const { actions } = controller;
  return {
    handleCopyPrompt: actions.handleCopyPrompt,
    handleRestoreVersion: actions.handleRestoreVersion,
    menuItems: actions.menuItems,
    onCreateRelation: actions.handleCreatePromptRelation,
    onDeleteRelation: actions.handleDeletePromptRelation,
  };
}

function usePromptWorkspaceDialogProps() {
  const controller = usePromptWorkspaceContext();
  return {
    ...getDialogModalProps(controller),
    ...getDialogCopyProps(controller),
    ...getDialogAiProps(controller),
    ...getDialogActionProps(controller),
  } satisfies PromptWorkspaceDialogsProps;
}

export function PromptWorkspaceDialogLayer() {
  return <PromptWorkspaceDialogs {...usePromptWorkspaceDialogProps()} />;
}
