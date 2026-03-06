import { useState, useEffect, useCallback, useMemo } from "react";
import { Modal, Button, Input, Textarea, UnsavedChangesDialog } from "../ui";
import { Select } from "../ui/Select";
import {
  HashIcon,
  XIcon,
  ImageIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  GlobeIcon,
  PlayIcon,
  VideoIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SaveIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import { useFolderStore } from "../../stores/folder.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/Toast";
import { renderFolderIcon } from "../layout/folderIconHelper";
import {
  buildPromptPayload,
  getExistingPromptTags,
  hasPromptFormChanges,
} from "./prompt-modal-utils";
import { usePromptMediaManager } from "./usePromptMediaManager";
import { usePromptNativeFullscreen } from "./usePromptNativeFullscreen";

interface CreatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    promptType?: "text" | "image";
    systemPrompt?: string;
    systemPromptEn?: string;
    userPrompt: string;
    userPromptEn?: string;
    tags: string[];
    images?: string[];
    videos?: string[];
    folderId?: string;
    source?: string;
    notes?: string;
  }) => void;
  defaultFolderId?: string;
  defaultPromptType?: "text" | "image";
}

export function CreatePromptModal({
  isOpen,
  onClose,
  onCreate,
  defaultFolderId,
  defaultPromptType,
}: CreatePromptModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptType, setPromptType] = useState<"text" | "image">(
    defaultPromptType || "text",
  );
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptEn, setSystemPromptEn] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [userPromptEn, setUserPromptEn] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglishVersion, setShowEnglishVersion] = useState(false);
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  const [showAttributes, setShowAttributes] = useState(false);
  const [userTab, setUserTab] = useState<"edit" | "preview">("edit");
  const [systemTab, setSystemTab] = useState<"edit" | "preview">("edit");
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const folders = useFolderStore((state) => state.folders);
  const prompts = usePromptStore((state) => state.prompts);
  const sourceHistory = useSettingsStore((state) => state.sourceHistory);
  const addSourceHistory = useSettingsStore((state) => state.addSourceHistory);

  // 获取所有已存在的标签
  const existingTags = useMemo(() => getExistingPromptTags(prompts), [prompts]);

  const {
    imageUrl,
    images,
    isDownloadingImage,
    setImageUrl,
    setImages,
    setShowUrlInput,
    setVideos,
    showUrlInput,
    videos,
    handleRemoveImage,
    handleRemoveVideo,
    handleSelectImage,
    handleSelectVideo,
    handleUrlUpload,
  } = usePromptMediaManager({
    isOpen,
    translate: (key, fallback) => t(key, fallback),
    showToast,
  });

  const {
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
      folderId: folderId || undefined,
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

  // 当弹窗打开时，设置默认文件夹
  useEffect(() => {
    if (isOpen && defaultFolderId) {
      setFolderId(defaultFolderId);
    }
  }, [isOpen, defaultFolderId]);

  // 当弹窗打开时，同步默认 promptType
  useEffect(() => {
    if (isOpen && defaultPromptType) {
      setPromptType(defaultPromptType);
    }
  }, [isOpen, defaultPromptType]);

  // 检查是否有未保存的更改
  const hasUnsavedChanges = useCallback(() => {
    return hasPromptFormChanges(formState);
  }, [formState]);

  // 处理关闭请求
  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !userPrompt.trim()) return;

    onCreate(buildPromptPayload(formState) as Parameters<typeof onCreate>[0]);

    // 保存来源到历史
    if (source.trim()) {
      addSourceHistory(source.trim());
    }

    // 重置表单
    setTitle("");
    setDescription("");
    setPromptType("text");
    setSystemPrompt("");
    setSystemPromptEn("");
    setUserPrompt("");
    setUserPromptEn("");
    setTags([]);
    setImages([]);
    setVideos([]);
    setFolderId("");
    setSource("");
    setNotes("");
    setShowEnglishVersion(false);
    onClose();
  }, [
    formState,
    onCreate,
    addSourceHistory,
    onClose,
    setImages,
    setVideos,
  ]);

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

  // 监听快捷键
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "s" || e.key === "S" || e.key === "Enter")
      ) {
        e.preventDefault();
        handleSubmit();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "f" || e.key === "F")
      ) {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      if (e.key === "Escape" && isNativeFullscreen) {
        exitNativeFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSubmit, isNativeFullscreen, exitNativeFullscreen]);

  // 如果是真正的全屏模式，渲染全屏编辑器
  if (isNativeFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {fullscreenTitle}
            </h2>
            <span className="text-sm text-muted-foreground">
              {t("common.markdownSupported")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t("common.exitFullscreen", "Exit Fullscreen")}
            </button>
            <Button variant="primary" onClick={exitNativeFullscreen}>
              {t("common.done", "Done")}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <textarea
            className="w-full h-full p-8 resize-none bg-background border-none outline-none text-lg font-mono leading-relaxed"
            value={fullscreenValue}
            onChange={(e) => updateFullscreenValue(e.target.value)}
            autoFocus
            placeholder={t("prompt.typeYourPrompt")}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseRequest}
        title={t("prompt.createPrompt")}
        size={isFullscreen ? "fullscreen" : "xl"}
        headerActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={
                isFullscreen
                  ? t("prompt.exitFullscreen", "Exit Fullscreen")
                  : t("prompt.fullscreen", "Fullscreen")
              }
            >
              {isFullscreen ? (
                <Minimize2Icon className="w-4 h-4" />
              ) : (
                <Maximize2Icon className="w-4 h-4" />
              )}
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!title.trim() || !userPrompt.trim()}
            >
              <SaveIcon className="w-4 h-4" />
              {t("prompt.create")}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* 标题 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t("prompt.titleLabel")}
              <span className="ml-1 text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={t("prompt.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-muted/50 border-0 text-xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
            />
          </div>

          {/* 可折叠的属性面板 */}
          <div className="border border-border/50 rounded-xl bg-muted/20 overflow-hidden">
            <button
              onClick={() => setShowAttributes(!showAttributes)}
              className="flex items-center gap-2 px-4 py-3 w-full text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              {showAttributes ? (
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
              )}
              <span>{t("prompt.properties", "Properties")}</span>
              {!showAttributes && (
                <span className="text-xs text-muted-foreground ml-2 font-normal truncate max-w-[400px]">
                  {[
                    folders.find((f) => f.id === folderId)?.name,
                    tags.length > 0
                      ? `${tags.length} ${t("prompt.tags", "tags")}`
                      : null,
                    images.length + videos.length > 0
                      ? `${images.length + videos.length} ${t("prompt.media", "media")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </span>
              )}
            </button>

            {showAttributes && (
              <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-1">
                {/* 描述 */}
                <Input
                  label={t("prompt.descriptionOptional")}
                  placeholder={t("prompt.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                {/* Prompt 类型 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.type", "Prompt Type")}
                  </label>
                  <div className="flex gap-2">
                    {(["text", "image"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setPromptType(type)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          promptType === type
                            ? "bg-primary text-white shadow-sm"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {type === "text" && (
                          <MessageSquareTextIcon className="w-4 h-4" />
                        )}
                        {type === "image" && <ImageIcon className="w-4 h-4" />}
                        {type === "text" && t("prompt.typeText", "Text")}
                        {type === "image" && t("prompt.typeImage", "Media")}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {promptType === "text" &&
                      t(
                        "prompt.typeTextDesc",
                        "Test with chat models (e.g. GPT-4)",
                      )}
                    {promptType === "image" &&
                      t(
                        "prompt.typeImageDesc",
                        "Test with image models (e.g. DALL-E)",
                      )}
                  </p>
                </div>

                {/* 参考媒体 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.referenceMedia")}
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {images.map((img, index) => (
                      <div
                        key={`img-${index}`}
                        className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border"
                      >
                        <img
                          src={`local-image://${img}`}
                          alt={`preview-${index}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {videos.map((video, index) => (
                      <div
                        key={`vid-${index}`}
                        className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border bg-black"
                      >
                        <video
                          src={`local-video://${video}`}
                          className="w-full h-full object-cover opacity-70"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <PlayIcon className="w-6 h-6 text-white/80" />
                        </div>
                        <button
                          onClick={() => handleRemoveVideo(index)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleSelectImage}
                      className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
                    >
                      <ImageIcon className="w-6 h-6 mb-1" />
                      <span className="text-[10px] leading-tight">
                        {t("prompt.uploadImage", "Upload/Add Link")}
                      </span>
                    </button>
                    <button
                      onClick={handleSelectVideo}
                      className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors text-center p-2"
                    >
                      <VideoIcon className="w-6 h-6 mb-1" />
                      <span className="text-[10px] leading-tight">
                        {t("prompt.uploadVideo", "Upload Video")}
                      </span>
                    </button>
                  </div>
                  {!showUrlInput ? (
                    <button
                      onClick={() => setShowUrlInput(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("prompt.addImageByUrl", "Add by URL")}
                    </button>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="https://example.com/image.jpg"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            imageUrl &&
                            !isDownloadingImage
                          ) {
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

                {/* 文件夹 */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.folderOptional")}
                  </label>
                  <Select
                    value={folderId || ""}
                    onChange={(val) => setFolderId(val || "")}
                    placeholder={t("prompt.noFolder")}
                    options={[
                      { value: "", label: t("prompt.noFolder") },
                      ...folders.map((folder) => ({
                        value: folder.id,
                        label: (
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground">
                              {renderFolderIcon(folder.icon)}
                            </span>
                            <span className="truncate">{folder.name}</span>
                          </div>
                        ),
                      })),
                    ]}
                  />
                </div>

                {/* 标签 */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.tagsOptional")}
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white"
                      >
                        <HashIcon className="w-3 h-3" />
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-white/70"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {existingTags.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-muted-foreground mb-1.5">
                        {t("prompt.selectExistingTags")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {existingTags
                          .filter((t) => !tags.includes(t))
                          .map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setTags([...tags, tag])}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                            >
                              <HashIcon className="w-3 h-3" />
                              {tag}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t("prompt.enterTagHint")}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
                    />
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={handleAddTag}
                    >
                      {t("prompt.addTag")}
                    </Button>
                  </div>
                </div>

                {/* 来源 / Source */}
                <div className="space-y-1.5 relative">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.sourceOptional") || "Source (Optional)"}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={
                        t("prompt.sourcePlaceholder") ||
                        "Record prompt source (e.g. website, book)"
                      }
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      onFocus={() => setShowSourceSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => setShowSourceSuggestions(false), 150)
                      }
                      className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
                    />
                    {showSourceSuggestions && sourceHistory.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                        {sourceHistory
                          .filter((s) =>
                            s.toLowerCase().includes(source.toLowerCase()),
                          )
                          .slice(0, 8)
                          .map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="w-full px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors truncate"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSource(item);
                                setShowSourceSuggestions(false);
                              }}
                            >
                              {item}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 备注 */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {t("prompt.notesOptional", "Notes (Optional)")}
                  </label>
                  <textarea
                    placeholder={t(
                      "prompt.notesPlaceholder",
                      "Personal notes about this prompt...",
                    )}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full min-h-[80px] px-4 py-3 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 英文版本切换 / Toggle English Version (Hide if language is English) */}
          {!i18n.language.startsWith("en") && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border">
              <div className="flex items-center gap-2">
                <GlobeIcon className="w-4 h-4 text-primary" />
                <div className="text-sm font-medium">
                  {t("prompt.bilingualHint")}
                </div>
              </div>
              <button
                onClick={() => setShowEnglishVersion(!showEnglishVersion)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showEnglishVersion
                    ? "bg-primary text-white"
                    : "bg-muted hover:bg-accent text-foreground"
                }`}
              >
                {showEnglishVersion ? (
                  <>
                    <XIcon className="w-3.5 h-3.5" />
                    {t("prompt.removeEnglishVersion")}
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-3.5 h-3.5" />
                    {t("prompt.addEnglishVersion")}
                  </>
                )}
              </button>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                {t("prompt.systemPromptOptional")}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                  <button
                    onClick={() => setSystemTab("edit")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      systemTab === "edit"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("prompt.edit", "Edit")}
                  </button>
                  <button
                    onClick={() => setSystemTab("preview")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      systemTab === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("prompt.preview", "Preview")}
                  </button>
                </div>
                <button
                  onClick={() => enterNativeFullscreen("system")}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                  title={t("prompt.fullscreen", "Fullscreen Edit")}
                >
                  <Maximize2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {systemTab === "edit" ? (
              <Textarea
                placeholder={t("prompt.systemPromptPlaceholder")}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[120px]"
              />
            ) : (
              <div className="p-4 rounded-xl bg-card border border-border text-sm break-words min-h-[120px] whitespace-pre-wrap">
                {systemPrompt || (
                  <span className="text-muted-foreground italic">
                    {t("prompt.noContent")}
                  </span>
                )}
              </div>
            )}
            {showEnglishVersion && (
              <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <span className="bg-primary/10 text-primary px-1 rounded text-[10px]">
                      EN
                    </span>
                    {t("prompt.systemPromptEn")}
                  </label>
                  <button
                    onClick={() => enterNativeFullscreen("systemEn")}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={t("prompt.fullscreen")}
                  >
                    <Maximize2Icon className="w-3 h-3" />
                  </button>
                </div>
                <Textarea
                  placeholder={t("prompt.enterEnglishSystemPrompt")}
                  value={systemPromptEn}
                  onChange={(e) => setSystemPromptEn(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            )}
          </div>

          {/* User Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                {t("prompt.userPromptLabel")}
                <span className="ml-2 text-xs text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                  <button
                    onClick={() => setUserTab("edit")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      userTab === "edit"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("prompt.edit", "Edit")}
                  </button>
                  <button
                    onClick={() => setUserTab("preview")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      userTab === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("prompt.preview", "Preview")}
                  </button>
                </div>
                <button
                  onClick={() => enterNativeFullscreen("user")}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                  title={t("prompt.fullscreen", "Fullscreen Edit")}
                >
                  <Maximize2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {userTab === "edit" ? (
              <Textarea
                placeholder={t("prompt.userPromptPlaceholder")}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="min-h-[200px]"
              />
            ) : (
              <div className="p-4 rounded-xl bg-card border border-border text-sm break-words min-h-[200px] whitespace-pre-wrap">
                {userPrompt || (
                  <span className="text-muted-foreground italic">
                    {t("prompt.noContent")}
                  </span>
                )}
              </div>
            )}
            {showEnglishVersion && (
              <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <span className="bg-primary/10 text-primary px-1 rounded text-[10px]">
                      EN
                    </span>
                    {t("prompt.userPromptEn")}
                  </label>
                  <button
                    onClick={() => enterNativeFullscreen("userEn")}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={t("prompt.fullscreen")}
                  >
                    <Maximize2Icon className="w-3 h-3" />
                  </button>
                </div>
                <Textarea
                  placeholder={t("prompt.enterEnglishUserPrompt")}
                  value={userPromptEn}
                  onChange={(e) => setUserPromptEn(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            )}
          </div>

          {/* 变量提示 */}
          <div className="p-4 rounded-xl bg-accent/50 text-sm">
            <p className="font-medium text-accent-foreground mb-1">
              💡 {t("prompt.variableTip")}
            </p>
            <p className="text-muted-foreground">
              {t("prompt.variableTipContent")}
            </p>
          </div>
        </div>
      </Modal>
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          setShowUnsavedDialog(false);
          handleSubmit();
        }}
        onDiscard={() => {
          setShowUnsavedDialog(false);
          onClose();
        }}
      />
    </>
  );
}
