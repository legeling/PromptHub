import { useWorkspaceDraft } from "../../hooks/useWorkspaceDraft";
import { useSettingsStore } from "../../stores/settings.store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Prompt,
  PromptSummary,
  UpdatePromptDTO,
} from "@prompthub/shared/types";
import { hasPromptContent } from "@prompthub/shared/utils/prompt-content";
import { useTranslation } from "react-i18next";
import { usePromptStore } from "../../stores/prompt.store";
import { useToast } from "../ui/Toast";

export type DetailInlineEditDraft = {
  title: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
};

export type DetailInlineEditField =
  | "title"
  | "description"
  | "systemPrompt"
  | "userPrompt";

function createDetailInlineEditDraft(
  prompt: Prompt,
  showEnglish: boolean,
): DetailInlineEditDraft {
  return {
    title: prompt.title,
    description: prompt.description ?? "",
    systemPrompt: showEnglish
      ? prompt.systemPromptEn || prompt.systemPrompt || ""
      : prompt.systemPrompt || "",
    userPrompt: showEnglish
      ? prompt.userPromptEn || prompt.userPrompt
      : prompt.userPrompt,
  };
}

function getDetailInlineSystemPromptField(
  prompt: Prompt,
  showEnglish: boolean,
): "systemPrompt" | "systemPromptEn" {
  return showEnglish && !!prompt.systemPromptEn
    ? "systemPromptEn"
    : "systemPrompt";
}

function getDetailInlineUserPromptField(
  prompt: Prompt,
  showEnglish: boolean,
): "userPrompt" | "userPromptEn" {
  return showEnglish && !!prompt.userPromptEn ? "userPromptEn" : "userPrompt";
}

const EMPTY_DRAFT: DetailInlineEditDraft = {
  title: "",
  description: "",
  systemPrompt: "",
  userPrompt: "",
};

export function usePromptDetailInlineEditor(
  selectedPrompt: Prompt | undefined,
  showEnglish: boolean,
) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const getPromptDetail = usePromptStore((state) => state.getPromptDetail);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const selectedId = usePromptStore((state) => state.selectedId);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    english: boolean;
  } | null>(null);
  const isDetailInlineEditing =
    !!editTarget &&
    editTarget.id === selectedId &&
    editTarget.id === selectedPrompt?.id;
  const draftLanguage = isDetailInlineEditing
    ? editTarget.english
    : showEnglish;
  const [isDetailInlineSaving, setIsDetailInlineSaving] = useState(false);
  const [detailInlineActiveField, setDetailInlineActiveField] =
    useState<DetailInlineEditField>("title");
  const [detailInlineDraft, setDetailInlineDraft] =
    useState<DetailInlineEditDraft>(EMPTY_DRAFT);
  const detailTitleInputRef = useRef<HTMLInputElement>(null);
  const detailDescriptionInputRef = useRef<HTMLInputElement>(null);
  const detailSystemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const detailUserPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptCardEditRequestRef = useRef(0);

  const currentValues = useMemo(
    () =>
      selectedPrompt
        ? createDetailInlineEditDraft(selectedPrompt, draftLanguage)
        : null,
    [selectedPrompt, draftLanguage],
  );
  const userPromptField = selectedPrompt
    ? getDetailInlineUserPromptField(selectedPrompt, draftLanguage)
    : "userPrompt";
  const systemPromptField = selectedPrompt
    ? getDetailInlineSystemPromptField(selectedPrompt, draftLanguage)
    : "systemPrompt";

  useEffect(() => {
    setEditTarget((current) => (current?.id === selectedId ? current : null));
    setIsDetailInlineSaving(false);
    setDetailInlineActiveField("title");
  }, [selectedId]);

  useEffect(() => {
    if (!isDetailInlineEditing) return;
    if (detailInlineActiveField === "systemPrompt") {
      detailSystemPromptTextareaRef.current?.focus();
      return;
    }
    if (detailInlineActiveField === "userPrompt") {
      detailUserPromptTextareaRef.current?.focus();
      return;
    }
    if (detailInlineActiveField === "description") {
      detailDescriptionInputRef.current?.focus();
      detailDescriptionInputRef.current?.select();
      return;
    }
    detailTitleInputRef.current?.focus();
    detailTitleInputRef.current?.select();
  }, [detailInlineActiveField, isDetailInlineEditing]);

  const openDetailInlineEdit = useCallback(
    (field: DetailInlineEditField = "title") => {
      if (!selectedPrompt || selectedPrompt.id !== selectedId) return;
      setDetailInlineDraft(
        createDetailInlineEditDraft(selectedPrompt, showEnglish),
      );
      setDetailInlineActiveField(field);
      setEditTarget({ id: selectedPrompt.id, english: showEnglish });
    },
    [selectedPrompt, selectedId, showEnglish],
  );

  const openPromptCardInlineTitleEdit = useCallback(
    async (prompt: PromptSummary) => {
      const requestId = ++promptCardEditRequestRef.current;
      selectPrompt(prompt.id);
      try {
        const detail = await getPromptDetail(prompt.id);
        if (
          requestId !== promptCardEditRequestRef.current ||
          usePromptStore.getState().selectedId !== prompt.id
        ) {
          return;
        }
        if (!detail) {
          showToast(t("prompt.detailLoadFailed"), "error");
          return;
        }
        setDetailInlineDraft(createDetailInlineEditDraft(detail, showEnglish));
        setDetailInlineActiveField("title");
        setEditTarget({ id: detail.id, english: showEnglish });
      } catch (error) {
        console.error("Failed to load prompt before inline editing:", error);
        if (
          requestId === promptCardEditRequestRef.current &&
          usePromptStore.getState().selectedId === prompt.id
        ) {
          showToast(t("prompt.detailLoadFailed"), "error");
        }
      }
    },
    [getPromptDetail, selectPrompt, showEnglish, showToast, t],
  );

  const cancelDetailInlineEdit = useCallback(() => {
    setDetailInlineDraft(
      selectedPrompt
        ? createDetailInlineEditDraft(selectedPrompt, showEnglish)
        : EMPTY_DRAFT,
    );
    setDetailInlineActiveField("title");
    setEditTarget(null);
    setIsDetailInlineSaving(false);
  }, [selectedPrompt, showEnglish]);

  const hasChanges = useMemo(() => {
    if (!currentValues) return false;
    return (
      detailInlineDraft.title.trim() !== currentValues.title.trim() ||
      detailInlineDraft.description.trim() !==
        currentValues.description.trim() ||
      detailInlineDraft.systemPrompt !== currentValues.systemPrompt ||
      detailInlineDraft.userPrompt !== currentValues.userPrompt
    );
  }, [currentValues, detailInlineDraft]);

  useWorkspaceDraft("prompt", {
    dirty: isDetailInlineEditing && hasChanges,
    saving: isDetailInlineSaving,
    discard: cancelDetailInlineEdit,
  });

  const hasDetailInlineContent =
    !!selectedPrompt &&
    hasPromptContent({
      systemPrompt:
        systemPromptField === "systemPrompt"
          ? detailInlineDraft.systemPrompt
          : selectedPrompt.systemPrompt,
      userPrompt:
        userPromptField === "userPrompt"
          ? detailInlineDraft.userPrompt
          : selectedPrompt.userPrompt,
    });
  const canSaveDetailInlineEdit =
    isDetailInlineEditing &&
    !!selectedPrompt &&
    !isDetailInlineSaving &&
    detailInlineDraft.title.trim().length > 0 &&
    hasDetailInlineContent &&
    hasChanges;

  const saveDetailInlineEdit = useCallback(async () => {
    if (!selectedPrompt || !canSaveDetailInlineEdit || !currentValues) return;

    const updateData: UpdatePromptDTO = {};
    const title = detailInlineDraft.title.trim();
    const description = detailInlineDraft.description.trim();
    if (title !== currentValues.title.trim()) updateData.title = title;
    if (description !== currentValues.description.trim()) {
      updateData.description = description;
    }
    if (detailInlineDraft.systemPrompt !== currentValues.systemPrompt) {
      updateData[systemPromptField] = detailInlineDraft.systemPrompt;
    }
    if (detailInlineDraft.userPrompt !== currentValues.userPrompt) {
      updateData[userPromptField] = detailInlineDraft.userPrompt;
    }

    setIsDetailInlineSaving(true);
    try {
      await updatePrompt(selectedPrompt.id, updateData);
      showToast(
        t("toast.saved"),
        "success",
        useSettingsStore.getState().showSaveNotification,
      );
      setDetailInlineActiveField("title");
      setEditTarget(null);
    } catch (error) {
      console.error("Failed to save inline prompt edits:", error);
      showToast(t("toast.updateFailed"), "error");
    } finally {
      setIsDetailInlineSaving(false);
    }
  }, [
    canSaveDetailInlineEdit,
    currentValues,
    detailInlineDraft,
    selectedPrompt,
    showToast,
    systemPromptField,
    t,
    updatePrompt,
    userPromptField,
  ]);

  const handleDetailInlineEditKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDetailInlineEdit();
      } else if (
        (event.key === "Enter" && event.currentTarget.tagName === "INPUT") ||
        ((event.metaKey || event.ctrlKey) && event.key === "Enter")
      ) {
        event.preventDefault();
        void saveDetailInlineEdit();
      }
    },
    [cancelDetailInlineEdit, saveDetailInlineEdit],
  );

  return {
    cancelDetailInlineEdit,
    canSaveDetailInlineEdit,
    detailDescriptionInputRef,
    detailInlineDraft,
    hasDetailInlineContent,
    detailSystemPromptTextareaRef,
    detailTitleInputRef,
    detailUserPromptTextareaRef,
    handleDetailInlineEditKeyDown,
    isDetailInlineEditing,
    isDetailInlineSaving,
    openDetailInlineEdit,
    openPromptCardInlineTitleEdit,
    saveDetailInlineEdit,
    setDetailInlineDraft,
  };
}
