import { useEffect, useState } from "react";
import type { Prompt } from "@prompthub/shared/types";
import type { VariableInputImageAttachment } from "../prompt/VariableInputModal";
import { useTemporaryFlag } from "../../hooks/useTemporaryFlag";

function usePromptCopyState() {
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [isCopyVariableModalOpen, setIsCopyVariableModalOpen] = useState(false);
  const [copyPrompt, setCopyPrompt] = useState<Prompt | null>(null);
  const [copyPromptQueue, setCopyPromptQueue] = useState<Prompt[]>([]);
  const [copyPromptResults, setCopyPromptResults] = useState<string[]>([]);
  const [copyPromptQueueIndex, setCopyPromptQueueIndex] = useState(-1);
  const [copyPromptSourceId, setCopyPromptSourceId] = useState<string | null>(
    null,
  );
  return {
    isVariableModalOpen,
    setIsVariableModalOpen,
    isCopyVariableModalOpen,
    setIsCopyVariableModalOpen,
    copyPrompt,
    setCopyPrompt,
    copyPromptQueue,
    setCopyPromptQueue,
    copyPromptResults,
    setCopyPromptResults,
    copyPromptQueueIndex,
    setCopyPromptQueueIndex,
    copyPromptSourceId,
    setCopyPromptSourceId,
  };
}

function usePromptDialogState() {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    prompt: Prompt;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    prompt: Prompt | null;
  }>({ isOpen: false, prompt: null });
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [quickRewritePrompt, setQuickRewritePrompt] = useState<Prompt | null>(
    null,
  );
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [versionHistoryPrompt, setVersionHistoryPrompt] =
    useState<Prompt | null>(null);
  const [quickTagPrompt, setQuickTagPrompt] = useState<Prompt | null>(null);
  return {
    previewImage,
    setPreviewImage,
    contextMenu,
    setContextMenu,
    deleteConfirm,
    setDeleteConfirm,
    editingPrompt,
    setEditingPrompt,
    quickRewritePrompt,
    setQuickRewritePrompt,
    isDetailModalOpen,
    setIsDetailModalOpen,
    detailPrompt,
    setDetailPrompt,
    isVersionModalOpen,
    setIsVersionModalOpen,
    versionHistoryPrompt,
    setVersionHistoryPrompt,
    quickTagPrompt,
    setQuickTagPrompt,
  };
}

function usePromptDetailState(renderMarkdownPreference: boolean) {
  const [renderMarkdownEnabled, setRenderMarkdownEnabled] = useState(
    renderMarkdownPreference,
  );
  const [showEnglish, setShowEnglish] = useState(false);
  const [isTagDropActive, setIsTagDropActive] = useState(false);
  const [collapsedPromptIds, setCollapsedPromptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isDetailRelationshipsOpen, setIsDetailRelationshipsOpen] =
    useState(false);
  const [isDetailOutputFormatOpen, setIsDetailOutputFormatOpen] =
    useState(false);
  useEffect(
    () => setRenderMarkdownEnabled(renderMarkdownPreference),
    [renderMarkdownPreference],
  );
  return {
    renderMarkdownEnabled,
    setRenderMarkdownEnabled,
    showEnglish,
    setShowEnglish,
    isTagDropActive,
    setIsTagDropActive,
    collapsedPromptIds,
    setCollapsedPromptIds,
    isDetailRelationshipsOpen,
    setIsDetailRelationshipsOpen,
    isDetailOutputFormatOpen,
    setIsDetailOutputFormatOpen,
  };
}

function usePromptAiState() {
  const [inlineAiTestImages, setInlineAiTestImages] = useState<
    VariableInputImageAttachment[]
  >([]);
  const [isAiTestModalOpen, setIsAiTestModalOpen] = useState(false);
  const [aiTestPrompt, setAiTestPrompt] = useState<Prompt | null>(null);
  const [aiTestInitialMode, setAiTestInitialMode] = useState<
    "single" | "compare" | "image"
  >("single");
  const [aiResponseCache, setAiResponseCache] = useState<
    Record<string, string>
  >({});
  return {
    inlineAiTestImages,
    setInlineAiTestImages,
    isAiTestModalOpen,
    setIsAiTestModalOpen,
    aiTestPrompt,
    setAiTestPrompt,
    aiTestInitialMode,
    setAiTestInitialMode,
    aiResponseCache,
    setAiResponseCache,
  };
}

export function usePromptWorkspaceState(renderMarkdownPreference: boolean) {
  const [copied, triggerCopied] = useTemporaryFlag(2000);
  const [shared, triggerShared] = useTemporaryFlag(2000);
  return {
    copied,
    triggerCopied,
    shared,
    triggerShared,
    copy: usePromptCopyState(),
    dialogs: usePromptDialogState(),
    detail: usePromptDetailState(renderMarkdownPreference),
    ai: usePromptAiState(),
  };
}
