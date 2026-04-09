import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  HashIcon,
  GithubIcon,
  SearchIcon,
  EditIcon,
  FolderOpenIcon,
  CuboidIcon,
  LoaderIcon,
  CheckIcon,
  SparklesIcon,
  AlertCircleIcon,
  BrainIcon,
  UploadIcon,
  Maximize2Icon,
  Minimize2Icon,
  SaveIcon,
  FileTextIcon,
  CheckSquareIcon,
  SquareIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import {
  generateSkillContent,
  polishSkillContent,
  AIConfig,
} from "../../services/ai";
import { BUILTIN_SKILL_REGISTRY } from "../../../shared/constants/skill-registry";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { SkillIconPicker } from "./SkillIconPicker";
import { getExistingSkillTags } from "./skill-modal-utils";
import type { ScannedSkill } from "../../../shared/types/skill";

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreateMode = "select" | "github" | "manual" | "scan" | "ai";

function sanitizeSkillName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function CreateSkillModal({ isOpen, onClose }: CreateSkillModalProps) {
  const { t } = useTranslation();
  const createSkill = useSkillStore((state) => state.createSkill);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const existingSkills = useSkillStore((state) => state.skills);

  // AI settings for generation
  // AI 生成设置
  const aiModels = useSettingsStore((state) => state.aiModels);

  const [mode, setMode] = useState<CreateMode>("select");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // GitHub mode
  const [githubUrl, setGithubUrl] = useState("");

  // Manual mode
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [version, setVersion] = useState("");
  const [author, setAuthor] = useState("");
  const [iconUrl, setIconUrl] = useState<string | undefined>(undefined);
  const [iconEmoji, setIconEmoji] = useState<string | undefined>(undefined);
  const [iconBackground, setIconBackground] = useState<string | undefined>(
    undefined,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Editor state
  // 编辑器状态
  const [instrTab, setInstrTab] = useState<"edit" | "preview">("edit");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scan mode state
  // 扫描模式状态
  const [scanResults, setScanResults] = useState<ScannedSkill[]>([]);
  const [selectedScanItems, setSelectedScanItems] = useState<Set<string>>(
    new Set(),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const [scanImportNotice, setScanImportNotice] = useState<string | null>(null);
  const [scanSearchQuery, setScanSearchQuery] = useState("");
  const [showScanOptionalTags, setShowScanOptionalTags] = useState(false);
  const [scanTagDrafts, setScanTagDrafts] = useState<Record<string, string[]>>(
    {},
  );
  const [scanTagInputs, setScanTagInputs] = useState<Record<string, string>>(
    {},
  );

  const installedScanPaths = useMemo(() => {
    return new Set(
      existingSkills.flatMap((skill) =>
        [skill.source_url, skill.local_repo_path].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
  }, [existingSkills]);

  const annotatedScanResults = useMemo(() => {
    return scanResults.map((skill) => ({
      ...skill,
      isImported: installedScanPaths.has(skill.localPath),
    }));
  }, [installedScanPaths, scanResults]);

  const selectableScanResults = useMemo(
    () => annotatedScanResults.filter((skill) => !skill.isImported),
    [annotatedScanResults],
  );
  const visibleAnnotatedScanResults = useMemo(() => {
    const query = scanSearchQuery.trim().toLowerCase();
    if (!query) {
      return annotatedScanResults;
    }
    return annotatedScanResults.filter((skill) => {
      const fields = [
        skill.name,
        skill.description,
        skill.author,
        skill.localPath,
        ...skill.tags,
        ...skill.platforms,
      ];
      return fields.some((value) => value?.toLowerCase().includes(query));
    });
  }, [annotatedScanResults, scanSearchQuery]);
  const visibleSelectableScanResults = useMemo(
    () => visibleAnnotatedScanResults.filter((skill) => !skill.isImported),
    [visibleAnnotatedScanResults],
  );
  const importedScanCount =
    annotatedScanResults.length - selectableScanResults.length;
  const existingTags = useMemo(
    () => getExistingSkillTags(existingSkills),
    [existingSkills],
  );

  // Get default chat model for AI generation
  // 获取默认对话模型用于 AI 生成
  const defaultChatModel = useMemo(() => {
    const chatModels = aiModels.filter((m) => (m.type ?? "chat") === "chat");
    return chatModels.find((m) => m.isDefault) ?? chatModels[0] ?? null;
  }, [aiModels]);

  // Check if AI generation is available
  // 检查 AI 生成是否可用
  const canGenerateWithAI = useMemo(() => {
    return (
      defaultChatModel && defaultChatModel.apiKey && defaultChatModel.apiUrl
    );
  }, [defaultChatModel]);

  // Get skill-creator content from registry for use as system prompt
  const skillCreatorContent = useMemo(() => {
    const creator = BUILTIN_SKILL_REGISTRY.find(
      (s) => s.slug === "skill-creator",
    );
    return creator?.content || null;
  }, []);

  // Fullscreen handlers (must be before early return to maintain hooks order)
  const handleEnterNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  }, []);

  const handleExitNativeFullscreen = useCallback(() => {
    setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  }, []);

  // Keyboard shortcuts (Escape to exit native fullscreen)
  // 键盘快捷键（Escape 退出原生全屏）
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isNativeFullscreen) {
        handleExitNativeFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isNativeFullscreen, handleExitNativeFullscreen]);

  if (!isOpen) return null;

  const hasUnsavedChanges = () => {
    return (
      name.trim() !== "" ||
      description.trim() !== "" ||
      instructions.trim() !== "" ||
      Boolean(iconUrl) ||
      Boolean(iconEmoji) ||
      Boolean(iconBackground)
    );
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges() && (mode === "manual" || mode === "ai")) {
      setShowUnsavedDialog(true);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setMode("select");
    setError(null);
    setShowUnsavedDialog(false);
    setGithubUrl("");
    setName("");
    setDescription("");
    setInstructions("");
    setVersion("");
    setAuthor("");
    setIconUrl(undefined);
    setIconEmoji(undefined);
    setIconBackground(undefined);
    setTags([]);
    setTagInput("");
    setInstrTab("edit");
    setIsFullscreen(false);
    setIsNativeFullscreen(false);
    setIsGenerating(false);
    setScanResults([]);
    setSelectedScanItems(new Set());
    setIsScanning(false);
    setScanDone(false);
    setImportingCount(0);
    setScanImportNotice(null);
    setScanTagDrafts({});
    setScanTagInputs({});
    onClose();
  };

  // MD file upload handler
  // MD 文件上传处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInstructions(content);
        // Auto-fill name from filename if empty
        if (!name.trim()) {
          const baseName = file.name
            .replace(/\.md$/i, "")
            .replace(/[^a-z0-9-]/gi, "-")
            .toLowerCase();
          setName(baseName);
        }
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // Tag handlers
  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  // AI Polish SKILL.md content
  // AI 润色 SKILL.md 内容
  const handleAIPolish = async () => {
    if (!instructions.trim()) {
      setError(
        t(
          "skill.polishNeedsContent",
          "Please write some content first before polishing",
        ),
      );
      return;
    }

    if (!defaultChatModel) {
      setError(
        t(
          "skill.noAiModelConfigured",
          "Please configure an AI model in settings first",
        ),
      );
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const config: AIConfig = {
        provider: defaultChatModel.provider,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };

      const polished = await polishSkillContent(
        config,
        instructions,
        name || undefined,
      );
      setInstructions(polished);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.polishFailed", "Failed to polish skill content"),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // AI mode: generate a draft, then switch to manual review mode
  const handleAICreate = async () => {
    const normalizedName = sanitizeSkillName(name);
    if (!normalizedName.trim()) {
      setError(t("skill.nameRequired", "Please enter a skill name"));
      return;
    }
    if (!description.trim()) {
      setError(
        t(
          "skill.descriptionRequired",
          "Please enter a skill description for AI generation",
        ),
      );
      return;
    }
    if (!defaultChatModel) {
      setError(
        t(
          "skill.noAiModelConfigured",
          "Please configure an AI model in settings first",
        ),
      );
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const config: AIConfig = {
        provider: defaultChatModel.provider,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };

      const generated = await generateSkillContent(
        config,
        normalizedName,
        description,
        undefined,
        skillCreatorContent || undefined,
      );
      setName(normalizedName);
      setInstructions(generated);
      setMode("manual");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.generateFailed", "Failed to generate skill content"),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGitHubInstall = async () => {
    if (!githubUrl.trim()) {
      setError(t("skill.enterGithubUrl", "Please enter a GitHub URL"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate GitHub URL format before sending to backend
      const match = githubUrl
        .trim()
        .match(
          /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
        );
      if (!match) {
        throw new Error(
          t("skill.invalidGithubUrl", "Invalid GitHub URL format"),
        );
      }

      // Pass the GitHub URL with an explicit flag to trigger git clone.
      // The backend IPC handler delegates to SkillInstaller.installFromGithub
      // when source_url is a valid GitHub URL and no content is provided.
      const createdSkill = await createSkill({
        name: match[2],
        description: "",
        protocol_type: "skill",
        source_url: githubUrl.trim(),
        is_favorite: false,
        tags: [],
        original_tags: ["github"],
      });

      if (!createdSkill) {
        throw new Error(
          t(
            "skill.installReturnedEmpty",
            "GitHub install did not return a skill",
          ),
        );
      }

      handleClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.installFailed", "Failed to install from GitHub"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCreate = async () => {
    const normalizedName = sanitizeSkillName(name);
    if (!normalizedName.trim()) {
      setError(t("skill.nameRequired", "Please enter a skill name"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const createdSkill = await createSkill({
        name: normalizedName,
        description,
        instructions,
        content: instructions,
        protocol_type: "skill",
        is_favorite: false,
        tags,
        version: version || undefined,
        author: author || undefined,
        icon_url: iconUrl,
        icon_emoji: iconEmoji,
        icon_background: iconBackground,
      });

      if (!createdSkill) {
        throw new Error(
          t(
            "skill.createReturnedEmpty",
            "Skill creation did not return a result",
          ),
        );
      }

      handleClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.createFailed", "Failed to create skill"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Scan local skills (preview mode - returns list for user to select)
  // 扫描本地技能（预览模式 - 返回列表供用户选择）
  const handleScanLocal = async () => {
    setIsScanning(true);
    setScanDone(false);
    setError(null);
    setScanImportNotice(null);
    setScanResults([]);
    setSelectedScanItems(new Set());
    setScanTagDrafts({});
    setScanTagInputs({});

    try {
      const allResults: ScannedSkill[] =
        await window.api.skill.scanLocalPreview();
      const installedCount = allResults.filter((skill) =>
        installedScanPaths.has(skill.localPath),
      ).length;

      setScanResults(allResults);
      setSelectedScanItems(
        new Set(
          allResults
            .filter((skill) => !installedScanPaths.has(skill.localPath))
            .map((skill) => skill.filePath),
        ),
      );
      setScanDone(true);
      if (allResults.length > 0 && installedCount === allResults.length) {
        setError(
          t(
            "skill.allAlreadyImported",
            "All found skills already exist in your library.",
          ),
        );
      } else if (allResults.length === 0) {
        setError(
          t("skill.noSkillsFound", "No new local SKILL.md files found."),
        );
      }
    } catch (err) {
      setError(t("skill.scanFailed", "Failed to scan: ") + String(err));
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle selection of a scanned skill
  const toggleScanItem = (filePath: string) => {
    setSelectedScanItems((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  // Toggle select all / deselect all
  const toggleSelectAll = () => {
    if (visibleSelectableScanResults.length === 0) return;
    const allVisibleSelected = visibleSelectableScanResults.every((skill) =>
      selectedScanItems.has(skill.filePath),
    );

    if (allVisibleSelected) {
      setSelectedScanItems((prev) => {
        const next = new Set(prev);
        visibleSelectableScanResults.forEach((skill) =>
          next.delete(skill.filePath),
        );
        return next;
      });
    } else {
      setSelectedScanItems((prev) => {
        const next = new Set(prev);
        visibleSelectableScanResults.forEach((skill) =>
          next.add(skill.filePath),
        );
        return next;
      });
    }
  };

  const handleAddScanTag = (localPath: string) => {
    const nextTag = (scanTagInputs[localPath] || "").trim().toLowerCase();
    if (!nextTag) return;

    setScanTagDrafts((prev) => {
      const existing = prev[localPath] || [];
      if (existing.includes(nextTag)) {
        return prev;
      }
      return { ...prev, [localPath]: [...existing, nextTag] };
    });
    setScanTagInputs((prev) => ({ ...prev, [localPath]: "" }));
  };

  const handleRemoveScanTag = (localPath: string, tag: string) => {
    setScanTagDrafts((prev) => ({
      ...prev,
      [localPath]: (prev[localPath] || []).filter((item) => item !== tag),
    }));
  };

  // Import selected scanned skills
  // 导入选中的扫描到的技能（使用 store 的 importScannedSkills 确保 name 校验 + saveToRepo）
  const handleImportSelected = async () => {
    const toImport = annotatedScanResults.filter(
      (skill) => !skill.isImported && selectedScanItems.has(skill.filePath),
    );
    if (toImport.length === 0) return;

    setIsLoading(true);
    setError(null);
    setScanImportNotice(null);
    setImportingCount(0);

    try {
      const userTagsByPath = Object.fromEntries(
        toImport.map((skill) => [
          skill.localPath,
          scanTagDrafts[skill.localPath] || [],
        ]),
      );
      const importResult = await importScannedSkills(toImport, userTagsByPath);
      setImportingCount(importResult.importedCount);

      const summary = t(
        "skill.scanImportSummary",
        "Imported {{imported}} / {{total}}, skipped {{skipped}}, failed {{failed}}.",
      )
        .replace("{{imported}}", String(importResult.importedCount))
        .replace("{{total}}", String(toImport.length))
        .replace("{{skipped}}", String(importResult.skipped.length))
        .replace("{{failed}}", String(importResult.failed.length));

      if (
        importResult.importedCount > 0 &&
        importResult.failed.length === 0 &&
        importResult.skipped.length === 0
      ) {
        handleClose();
      } else if (
        importResult.importedCount === 0 &&
        importResult.failed.length === 0 &&
        importResult.skipped.length > 0
      ) {
        setError(
          t(
            "skill.allDuplicates",
            "All selected skills already exist in your library.",
          ),
        );
      } else {
        const detailItems = [...importResult.skipped, ...importResult.failed]
          .slice(0, 3)
          .map((item) => `${item.name}: ${item.reason}`);
        setScanImportNotice(
          detailItems.length > 0
            ? `${summary} ${detailItems.join(" | ")}`
            : summary,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.importFailed", "Failed to import skills"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Native fullscreen: split-screen editor + preview (for manual mode)
  // 原生全屏：左右分屏编辑器 + 预览（手动模式）
  if (isNativeFullscreen && mode === "manual") {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {t("skill.instructions", "Instructions (SKILL.md)")}
            </h2>
            <span className="text-sm text-muted-foreground">
              {t("common.markdownSupported", "Supports Markdown")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <UploadIcon className="w-4 h-4" />
              {t("skill.uploadMd", "Upload .md")}
            </button>
            <button
              onClick={handleExitNativeFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
            >
              <Minimize2Icon className="w-4 h-4" />
              {t("common.exitFullscreen", "Exit Fullscreen")}
            </button>
            <button
              onClick={() => {
                handleManualCreate();
                handleExitNativeFullscreen();
              }}
              disabled={isLoading || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <SaveIcon className="w-4 h-4" />
              {t("skill.create", "Create")}
            </button>
          </div>
        </div>
        {/* Split-screen: left editor + right preview */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t("prompt.edit", "Edit")}
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              autoFocus
              placeholder={t(
                "skill.instructionsPlaceholder",
                "Enter skill instructions or SKILL.md content...",
              )}
            />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
              {t("prompt.preview", "Preview")}
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {instructions ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                  >
                    {instructions}
                  </ReactMarkdown>
                ) : (
                  <div className="text-muted-foreground text-sm italic">
                    {t("skill.noContent", "No content")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCloseRequest}
      />

      {/* Modal - wider for manual/scan mode */}
      <div
        className={`relative bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col transition-all ${
          mode === "manual"
            ? isFullscreen
              ? "w-[95vw] h-[95vh]"
              : "w-full max-w-2xl max-h-[90vh]"
            : mode === "scan" && scanDone && scanResults.length > 0
              ? "w-[min(92vw,1100px)] max-h-[92vh]"
              : "w-full max-w-lg max-h-[90vh]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <CuboidIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {mode === "select"
                ? t("skill.addSkill", "Add Skill")
                : mode === "github"
                  ? t("skill.installFromGithub", "Install from GitHub")
                  : mode === "manual"
                    ? t("skill.createTitle", "Create Skill")
                    : mode === "ai"
                      ? t("skill.aiCreate", "AI Draft")
                      : t("skill.scanLocal", "Scan Local")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {mode === "manual" && (
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                title={
                  isFullscreen
                    ? t("common.exitFullscreen", "Exit Fullscreen")
                    : t("common.fullscreen", "Fullscreen")
                }
              >
                {isFullscreen ? (
                  <Minimize2Icon className="w-4 h-4" />
                ) : (
                  <Maximize2Icon className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              onClick={handleCloseRequest}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className={`p-6 ${mode === "manual" || mode === "scan" ? "flex-1 overflow-y-auto" : ""}`}
        >
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {mode === "select" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  "skill.chooseAddMethod",
                  "Choose how you want to add a new skill:",
                )}
              </p>

              {/* AI Create Option */}
              <button
                onClick={() => setMode("ai")}
                className="w-full flex items-center gap-4 p-4 bg-primary/5 hover:bg-primary/10 border border-primary/30 rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-primary rounded-lg">
                  <BrainIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    {t("skill.aiCreate", "AI Draft")}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-normal">
                      skill-creator
                    </span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "skill.aiCreateDesc",
                      "Describe what you need, AI drafts the SKILL.md for review",
                    )}
                  </p>
                </div>
              </button>

              {/* GitHub Option */}
              <button
                onClick={() => setMode("github")}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <GithubIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    {t("skill.installFromGithub", "Install from GitHub")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("skill.githubDesc", "Paste a GitHub repository URL")}
                  </p>
                </div>
              </button>

              {/* Manual Option */}
              <button
                onClick={() => setMode("manual")}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <EditIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    {t("skill.createManually", "Create Manually")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("skill.manualDesc", "Build a skill from scratch")}
                  </p>
                </div>
              </button>

              {/* Scan Option */}
              <button
                onClick={() => setMode("scan")}
                className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
              >
                <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
                  <FolderOpenIcon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">
                    {t("skill.scanLocal", "Scan Local")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("skill.scanLocalDesc", "Detect existing SKILL.md files")}
                  </p>
                </div>
              </button>
            </div>
          )}

          {mode === "github" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("skill.githubUrl", "GitHub Repository URL")}
                </label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/skill-repo"
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    "skill.githubUrlHint",
                    "Use the repository root URL. PromptHub will clone the repo and prefer SKILL.md, then README.md as fallback.",
                  )}
                </p>
                <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5">
                  <p>
                    {t(
                      "skill.githubConstraintHint",
                      "Only repository root URLs are supported, such as https://github.com/owner/repo",
                    )}
                  </p>
                  <p>
                    {t(
                      "skill.githubFallbackHint",
                      "If SKILL.md is missing, PromptHub will try README.md. Reinstall currently requires deleting the old copy first.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode("select")}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  {t("common.back", "Back")}
                </button>
                <button
                  onClick={handleGitHubInstall}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? (
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckIcon className="w-4 h-4" />
                  )}
                  {t("skill.install", "Install")}
                </button>
              </div>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("skill.skillName", "Skill Name")}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(sanitizeSkillName(e.target.value));
                  }}
                  placeholder="my-skill-name"
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(
                    "skill.nameHint",
                    "Lowercase letters, numbers, and hyphens only, e.g. my-skill-name",
                  )}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("skill.skillDescription", "Description")}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    "skill.descriptionPlaceholder",
                    "What does this skill do?",
                  )}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <SkillIconPicker
                name={name}
                iconUrl={iconUrl}
                iconEmoji={iconEmoji}
                iconBackground={iconBackground}
                onChange={({
                  iconUrl: nextIconUrl,
                  iconEmoji: nextIconEmoji,
                  iconBackground: nextIconBackground,
                }) => {
                  setIconUrl(nextIconUrl);
                  setIconEmoji(nextIconEmoji);
                  setIconBackground(nextIconBackground);
                }}
              />

              {/* Version & Author (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t("skill.version", "Version")}
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t("skill.author", "Author")}
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder={t("skill.authorPlaceholder", "Author name")}
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t("skill.tagsOptional", "Tags (Optional)")}
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
                        type="button"
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
                      {t("skill.selectExistingTags", "Select existing tags:")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {existingTags
                        .filter((existingTag) => !tags.includes(existingTag))
                        .map((existingTag) => (
                          <button
                            key={existingTag}
                            type="button"
                            onClick={() => setTags([...tags, existingTag])}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                          >
                            <HashIcon className="w-3 h-3" />
                            {existingTag}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={t(
                      "skill.enterTagHint",
                      "Enter new tag and press Enter",
                    )}
                    className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                    className="px-3 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {t("skill.addTag", "Add tag")}
                  </button>
                </div>
              </div>

              {/* Instructions (SKILL.md) with edit/preview tabs + upload + AI generate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    {t("skill.instructions", "Instructions (SKILL.md)")}
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Upload MD button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      <UploadIcon className="w-3.5 h-3.5" />
                      {t("skill.uploadMd", "Upload .md")}
                    </button>
                    {/* AI Polish Button */}
                    <button
                      onClick={handleAIPolish}
                      disabled={
                        isGenerating ||
                        !canGenerateWithAI ||
                        !instructions.trim()
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        canGenerateWithAI
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                      title={
                        !canGenerateWithAI
                          ? t(
                              "skill.configureAiFirst",
                              "Please configure AI model in settings first",
                            )
                          : !instructions.trim()
                            ? t(
                                "skill.polishNeedsContent",
                                "Write some content first",
                              )
                            : t(
                                "skill.aiPolishHint",
                                "Polish content to SKILL.md standard format",
                              )
                      }
                    >
                      {isGenerating ? (
                        <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <SparklesIcon className="w-3.5 h-3.5" />
                      )}
                      {isGenerating
                        ? t("skill.polishing", "Polishing...")
                        : t("skill.aiPolish", "AI Polish")}
                    </button>
                    {/* Edit/Preview tabs */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                      <button
                        onClick={() => setInstrTab("edit")}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          instrTab === "edit"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("prompt.edit", "Edit")}
                      </button>
                      <button
                        onClick={() => setInstrTab("preview")}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          instrTab === "preview"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("prompt.preview", "Preview")}
                      </button>
                    </div>
                    {/* Fullscreen button */}
                    <button
                      onClick={handleEnterNativeFullscreen}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                      title={t("common.fullscreen", "Fullscreen Edit")}
                    >
                      <Maximize2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!canGenerateWithAI && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t(
                        "skill.aiGenerateHint",
                        "Configure an AI model in settings to enable AI generation",
                      )}
                    </p>
                  </div>
                )}
                {instrTab === "edit" ? (
                  <textarea
                    ref={textareaRef}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder={t(
                      "skill.instructionsPlaceholder",
                      "Enter skill instructions or SKILL.md content...",
                    )}
                    rows={isFullscreen ? 20 : 10}
                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                ) : (
                  <div
                    className={`p-4 rounded-lg bg-card border border-border text-sm break-words overflow-auto ${
                      isFullscreen ? "min-h-[400px]" : "min-h-[200px]"
                    }`}
                  >
                    {instructions ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                        >
                          {instructions}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm italic">
                        {t("skill.noContent", "No content")}
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(
                    "skill.instructionsHint",
                    "Supports Markdown format for guiding AI on how to use this skill",
                  )}
                </p>
              </div>

              {/* Hidden file input for MD upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {mode === "ai" && (
            <div className="space-y-4">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-xs text-primary flex items-center gap-2">
                  <BrainIcon className="w-3.5 h-3.5" />
                  {t(
                    "skill.aiCreateHint",
                    "Uses the Skill Creator skill to draft a professional SKILL.md. You can review and edit before saving.",
                  )}
                </p>
              </div>

              {!canGenerateWithAI && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t(
                      "skill.aiGenerateHint",
                      "Configure an AI model in settings to enable AI generation",
                    )}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("skill.name", "Name")}
                  <span className="ml-1 text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(sanitizeSkillName(e.target.value))}
                  placeholder={t("skill.namePlaceholder", "my-skill")}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(
                    "skill.nameHint",
                    "Lowercase letters, numbers, and hyphens only, e.g. my-skill-name",
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("skill.description", "Description")}
                  <span className="ml-1 text-destructive">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    "skill.aiDescPlaceholder",
                    "Describe what this skill should do, its purpose, and when to use it...",
                  )}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode("select")}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  {t("common.back", "Back")}
                </button>
                <button
                  onClick={handleAICreate}
                  disabled={
                    isGenerating ||
                    !canGenerateWithAI ||
                    !name.trim() ||
                    !description.trim()
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? (
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="w-4 h-4" />
                  )}
                  {isGenerating
                    ? t("skill.generating", "Generating...")
                    : t("skill.generateAndReview", "Generate & Review")}
                </button>
              </div>
            </div>
          )}

          {mode === "scan" && (
            <div className="space-y-4">
              {/* Before scan or while scanning */}
              {!scanDone && (
                <div className="text-center py-8">
                  <FolderOpenIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="font-medium mb-2">
                    {t("skill.scanLocalTitle", "Scan for Local Skills")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t(
                      "skill.scanLocalHint",
                      "Automatically detect SKILL.md files from Claude, Cursor, Windsurf and other AI tools.",
                    )}
                  </p>
                  <button
                    onClick={handleScanLocal}
                    disabled={isScanning}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isScanning ? (
                      <LoaderIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <SearchIcon className="w-4 h-4" />
                    )}
                    {isScanning
                      ? t("skill.scanning", "Scanning...")
                      : t("skill.startScan", "Start Scan")}
                  </button>
                </div>
              )}

              {/* Scan results */}
              {scanDone && annotatedScanResults.length > 0 && (
                <div className="space-y-3">
                  {scanImportNotice && (
                    <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                      {scanImportNotice}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-border bg-accent/25 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        {t("skill.scanStatsTotal", "总数")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {annotatedScanResults.length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-accent/25 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        {t("skill.scanStatsImported", "已导入")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {importedScanCount}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-accent/25 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        {t("skill.scanStatsImportable", "可导入")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {selectableScanResults.length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        {t("skill.scanStatsSelected", "已选择")}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-primary">
                        {selectedScanItems.size}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center">
                    <label className="relative block flex-1">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={scanSearchQuery}
                        onChange={(event) =>
                          setScanSearchQuery(event.target.value)
                        }
                        placeholder={t(
                          "skill.searchImportPlaceholder",
                          "搜索名称、描述、标签、平台或路径",
                        )}
                        className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowScanOptionalTags((prev) => !prev)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                        showScanOptionalTags
                          ? "border-primary/40 bg-primary/5 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <HashIcon className="h-4 w-4" />
                      {showScanOptionalTags
                        ? t("skill.hideOptionalTags", "隐藏可选标签")
                        : t("skill.showOptionalTags", "需要时再加标签")}
                    </button>
                  </div>

                  {/* Results header with count and select-all */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {t("skill.scanFound", "Found {{count}} skill(s)").replace(
                        "{{count}}",
                        String(visibleAnnotatedScanResults.length),
                      )}
                    </p>
                    {visibleSelectableScanResults.length > 0 && (
                      <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                      >
                        {visibleSelectableScanResults.every((skill) =>
                          selectedScanItems.has(skill.filePath),
                        ) ? (
                          <>
                            <CheckSquareIcon className="w-3.5 h-3.5" />{" "}
                            {t("skill.deselectAll", "Deselect All")}
                          </>
                        ) : (
                          <>
                            <SquareIcon className="w-3.5 h-3.5" />{" "}
                            {t("skill.selectAll", "Select All")}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Scrollable results cards */}
                  <div className="max-h-[480px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {visibleAnnotatedScanResults.map((skill) => {
                        const isSelected = selectedScanItems.has(
                          skill.filePath,
                        );
                        const shortPath = (() => {
                          const parts = skill.localPath
                            .replace(/\\/g, "/")
                            .split("/")
                            .filter(Boolean);
                          return parts.length >= 2
                            ? `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
                            : skill.localPath;
                        })();
                        return (
                          <button
                            key={skill.filePath}
                            onClick={() =>
                              !skill.isImported &&
                              toggleScanItem(skill.filePath)
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition-all shadow-sm ${
                              skill.isImported
                                ? "border-border bg-muted/30 opacity-70 cursor-not-allowed"
                                : isSelected
                                  ? "border-primary/40 bg-primary/5 shadow-primary/10"
                                  : "border-border bg-card hover:border-primary/30 hover:shadow-md"
                            }`}
                            disabled={skill.isImported}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${
                                  skill.isImported
                                    ? "bg-accent text-muted-foreground"
                                    : "bg-primary/10 text-primary"
                                }`}
                              >
                                <FileTextIcon className="w-5 h-5" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-semibold text-sm truncate">
                                        {skill.name}
                                      </h4>
                                      {skill.version && (
                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                          v{skill.version}
                                        </span>
                                      )}
                                      {skill.isImported && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-accent text-muted-foreground shrink-0">
                                          {t(
                                            "skill.importedBadge",
                                            "Already Imported",
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    {skill.author && (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {skill.author}
                                      </p>
                                    )}
                                  </div>

                                  <div className="shrink-0 pt-0.5">
                                    {skill.isImported || isSelected ? (
                                      <CheckSquareIcon className="w-4 h-4 text-primary" />
                                    ) : (
                                      <SquareIcon className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>

                                {skill.description && (
                                  <p className="mt-3 text-xs leading-5 text-muted-foreground line-clamp-3">
                                    {skill.description}
                                  </p>
                                )}

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {skill.platforms.map((p) => (
                                    <span
                                      key={p}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/8 text-primary/80"
                                    >
                                      {p}
                                    </span>
                                  ))}
                                </div>

                                {!skill.isImported &&
                                  isSelected &&
                                  showScanOptionalTags && (
                                    <div className="mt-4 rounded-xl border border-border bg-accent/20 p-3 space-y-2">
                                      <div className="text-[11px] font-medium text-foreground">
                                        {t(
                                          "skill.importTagsOptional",
                                          "导入标签（可选）",
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {(
                                          scanTagDrafts[skill.localPath] || []
                                        ).map((tag) => (
                                          <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-white"
                                          >
                                            <HashIcon className="w-3 h-3" />
                                            {tag}
                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleRemoveScanTag(
                                                  skill.localPath,
                                                  tag,
                                                );
                                              }}
                                              className="hover:text-white/70"
                                            >
                                              <XIcon className="w-3 h-3" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          value={
                                            scanTagInputs[skill.localPath] || ""
                                          }
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onChange={(event) =>
                                            setScanTagInputs((prev) => ({
                                              ...prev,
                                              [skill.localPath]:
                                                event.target.value,
                                            }))
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              handleAddScanTag(skill.localPath);
                                            }
                                          }}
                                          placeholder={t(
                                            "skill.enterTagHint",
                                            "输入新标签后按回车",
                                          )}
                                          className="flex-1 h-9 rounded-xl border-0 bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleAddScanTag(skill.localPath);
                                          }}
                                          disabled={
                                            !scanTagInputs[
                                              skill.localPath
                                            ]?.trim()
                                          }
                                          className="rounded-xl bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50"
                                        >
                                          {t("skill.addTag", "添加标签")}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                <div
                                  className="mt-4 flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono truncate"
                                  title={skill.localPath}
                                >
                                  <FolderOpenIcon className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{shortPath}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rescan button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleScanLocal}
                      disabled={isScanning}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {isScanning ? (
                        <LoaderIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        <SearchIcon className="w-3 h-3" />
                      )}
                      {t("skill.rescan", "Rescan")}
                    </button>
                  </div>
                </div>
              )}

              {/* Scan done but no results */}
              {scanDone && annotatedScanResults.length === 0 && (
                <div className="text-center py-8">
                  <FolderOpenIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {t(
                      "skill.noSkillsFound",
                      "No new local SKILL.md files found.",
                    )}
                  </p>
                  <button
                    onClick={handleScanLocal}
                    disabled={isScanning}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    {isScanning ? (
                      <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <SearchIcon className="w-3.5 h-3.5" />
                    )}
                    {t("skill.rescan", "Rescan")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer for scan mode */}
        {mode === "scan" && scanDone && annotatedScanResults.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0 bg-card">
            <span className="text-xs text-muted-foreground">
              {
                visibleSelectableScanResults.filter((skill) =>
                  selectedScanItems.has(skill.filePath),
                ).length
              }{" "}
              / {visibleSelectableScanResults.length}{" "}
              {t("skill.selected", "selected")}
            </span>
            <button
              onClick={handleImportSelected}
              disabled={isLoading || selectedScanItems.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <>
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                  {t("skill.importing", "Importing...")} ({importingCount}/
                  {selectedScanItems.size})
                </>
              ) : (
                <>
                  <CheckIcon className="w-4 h-4" />
                  {t("skill.importSelected", "Import Selected")} (
                  {selectedScanItems.size})
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer for manual mode */}
        {mode === "manual" && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-card">
            <button
              onClick={() => setMode("select")}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {t("common.back", "Back")}
            </button>
            <button
              onClick={handleManualCreate}
              disabled={isLoading || isGenerating || !name.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckIcon className="w-4 h-4" />
              )}
              {t("skill.create", "Create")}
            </button>
          </div>
        )}
      </div>
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          setShowUnsavedDialog(false);
          handleManualCreate();
        }}
        onDiscard={() => {
          setShowUnsavedDialog(false);
          handleClose();
        }}
      />
    </div>
  );
}
