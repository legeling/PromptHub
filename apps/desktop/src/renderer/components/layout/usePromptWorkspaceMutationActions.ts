import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  CreatePromptDTO,
  Prompt,
  PromptSummary,
  PromptVersion,
  UpdatePromptDTO,
} from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import type { useToast } from "../ui/Toast";

type ShowToast = ReturnType<typeof useToast>["showToast"];
type PromptUpdater = (id: string, data: UpdatePromptDTO) => Promise<void>;

interface DuplicatePromptParams {
  createPrompt: (data: CreatePromptDTO) => Promise<Prompt>;
  getPromptDetail: (id: string) => Promise<Prompt | null>;
  selectPrompt: (id: string | null) => void;
  showToast: ShowToast;
  t: TFunction;
}

export function useDuplicatePromptAction(params: DuplicatePromptParams) {
  return useCallback(
    async (prompt: PromptSummary) => {
      // Duplicate copies the full content; hydrate when the list projection
      // is the source (menu / table row).
      // 复制需要完整内容，列表投影场景先按需加载。
      const detail: Prompt =
        "userPrompt" in prompt && prompt.userPrompt !== undefined
          ? (prompt as Prompt)
          : ((await params.getPromptDetail(prompt.id)) ?? (prompt as Prompt));
      const duplicate = await params.createPrompt(
        createDuplicatePromptInput(detail, params.t),
      );
      params.selectPrompt(duplicate.id);
      params.showToast(
        params.t("prompt.promptDuplicated", "Prompt duplicate created"),
        "success",
      );
    },
    [params],
  );
}

function createDuplicatePromptInput(
  prompt: Prompt,
  t: TFunction,
): CreatePromptDTO {
  return {
    title: `${prompt.title} (${t("prompt.duplicateSuffix", "Duplicate")})`,
    description: prompt.description ?? undefined,
    promptType: prompt.promptType,
    systemPrompt: prompt.systemPrompt ?? undefined,
    systemPromptEn: prompt.systemPromptEn ?? undefined,
    userPrompt: prompt.userPrompt,
    userPromptEn: prompt.userPromptEn ?? undefined,
    variables: prompt.variables,
    tags: prompt.tags,
    folderId: prompt.folderId,
    images: prompt.images,
    videos: prompt.videos,
    source: prompt.source ?? undefined,
    notes: prompt.notes ?? undefined,
  };
}

interface DeletePromptParams {
  deleteConfirm: { isOpen: boolean; prompt: Prompt | null };
  deletePrompt: (id: string) => Promise<void>;
  setDeleteConfirm: Dispatch<
    SetStateAction<{ isOpen: boolean; prompt: Prompt | null }>
  >;
  showToast: ShowToast;
  t: TFunction;
}

export function useDeletePromptActions(params: DeletePromptParams): {
  handleDeletePrompt: (prompt: PromptSummary) => void;
  confirmDelete: () => Promise<void>;
  isDeletingPrompt: boolean;
} {
  const deletionInFlight = useRef(false);
  const [isDeletingPrompt, setIsDeletingPrompt] = useState(false);
  const handleDeletePrompt = useCallback(
    (prompt: PromptSummary) =>
      params.setDeleteConfirm({ isOpen: true, prompt: prompt as Prompt }),
    [params],
  );
  const confirmDelete = useCallback(async () => {
    const prompt = params.deleteConfirm.prompt;
    if (!prompt || deletionInFlight.current) return;
    deletionInFlight.current = true;
    setIsDeletingPrompt(true);
    try {
      await params.deletePrompt(prompt.id);
      params.showToast(params.t("prompt.promptDeleted"), "success");
      params.setDeleteConfirm({ isOpen: false, prompt: null });
    } catch (error) {
      console.error("Failed to delete Prompt:", error);
      params.showToast(params.t("prompt.deleteFailed"), "error");
    } finally {
      deletionInFlight.current = false;
      setIsDeletingPrompt(false);
    }
  }, [params]);
  return { handleDeletePrompt, confirmDelete, isDeletingPrompt };
}

interface AiTestParams {
  canRunSingleAiTest: boolean;
  getPromptDetail: (id: string) => Promise<Prompt | null>;
  setAiTestInitialMode: Dispatch<
    SetStateAction<"single" | "compare" | "image">
  >;
  setAiTestPrompt: Dispatch<SetStateAction<Prompt | null>>;
  setIsAiTestModalOpen: Dispatch<SetStateAction<boolean>>;
  showToast: ShowToast;
  t: TFunction;
}

export function useAiTestModalAction(params: AiTestParams) {
  return useCallback(
    (
      prompt: PromptSummary,
      initialMode: "single" | "compare" | "image" = "single",
    ) => {
      if (!params.canRunSingleAiTest)
        return params.showToast(params.t("toast.configAI"), "error");
      // The AI test dialog renders the full prompt content; hydrate from the
      // list projection before opening.
      // AI 测试弹窗渲染完整内容，打开前按需加载。
      void params.getPromptDetail(prompt.id).then((detail) => {
        if (!detail) return;
        params.setAiTestPrompt(detail);
        params.setAiTestInitialMode(initialMode);
        params.setIsAiTestModalOpen(true);
      });
    },
    [params],
  );
}

interface PromptModalParams {
  getPromptDetail: (id: string) => Promise<Prompt | null>;
  setDetailPrompt: Dispatch<SetStateAction<Prompt | null>>;
  setIsDetailModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsVersionModalOpen: Dispatch<SetStateAction<boolean>>;
  setVersionHistoryPrompt: Dispatch<SetStateAction<Prompt | null>>;
}

export function usePromptModalActions(params: PromptModalParams) {
  const handleViewDetail = useCallback(
    (prompt: PromptSummary) => openPromptDetail(prompt, params),
    [params],
  );
  const handleVersionHistory = useCallback(
    (prompt: PromptSummary) => openPromptVersionHistory(prompt, params),
    [params],
  );
  return { handleViewDetail, handleVersionHistory };
}

function openPromptDetail(prompt: PromptSummary, params: PromptModalParams) {
  // Detail modal renders full content; hydrate from the list projection.
  // 详情弹窗渲染完整内容，按需加载。
  void params.getPromptDetail(prompt.id).then((detail) => {
    if (!detail) return;
    params.setDetailPrompt(detail);
    params.setIsDetailModalOpen(true);
  });
}

function openPromptVersionHistory(
  prompt: PromptSummary,
  params: PromptModalParams,
) {
  void params.getPromptDetail(prompt.id).then((detail) => {
    if (!detail) return;
    params.setVersionHistoryPrompt(detail);
    params.setIsVersionModalOpen(true);
  });
}

interface RestoreVersionParams {
  setIsVersionModalOpen: Dispatch<SetStateAction<boolean>>;
  setVersionHistoryPrompt: Dispatch<SetStateAction<Prompt | null>>;
  showToast: ShowToast;
  t: TFunction;
  updatePrompt: PromptUpdater;
  versionHistoryPrompt: Prompt | null;
}

export function useRestoreVersionAction(params: RestoreVersionParams) {
  return useCallback(
    async (version: PromptVersion) => {
      if (!params.versionHistoryPrompt) return;
      await params.updatePrompt(params.versionHistoryPrompt.id, {
        systemPrompt: version.systemPrompt,
        userPrompt: version.userPrompt,
      });
      params.showToast(params.t("toast.restored"), "success");
      params.setIsVersionModalOpen(false);
      params.setVersionHistoryPrompt(null);
    },
    [params],
  );
}

interface AiResponseParams {
  incrementUsageCount: (id: string) => Promise<void>;
  setAiResponseCache: Dispatch<SetStateAction<Record<string, string>>>;
  updatePrompt: PromptUpdater;
}

export function useAiResponseActions(params: AiResponseParams) {
  const handleAiUsageIncrement = useCallback(
    (id: string) => params.incrementUsageCount(id),
    [params],
  );
  const handleSaveAiResponse = useCallback(
    async (promptId: string, response: string) => {
      await params.updatePrompt(promptId, { lastAiResponse: response });
      params.setAiResponseCache((cache) => ({
        ...cache,
        [promptId]: response,
      }));
    },
    [params],
  );
  return { handleAiUsageIncrement, handleSaveAiResponse };
}
