import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useId,
} from "react";
import { Modal, Button, Input, Textarea, UnsavedChangesDialog } from "../ui";
import { handleMarkdownListKeyDown } from "../ui/Textarea";
import {
  ImageIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  GlobeIcon,
  SparklesIcon,
  Loader2Icon,
  PlayIcon,
  VideoIcon,
  SaveIcon,
  MessageSquareTextIcon,
  XIcon,
} from "lucide-react";

import { usePromptStore } from "../../stores/prompt.store";
import { hasPromptContent } from "@prompthub/shared/utils/prompt-content";
import { useFolderStore } from "../../stores/folder.store";
import {
  IMAGE_DOWNLOAD_MAX_MB,
  MEDIA_SAVE_MAX_MB,
} from "@prompthub/shared/constants";
import { useSettingsStore } from "../../stores/settings.store";
import { resolveScenarioModel } from "../../services/ai-defaults";
import { chatCompletion, rewritePromptDraft } from "../../services/ai";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/Toast";
import type {
  CreatePromptDTO,
  Prompt,
  UpdatePromptDTO,
} from "@prompthub/shared/types";
import {
  buildPromptPayload,
  createPromptFormData,
  getExistingPromptTags,
  mergePromptTagCatalog,
  getLanguageName,
  hasPromptFormChanges,
  isPureEnglish,
  promoteMainEnglishToEnglishVersion,
} from "./prompt-modal-utils";
import { usePromptMediaManager } from "./usePromptMediaManager";
import { usePromptNativeFullscreen } from "./usePromptNativeFullscreen";
import { resolveLocalVideoSrc } from "../../utils/media-url";
import { PromptReferenceImages } from "./PromptReferenceImages";
import {
  EditPromptMoreSettings,
  PromptEditorField,
} from "./EditPromptSections";
import { usePromptMarkdownPreview } from "./usePromptMarkdownPreview";

/* Existing code */
// Add initialData to props
interface EditPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt?: Prompt | null;
  initialData?: Partial<Prompt>;
}

export function EditPromptModal({
  isOpen,
  onClose,
  prompt,
  initialData,
}: EditPromptModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const renderMarkdownPreview = usePromptMarkdownPreview();
  const titleInputId = useId();
  const systemPromptInputId = useId();
  const systemPromptEnInputId = useId();
  const userPromptInputId = useId();
  const userPromptEnInputId = useId();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const prompts = usePromptStore((state) => state.prompts);
  const promptTagCatalog = useSettingsStore((state) => state.promptTagCatalog);
  const folders = useFolderStore((state) => state.folders);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptType, setPromptType] = useState<"text" | "image" | "video">(
    "text",
  );
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptEn, setSystemPromptEn] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [userPromptEn, setUserPromptEn] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriteSummary, setRewriteSummary] = useState<string | null>(null);
  const [rewriteSnapshot, setRewriteSnapshot] = useState<null | {
    description: string;
    systemPrompt: string;
    userPrompt: string;
    notes: string;
  }>(null);
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  // 属性面板折叠状态
  const [showAttributes, setShowAttributes] = useState(false);
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sourceSuggestionsCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const modalSessionRef = useRef(0);

  // Only subscribe to the fields we need, not the entire store
  // 只订阅需要的字段，而不是整个 store
  const sourceHistory = useSettingsStore((state) => state.sourceHistory);
  const addSourceHistory = useSettingsStore((state) => state.addSourceHistory);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore(
    (state) => state.scenarioModelDefaults,
  );
  const modelRouteDefaults = useSettingsStore(
    (state) => state.modelRouteDefaults,
  );
  const translationModel = useMemo(() => {
    return resolveScenarioModel(
      aiModels,
      scenarioModelDefaults,
      "translation",
      "chat",
      undefined,
      modelRouteDefaults,
    );
  }, [aiModels, modelRouteDefaults, scenarioModelDefaults]);
  const canTranslate = !!translationModel;
  const rewriteModel = translationModel;
  const canRewrite = !!rewriteModel;

  const clearSourceSuggestionsCloseTimer = useCallback(() => {
    if (sourceSuggestionsCloseTimerRef.current) {
      clearTimeout(sourceSuggestionsCloseTimerRef.current);
      sourceSuggestionsCloseTimerRef.current = null;
    }
  }, []);

  const handleSourceFocus = useCallback(() => {
    clearSourceSuggestionsCloseTimer();
    setShowSourceSuggestions(true);
  }, [clearSourceSuggestionsCloseTimer]);

  const handleSourceBlur = useCallback(() => {
    clearSourceSuggestionsCloseTimer();
    sourceSuggestionsCloseTimerRef.current = setTimeout(() => {
      setShowSourceSuggestions(false);
      sourceSuggestionsCloseTimerRef.current = null;
    }, 150);
  }, [clearSourceSuggestionsCloseTimer]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
      modalSessionRef.current += 1;
      clearSourceSuggestionsCloseTimer();
    };
  }, [clearSourceSuggestionsCloseTimer]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    modalSessionRef.current += 1;
  }, [isOpen, prompt?.id]);

  const canApplyAsyncResult = useCallback(
    (session: number) =>
      isMountedRef.current &&
      isOpenRef.current &&
      modalSessionRef.current === session,
    [],
  );

  // Detect if main content is pure English (strict: no CJK allowed)
  // 检测主内容是否为纯英文（严格：不允许中日韩字符）
  const isMainContentEnglish = useMemo(() => {
    const combined = [systemPrompt, userPrompt].filter(Boolean).join(" ");
    return isPureEnglish(combined);
  }, [systemPrompt, userPrompt]);

  const {
    imageUrl,
    images,
    isDownloadingImage,
    setImageUrl,
    setShowUrlInput,
    showUrlInput,
    videos,
    handleRemoveImage,
    handleRemoveVideo,
    handleSelectImage,
    handleSelectVideo,
    handleMediaDragLeave,
    handleMediaDragOver,
    handleMediaDrop,
    handleUrlUpload,
    isDraggingMedia,
  } = usePromptMediaManager({
    isOpen,
    initialImages: prompt?.images || initialData?.images || [],
    initialVideos: prompt?.videos || initialData?.videos || [],
    translate: (key, fallback) => t(key, fallback),
    showToast,
  });

  const {
    activeFullscreenField,
    fullscreenTitle,
    fullscreenValue,
    isNativeFullscreen,
    enterNativeFullscreen,
    exitNativeFullscreen,
    updateFullscreenValue,
  } = usePromptNativeFullscreen({
    getFieldValue: (field) => {
      switch (field) {
        case "system":
          return systemPrompt;
        case "systemEn":
          return systemPromptEn;
        case "user":
          return userPrompt;
        case "userEn":
          return userPromptEn;
      }
    },
    setFieldValue: (field, value) => {
      switch (field) {
        case "system":
          setSystemPrompt(value);
          break;
        case "systemEn":
          setSystemPromptEn(value);
          break;
        case "user":
          setUserPrompt(value);
          break;
        case "userEn":
          setUserPromptEn(value);
          break;
      }
    },
    getFieldTitle: (field) => {
      switch (field) {
        case "system":
          return t("prompt.systemPromptOptional");
        case "systemEn":
          return `${t("prompt.systemPromptOptional")} (EN)`;
        case "user":
          return t("prompt.userPromptLabel");
        case "userEn":
          return `${t("prompt.userPromptLabel")} (EN)`;
      }
    },
  });

  const formState = useMemo(
    () => ({
      title,
      description,
      promptType,
      systemPrompt,
      systemPromptEn,
      userPrompt,
      userPromptEn,
      tags,
      folderId,
      images,
      videos,
      source,
      notes,
    }),
    [
      title,
      description,
      promptType,
      systemPrompt,
      systemPromptEn,
      userPrompt,
      userPromptEn,
      tags,
      folderId,
      images,
      videos,
      source,
      notes,
    ],
  );

  // 检查是否有未保存的更改
  const hasUnsavedChanges = useCallback(() => {
    return hasPromptFormChanges(formState, prompt || initialData);
  }, [formState, initialData, prompt]);

  // 处理关闭请求
  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // 处理保存并关闭
  const handleSaveAndClose = async () => {
    await handleSubmit();
    setShowUnsavedDialog(false);
  };

  // 处理放弃更改
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    onClose();
  };

  // 获取所有已存在的标签
  const existingTags = useMemo(
    () => mergePromptTagCatalog(prompts, promptTagCatalog),
    [promptTagCatalog, prompts],
  );

  const translateToEnglishDisabledReason = !canTranslate
    ? t("toast.configAI", "请先在设置中配置 AI 模型")
    : !systemPrompt && !userPrompt
      ? t("prompt.noContentToTranslate", "没有内容可翻译")
      : isMainContentEnglish
        ? t("prompt.alreadyEnglish", "内容已是英文")
        : "";

  const translateFromEnglishDisabledReason = !canTranslate
    ? t("toast.configAI", "请先在设置中配置 AI 模型")
    : !systemPromptEn && !userPromptEn && !isMainContentEnglish
      ? t("prompt.noEnglishContentToTranslate", "没有英文内容可翻译")
      : "";
  const translateToEnglishLabel = t("prompt.translateToEnglish", "翻译为英文");
  const translateFromEnglishLabel = isMainContentEnglish
    ? t("prompt.translateDetectedEnglish", "检测到英文内容，翻译为当前语言")
    : t("prompt.translateFromEnglish", "从英文翻译到当前语言");

  // 当 prompt 变化时更新表单
  useEffect(() => {
    if (isOpen) {
      const form = createPromptFormData(prompt || initialData, {
        promptType: "text",
      });
      setTitle(form.title);
      setDescription(form.description);
      setPromptType(form.promptType);
      setSystemPrompt(form.systemPrompt);
      setSystemPromptEn(form.systemPromptEn);
      setUserPrompt(form.userPrompt);
      setUserPromptEn(form.userPromptEn);
      setTags(form.tags);
      setFolderId(form.folderId);
      setSource(form.source);
      setNotes(form.notes);
      setShowEnglishVersion(!!(form.systemPromptEn || form.userPromptEn));
      setRewriteInstruction("");
      setRewriteSummary(null);
      setRewriteSnapshot(null);
    }
  }, [prompt, initialData, isOpen]);

  const handleSubmit = async () => {
    if (!title.trim() || !hasPromptContent(formState)) return;

    try {
      const promptData = buildPromptPayload(formState, {
        preserveEmptyOptionalFields: true,
      });

      if (prompt) {
        await updatePrompt(prompt.id, promptData as UpdatePromptDTO);
      } else {
        await createPrompt(promptData as CreatePromptDTO);
      }

      // 保存来源到历史 / Save source to history
      if (source.trim()) {
        addSourceHistory(source.trim());
      }
      showToast(t("toast.saved"), "success", useSettingsStore.getState().showSaveNotification);
      onClose();
    } catch (error) {
      console.error("Failed to save prompt:", error);
      showToast(t("common.error"), "error");
    }
  };

  const handleApplyRewriteTemplate = (template: string) => {
    setRewriteInstruction(template);
  };

  const handleUndoRewrite = () => {
    if (!rewriteSnapshot) {
      return;
    }

    setDescription(rewriteSnapshot.description);
    setSystemPrompt(rewriteSnapshot.systemPrompt);
    setUserPrompt(rewriteSnapshot.userPrompt);
    setNotes(rewriteSnapshot.notes);
    setRewriteSnapshot(null);
    setRewriteSummary(null);
    showToast(t("prompt.aiRewriteUndoDone"), "success");
  };

  const handleRewritePrompt = async () => {
    if (!canRewrite || !rewriteModel) {
      showToast(t("toast.configAI"), "error");
      return;
    }

    if (!rewriteInstruction.trim()) {
      showToast(t("prompt.aiRewriteNeedsInstruction"), "error");
      return;
    }

    if (!hasPromptContent(formState)) {
      showToast(t("prompt.aiRewriteNeedsContent"), "error");
      return;
    }

    const rewriteSession = modalSessionRef.current;
    setIsRewritingPrompt(true);
    try {
      const previous = {
        description,
        systemPrompt,
        userPrompt,
        notes,
      };

      const rewritten = await rewritePromptDraft(
        {
          provider: rewriteModel.provider,
          apiProtocol: rewriteModel.apiProtocol,
          apiKey: rewriteModel.apiKey,
          apiUrl: rewriteModel.apiUrl,
          model: rewriteModel.model,
        },
        {
          promptType,
          title,
          description,
          systemPrompt,
          userPrompt,
          notes,
          instruction: rewriteInstruction,
        },
      );

      if (!canApplyAsyncResult(rewriteSession)) {
        return;
      }

      setRewriteSnapshot(previous);

      if (rewritten.description !== undefined) {
        setDescription(rewritten.description);
      }
      if (rewritten.systemPrompt !== undefined) {
        setSystemPrompt(rewritten.systemPrompt);
      }
      if (rewritten.userPrompt !== undefined) {
        setUserPrompt(rewritten.userPrompt);
      }
      if (rewritten.notes !== undefined) {
        setNotes(rewritten.notes);
      }

      setRewriteSummary(
        rewritten.summary || t("prompt.aiRewriteSummaryDefault"),
      );
      showToast(t("prompt.aiRewriteDone"), "success");
    } catch (error) {
      if (!canApplyAsyncResult(rewriteSession)) {
        return;
      }
      showToast(
        error instanceof Error ? error.message : t("prompt.aiRewriteFailed"),
        "error",
      );
    } finally {
      if (canApplyAsyncResult(rewriteSession)) {
        setIsRewritingPrompt(false);
      }
    }
  };

  const handleTranslateToEnglish = async () => {
    if (!canTranslate || !translationModel) {
      showToast(t("toast.configAI"), "error");
      return;
    }
    if (!systemPrompt && !userPrompt) {
      showToast(t("prompt.noContentToTranslate"), "error");
      return;
    }

    const translateSession = modalSessionRef.current;
    setIsTranslating(true);
    try {
      const systemInstruction =
        "You are a professional prompt translator. Translate the provided System Prompt and User Prompt into natural, accurate English.\n" +
        "- Keep original meaning, tone, and intent.\n" +
        "- Preserve ALL formatting, Markdown, lists, and code blocks.\n" +
        "- Do NOT translate or alter placeholders like {{variable}}.\n" +
        "- Do NOT add explanations.\n" +
        'Return STRICT JSON ONLY: {"systemPromptEn":"...","userPromptEn":"..."}. If systemPrompt is empty, use empty string.';

      const contentToTranslate = JSON.stringify({
        systemPrompt: systemPrompt || "",
        userPrompt: userPrompt || "",
      });

      const result = await chatCompletion(
        {
          provider: translationModel.provider,
          apiProtocol: translationModel.apiProtocol,
          apiKey: translationModel.apiKey,
          apiUrl: translationModel.apiUrl,
          model: translationModel.model,
        },
        [
          { role: "system", content: systemInstruction },
          { role: "user", content: contentToTranslate },
        ],
        { temperature: 0.3, maxTokens: 8192 },
      );

      if (!canApplyAsyncResult(translateSession)) {
        return;
      }

      if (!result.content) {
        throw new Error(t("common.error"));
      }

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(t("common.error"));
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText) as {
        systemPromptEn?: string;
        userPromptEn?: string;
      };

      if (typeof parsed.userPromptEn !== "string") {
        throw new Error(t("common.error"));
      }

      if (parsed.systemPromptEn) {
        setSystemPromptEn(parsed.systemPromptEn);
      }
      if (parsed.userPromptEn) {
        setUserPromptEn(parsed.userPromptEn);
      }

      setShowEnglishVersion(true);
      showToast(t("prompt.englishGenerated"), "success");
    } catch (e) {
      if (!canApplyAsyncResult(translateSession)) {
        return;
      }
      showToast(e instanceof Error ? e.message : t("common.error"), "error");
    } finally {
      if (canApplyAsyncResult(translateSession)) {
        setIsTranslating(false);
      }
    }
  };

  // 从英文翻译到当前语言
  // When main content is English (auto-detected), use it as the English source
  // 当主内容被检测为纯英文时，自动将其作为英文源进行翻译
  const handleTranslateFromEnglish = async () => {
    if (!canTranslate || !translationModel) {
      showToast(t("toast.configAI"), "error");
      return;
    }

    // Determine English source: use En fields if available, otherwise use main content if it's English
    const englishSystem =
      systemPromptEn || (isMainContentEnglish ? systemPrompt : "");
    const englishUser =
      userPromptEn || (isMainContentEnglish ? userPrompt : "");

    if (!englishSystem && !englishUser) {
      showToast(t("prompt.noEnglishContentToTranslate"), "error");
      return;
    }

    const translateSession = modalSessionRef.current;
    setIsTranslating(true);
    try {
      // If main content is English and En fields are empty, copy main → En fields first
      if (isMainContentEnglish && !systemPromptEn && !userPromptEn) {
        if (systemPrompt) setSystemPromptEn(systemPrompt);
        if (userPrompt) setUserPromptEn(userPrompt);
      }

      const targetLang = getLanguageName(i18n.language);
      const instruction =
        `You are a professional prompt translator. Translate the provided English System Prompt and User Prompt into natural, accurate ${targetLang}.\n` +
        "- Keep original meaning, tone, and intent.\n" +
        "- Preserve ALL formatting, Markdown, lists, and code blocks.\n" +
        "- Do NOT translate or alter placeholders like {{variable}}.\n" +
        "- Do NOT add explanations.\n" +
        'Return STRICT JSON ONLY: {"systemPrompt":"...","userPrompt":"..."}. If systemPromptEn is empty, use empty string for systemPrompt.';

      const contentToTranslate = JSON.stringify({
        systemPromptEn: englishSystem,
        userPromptEn: englishUser,
      });

      const result = await chatCompletion(
        {
          provider: translationModel.provider,
          apiProtocol: translationModel.apiProtocol,
          apiKey: translationModel.apiKey,
          apiUrl: translationModel.apiUrl,
          model: translationModel.model,
        },
        [
          { role: "system", content: instruction },
          { role: "user", content: contentToTranslate },
        ],
        { temperature: 0.3, maxTokens: 8192 },
      );

      if (!canApplyAsyncResult(translateSession)) {
        return;
      }

      if (!result.content) {
        throw new Error(t("common.error") || "翻译失败");
      }

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(t("common.error") || "翻译结果解析失败");
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText) as {
        systemPrompt?: string;
        userPrompt?: string;
      };

      if (typeof parsed.userPrompt !== "string") {
        throw new Error(t("common.error") || "翻译结果解析失败");
      }

      if (parsed.systemPrompt !== undefined) {
        setSystemPrompt(parsed.systemPrompt);
      }
      if (parsed.userPrompt) {
        setUserPrompt(parsed.userPrompt);
      }

      setShowEnglishVersion(true);
      showToast(
        t("prompt.localizedGenerated", "已生成当前语言版本"),
        "success",
      );
    } catch (e) {
      if (!canApplyAsyncResult(translateSession)) {
        return;
      }
      showToast(
        e instanceof Error
          ? e.message
          : t("common.error") || "Translation failed",
        "error",
      );
    } finally {
      if (canApplyAsyncResult(translateSession)) {
        setIsTranslating(false);
      }
    }
  };

  const handleToggleEnglishVersion = () => {
    if (showEnglishVersion) {
      setShowEnglishVersion(false);
      return;
    }

    const promoted = promoteMainEnglishToEnglishVersion({
      systemPrompt,
      systemPromptEn,
      userPrompt,
      userPromptEn,
    });

    if (
      promoted.systemPrompt !== systemPrompt ||
      promoted.userPrompt !== userPrompt ||
      promoted.systemPromptEn !== systemPromptEn ||
      promoted.userPromptEn !== userPromptEn
    ) {
      setSystemPrompt(promoted.systemPrompt);
      setUserPrompt(promoted.userPrompt);
      setSystemPromptEn(promoted.systemPromptEn);
      setUserPromptEn(promoted.userPromptEn);
    }

    setShowEnglishVersion(true);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  // 监听快捷键 (Cmd+S / Cmd+Enter 保存，Cmd/Shift+S 全屏切换)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save: Cmd+S or Cmd+Enter
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "s" || e.key === "S" || e.key === "Enter")
      ) {
        e.preventDefault();
        handleSubmit();
      }
      // Fullscreen: Cmd+Shift+F or Cmd+Shift+S (flexible)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "f" || e.key === "F")
      ) {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      // Exit native fullscreen with Escape
      if (e.key === "Escape" && isNativeFullscreen) {
        exitNativeFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSubmit, isNativeFullscreen, exitNativeFullscreen]);

  const renderReferenceMediaSection = () => (
    <div
      className={`space-y-2 rounded-xl border border-dashed p-3 transition-colors ${
        isDraggingMedia ? "border-primary bg-primary/5" : "border-transparent"
      }`}
      onDragOver={handleMediaDragOver}
      onDragLeave={handleMediaDragLeave}
      onDrop={handleMediaDrop}
    >
      <label className="block text-sm font-medium text-foreground">
        {t("prompt.referenceMedia")}
      </label>
      {/* v0.6.3 #64: state the real limits next to the upload affordance.
          上传入口旁直接写明真实限制（与主进程强制值同源）。 */}
      <p className="text-xs text-muted-foreground">
        {t("prompt.mediaLimitHint", {
          local: MEDIA_SAVE_MAX_MB,
          remote: IMAGE_DOWNLOAD_MAX_MB,
        })}
      </p>
      <div className="flex flex-wrap gap-3">
        <PromptReferenceImages images={images} onRemove={handleRemoveImage} />
        {videos.map((video, index) => (
          <div
            key={`vid-${index}`}
            className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border bg-black"
          >
            <video
              src={resolveLocalVideoSrc(video)}
              className="w-full h-full object-cover opacity-70"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <PlayIcon className="w-6 h-6 text-white/80" aria-hidden="true" />
            </div>
            <button
              type="button"
              aria-label={t("prompt.removeReferenceVideo", {
                defaultValue: "Remove reference video {{index}}",
                index: index + 1,
              })}
              onClick={() => handleRemoveVideo(index)}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <XIcon className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleSelectImage}
          className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
        >
          <ImageIcon className="w-6 h-6 mb-1" aria-hidden="true" />
          <span className="text-[10px] leading-tight">
            {t("prompt.uploadImage", "Upload/Add Link")}
          </span>
        </button>
        <button
          type="button"
          onClick={handleSelectVideo}
          className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
        >
          <VideoIcon className="w-6 h-6 mb-1" aria-hidden="true" />
          <span className="text-[10px] leading-tight">
            {t("prompt.uploadVideo", "Upload Video")}
          </span>
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        {t("prompt.mediaUploadHint")}
      </p>
      {!showUrlInput ? (
        <button
          type="button"
          onClick={() => setShowUrlInput(true)}
          className="text-xs text-primary hover:underline"
        >
          {t("prompt.addImageByUrl", "Add by URL")}
        </button>
      ) : (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder={t("prompt.enterImageUrl")}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === "Enter" && imageUrl && !isDownloadingImage) {
                handleUrlUpload(imageUrl);
                setImageUrl("");
                setShowUrlInput(false);
              }
              if (e.key === "Escape") {
                setShowUrlInput(false);
                setImageUrl("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (imageUrl && !isDownloadingImage) {
                handleUrlUpload(imageUrl);
                setImageUrl("");
                setShowUrlInput(false);
              }
            }}
            disabled={isDownloadingImage || !imageUrl}
            className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloadingImage
              ? t("common.loading", "Loading...")
              : t("common.confirm", "Confirm")}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowUrlInput(false);
              setImageUrl("");
            }}
            disabled={isDownloadingImage}
            className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      )}
    </div>
  );

  // 全屏编辑器的 Markdown 列表续行处理
  const handleFullscreenKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const currentValue = fullscreenValue;
      const handled = handleMarkdownListKeyDown(
        e,
        currentValue,
        (newValue, cursorPos) => {
          updateFullscreenValue(newValue);
          // Set cursor position after React updates the DOM
          requestAnimationFrame(() => {
            if (fullscreenTextareaRef.current) {
              fullscreenTextareaRef.current.selectionStart = cursorPos;
              fullscreenTextareaRef.current.selectionEnd = cursorPos;
            }
          });
        },
      );
      // handled is used implicitly by preventDefault in handleMarkdownListKeyDown
    },
    [fullscreenValue, updateFullscreenValue],
  );

  // 如果是真正的全屏模式，渲染全屏编辑器（左右分屏：编辑 + 预览）
  if (isNativeFullscreen && activeFullscreenField) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {/* 全屏编辑器头部 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{fullscreenTitle}</h2>
            <span className="text-sm text-muted-foreground">
              {t("common.markdownSupported")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" aria-hidden="true" />
              {t("common.exitFullscreen", "Exit Fullscreen")}
            </button>
            <Button variant="primary" onClick={exitNativeFullscreen}>
              {t("common.done", "Done")}
            </Button>
          </div>
        </div>
        {/* 分屏区域：左边编辑 + 右边预览 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左边：编辑区 */}
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t("prompt.edit", "编辑")}
            </div>
            <textarea
              ref={fullscreenTextareaRef}
              className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
              value={fullscreenValue}
              onChange={(e) => updateFullscreenValue(e.target.value)}
              onKeyDown={handleFullscreenKeyDown}
              autoFocus
              placeholder={t("prompt.typeYourPrompt")}
            />
          </div>
          {/* 右边：实时预览 */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t("prompt.preview", "预览")}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none markdown-content">
                {fullscreenValue ? (
                  renderMarkdownPreview(fullscreenValue)
                ) : (
                  <div className="text-muted-foreground text-sm italic">
                    {t("prompt.noContent", "暂无内容")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseRequest}
      title={prompt ? t("prompt.editPrompt") : t("prompt.createPrompt")}
      size={isFullscreen ? "fullscreen" : "xl"}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            aria-label={
              isFullscreen
                ? t("prompt.exitFullscreen", "Exit Fullscreen")
                : t("prompt.fullscreen", "Fullscreen")
            }
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={
              isFullscreen
                ? t("prompt.exitFullscreen", "Exit Fullscreen")
                : t("prompt.fullscreen", "Fullscreen")
            }
          >
            {isFullscreen ? (
              <Minimize2Icon className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2Icon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || !hasPromptContent(formState)}
          >
            <SaveIcon className="w-4 h-4" aria-hidden="true" />
            {prompt ? t("prompt.save") : t("prompt.create")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 标题 */}
        <div className="space-y-1.5">
          <label
            htmlFor={titleInputId}
            className="block text-sm font-medium text-foreground"
          >
            {t("prompt.titleLabel")}
            <span className="ml-1 text-destructive">*</span>
          </label>
          <input
            id={titleInputId}
            type="text"
            placeholder={t("prompt.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-muted/50 border-0 text-xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base"
          />
        </div>

        <div className="space-y-4 border border-border/50 rounded-xl bg-muted/20 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">
              {t("prompt.basicInfo", "Basic Info")}
            </h3>
          </div>

          <Input
            label={t("prompt.descriptionOptional")}
            placeholder={t("prompt.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              {t("prompt.type", "Prompt Type")}
            </label>
            <div className="flex gap-2">
              {(["text", "image"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={promptType === type}
                  onClick={() => setPromptType(type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    promptType === type
                      ? "bg-primary text-white shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "text" && (
                    <MessageSquareTextIcon
                      className="w-4 h-4"
                      aria-hidden="true"
                    />
                  )}
                  {type === "image" && (
                    <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  )}
                  {type === "text" && t("prompt.typeText", "Text")}
                  {type === "image" && t("prompt.typeImage", "Image")}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {promptType === "text" &&
                t("prompt.typeTextDesc", "Test with chat models (e.g. GPT-4)")}
              {promptType === "image" &&
                t(
                  "prompt.typeImageDesc",
                  "Test with image models (e.g. DALL-E)",
                )}
            </p>
          </div>

          {promptType === "image" && renderReferenceMediaSection()}
        </div>

        <div className="space-y-3 border border-border/50 rounded-xl bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <SparklesIcon
                  className="w-4 h-4 text-primary"
                  aria-hidden="true"
                />
                {t("prompt.aiRewriteTitle")}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("prompt.aiRewriteHint")}
              </p>
            </div>
            {rewriteSnapshot ? (
              <Button variant="secondary" size="sm" onClick={handleUndoRewrite}>
                {t("prompt.aiRewriteUndo")}
              </Button>
            ) : null}
          </div>

          {rewriteSummary ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
              {rewriteSummary}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {[
              t("prompt.aiRewriteTemplateClarity"),
              t("prompt.aiRewriteTemplateStructure"),
              promptType === "image"
                ? t("prompt.aiRewriteTemplateImage")
                : t("prompt.aiRewriteTemplateConstraints"),
            ].map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => handleApplyRewriteTemplate(template)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {template}
              </button>
            ))}
          </div>

          <Textarea
            aria-label={t("prompt.aiRewriteTitle")}
            value={rewriteInstruction}
            onChange={(event) => setRewriteInstruction(event.target.value)}
            placeholder={t("prompt.aiRewritePlaceholder")}
            className="min-h-[96px]"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {canRewrite
                ? t("prompt.aiRewriteReady")
                : t("prompt.aiRewriteNeedsModel")}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRewritePrompt}
              disabled={
                isRewritingPrompt || !canRewrite || !rewriteInstruction.trim()
              }
            >
              {isRewritingPrompt ? (
                <Loader2Icon
                  className="w-4 h-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SparklesIcon className="w-4 h-4" aria-hidden="true" />
              )}
              {isRewritingPrompt
                ? t("prompt.aiRewriteWorking")
                : t("prompt.aiRewriteAction")}
            </Button>
          </div>
        </div>

        <EditPromptMoreSettings
          existingTags={existingTags}
          folderId={folderId}
          folders={folders}
          mediaCount={images.length + videos.length}
          notes={notes}
          onAddTag={handleAddTag}
          onNotesChange={setNotes}
          onRemoveTag={handleRemoveTag}
          onSourceBlur={handleSourceBlur}
          onSourceFocus={handleSourceFocus}
          onTagKeyDown={handleTagKeyDown}
          promptType={promptType}
          referenceMedia={null}
          setFolderId={setFolderId}
          setShowAttributes={setShowAttributes}
          setShowSourceSuggestions={setShowSourceSuggestions}
          setSource={setSource}
          setTagInput={setTagInput}
          setTags={setTags}
          showAttributes={showAttributes}
          showSourceSuggestions={showSourceSuggestions}
          source={source}
          sourceHistory={sourceHistory}
          t={t}
          tagInput={tagInput}
          tags={tags}
        />

        {/* 英文版本切换 */}
        {/* 英文版本切换 / Toggle English Version (Hide if language is English) */}
        {!i18n.language.startsWith("en") && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border">
            <div className="flex items-center gap-2">
              <GlobeIcon className="w-4 h-4 text-primary" aria-hidden="true" />
              <div>
                <div className="text-sm font-medium">
                  {t("prompt.bilingualHint")}
                </div>
              </div>
            </div>
            {!i18n.language.startsWith("en") && (
              <div className="flex items-center gap-2">
                {/* 当前语言 → 英文 (disabled when content is already English) */}
                <button
                  type="button"
                  onClick={handleTranslateToEnglish}
                  disabled={
                    isTranslating ||
                    !canTranslate ||
                    (!systemPrompt && !userPrompt) ||
                    isMainContentEnglish
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isTranslating ||
                    !canTranslate ||
                    (!systemPrompt && !userPrompt) ||
                    isMainContentEnglish
                      ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                  title={
                    translateToEnglishDisabledReason || translateToEnglishLabel
                  }
                  aria-label={translateToEnglishLabel}
                >
                  {isTranslating ? (
                    <Loader2Icon
                      className="w-3.5 h-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <SparklesIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  → EN
                </button>
                {/* 英文 → 当前语言 (enabled when main content is English even if En fields are empty) */}
                <button
                  type="button"
                  onClick={handleTranslateFromEnglish}
                  disabled={
                    isTranslating ||
                    !canTranslate ||
                    (!systemPromptEn && !userPromptEn && !isMainContentEnglish)
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isTranslating ||
                    !canTranslate ||
                    (!systemPromptEn && !userPromptEn && !isMainContentEnglish)
                      ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                  title={
                    translateFromEnglishDisabledReason ||
                    translateFromEnglishLabel
                  }
                  aria-label={translateFromEnglishLabel}
                >
                  {isTranslating ? (
                    <Loader2Icon
                      className="w-3.5 h-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <SparklesIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  EN →
                </button>
                <button
                  type="button"
                  aria-pressed={showEnglishVersion}
                  onClick={handleToggleEnglishVersion}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    showEnglishVersion
                      ? "bg-primary text-white"
                      : "bg-muted hover:bg-accent text-foreground"
                  }`}
                >
                  {showEnglishVersion ? (
                    <>
                      <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      {t("prompt.removeEnglishVersion")}
                    </>
                  ) : isMainContentEnglish ? (
                    <>
                      <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      {t("prompt.addLocalizedVersion", "添加本地语言版本")}
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      {t("prompt.addEnglishVersion")}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <PromptEditorField
          englishId={systemPromptEnInputId}
          englishLabel={t("prompt.systemPromptEn")}
          englishPlaceholder="Enter English System Prompt..."
          englishValue={systemPromptEn}
          id={systemPromptInputId}
          label={t("prompt.systemPromptOptional")}
          minHeight={200}
          onChange={(event) => setSystemPrompt(event.target.value)}
          onEnglishChange={(event) => setSystemPromptEn(event.target.value)}
          onEnglishFullscreen={() => enterNativeFullscreen("systemEn")}
          onFullscreen={() => enterNativeFullscreen("system")}
          placeholder={t("prompt.systemPromptPlaceholder")}
          renderPreview={renderMarkdownPreview}
          showEnglishVersion={showEnglishVersion}
          t={t}
          value={systemPrompt}
        />

        <PromptEditorField
          englishId={userPromptEnInputId}
          englishLabel={t("prompt.userPromptEn")}
          englishPlaceholder="Enter English User Prompt..."
          englishValue={userPromptEn}
          id={userPromptInputId}
          label={t("prompt.userPromptLabel")}
          minHeight={280}
          onChange={(event) => setUserPrompt(event.target.value)}
          onEnglishChange={(event) => setUserPromptEn(event.target.value)}
          onEnglishFullscreen={() => enterNativeFullscreen("userEn")}
          onFullscreen={() => enterNativeFullscreen("user")}
          placeholder={t("prompt.userPromptPlaceholder")}
          renderPreview={renderMarkdownPreview}
          showEnglishVersion={showEnglishVersion}
          t={t}
          value={userPrompt}
        />
        {promptType !== "image" && renderReferenceMediaSection()}
      </div>

      {/* 未保存更改提示弹窗 */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={handleSaveAndClose}
        onDiscard={handleDiscardChanges}
      />
    </Modal>
  );
}
