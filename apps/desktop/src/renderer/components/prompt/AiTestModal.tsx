import { notifyTaskResult } from "../../services/application-notifications";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  PlayIcon,
  LoaderIcon,
  CopyIcon,
  CheckIcon,
  GitCompareIcon,
  ImageIcon,
  BracesIcon,
  FileTextIcon,
  ChevronDownIcon,
  SquareIcon,
  CheckSquareIcon,
  BotIcon,
} from "lucide-react";
import { AiTestDrawer } from "./AiTestDrawer";
import { parseTestResponseFormat } from "./ai-test-output-format";
import { AiTestResults } from "./AiTestResults";
import { recordPromptTestRun } from "../../services/prompt-test-history";
import {
  loadPromptVariableCache,
  savePromptVariableCache,
} from "../../services/prompt-variable-cache";
import { CollapsibleThinking } from "../ui/CollapsibleThinking";
import {
  chatCompletion,
  buildMessagesFromPrompt,
  multiModelCompare,
  AITestResult,
  generateImage,
  type ChatImageAttachment,
  type StreamCallbacks,
} from "../../services/ai";
import { resolveScenarioModel } from "../../services/ai-defaults";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { copyTextToClipboard } from "./prompt-copy-utils";
import {
  parsePromptVariables,
  replacePromptVariables,
} from "./prompt-modal-utils";
import { resolvePromptMarkdownHref } from "./prompt-markdown-url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { resolveGeneratedImageUrl } from "../../utils/generated-image-url";
import { downloadGeneratedImage } from "../../utils/download-generated-image";
import {
  getProviderDisplayName,
  MAX_AI_TEST_IMAGE_BYTES,
  MAX_AI_TEST_IMAGES,
  SUPPORTED_AI_TEST_IMAGE_MIME_TYPES,
  type AiTestImageAttachment,
  type AiTestModalProps,
} from "./ai-test-modal-config";
import {
  AiImageGenerationSection,
  AiTestAttachments,
} from "./AiTestModalSections";

export function AiTestModal({
  isOpen,
  onClose,
  prompt,
  initialMode,
  filledSystemPrompt,
  filledUserPrompt,
  onUsageIncrement,
  onSaveResponse,
  onAddImage,
}: AiTestModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [mode, setMode] = useState<"single" | "compare" | "image">("single");
  const [historyRevision, setHistoryRevision] = useState(0);
  // Separate loading states for single model and multi-model
  // 分离单模型和多模型的 loading 状态
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [thinkingContent, setThinkingContent] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<AITestResult[] | null>(
    null,
  );
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageGenerationError, setImageGenerationError] = useState<
    string | null
  >(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  // Variable fill state
  // 变量填充状态
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  // Output format state (Issue #38)
  // 输出格式状态
  const [outputFormat, setOutputFormat] = useState<
    "text" | "json_object" | "json_schema"
  >("text");
  const [jsonSchemaName, setJsonSchemaName] = useState("response");
  const [jsonSchemaContent, setJsonSchemaContent] = useState("");
  const singleContentBufferRef = useRef("");
  const singleThinkingBufferRef = useRef("");
  const singleContentRafRef = useRef<number | null>(null);
  const singleThinkingRafRef = useRef<number | null>(null);
  const compareBuffersRef = useRef<
    Record<string, { response: string; thinkingContent: string }>
  >({});
  const compareFlushRafRef = useRef<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const modalSessionRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const rehypePlugins = useMemo(() => [rehypeSanitize, rehypeHighlight], []);
  const markdownComponents = useMemo(
    () => ({
      a: ({
        children,
        href,
        node: _node,
        ...props
      }: React.ComponentProps<"a"> & { node?: unknown }) => {
        const safeHref = resolvePromptMarkdownHref(href);

        if (!safeHref) {
          return <span {...props}>{children}</span>;
        }

        return (
          <a
            {...props}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
      },
    }),
    [],
  );
  const [testImageAttachments, setTestImageAttachments] = useState<
    AiTestImageAttachment[]
  >([]);
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<
    string[]
  >([]);
  const isImagePrompt = prompt?.promptType === "image";

  // AI settings
  // AI 设置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiProtocol = useSettingsStore((state) => state.aiApiProtocol);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiProviders = useSettingsStore((state) => state.aiProviders);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore(
    (state) => state.scenarioModelDefaults,
  );
  const modelRouteDefaults = useSettingsStore(
    (state) => state.modelRouteDefaults,
  );

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || "").toLowerCase();
    // Currently Prompt only provides EN version fields: non-Chinese interface defaults to using English version (use if available, fallback to Chinese if not)
    // 目前 Prompt 只提供 EN 版本字段：非中文界面默认优先使用英文版（有则用，无则回退中文）
    return !lang.startsWith("zh");
  }, [i18n.language]);

  const defaultChatModel = useMemo(() => {
    return resolveScenarioModel(
      aiModels,
      scenarioModelDefaults,
      "promptTest",
      "chat",
      undefined,
      modelRouteDefaults,
    );
  }, [aiModels, modelRouteDefaults, scenarioModelDefaults]);

  // Get default image generation model
  // 获取默认生图模型
  const defaultImageModel = useMemo(() => {
    return resolveScenarioModel(
      aiModels,
      scenarioModelDefaults,
      "imageTest",
      "image",
      undefined,
      modelRouteDefaults,
    );
  }, [aiModels, modelRouteDefaults, scenarioModelDefaults]);

  const defaultImageProviderName = useMemo(
    () => getProviderDisplayName(defaultImageModel, aiProviders),
    [aiProviders, defaultImageModel],
  );

  // Get all image generation models
  // 获取所有生图模型
  const imageModels = useMemo(() => {
    return aiModels.filter((m) => m.type === "image");
  }, [aiModels]);

  const compareModels = useMemo(() => {
    if (isImagePrompt) {
      return [];
    }
    return aiModels.filter((model) => (model.type ?? "chat") === "chat");
  }, [aiModels, isImagePrompt]);

  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
      modalSessionRef.current += 1;
      clearCopyTimer();
    };
  }, [clearCopyTimer]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    modalSessionRef.current += 1;

    if (!isOpen) {
      clearCopyTimer();
      setCopied(false);
    }
  }, [clearCopyTimer, isOpen, prompt?.id]);

  const canApplyAsyncResult = useCallback(
    (session: number) =>
      isMountedRef.current &&
      isOpenRef.current &&
      modalSessionRef.current === session,
    [],
  );

  useEffect(() => {
    setSelectedModelIds((prev) =>
      prev.filter((id) => compareModels.some((model) => model.id === id)),
    );
  }, [compareModels]);

  useEffect(() => {
    if (!isOpen || !prompt) return;
    const nextMode = isImagePrompt
      ? "image"
      : initialMode === "compare"
        ? "compare"
        : "single";
    setMode(nextMode);
  }, [initialMode, isImagePrompt, isOpen, prompt]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const cancelSingleStreamRafs = useCallback(() => {
    if (singleContentRafRef.current !== null) {
      cancelAnimationFrame(singleContentRafRef.current);
      singleContentRafRef.current = null;
    }
    if (singleThinkingRafRef.current !== null) {
      cancelAnimationFrame(singleThinkingRafRef.current);
      singleThinkingRafRef.current = null;
    }
  }, []);

  const resetSingleStreamBuffers = useCallback(() => {
    cancelSingleStreamRafs();
    singleContentBufferRef.current = "";
    singleThinkingBufferRef.current = "";
  }, [cancelSingleStreamRafs]);

  const scheduleSingleContentFlush = useCallback(
    (session?: number) => {
      if (singleContentRafRef.current !== null) return;
      singleContentRafRef.current = requestAnimationFrame(() => {
        singleContentRafRef.current = null;
        if (session !== undefined && !canApplyAsyncResult(session)) {
          return;
        }
        flushSync(() => {
          setAiResponse(singleContentBufferRef.current);
        });
      });
    },
    [canApplyAsyncResult],
  );

  const scheduleSingleThinkingFlush = useCallback(
    (session?: number) => {
      if (singleThinkingRafRef.current !== null) return;
      singleThinkingRafRef.current = requestAnimationFrame(() => {
        singleThinkingRafRef.current = null;
        if (session !== undefined && !canApplyAsyncResult(session)) {
          return;
        }
        flushSync(() => {
          setThinkingContent(singleThinkingBufferRef.current);
        });
      });
    },
    [canApplyAsyncResult],
  );

  const flushCompareBuffers = useCallback(() => {
    setCompareResults((prev) => {
      if (!prev) return prev;
      return prev.map((result) => {
        const buffered = result.id
          ? compareBuffersRef.current[result.id]
          : undefined;
        if (!buffered) {
          return result;
        }
        return {
          ...result,
          response: buffered.response,
          thinkingContent: buffered.thinkingContent,
        };
      });
    });
  }, []);

  const scheduleCompareFlush = useCallback(
    (session?: number) => {
      if (compareFlushRafRef.current !== null) return;
      compareFlushRafRef.current = requestAnimationFrame(() => {
        compareFlushRafRef.current = null;
        if (session !== undefined && !canApplyAsyncResult(session)) {
          return;
        }
        flushSync(() => {
          flushCompareBuffers();
        });
      });
    },
    [canApplyAsyncResult, flushCompareBuffers],
  );

  const resetCompareBuffers = useCallback(() => {
    if (compareFlushRafRef.current !== null) {
      cancelAnimationFrame(compareFlushRafRef.current);
      compareFlushRafRef.current = null;
    }
    compareBuffersRef.current = {};
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetSingleStreamBuffers();
      resetCompareBuffers();
    }
  }, [isOpen, resetCompareBuffers, resetSingleStreamBuffers]);

  // Get all variables
  // 获取所有变量
  const allVariables = useMemo(() => {
    if (!prompt) return [];
    const sysText = preferEnglish
      ? prompt.systemPromptEn || prompt.systemPrompt || ""
      : prompt.systemPrompt || "";
    const userText = preferEnglish
      ? prompt.userPromptEn || prompt.userPrompt
      : prompt.userPrompt;
    return parsePromptVariables(`${sysText}\n${userText}`);
  }, [prompt, preferEnglish]);

  // Build single model configuration - must be called before all conditional returns
  // 构建单模型配置 - 必须在所有条件返回之前调用
  const buildSingleConfig = useCallback(() => {
    if (defaultChatModel) {
      return {
        id: defaultChatModel.id,
        provider: defaultChatModel.provider,
        apiProtocol: defaultChatModel.apiProtocol,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };
    }
    // 兼容旧版单模型配置
    return {
      provider: aiProvider,
      apiProtocol: aiApiProtocol,
      apiKey: aiApiKey,
      apiUrl: aiApiUrl,
      model: aiModel,
    };
  }, [
    defaultChatModel,
    aiProvider,
    aiApiProtocol,
    aiApiKey,
    aiApiUrl,
    aiModel,
  ]);

  const singleConfigForUi = useMemo(
    () => buildSingleConfig(),
    [buildSingleConfig],
  );
  const canRunSingleTest = !!(
    singleConfigForUi.apiKey &&
    singleConfigForUi.apiUrl &&
    singleConfigForUi.model
  );

  // 替换变量
  const replaceVariables = useCallback(
    (text: string): string => {
      return replacePromptVariables(text, variableValues);
    },
    [variableValues],
  );

  // 计算实际使用的 prompt 内容
  const baseSystemPrompt = useMemo(() => {
    if (!prompt) return "";
    return preferEnglish
      ? prompt.systemPromptEn || prompt.systemPrompt || ""
      : prompt.systemPrompt || "";
  }, [prompt, preferEnglish]);

  const baseUserPrompt = useMemo(() => {
    if (!prompt) return "";
    return preferEnglish
      ? prompt.userPromptEn || prompt.userPrompt
      : prompt.userPrompt;
  }, [prompt, preferEnglish]);

  const systemPrompt = useMemo(
    () => filledSystemPrompt ?? replaceVariables(baseSystemPrompt),
    [filledSystemPrompt, replaceVariables, baseSystemPrompt],
  );
  const userPrompt = useMemo(
    () => filledUserPrompt ?? replaceVariables(baseUserPrompt),
    [filledUserPrompt, replaceVariables, baseUserPrompt],
  );

  const readImageFileAsAttachment = useCallback(
    (file: File): Promise<AiTestImageAttachment> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error(t("prompt.aiTestImageReadFailed")));
            return;
          }

          const commaIndex = reader.result.indexOf(",");
          if (commaIndex === -1) {
            reject(new Error(t("prompt.aiTestImageReadFailed")));
            return;
          }

          resolve({
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            dataUrl: reader.result,
            base64: reader.result.slice(commaIndex + 1),
          });
        };
        reader.onerror = () =>
          reject(new Error(t("prompt.aiTestImageReadFailed")));
        reader.readAsDataURL(file);
      });
    },
    [t],
  );

  const formatImageSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }, []);

  const handleTestImageSelection = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const remainingSlots = MAX_AI_TEST_IMAGES - testImageAttachments.length;
      if (remainingSlots <= 0) {
        showToast(
          t("prompt.aiTestImageLimit", { count: MAX_AI_TEST_IMAGES }),
          "error",
        );
        return;
      }

      const selectedFiles = Array.from(files);
      if (selectedFiles.length > remainingSlots) {
        showToast(
          t("prompt.aiTestImageLimit", { count: MAX_AI_TEST_IMAGES }),
          "error",
        );
      }

      const acceptedFiles: File[] = [];
      for (const file of selectedFiles.slice(0, remainingSlots)) {
        if (!SUPPORTED_AI_TEST_IMAGE_MIME_TYPES.has(file.type)) {
          showToast(
            t("prompt.aiTestImageUnsupported", { name: file.name }),
            "error",
          );
          continue;
        }
        if (file.size > MAX_AI_TEST_IMAGE_BYTES) {
          showToast(
            t("prompt.aiTestImageTooLarge", {
              name: file.name,
              size: formatImageSize(MAX_AI_TEST_IMAGE_BYTES),
            }),
            "error",
          );
          continue;
        }
        acceptedFiles.push(file);
      }

      if (acceptedFiles.length === 0) return;

      try {
        const attachments = await Promise.all(
          acceptedFiles.map(readImageFileAsAttachment),
        );
        setTestImageAttachments((prev) =>
          [...prev, ...attachments].slice(0, MAX_AI_TEST_IMAGES),
        );
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : t("prompt.aiTestImageReadFailed"),
          "error",
        );
      }
    },
    [
      formatImageSize,
      readImageFileAsAttachment,
      showToast,
      t,
      testImageAttachments.length,
    ],
  );

  const removeTestImageAttachment = useCallback((id: string) => {
    setTestImageAttachments((prev) =>
      prev.filter((attachment) => attachment.id !== id),
    );
  }, []);

  const toggleReferenceImage = useCallback((fileName: string) => {
    setSelectedReferenceImages((prev) =>
      prev.includes(fileName)
        ? prev.filter((item) => item !== fileName)
        : [...prev, fileName],
    );
  }, []);

  const buildImageReferenceAttachments = useCallback(async (): Promise<
    ChatImageAttachment[]
  > => {
    const savedReferences = await Promise.all<ChatImageAttachment | null>(
      selectedReferenceImages.map(async (fileName) => {
        const base64 = await window.electron?.readImageBase64?.(fileName);
        if (!base64) return null;

        const extension = fileName.split(".").pop()?.toLowerCase();
        const mimeType =
          extension === "jpg" || extension === "jpeg"
            ? "image/jpeg"
            : extension === "webp"
              ? "image/webp"
              : extension === "gif"
                ? "image/gif"
                : "image/png";

        return {
          name: fileName,
          mimeType,
          base64,
        };
      }),
    );

    return [
      ...savedReferences.filter(
        (item): item is ChatImageAttachment => item !== null,
      ),
      ...testImageAttachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        base64: attachment.base64,
      })),
    ];
  }, [selectedReferenceImages, testImageAttachments]);

  const buildChatAttachments = useCallback(async (): Promise<
    ChatImageAttachment[]
  > => {
    if (isImagePrompt) {
      return buildImageReferenceAttachments();
    }

    return testImageAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      base64: attachment.base64,
    }));
  }, [buildImageReferenceAttachments, isImagePrompt, testImageAttachments]);

  // 重置状态
  useEffect(() => {
    if (isOpen && prompt) {
      resetSingleStreamBuffers();
      resetCompareBuffers();
      setAiResponse(null);
      setThinkingContent(null);
      setCompareResults(null);
      setGeneratedImages([]);
      setImageGenerationError(null);
      clearCopyTimer();
      setCopied(false);
      setTestImageAttachments([]);
      setSelectedReferenceImages(isImagePrompt ? prompt.images || [] : []);
      setIsSingleLoading(false);
      setIsCompareLoading(false);
      setIsImageLoading(false);
      // 初始化变量值
      const history = loadPromptVariableCache(prompt.id);
      const initialValues: Record<string, string> = {};
      allVariables.forEach((v) => {
        initialValues[v.name] = history[v.name] ?? v.defaultValue ?? "";
      });
      setVariableValues(initialValues);
    }
  }, [
    allVariables,
    clearCopyTimer,
    isImagePrompt,
    isOpen,
    prompt?.id,
    resetCompareBuffers,
    resetSingleStreamBuffers,
  ]);

  useEffect(() => {
    return () => {
      resetSingleStreamBuffers();
      resetCompareBuffers();
    };
  }, [resetCompareBuffers, resetSingleStreamBuffers]);

  // 如果没有 prompt，返回 null（所有 hooks 已在上面调用完毕）
  if (!prompt) return null;

  const updateVariableValue = (name: string, value: string): void => {
    const next = { ...variableValues, [name]: value };
    setVariableValues(next);
    try {
      savePromptVariableCache(prompt.id, {
        ...loadPromptVariableCache(prompt.id),
        ...next,
      });
    } catch (error) {
      console.error("Saving AI test variable values failed", error);
      showToast(t("prompt.variableCacheSaveError"), "error");
    }
  };

  const saveTestHistory = async (
    testMode: "single" | "compare",
    results: AITestResult[],
  ): Promise<void> => {
    const session = modalSessionRef.current;
    await recordPromptTestRun(
      {
        promptId: prompt.id,
        promptVersion: prompt.currentVersion,
        mode: testMode,
        systemPrompt,
        userPrompt,
        outputFormat:
          outputFormat === "json_schema"
            ? `${outputFormat}: ${jsonSchemaName}\n${jsonSchemaContent}`
            : outputFormat,
        attachmentNames: testImageAttachments.map(
          (attachment) => attachment.name,
        ),
        results: results.map((result) => ({
          model: result.model,
          provider: result.provider,
          success: result.success,
          response: result.response ?? "",
          thinkingContent: result.thinkingContent ?? "",
          error: result.error ?? "",
          latency: result.latency ?? 0,
        })),
      },
      () => showToast(t("testHistory.saveError"), "error"),
    );
    if (canApplyAsyncResult(session)) setHistoryRevision((value) => value + 1);
  };

  const getResponseFormat = () => {
    try {
      return {
        value: parseTestResponseFormat(
          outputFormat,
          jsonSchemaName,
          jsonSchemaContent,
        ),
      };
    } catch {
      showToast(t("prompt.jsonSchemaInvalid"), "error");
      return null;
    }
  };

  // 单模型测试
  const runSingleTest = async () => {
    const config = buildSingleConfig();
    if (!config.apiKey || !config.apiUrl || !config.model) return;

    const format = getResponseFormat();
    if (!format) return;
    const responseFormat = format.value;
    const singleSession = modalSessionRef.current;
    const startedAt = Date.now();
    setIsSingleLoading(true);
    setAiResponse(null);
    setThinkingContent(null);
    resetSingleStreamBuffers();

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    try {
      const imageAttachments = await buildChatAttachments();
      if (!canApplyAsyncResult(singleSession)) {
        return;
      }

      const messages = buildMessagesFromPrompt(
        systemPrompt,
        userPrompt,
        undefined,
        imageAttachments,
      );
      const useThinking = !!config.chatParams?.enableThinking;

      singleContentBufferRef.current = "";
      singleThinkingBufferRef.current = "";
      setAiResponse("");
      if (useThinking) setThinkingContent("");

      const result = await chatCompletion(
        // 注意：显式传递 stream 和 enableThinking 参数
        // Note: Explicitly pass stream and enableThinking parameters
        config,
        messages,
        {
          stream: true,
          enableThinking: useThinking,
          streamCallbacks: {
            onContent: (chunk) => {
              if (!canApplyAsyncResult(singleSession)) return;
              singleContentBufferRef.current += chunk;
              scheduleSingleContentFlush(singleSession);
            },
            onThinking: (chunk) => {
              if (!canApplyAsyncResult(singleSession)) return;
              singleThinkingBufferRef.current += chunk;
              scheduleSingleThinkingFlush(singleSession);
            },
          },
          // Output format (Issue #38)
          // 输出格式
          responseFormat,
        },
      );

      await saveTestHistory("single", [
        {
          model: config.model,
          provider: config.provider,
          success: true,
          response: result.content,
          thinkingContent: result.thinkingContent,
          latency: Date.now() - startedAt,
        },
      ]);
      if (!canApplyAsyncResult(singleSession)) {
        return;
      }

      cancelSingleStreamRafs();
      setAiResponse(singleContentBufferRef.current || result.content);
      setThinkingContent(
        singleThinkingBufferRef.current || result.thinkingContent || null,
      );

      // 保存 AI 响应到 Prompt / Save AI response to Prompt
      if (onSaveResponse && result.content) {
        onSaveResponse(prompt.id, result.content);
      }
      notifyTaskResult("promptTest", "success");
    } catch (error) {
      await saveTestHistory("single", [
        {
          model: config.model,
          provider: config.provider,
          success: false,
          error: error instanceof Error ? error.message : t("common.error"),
          latency: Date.now() - startedAt,
        },
      ]);
      if (!canApplyAsyncResult(singleSession)) {
        return;
      }
      cancelSingleStreamRafs();
      setAiResponse(
        `${t("common.error")}: ${error instanceof Error ? error.message : t("common.error")}`,
      );
      notifyTaskResult("promptTest", "error");
    } finally {
      if (canApplyAsyncResult(singleSession)) {
        setIsSingleLoading(false);
      }
    }
  };

  // 多模型对比
  const runCompare = async () => {
    if (selectedModelIds.length < 2) return;

    const format = getResponseFormat();
    if (!format) return;
    const responseFormat = format.value;
    const compareSession = modalSessionRef.current;
    const startedAt = Date.now();
    setIsCompareLoading(true);
    setCompareResults(null);

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    const selectedConfigs = compareModels
      .filter((m) => selectedModelIds.includes(m.id))
      .map((m) => ({
        id: m.id,
        provider: m.provider,
        apiProtocol: m.apiProtocol,
        apiKey: m.apiKey,
        apiUrl: m.apiUrl,
        model: m.model,
        chatParams: m.chatParams,
        imageParams: m.imageParams,
      }));

    try {
      const imageAttachments = await buildChatAttachments();
      if (!canApplyAsyncResult(compareSession)) {
        return;
      }

      const messages = buildMessagesFromPrompt(
        systemPrompt,
        userPrompt,
        undefined,
        imageAttachments,
      );

      resetCompareBuffers();
      compareBuffersRef.current = Object.fromEntries(
        selectedConfigs.map((config) => [
          config.id,
          { response: "", thinkingContent: "" },
        ]),
      );

      // 支持流式：提前渲染占位结果，让用户能看到“正在流式输出”的差异
      setCompareResults(
        selectedConfigs.map((c) => ({
          id: c.id,
          success: true,
          response: "",
          thinkingContent: "",
          latency: 0,
          model: c.model,
          provider: c.provider,
        })),
      );

      const streamCallbacksMap = new Map<string, StreamCallbacks>();
      for (const cfg of selectedConfigs) {
        streamCallbacksMap.set(cfg.id, {
          onContent: (chunk: string) => {
            if (!canApplyAsyncResult(compareSession)) return;
            const buffer = compareBuffersRef.current[cfg.id];
            if (!buffer) return;
            buffer.response += chunk;
            scheduleCompareFlush(compareSession);
          },
          onThinking: (chunk: string) => {
            if (!canApplyAsyncResult(compareSession)) return;
            const buffer = compareBuffersRef.current[cfg.id];
            if (!buffer) return;
            buffer.thinkingContent += chunk;
            scheduleCompareFlush(compareSession);
          },
        });
      }

      const result = await multiModelCompare(selectedConfigs, messages, {
        stream: true,
        streamCallbacksMap,
        responseFormat,
      });
      await saveTestHistory("compare", result.results);
      if (!canApplyAsyncResult(compareSession)) {
        return;
      }

      flushCompareBuffers();
      setCompareResults(result.results);
      const successes = result.results.filter((item) => item.success).length;
      notifyTaskResult(
        "promptTest",
        successes === result.results.length
          ? "success"
          : successes === 0
            ? "error"
            : "attention",
      );
    } catch (error) {
      await saveTestHistory(
        "compare",
        selectedConfigs.map((config) => ({
          model: config.model,
          provider: config.provider,
          success: false,
          error: error instanceof Error ? error.message : t("common.error"),
          latency: Date.now() - startedAt,
        })),
      );
      if (!canApplyAsyncResult(compareSession)) {
        return;
      }
      console.error("Prompt comparison failed:", error);
      setCompareResults(
        selectedConfigs.map((config) => ({
          id: config.id,
          success: false,
          error: error instanceof Error ? error.message : t("common.error"),
          latency: 0,
          model: config.model,
          provider: config.provider,
        })),
      );
      notifyTaskResult("promptTest", "error");
    } finally {
      if (canApplyAsyncResult(compareSession)) {
        resetCompareBuffers();
        setIsCompareLoading(false);
      }
    }
  };

  // 切换模型选择
  const toggleModelSelection = (modelId: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    );
  };

  // 复制响应
  const handleCopy = async (text: string) => {
    await copyTextToClipboard(text);
    if (!isMountedRef.current || !isOpenRef.current) {
      return;
    }
    clearCopyTimer();
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  // 生图测试
  const runImageTest = async () => {
    if (!defaultImageModel) {
      showToast(t("settings.configImageModel"), "error");
      return;
    }

    const imageSession = modalSessionRef.current;
    setIsImageLoading(true);
    setGeneratedImages([]);
    setImageGenerationError(null);

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    try {
      const config = {
        provider: defaultImageModel.provider,
        apiProtocol: defaultImageModel.apiProtocol,
        apiKey: defaultImageModel.apiKey,
        apiUrl: defaultImageModel.apiUrl,
        model: defaultImageModel.model,
      };

      const referenceImages = await buildImageReferenceAttachments();
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }

      const result = await generateImage(config, userPrompt, {
        n: 1,
        referenceImages,
      });
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }

      const urls: string[] = [];
      for (const item of result.data) {
        if (item.url) {
          const resolved = resolveGeneratedImageUrl(item.url);
          if (resolved) {
            urls.push(resolved.url);
          }
        } else if (item.b64_json) {
          // 将 base64 转换为 data URL
          const resolved = resolveGeneratedImageUrl(
            `data:image/png;base64,${item.b64_json}`,
          );
          if (resolved) {
            urls.push(resolved.url);
          }
        }
      }

      setGeneratedImages(urls);
      if (urls.length > 0) {
        notifyTaskResult("generation", "success");
      } else {
        setImageGenerationError(t("settings.imageGenEmptyResult"));
        notifyTaskResult("generation", "error");
      }
    } catch (error) {
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : t("common.error");
      setImageGenerationError(message);
      notifyTaskResult("generation", "error");
    } finally {
      if (canApplyAsyncResult(imageSession)) {
        setIsImageLoading(false);
      }
    }
  };

  const renderAiResponseContent = (content?: string) => {
    if (!content) {
      return null;
    }

    return (
      <div className="text-[15px] leading-relaxed markdown-content space-y-3 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  // 将生成的图片添加到 Prompt
  const handleAddImageToPrompt = async (imageUrl: string) => {
    if (!onAddImage) return;

    try {
      const resolved = resolveGeneratedImageUrl(imageUrl);
      if (!resolved) {
        showToast(t("prompt.uploadFailed"), "error");
        return;
      }

      // 如果是外部 URL，需要先下载到本地
      if (resolved.kind === "remote") {
        const fileName = await window.electron?.downloadImage?.(resolved.url);
        if (fileName) {
          onAddImage(fileName);
          showToast(t("prompt.imageAddedToPrompt"), "success");
        } else {
          showToast(t("prompt.uploadFailed"), "error");
        }
      } else {
        // base64 图片，需要保存到本地
        const fileName = `generated-${Date.now()}.png`;
        const saved = await window.electron?.saveImageBase64?.(
          fileName,
          resolved.base64,
        );
        if (saved) {
          onAddImage(fileName);
          showToast(t("prompt.imageAddedToPrompt"), "success");
        } else {
          showToast(t("prompt.uploadFailed"), "error");
        }
      }
    } catch (error) {
      showToast(t("prompt.uploadFailed"), "error");
    }
  };

  // 下载图片
  const handleDownloadImage = async (imageUrl: string, index: number) => {
    try {
      await downloadGeneratedImage({
        imageUrl,
        fileName: `generated-image-${index + 1}.png`,
      });
      showToast(t("common.downloadSuccess"), "success");
    } catch (error) {
      showToast(t("common.downloadFailed"), "error");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 bg-background/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <AiTestDrawer
        key={prompt.id}
        promptId={prompt.id}
        title={prompt.title}
        mode={mode}
        onMode={setMode}
        onClose={onClose}
        revision={historyRevision}
        renderContent={renderAiResponseContent}
      >
        <div className="max-h-[42vh] shrink-0 overflow-y-auto border-b border-border px-5 py-3">
          <details open className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <FileTextIcon
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              {t("testHistory.input")}
              <ChevronDownIcon
                className="ml-auto h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-3 space-y-4">
              {/* 变量填充 */}
              {allVariables.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <BracesIcon className="w-4 h-4" aria-hidden="true" />
                    {t("prompt.fillVariables")}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allVariables.map((variable) => (
                      <div key={variable.name} className="space-y-1">
                        <label className="text-xs text-muted-foreground font-mono">{`{{${variable.name}}}`}</label>
                        <input
                          type="text"
                          aria-label={`{{${variable.name}}}`}
                          value={variableValues[variable.name] || ""}
                          onChange={(e) =>
                            updateVariableValue(variable.name, e.target.value)
                          }
                          placeholder={t("prompt.enterValue")}
                          className="w-full px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {systemPrompt && (
                <div className="space-y-1">
                  <h4 className="text-xs text-muted-foreground">
                    {t("prompt.systemPromptLabel")}
                  </h4>
                  <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">
                    {systemPrompt}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <h4 className="text-xs text-muted-foreground">
                  {t("prompt.userPromptLabel")}
                </h4>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm leading-6">
                  {userPrompt}
                </p>
              </div>
              <AiTestAttachments
                attachments={testImageAttachments}
                formatImageSize={formatImageSize}
                imageInputRef={imageInputRef}
                isImagePrompt={isImagePrompt}
                onFilesSelected={(files) =>
                  void handleTestImageSelection(files)
                }
                onRemoveAttachment={removeTestImageAttachment}
                onToggleReference={toggleReferenceImage}
                promptImages={prompt.images}
                selectedReferenceImages={selectedReferenceImages}
                t={t}
              />

              {(mode === "single" || mode === "compare") && (
                <div>
                  {" "}
                  {/* 输出格式选择器 (Issue #38) */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {t("prompt.outputFormat")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={outputFormat === "text"}
                        onClick={() => setOutputFormat("text")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          outputFormat === "text"
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {t("prompt.outputFormatText")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={outputFormat === "json_object"}
                        onClick={() => setOutputFormat("json_object")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          outputFormat === "json_object"
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {t("prompt.outputFormatJson")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={outputFormat === "json_schema"}
                        onClick={() => setOutputFormat("json_schema")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          outputFormat === "json_schema"
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {t("prompt.outputFormatJsonSchema")}
                      </button>
                    </div>

                    {/* JSON Schema 编辑器 */}
                    {outputFormat === "json_schema" && (
                      <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="space-y-1">
                          <label
                            htmlFor="test-schema-name"
                            className="text-xs text-muted-foreground"
                          >
                            {t("prompt.jsonSchemaName")}
                          </label>
                          <input
                            id="test-schema-name"
                            type="text"
                            value={jsonSchemaName}
                            onChange={(e) => setJsonSchemaName(e.target.value)}
                            placeholder={t(
                              "prompt.jsonSchemaName",
                            ).toLowerCase()}
                            className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="test-schema-content"
                            className="text-xs text-muted-foreground"
                          >
                            {t("prompt.jsonSchemaContent")}
                          </label>
                          <textarea
                            id="test-schema-content"
                            value={jsonSchemaContent}
                            onChange={(e) =>
                              setJsonSchemaContent(e.target.value)
                            }
                            placeholder={t("prompt.jsonSchemaPlaceholder")}
                            rows={6}
                            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("prompt.jsonSchemaHint")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
        {mode === "compare" && (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <GitCompareIcon className="h-4 w-4" aria-hidden="true" />
                {t("prompt.selectModelsHint")}
              </span>
              {compareModels.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => toggleModelSelection(model.id)}
                  aria-pressed={selectedModelIds.includes(model.id)}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
                >
                  {selectedModelIds.includes(model.id) ? (
                    <CheckSquareIcon
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <SquareIcon
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {model.name || model.model}
                </button>
              ))}
            </div>
            <h3 className="flex shrink-0 items-center gap-2 px-5 py-3 text-sm font-semibold">
              <BotIcon className="h-4 w-4" aria-hidden="true" />
              {t("testWorkbench.results")}
            </h3>
            {compareResults ? (
              <AiTestResults
                results={compareResults}
                loading={isCompareLoading}
                renderContent={renderAiResponseContent}
              />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                {t("testWorkbench.compareEmpty")}
              </div>
            )}
          </>
        )}
        {mode === "single" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <BotIcon className="h-4 w-4" aria-hidden="true" />
                {t("prompt.aiResponse")}
              </h3>
              {aiResponse && (
                <button
                  type="button"
                  onClick={() => void handleCopy(aiResponse)}
                  className="inline-flex items-center gap-2 rounded-md p-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <CopyIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t(copied ? "prompt.copied" : "prompt.copyResponse")}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <CollapsibleThinking
                content={thinkingContent}
                isLoading={isSingleLoading}
              />
              {aiResponse
                ? renderAiResponseContent(aiResponse)
                : !isSingleLoading && (
                    <p className="text-sm text-muted-foreground">
                      {t("testWorkbench.singleEmpty")}
                    </p>
                  )}
            </div>
          </div>
        )}
        {mode === "image" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {" "}
            {/* 生图测试 */}
            {isImagePrompt && mode === "image" && (
              <AiImageGenerationSection
                defaultImageModel={defaultImageModel}
                generatedImages={generatedImages}
                imageGenerationError={imageGenerationError}
                isLoading={isImageLoading}
                onAddImage={
                  onAddImage
                    ? (imageUrl) => void handleAddImageToPrompt(imageUrl)
                    : undefined
                }
                onDownloadImage={(imageUrl, index) =>
                  void handleDownloadImage(imageUrl, index)
                }
                onRun={() => void runImageTest()}
                providerName={defaultImageProviderName}
                t={t}
              />
            )}
          </div>
        )}
        {mode !== "image" && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {mode === "single"
                ? `${t("settings.model")}: ${singleConfigForUi.model || "-"}`
                : t("prompt.compareModels", { count: selectedModelIds.length })}
            </span>
            <button
              type="button"
              onClick={() =>
                void (mode === "single" ? runSingleTest() : runCompare())
              }
              disabled={
                mode === "single"
                  ? isSingleLoading || !canRunSingleTest
                  : isCompareLoading || selectedModelIds.length < 2
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {(mode === "single" ? isSingleLoading : isCompareLoading) ? (
                <LoaderIcon
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <PlayIcon className="h-4 w-4" aria-hidden="true" />
              )}
              {t(
                mode === "single"
                  ? isSingleLoading
                    ? "prompt.testing"
                    : "prompt.aiTest"
                  : isCompareLoading
                    ? "prompt.comparing"
                    : "settings.runCompare",
              )}
            </button>
          </footer>
        )}
      </AiTestDrawer>
    </div>,
    document.body,
  );
}
