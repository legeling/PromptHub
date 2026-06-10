import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CopyIcon,
  ImageIcon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  UploadIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react";
import { chatCompletion } from "../../services/ai";
import { useFolderStore } from "../../stores/folder.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { resolveLocalImageSrc } from "../../utils/media-url";
import { renderFolderIcon } from "../layout/folderIconHelper";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { useToast } from "../ui/Toast";
import type { Variable } from "@prompthub/shared/types";
import {
  buildImagePromptReverseInstruction,
  IMAGE_PROMPT_REVERSE_SYSTEM_PROMPT,
  resolveImagePromptReverseConfig,
} from "./image-prompt-reverse-utils";
import {
  type QuickAddGeneratedDraft,
  parseQuickAddGeneratedDraft,
} from "./quick-add-utils";
import { copyTextToClipboard } from "./prompt-copy-utils";
import { parsePromptVariables } from "./prompt-modal-utils";

interface ReverseImageInput {
  name: string;
  mimeType: string;
  base64: string;
  fileName: string;
  previewUrl: string;
}

const MAX_IMAGE_PROMPT_REVERSE_IMAGE_BYTES = 20 * 1024 * 1024;

interface ImagePromptReverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    userPrompt: string;
    systemPrompt?: string;
    description?: string;
    folderId?: string;
    promptType?: "text" | "image";
    tags?: string[];
    images?: string[];
    variables?: Variable[];
  }) => Promise<any>;
  defaultFolderId?: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function getImageMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}

function formatImageSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}

function extractPromptVariables(promptText: string): Variable[] {
  return parsePromptVariables(promptText)
    .map((variable): Variable => ({
      name: variable.name,
      type: "text",
      defaultValue: variable.defaultValue || undefined,
      required: false,
    }))
    .slice(0, 8);
}

export function ImagePromptReverseModal({
  isOpen,
  onClose,
  onCreate,
  defaultFolderId,
}: ImagePromptReverseModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore(
    (state) => state.scenarioModelDefaults,
  );
  const modelRouteDefaults = useSettingsStore((state) => state.modelRouteDefaults);
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiProtocol = useSettingsStore((state) => state.aiApiProtocol);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const attachReferenceImage = useSettingsStore(
    (state) => state.imageReverseAttachReferenceByDefault,
  );
  const setAttachReferenceImage = useSettingsStore(
    (state) => state.setImageReverseAttachReferenceByDefault,
  );

  const [guidance, setGuidance] = useState("");
  const [imageInput, setImageInput] = useState<ReverseImageInput | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(
    undefined,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [draft, setDraft] = useState<QuickAddGeneratedDraft | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const modalSessionRef = useRef(0);
  const isCreatingRef = useRef(false);

  const reverseConfig = useMemo(
    () =>
      resolveImagePromptReverseConfig({
        aiModels,
        scenarioModelDefaults,
        modelRouteDefaults,
        aiProvider,
        aiApiProtocol,
        aiApiKey,
        aiApiUrl,
        aiModel,
      }),
    [
      aiApiKey,
      aiApiProtocol,
      aiApiUrl,
      aiModel,
      aiModels,
      aiProvider,
      modelRouteDefaults,
      scenarioModelDefaults,
    ],
  );

  const setReverseImage = useCallback((nextImage: ReverseImageInput | null) => {
    setImageInput(nextImage);
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
    modalSessionRef.current += 1;
  }, [isOpen]);

  const canApplyAsyncResult = useCallback(
    (sessionId = modalSessionRef.current) =>
      isMountedRef.current && isOpenRef.current && sessionId === modalSessionRef.current,
    [],
  );

  const hasUnsavedChanges = useCallback(
    () => guidance.trim() !== "" || imageInput !== null || draft !== null,
    [draft, guidance, imageInput],
  );

  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setGuidance("");
    setSelectedFolderId(defaultFolderId);
    setIsSubmitting(false);
    setIsCreating(false);
    isCreatingRef.current = false;
    setIsDraggingImage(false);
    setDraft(null);
    setReverseImage(null);
  }, [defaultFolderId, isOpen, setReverseImage]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setIsSubmitting(false);
    setIsCreating(false);
    isCreatingRef.current = false;
    setIsDraggingImage(false);
    setDraft(null);
    setShowUnsavedDialog(false);
    setReverseImage(null);
  }, [isOpen, setReverseImage]);

  useEffect(() => {
    return () => {
      if (
        typeof imageInput?.previewUrl === "string" &&
        imageInput.previewUrl.startsWith("blob:")
      ) {
        URL.revokeObjectURL(imageInput.previewUrl);
      }
    };
  }, [imageInput]);

  const handleImageFile = useCallback(
    async (file: File) => {
      const imageSession = modalSessionRef.current;

      if (!file.type.startsWith("image/")) {
        showToast(t("imageReverse.unsupported", "Only image files are supported."), "error");
        return;
      }

      if (file.size > MAX_IMAGE_PROMPT_REVERSE_IMAGE_BYTES) {
        showToast(
          t(
            "imageReverse.tooLarge",
            "Image must be {{size}} or smaller.",
            {
              size: formatImageSize(MAX_IMAGE_PROMPT_REVERSE_IMAGE_BYTES),
            },
          ),
          "error",
        );
        return;
      }

      const buffer = await file.arrayBuffer();
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }

      const fileName = await window.electron?.saveImageBuffer?.(buffer);
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }

      if (!fileName) {
        showToast(t("prompt.uploadFailed", "Image upload failed"), "error");
        return;
      }

      setReverseImage({
        name: file.name || fileName,
        mimeType: file.type || getImageMimeType(fileName),
        base64: arrayBufferToBase64(buffer),
        fileName,
        previewUrl: URL.createObjectURL(file),
      });
      setDraft(null);
      showToast(t("imageReverse.imageReady", "Image added"), "success");
    },
    [canApplyAsyncResult, setReverseImage, showToast, t],
  );

  const handleSelectImage = useCallback(async () => {
    const imageSession = modalSessionRef.current;

    const filePaths = await window.electron?.selectImage?.();
    if (!canApplyAsyncResult(imageSession)) {
      return;
    }

    if (!filePaths || filePaths.length === 0) {
      return;
    }

    const savedImages = await window.electron?.saveImage?.([filePaths[0]]);
    if (!canApplyAsyncResult(imageSession)) {
      return;
    }

    const fileName = savedImages?.[0];
    if (!fileName) {
      showToast(t("prompt.uploadFailed", "Image upload failed"), "error");
      return;
    }

    const base64 = await window.electron?.readImageBase64?.(fileName);
    if (!canApplyAsyncResult(imageSession)) {
      return;
    }

    if (!base64) {
      showToast(t("prompt.uploadFailed", "Image upload failed"), "error");
      return;
    }

    setReverseImage({
      name: fileName,
      mimeType: getImageMimeType(fileName),
      base64,
      fileName,
      previewUrl: resolveLocalImageSrc(fileName),
    });
    setDraft(null);
    showToast(t("imageReverse.imageReady", "Image added"), "success");
  }, [canApplyAsyncResult, setReverseImage, showToast, t]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        void handleImageFile(file);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleImageFile, isOpen]);

  const resolveMatchedFolderId = useCallback(
    (suggestedFolder?: string | null) => {
      if (selectedFolderId) {
        return selectedFolderId;
      }

      if (!suggestedFolder) {
        return undefined;
      }

      const normalizedSuggestion = suggestedFolder.toLowerCase();
      const matchedFolder = folders.find((folder) => {
        const normalizedName = folder.name.toLowerCase();
        return (
          normalizedName.includes(normalizedSuggestion) ||
          normalizedSuggestion.includes(normalizedName)
        );
      });

      return matchedFolder?.id;
    },
    [folders, selectedFolderId],
  );

  const handleReverse = async () => {
    const reverseSession = modalSessionRef.current;

    if (isSubmitting) {
      return;
    }

    if (!imageInput) {
      showToast(t("imageReverse.needsImage", "Please add an image first."), "error");
      return;
    }

    if (!reverseConfig) {
      showToast(
        t(
          "imageReverse.noVisionModelDesc",
          "Configure a vision-capable chat model in Settings > AI Model Workbench, then select it in the Vision model route.",
        ),
        "error",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const folderNames = folders.map((folder) => folder.name).join(", ");
      const existingTags = [
        ...new Set(prompts.flatMap((prompt) => prompt.tags || [])),
      ].sort();
      const tagsString =
        existingTags.length > 0 ? existingTags.join(", ") : "无现有标签";
      const reverseInstruction = buildImagePromptReverseInstruction(guidance, {
        folderNames,
        tagsString,
      });

      const aiResult = await chatCompletion(
        reverseConfig,
        [
          { role: "system", content: IMAGE_PROMPT_REVERSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: reverseInstruction },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageInput.mimeType};base64,${imageInput.base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        { temperature: 0.45, maxTokens: 2048 },
      );

      if (!canApplyAsyncResult(reverseSession)) {
        return;
      }

      const generatedDraft = parseQuickAddGeneratedDraft(
        aiResult.content,
        "image",
        t("prompt.newPrompt"),
      );

      if (!generatedDraft) {
        showToast(t("quickAdd.parseError"), "error");
        return;
      }

      setDraft(generatedDraft);
      showToast(t("imageReverse.draftReady", "Reverse draft is ready"), "success");
    } catch (error) {
      if (!canApplyAsyncResult(reverseSession)) {
        return;
      }
      console.error("Image prompt reverse generation failed:", error);
      showToast(t("imageReverse.failed", "Image prompt reverse failed"), "error");
    } finally {
      if (canApplyAsyncResult(reverseSession)) {
        setIsSubmitting(false);
      }
    }
  };

  const handleCreate = async () => {
    if (!draft) {
      await handleReverse();
      return;
    }

    if (isCreatingRef.current) {
      return;
    }

    isCreatingRef.current = true;
    setIsCreating(true);
    const createSession = modalSessionRef.current;

    try {
      const createdPrompt = await onCreate({
        title: draft.title,
        userPrompt: draft.userPrompt,
        systemPrompt: draft.systemPrompt,
        description: draft.description,
        folderId: resolveMatchedFolderId(draft.suggestedFolder),
        promptType: "image",
        tags: draft.tags,
        images: attachReferenceImage && imageInput ? [imageInput.fileName] : undefined,
        variables: extractPromptVariables(draft.userPrompt),
      });

      if (!canApplyAsyncResult(createSession)) {
        return;
      }

      if (createdPrompt) {
        onClose();
      }
    } catch (error) {
      if (!canApplyAsyncResult(createSession)) {
        return;
      }
      console.error("Image prompt reverse create failed:", error);
      showToast(t("imageReverse.createFailed", "Prompt creation failed"), "error");
    } finally {
      if (modalSessionRef.current !== createSession) {
        return;
      }

      isCreatingRef.current = false;
      if (canApplyAsyncResult(createSession)) {
        setIsCreating(false);
      }
    }
  };

  const handleCopyDraft = async () => {
    if (!draft?.userPrompt.trim()) {
      return;
    }

    try {
      await copyTextToClipboard(draft.userPrompt);
      showToast(t("imageReverse.copied", "Prompt copied"), "success");
    } catch {
      showToast(t("prompt.copyFailed", "Copy failed"), "error");
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-base ease-enter">
      <div
        data-testid="image-prompt-reverse-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-base ease-enter"
        onClick={handleCloseRequest}
      />

      <div className="relative mx-4 flex max-h-[min(760px,calc(100vh-32px))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-base ease-enter">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">
              {t("imageReverse.title", "Image Reverse")}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCloseRequest}
            aria-label={t("common.close", "Close")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "imageReverse.desc",
              "Use a vision-capable chat model to reverse a reference image into a structured image prompt.",
            )}
          </p>

          <div
            role="button"
            tabIndex={0}
            onClick={() => void handleSelectImage()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void handleSelectImage();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingImage(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDraggingImage(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDraggingImage(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingImage(false);
              const file = Array.from(event.dataTransfer.files).find((entry) =>
                entry.type.startsWith("image/"),
              );
              if (file) {
                void handleImageFile(file);
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition-all duration-200 ${
              imageInput ? "min-h-[132px] py-4" : "min-h-[190px] py-5"
            } ${
              isDraggingImage
                ? "border-primary/70 bg-primary/5 shadow-inner"
                : "border-border bg-muted/20 hover:bg-muted/30"
            }`}
          >
            {imageInput ? (
              <div className="flex w-full items-center gap-4 text-left">
                <img
                  src={imageInput.previewUrl}
                  alt={imageInput.name}
                  className="h-24 w-24 shrink-0 rounded-xl border border-border object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {imageInput.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("imageReverse.ready", "Ready to reverse into an image prompt")}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setReverseImage(null);
                      setDraft(null);
                    }}
                    className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("common.remove", "Remove")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UploadIcon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-medium text-foreground">
                  {t(
                    "imageReverse.dropTitle",
                    "Drop an image, paste a screenshot, or click to choose",
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "imageReverse.dropHint",
                    "PromptHub will save the image as a reference and ask a vision model to reverse the prompt.",
                  )}
                </div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("imageReverse.selectImage", "Select image")}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t("imageReverse.guidance", "Extra guidance (optional)")}
            </label>
            <textarea
              value={guidance}
              onChange={(event) => {
                setGuidance(event.target.value);
                setDraft(null);
              }}
              aria-label={t("imageReverse.guidance", "Extra guidance (optional)")}
              placeholder={t(
                "imageReverse.placeholder",
                "For example: make it more photorealistic and add quality terms for Midjourney / Stable Diffusion.",
              )}
              className="min-h-[72px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/15 px-4 py-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Wand2Icon
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{t("prompt.typeImage", "Image")}</span>
              </div>
              <Checkbox
                checked={attachReferenceImage}
                onChange={setAttachReferenceImage}
                label={t(
                  "imageReverse.attachReference",
                  "Keep as reference",
                )}
              />
            </div>

            {draft && (
              <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t("imageReverse.draftTitle", "Reverse draft")}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "imageReverse.draftDesc",
                        "Review, edit, copy, or create a stored prompt when it looks right.",
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDraft}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <CopyIcon className="h-4 w-4" aria-hidden="true" />
                    {t("imageReverse.copyPrompt", "Copy prompt")}
                  </button>
                </div>

                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("imageReverse.draftTitleLabel", "Draft title")}
                    </label>
                    <input
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                      aria-label={t("imageReverse.draftTitleLabel", "Draft title")}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("imageReverse.draftPromptLabel", "Generated prompt")}
                    </label>
                    <textarea
                      value={draft.userPrompt}
                      onChange={(event) =>
                        setDraft({ ...draft, userPrompt: event.target.value })
                      }
                      aria-label={t(
                        "imageReverse.draftPromptLabel",
                        "Generated prompt",
                      )}
                      className="min-h-[140px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.description", "Description")}
                      </label>
                      <input
                        value={draft.description ?? ""}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                        aria-label={t("prompt.description", "Description")}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.tags", "Tags")}
                      </label>
                      <input
                        value={draft.tags.join(", ")}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            tags: event.target.value
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          })
                        }
                        aria-label={t("prompt.tags", "Tags")}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("prompt.folderOptional", "Folder (optional)")}
              </label>
              <Select
                value={selectedFolderId || ""}
                onChange={(value) => setSelectedFolderId(value || undefined)}
                placeholder={t("quickAdd.smartFolder", "AI Smart Auto-Folder")}
                options={[
                  {
                    value: "",
                    label: (
                      <div className="flex items-center gap-2">
                        <SparklesIcon
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{t("quickAdd.smartFolder", "AI Smart Auto-Folder")}</span>
                      </div>
                    ),
                    labelText: t("quickAdd.smartFolder", "AI Smart Auto-Folder"),
                  },
                  ...folders.map((folder) => ({
                    value: folder.id,
                    label: (
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                          aria-hidden="true"
                        >
                          {renderFolderIcon(folder.icon)}
                        </span>
                        <span className="truncate">{folder.name}</span>
                      </div>
                    ),
                    labelText: folder.name,
                  })),
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <button
            type="button"
            onClick={handleCloseRequest}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleReverse}
            disabled={isSubmitting || isCreating || !imageInput}
            className={
              draft
                ? "flex items-center gap-2 rounded-lg border border-border px-5 py-2 font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-press-in disabled:opacity-50"
                : "flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-press-in disabled:opacity-50"
            }
          >
            {isSubmitting && (
              <Loader2Icon
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {draft
              ? t("imageReverse.regenerate", "Regenerate")
              : t("imageReverse.reverse", "Reverse")}
          </button>
          {draft && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-press-in disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2Icon
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SaveIcon className="h-4 w-4" aria-hidden="true" />
              )}
              {t("imageReverse.createPrompt", "Create prompt")}
            </button>
          )}
        </div>
      </div>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          setShowUnsavedDialog(false);
          void handleCreate();
        }}
        onDiscard={() => {
          setShowUnsavedDialog(false);
          onClose();
        }}
      />
    </div>
  );
}
