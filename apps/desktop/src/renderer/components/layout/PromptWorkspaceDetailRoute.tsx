import type { PromptWorkspaceDetailPaneProps } from "./prompt-workspace-detail-types";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";
import { PromptWorkspaceDetailPane } from "./PromptWorkspaceDetailPane";

type Controller = ReturnType<typeof usePromptWorkspaceContext>;

function getDetailAiProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDetailPaneProps,
  | "aiResponse"
  | "aiResponseModelLabel"
  | "aiThinking"
  | "hasCompareModels"
  | "isAiResponseImage"
  | "isTestingAI"
> {
  const { ai, derived } = controller;
  const isImage =
    derived.selectedPrompt?.promptType === "image" || ai.isAiResponseImage;
  return {
    aiResponse: ai.aiResponse,
    aiResponseModelLabel: isImage
      ? ai.defaultImageModel?.model || ai.aiModel
      : ai.aiModel,
    aiThinking: ai.aiThinking,
    hasCompareModels: ai.compareModels.length > 0,
    isAiResponseImage: ai.isAiResponseImage,
    isTestingAI: ai.isTestingAI,
  };
}

function getDetailInlineProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDetailPaneProps,
  | "cancelDetailInlineEdit"
  | "canSaveDetailInlineEdit"
  | "detailDescriptionInputRef"
  | "detailInlineDraft"
  | "detailSystemPromptTextareaRef"
  | "detailTitleInputRef"
  | "detailUserPromptTextareaRef"
  | "handleDetailInlineEditKeyDown"
  | "isDetailInlineEditing"
  | "isDetailInlineSaving"
  | "openDetailInlineEdit"
  | "saveDetailInlineEdit"
  | "setDetailInlineDraft"
> {
  const { inlineEditor } = controller;
  return {
    cancelDetailInlineEdit: inlineEditor.cancelDetailInlineEdit,
    canSaveDetailInlineEdit: inlineEditor.canSaveDetailInlineEdit,
    detailDescriptionInputRef: inlineEditor.detailDescriptionInputRef,
    detailInlineDraft: inlineEditor.detailInlineDraft,
    detailSystemPromptTextareaRef: inlineEditor.detailSystemPromptTextareaRef,
    detailTitleInputRef: inlineEditor.detailTitleInputRef,
    detailUserPromptTextareaRef: inlineEditor.detailUserPromptTextareaRef,
    handleDetailInlineEditKeyDown: inlineEditor.handleDetailInlineEditKeyDown,
    isDetailInlineEditing: inlineEditor.isDetailInlineEditing,
    isDetailInlineSaving: inlineEditor.isDetailInlineSaving,
    openDetailInlineEdit: inlineEditor.openDetailInlineEdit,
    saveDetailInlineEdit: inlineEditor.saveDetailInlineEdit,
    setDetailInlineDraft: inlineEditor.setDetailInlineDraft,
  };
}

function getDetailPromptProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDetailPaneProps,
  | "childPrompts"
  | "filterTags"
  | "folderOptions"
  | "highlightTerms"
  | "outputFormatCount"
  | "parentPrompt"
  | "relations"
  | "relationshipCount"
  | "selectedPrompt"
  | "uiLangTag"
> {
  const { derived, stores } = controller;
  return {
    childPrompts: derived.selectedChildPrompts,
    filterTags: stores.promptData.filterTags,
    folderOptions: derived.detailFolderOptions,
    highlightTerms: derived.highlightTerms,
    outputFormatCount: derived.selectedOutputFormatCount,
    parentPrompt: derived.selectedParentPrompt,
    relations: derived.selectedPromptRelations,
    relationshipCount: derived.selectedRelationshipCount,
    selectedPrompt: derived.selectedPrompt,
    uiLangTag: derived.uiLangTag,
  };
}

function getDetailActionProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDetailPaneProps,
  | "handleAiTest"
  | "handleCopyPrompt"
  | "handleDeletePrompt"
  | "handleDetailRemoveTag"
  | "handleDetailTagDragLeave"
  | "handleDetailTagDragOver"
  | "handleDetailTagDrop"
  | "handleMovePrompt"
  | "handleSharePrompt"
  | "handleTagFilterClick"
  | "handleVersionHistory"
  | "onCreateRelation"
  | "onDeleteRelation"
  | "onDetachPrompt"
  | "onRevealPrompt"
> {
  const { actions } = controller;
  return {
    handleAiTest: actions.handleAiTestFromTable,
    handleCopyPrompt: actions.handleCopyPrompt,
    handleDeletePrompt: actions.handleDeletePrompt,
    handleDetailRemoveTag: actions.handleDetailRemoveTag,
    handleDetailTagDragLeave: actions.handleDetailTagDragLeave,
    handleDetailTagDragOver: actions.handleDetailTagDragOver,
    handleDetailTagDrop: actions.handleDetailTagDrop,
    handleMovePrompt: actions.handleMovePrompt,
    handleSharePrompt: actions.handleSharePrompt,
    handleTagFilterClick: actions.handleTagFilterClick,
    handleVersionHistory: actions.handleVersionHistory,
    onCreateRelation: actions.handleCreatePromptRelation,
    onDeleteRelation: actions.handleDeletePromptRelation,
    onDetachPrompt: actions.handleDetachPrompt,
    onRevealPrompt: actions.handleRevealPrompt,
  };
}

function getDetailPresentationProps(
  controller: Controller,
): Pick<
  PromptWorkspaceDetailPaneProps,
  | "copied"
  | "isDetailOutputFormatOpen"
  | "isDetailRelationshipsOpen"
  | "isTagDropActive"
  | "renderMarkdownEnabled"
  | "setEditingPrompt"
  | "setIsDetailOutputFormatOpen"
  | "setIsDetailRelationshipsOpen"
  | "setIsVariableModalOpen"
  | "setPreviewImage"
  | "setQuickRewritePrompt"
  | "setShowEnglish"
  | "shared"
  | "showEnglish"
  | "toggleRenderMarkdown"
  | "triggerCopied"
> {
  const { actions, state } = controller;
  return {
    copied: state.copied,
    isDetailOutputFormatOpen: state.detail.isDetailOutputFormatOpen,
    isDetailRelationshipsOpen: state.detail.isDetailRelationshipsOpen,
    isTagDropActive: state.detail.isTagDropActive,
    renderMarkdownEnabled: state.detail.renderMarkdownEnabled,
    setEditingPrompt: state.dialogs.setEditingPrompt,
    setIsDetailOutputFormatOpen: state.detail.setIsDetailOutputFormatOpen,
    setIsDetailRelationshipsOpen: state.detail.setIsDetailRelationshipsOpen,
    setIsVariableModalOpen: state.copy.setIsVariableModalOpen,
    setPreviewImage: state.dialogs.setPreviewImage,
    setQuickRewritePrompt: state.dialogs.setQuickRewritePrompt,
    setShowEnglish: state.detail.setShowEnglish,
    shared: state.shared,
    showEnglish: state.detail.showEnglish,
    toggleRenderMarkdown: actions.toggleRenderMarkdown,
    triggerCopied: state.triggerCopied,
  };
}

function usePromptWorkspaceDetailProps() {
  const controller = usePromptWorkspaceContext();
  return {
    ...getDetailAiProps(controller),
    ...getDetailInlineProps(controller),
    ...getDetailPromptProps(controller),
    ...getDetailActionProps(controller),
    ...getDetailPresentationProps(controller),
  } satisfies PromptWorkspaceDetailPaneProps;
}

export function PromptWorkspaceDetailRoute() {
  return <PromptWorkspaceDetailPane {...usePromptWorkspaceDetailProps()} />;
}
