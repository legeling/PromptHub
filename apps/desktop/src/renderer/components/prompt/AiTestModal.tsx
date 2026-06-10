import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PlayIcon, LoaderIcon, CopyIcon, CheckIcon, GitCompareIcon, ImageIcon, PlusIcon, DownloadIcon, BracesIcon, PaperclipIcon, XIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { CollapsibleThinking } from '../ui/CollapsibleThinking';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult, generateImage, type ChatImageAttachment } from '../../services/ai';
import { resolveScenarioModel } from '../../services/ai-defaults';
import { useSettingsStore, type AIModelConfig, type AIProviderConfig } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { LocalImage } from '../ui/LocalImage';
import type { Prompt } from '@prompthub/shared/types';
import { copyTextToClipboard } from './prompt-copy-utils';
import { parsePromptVariables, replacePromptVariables } from './prompt-modal-utils';
import { resolvePromptMarkdownHref } from './prompt-markdown-url';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { resolveGeneratedImageUrl } from '../../utils/generated-image-url';
import { downloadGeneratedImage } from '../../utils/download-generated-image';

interface AiTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
  initialMode?: 'single' | 'compare' | 'image';
  filledSystemPrompt?: string;
  filledUserPrompt?: string;
  onUsageIncrement?: (promptId: string) => void;
  onSaveResponse?: (promptId: string, response: string) => void;
  onAddImage?: (imageUrl: string) => void; // Add: Add generated image to Prompt
  // 新增：将生成的图片添加到 Prompt
}

interface AiTestImageAttachment extends ChatImageAttachment {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
}

const MAX_AI_TEST_IMAGES = 8;
const MAX_AI_TEST_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AI_TEST_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
function getProviderDisplayName(
  model: AIModelConfig | null,
  providers: AIProviderConfig[],
): string | null {
  if (!model) {
    return null;
  }

  const exactMatch = providers.find(
    (provider) =>
      provider.provider === model.provider &&
      provider.apiProtocol === model.apiProtocol &&
      provider.apiUrl === model.apiUrl &&
      provider.apiKey === model.apiKey,
  );
  const endpointMatch =
    exactMatch ??
    providers.find(
      (provider) =>
        provider.provider === model.provider &&
        provider.apiProtocol === model.apiProtocol &&
        provider.apiUrl === model.apiUrl,
    );

  return endpointMatch?.name?.trim() || endpointMatch?.provider || model.provider;
}

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
  const [mode, setMode] = useState<'single' | 'compare' | 'image'>('single');
  const [isExpanded, setIsExpanded] = useState(false);
  // Separate loading states for single model and multi-model
  // 分离单模型和多模型的 loading 状态
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [thinkingContent, setThinkingContent] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<AITestResult[] | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  // Variable fill state
  // 变量填充状态
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  // Output format state (Issue #38)
  // 输出格式状态
  const [outputFormat, setOutputFormat] = useState<'text' | 'json_object' | 'json_schema'>('text');
  const [jsonSchemaName, setJsonSchemaName] = useState('response');
  const [jsonSchemaContent, setJsonSchemaContent] = useState('');
  const singleContentBufferRef = useRef('');
  const singleThinkingBufferRef = useRef('');
  const singleContentRafRef = useRef<number | null>(null);
  const singleThinkingRafRef = useRef<number | null>(null);
  const compareBuffersRef = useRef<Record<string, { response: string; thinkingContent: string }>>({});
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
  const [testImageAttachments, setTestImageAttachments] = useState<AiTestImageAttachment[]>([]);
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<string[]>([]);
  const isImagePrompt = prompt?.promptType === 'image';

  // AI settings
  // AI 设置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiProtocol = useSettingsStore((state) => state.aiApiProtocol);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiProviders = useSettingsStore((state) => state.aiProviders);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore((state) => state.scenarioModelDefaults);
  const modelRouteDefaults = useSettingsStore((state) => state.modelRouteDefaults);

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    // Currently Prompt only provides EN version fields: non-Chinese interface defaults to using English version (use if available, fallback to Chinese if not)
    // 目前 Prompt 只提供 EN 版本字段：非中文界面默认优先使用英文版（有则用，无则回退中文）
    return !(lang.startsWith('zh'));
  }, [i18n.language]);

  const defaultChatModel = useMemo(() => {
    return resolveScenarioModel(
      aiModels,
      scenarioModelDefaults,
      'promptTest',
      'chat',
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
      'imageTest',
      'image',
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
    return aiModels.filter((m) => m.type === 'image');
  }, [aiModels]);

  const compareModels = useMemo(() => {
    if (isImagePrompt) {
      return [];
    }
    return aiModels.filter((model) => (model.type ?? 'chat') === 'chat');
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
      prev.filter((id) => compareModels.some((model) => model.id === id))
    );
  }, [compareModels]);

  useEffect(() => {
    if (!isOpen || !prompt) return;
    const nextMode = isImagePrompt
      ? 'image'
      : initialMode === 'compare'
        ? 'compare'
        : 'single';
    setMode(nextMode);
  }, [initialMode, isImagePrompt, isOpen, prompt]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
    singleContentBufferRef.current = '';
    singleThinkingBufferRef.current = '';
  }, [cancelSingleStreamRafs]);

  const scheduleSingleContentFlush = useCallback((session?: number) => {
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
  }, [canApplyAsyncResult]);

  const scheduleSingleThinkingFlush = useCallback((session?: number) => {
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
  }, [canApplyAsyncResult]);

  const flushCompareBuffers = useCallback(() => {
    setCompareResults((prev) => {
      if (!prev) return prev;
      return prev.map((result) => {
        const buffered = result.id ? compareBuffersRef.current[result.id] : undefined;
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

  const scheduleCompareFlush = useCallback((session?: number) => {
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
  }, [canApplyAsyncResult, flushCompareBuffers]);

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
    const sysText = preferEnglish ? (prompt.systemPromptEn || prompt.systemPrompt || '') : (prompt.systemPrompt || '');
    const userText = preferEnglish ? (prompt.userPromptEn || prompt.userPrompt) : prompt.userPrompt;
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
  }, [defaultChatModel, aiProvider, aiApiProtocol, aiApiKey, aiApiUrl, aiModel]);

  const singleConfigForUi = useMemo(() => buildSingleConfig(), [buildSingleConfig]);
  const canRunSingleTest = !!(singleConfigForUi.apiKey && singleConfigForUi.apiUrl && singleConfigForUi.model);

  // 替换变量
  const replaceVariables = useCallback((text: string): string => {
    return replacePromptVariables(text, variableValues);
  }, [variableValues]);

  // 计算实际使用的 prompt 内容
  const baseSystemPrompt = useMemo(() => {
    if (!prompt) return '';
    return preferEnglish ? (prompt.systemPromptEn || prompt.systemPrompt || '') : (prompt.systemPrompt || '');
  }, [prompt, preferEnglish]);

  const baseUserPrompt = useMemo(() => {
    if (!prompt) return '';
    return preferEnglish ? (prompt.userPromptEn || prompt.userPrompt) : prompt.userPrompt;
  }, [prompt, preferEnglish]);

  const systemPrompt = useMemo(() => filledSystemPrompt ?? replaceVariables(baseSystemPrompt), [filledSystemPrompt, replaceVariables, baseSystemPrompt]);
  const userPrompt = useMemo(() => filledUserPrompt ?? replaceVariables(baseUserPrompt), [filledUserPrompt, replaceVariables, baseUserPrompt]);

  const readImageFileAsAttachment = useCallback((file: File): Promise<AiTestImageAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error(t('prompt.aiTestImageReadFailed')));
          return;
        }

        const commaIndex = reader.result.indexOf(',');
        if (commaIndex === -1) {
          reject(new Error(t('prompt.aiTestImageReadFailed')));
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
      reader.onerror = () => reject(new Error(t('prompt.aiTestImageReadFailed')));
      reader.readAsDataURL(file);
    });
  }, [t]);

  const formatImageSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }, []);

  const handleTestImageSelection = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_AI_TEST_IMAGES - testImageAttachments.length;
    if (remainingSlots <= 0) {
      showToast(t('prompt.aiTestImageLimit', { count: MAX_AI_TEST_IMAGES }), 'error');
      return;
    }

    const selectedFiles = Array.from(files);
    if (selectedFiles.length > remainingSlots) {
      showToast(t('prompt.aiTestImageLimit', { count: MAX_AI_TEST_IMAGES }), 'error');
    }

    const acceptedFiles: File[] = [];
    for (const file of selectedFiles.slice(0, remainingSlots)) {
      if (!SUPPORTED_AI_TEST_IMAGE_MIME_TYPES.has(file.type)) {
        showToast(t('prompt.aiTestImageUnsupported', { name: file.name }), 'error');
        continue;
      }
      if (file.size > MAX_AI_TEST_IMAGE_BYTES) {
        showToast(t('prompt.aiTestImageTooLarge', { name: file.name, size: formatImageSize(MAX_AI_TEST_IMAGE_BYTES) }), 'error');
        continue;
      }
      acceptedFiles.push(file);
    }

    if (acceptedFiles.length === 0) return;

    try {
      const attachments = await Promise.all(acceptedFiles.map(readImageFileAsAttachment));
      setTestImageAttachments((prev) => [...prev, ...attachments].slice(0, MAX_AI_TEST_IMAGES));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('prompt.aiTestImageReadFailed'), 'error');
    }
  }, [formatImageSize, readImageFileAsAttachment, showToast, t, testImageAttachments.length]);

  const removeTestImageAttachment = useCallback((id: string) => {
    setTestImageAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const toggleReferenceImage = useCallback((fileName: string) => {
    setSelectedReferenceImages((prev) =>
      prev.includes(fileName)
        ? prev.filter((item) => item !== fileName)
        : [...prev, fileName],
    );
  }, []);

  const buildImageReferenceAttachments = useCallback(async (): Promise<ChatImageAttachment[]> => {
    const savedReferences = await Promise.all<ChatImageAttachment | null>(
      selectedReferenceImages.map(async (fileName) => {
        const base64 = await window.electron?.readImageBase64?.(fileName);
        if (!base64) return null;

        const extension = fileName.split('.').pop()?.toLowerCase();
        const mimeType =
          extension === 'jpg' || extension === 'jpeg'
            ? 'image/jpeg'
            : extension === 'webp'
              ? 'image/webp'
              : extension === 'gif'
                ? 'image/gif'
                : 'image/png';

        return {
          name: fileName,
          mimeType,
          base64,
        };
      }),
    );

    return [
      ...savedReferences.filter((item): item is ChatImageAttachment => item !== null),
      ...testImageAttachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        base64: attachment.base64,
      })),
    ];
  }, [selectedReferenceImages, testImageAttachments]);

  const buildChatAttachments = useCallback(async (): Promise<ChatImageAttachment[]> => {
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
      setSelectedReferenceImages(isImagePrompt ? (prompt.images || []) : []);
      setIsSingleLoading(false);
      setIsCompareLoading(false);
      setIsImageLoading(false);
      // 初始化变量值
      const initialValues: Record<string, string> = {};
      allVariables.forEach((v) => {
        initialValues[v.name] = v.defaultValue || '';
      });
      setVariableValues(initialValues);
    }
  }, [allVariables, clearCopyTimer, isImagePrompt, isOpen, prompt?.id, resetCompareBuffers, resetSingleStreamBuffers]);

  useEffect(() => {
    return () => {
      resetSingleStreamBuffers();
      resetCompareBuffers();
    };
  }, [resetCompareBuffers, resetSingleStreamBuffers]);

  // 如果没有 prompt，返回 null（所有 hooks 已在上面调用完毕）
  if (!prompt) return null;

  // 单模型测试
  const runSingleTest = async () => {
    const config = buildSingleConfig();
    if (!config.apiKey || !config.apiUrl || !config.model) return;

    const singleSession = modalSessionRef.current;
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
      const useStream = !!config.chatParams?.stream;
      const useThinking = !!config.chatParams?.enableThinking;

      if (useStream) {
        singleContentBufferRef.current = '';
        singleThinkingBufferRef.current = '';
        setAiResponse('');
        if (useThinking) setThinkingContent('');
      }

      const result = await chatCompletion(
        // 注意：显式传递 stream 和 enableThinking 参数
        // Note: Explicitly pass stream and enableThinking parameters
        config as any,
        messages,
        {
          stream: useStream,
          enableThinking: useThinking,
          streamCallbacks: useStream
            ? {
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
            }
            : undefined,
          // Output format (Issue #38)
          // 输出格式
          responseFormat: outputFormat === 'text' ? undefined : {
            type: outputFormat,
            jsonSchema: outputFormat === 'json_schema' && jsonSchemaContent ? (() => {
              try {
                return {
                  name: jsonSchemaName || 'response',
                  strict: true,
                  schema: JSON.parse(jsonSchemaContent),
                };
              } catch {
                return undefined;
              }
            })() : undefined,
          },
        }
      );

      if (!canApplyAsyncResult(singleSession)) {
        return;
      }

      // IMPORTANT: Don't overwrite streamed content in stream mode!
      // 重要：流式模式下不要覆盖已流式更新的内容！
      if (!useStream) {
        setAiResponse(result.content);
        setThinkingContent(result.thinkingContent || null);
      } else {
        cancelSingleStreamRafs();
        setAiResponse(singleContentBufferRef.current || result.content);
        setThinkingContent(singleThinkingBufferRef.current || result.thinkingContent || null);
      }

      // 保存 AI 响应到 Prompt / Save AI response to Prompt
      if (onSaveResponse && result.content) {
        onSaveResponse(prompt.id, result.content);
      }
    } catch (error) {
      if (!canApplyAsyncResult(singleSession)) {
        return;
      }
      cancelSingleStreamRafs();
      setAiResponse(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`);
    } finally {
      if (canApplyAsyncResult(singleSession)) {
        setIsSingleLoading(false);
      }
    }
  };

  // 多模型对比
  const runCompare = async () => {
    if (selectedModelIds.length < 2) return;

    const compareSession = modalSessionRef.current;
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
          { response: '', thinkingContent: '' },
        ])
      );

      // 支持流式：提前渲染占位结果，让用户能看到“正在流式输出”的差异
      setCompareResults(
        selectedConfigs.map((c) => ({
          id: c.id,
          success: true,
          response: '',
          thinkingContent: '',
          latency: 0,
          model: c.model,
          provider: c.provider,
        }))
      );

      const streamCallbacksMap = new Map<string, any>();
      for (const cfg of selectedConfigs) {
        if (cfg.chatParams?.stream) {
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
      }

      const result = await multiModelCompare(selectedConfigs as any, messages, {
        streamCallbacksMap,
      });
      if (!canApplyAsyncResult(compareSession)) {
        return;
      }

      flushCompareBuffers();
      setCompareResults(result.results);
    } catch (error) {
      if (!canApplyAsyncResult(compareSession)) {
        return;
      }
      // Handle error
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
        : [...prev, modelId]
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
      showToast(t('settings.configImageModel'), 'error');
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
        showToast(t('settings.imageGenSuccess'), 'success');
      } else {
        setImageGenerationError(t('settings.imageGenEmptyResult'));
      }
    } catch (error) {
      if (!canApplyAsyncResult(imageSession)) {
        return;
      }
      const message = error instanceof Error ? error.message : t('common.error');
      setImageGenerationError(message);
      showToast(`${t('common.error')}: ${message}`, 'error');
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
        showToast(t('prompt.uploadFailed'), 'error');
        return;
      }

      // 如果是外部 URL，需要先下载到本地
      if (resolved.kind === 'remote') {
        const fileName = await window.electron?.downloadImage?.(resolved.url);
        if (fileName) {
          onAddImage(fileName);
          showToast(t('prompt.imageAddedToPrompt'), 'success');
        } else {
          showToast(t('prompt.uploadFailed'), 'error');
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
          showToast(t('prompt.imageAddedToPrompt'), 'success');
        } else {
          showToast(t('prompt.uploadFailed'), 'error');
        }
      }
    } catch (error) {
      showToast(t('prompt.uploadFailed'), 'error');
    }
  };

  // 下载图片
  const handleDownloadImage = async (imageUrl: string, index: number) => {
    try {
      await downloadGeneratedImage({
        imageUrl,
        fileName: `generated-image-${index + 1}.png`,
      });
      showToast(t('common.downloadSuccess'), 'success');
    } catch (error) {
      showToast(t('common.downloadFailed'), 'error');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-background/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-border app-wallpaper-panel-strong shadow-[-24px_0_80px_-40px_rgba(0,0,0,0.65)] animate-in slide-in-from-right-8 fade-in duration-base ease-enter transition-all ${isExpanded
          ? 'w-[min(1120px,88vw)]'
          : 'w-[min(640px,100vw)]'
          }`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{t('prompt.aiTest')}</div>
            <div className="truncate text-xs text-muted-foreground">{prompt.title}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              title={isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
            >
              {isExpanded ? (
                <Minimize2Icon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Maximize2Icon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('common.close')}
            >
              <XIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
        {/* 模式切换 */}
        <div className="flex items-center gap-2 border-b border-border pb-4 flex-wrap">
          {!isImagePrompt && (
            <>
              <button
                type="button"
                aria-pressed={mode === 'single'}
                onClick={() => setMode('single')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'single'
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <PlayIcon className="w-4 h-4" aria-hidden="true" />
                {t('prompt.aiTest')}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'compare'}
                onClick={() => setMode('compare')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'compare'
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <GitCompareIcon className="w-4 h-4" aria-hidden="true" />
                {t('settings.multiModelCompare')}
              </button>
            </>
          )}
          {isImagePrompt && (
            <button
              type="button"
              aria-pressed={mode === 'image'}
              onClick={() => setMode('image')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'image'
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
              {t('settings.testImage')}
            </button>
          )}
        </div>

        {/* 变量填充 */}
        {allVariables.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <BracesIcon className="w-4 h-4" aria-hidden="true" />
              {t('prompt.fillVariables')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allVariables.map((variable) => (
                <div key={variable.name} className="space-y-1">
                  <label className="text-xs text-muted-foreground font-mono">{`{{${variable.name}}}`}</label>
                  <input
                    type="text"
                    value={variableValues[variable.name] || ''}
                    onChange={(e) => setVariableValues((prev) => ({ ...prev, [variable.name]: e.target.value }))}
                    placeholder={t('prompt.enterValue')}
                    className="w-full px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompt 预览 */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.userPromptLabel')}</h4>
          <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap">{userPrompt}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <PaperclipIcon className="w-4 h-4" aria-hidden="true" />
                {isImagePrompt
                  ? t('prompt.referenceImages')
                  : t('prompt.aiTestAttachments', '测试附件')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {isImagePrompt
                  ? t('prompt.typeImageDesc')
                  : t('prompt.aiTestAttachmentHint', {
                      count: MAX_AI_TEST_IMAGES,
                      size: formatImageSize(MAX_AI_TEST_IMAGE_BYTES),
                    })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={testImageAttachments.length >= MAX_AI_TEST_IMAGES}
              className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
              {t('prompt.aiTestAddImages')}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              aria-label={t('prompt.aiTestAddImages')}
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleTestImageSelection(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
          </div>

          {isImagePrompt && prompt.images && prompt.images.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t('prompt.aiTestSelectReferenceImages', 'Select existing reference images')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {prompt.images.map((imageName) => {
                  const selected = selectedReferenceImages.includes(imageName);
                  return (
                    <button
                      type="button"
	                      key={imageName}
	                      onClick={() => toggleReferenceImage(imageName)}
	                      aria-label={
	                        selected
	                          ? t('prompt.aiTestDeselectReferenceImage', {
	                            name: imageName,
	                            defaultValue: `Deselect reference image ${imageName}`,
	                          })
	                          : t('prompt.aiTestSelectReferenceImage', {
	                            name: imageName,
	                            defaultValue: `Select reference image ${imageName}`,
	                          })
	                      }
	                      aria-pressed={selected}
	                      className={`relative overflow-hidden rounded-lg border text-left transition-colors ${selected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/50'
                        }`}
                    >
	                      <LocalImage
	                        src={imageName}
	                        alt=""
	                        aria-hidden="true"
	                        className="h-24 w-full object-cover"
	                        fallbackClassName="h-24 w-full"
                      />
                      <div className="absolute left-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                        {selected ? t('common.selected', 'Selected') : t('common.select', 'Select')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {testImageAttachments.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {isImagePrompt
                  ? t('prompt.aiTestUploadedReferenceImages', 'Uploaded reference images')
                  : t('prompt.aiTestUploadedReferenceImages', 'Uploaded reference images')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {testImageAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative overflow-hidden rounded-lg border border-border bg-muted/40"
                  >
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeTestImageAttachment(attachment.id)}
                      aria-label={t('prompt.aiTestRemoveImage')}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                      title={t('prompt.aiTestRemoveImage')}
                    >
                      <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <div className="space-y-0.5 px-2 py-1.5">
                      <p className="truncate text-xs font-medium" title={attachment.name}>
                        {attachment.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatImageSize(attachment.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 单模型测试 */}
        {mode === 'single' && (
          <div className="space-y-4">
            {/* 输出格式选择器 (Issue #38) */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.outputFormat')}</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={outputFormat === 'text'}
                  onClick={() => setOutputFormat('text')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${outputFormat === 'text'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatText')}
                </button>
                <button
                  type="button"
                  aria-pressed={outputFormat === 'json_object'}
                  onClick={() => setOutputFormat('json_object')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${outputFormat === 'json_object'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatJson')}
                </button>
                <button
                  type="button"
                  aria-pressed={outputFormat === 'json_schema'}
                  onClick={() => setOutputFormat('json_schema')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${outputFormat === 'json_schema'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatJsonSchema')}
                </button>
              </div>

              {/* JSON Schema 编辑器 */}
              {outputFormat === 'json_schema' && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t('prompt.jsonSchemaName')}</label>
                    <input
                      type="text"
                      value={jsonSchemaName}
                      onChange={(e) => setJsonSchemaName(e.target.value)}
                      placeholder={t('prompt.jsonSchemaName').toLowerCase()}
                      className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t('prompt.jsonSchemaContent')}</label>
                    <textarea
                      value={jsonSchemaContent}
                      onChange={(e) => setJsonSchemaContent(e.target.value)}
                      placeholder={t('prompt.jsonSchemaPlaceholder')}
                      rows={6}
                      className="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                    <p className="text-xs text-muted-foreground">{t('prompt.jsonSchemaHint')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('settings.model')}: {aiModel || '-'}
              </span>
              <button
                type="button"
                onClick={runSingleTest}
                disabled={isSingleLoading || !canRunSingleTest}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSingleLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PlayIcon className="w-4 h-4" aria-hidden="true" />
                )}
                {isSingleLoading ? t('prompt.testing') : t('prompt.aiTest')}
              </button>
            </div>

            {/* 响应结果 */}
            {aiResponse && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.aiResponse')}</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy(aiResponse)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <CheckIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <CopyIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {copied ? t('prompt.copied') : t('prompt.copyResponse')}
                  </button>
                </div>
                {/* Thinking process / 思考过程（如果有） */}
                <CollapsibleThinking
                  content={thinkingContent}
                  isLoading={isSingleLoading}
                />

                <div className="app-wallpaper-surface border border-border rounded-lg p-4 max-h-64 overflow-y-auto">
                  {renderAiResponseContent(aiResponse)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 多模型对比 */}
        {mode === 'compare' && (
          <div className="space-y-4">
            {/* 模型选择 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('prompt.selectModelsHint')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {compareModels.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    onClick={() => toggleModelSelection(model.id)}
                    aria-pressed={selectedModelIds.includes(model.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedModelIds.includes(model.id)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                  >
                    {model.name || model.model}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('prompt.compareModels', { count: selectedModelIds.length })}
              </span>
              <button
                type="button"
                onClick={runCompare}
                disabled={isCompareLoading || selectedModelIds.length < 2}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isCompareLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <GitCompareIcon className="w-4 h-4" aria-hidden="true" />
                )}
                {isCompareLoading ? t('prompt.comparing') : t('settings.runCompare')}
              </button>
            </div>

            {/* 对比结果 */}
            {compareResults && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
                {compareResults.map((res, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${res.success ? 'border-border app-wallpaper-surface' : 'border-destructive/50 bg-destructive/5'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium truncate">{res.model}</span>
                      <span className="text-[10px] text-muted-foreground">{res.latency}ms</span>
                    </div>
                    <div className="text-xs text-muted-foreground max-h-40 overflow-y-auto">
                      {res.success
                        ? (renderAiResponseContent(res.response || '(空)') ?? '(空)')
                        : (res.error || '未知错误')}
                    </div>
                    {res.success && res.thinkingContent && (
                      <CollapsibleThinking
                        content={res.thinkingContent}
                        className="mt-2"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 生图测试 */}
        {isImagePrompt && mode === 'image' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">
                  {t('settings.model')}: {defaultImageModel?.model || t('settings.noImageModel', '未配置生图模型')}
                </span>
                {defaultImageModel && (
                  <p className="text-xs text-muted-foreground">
                    {t('settings.provider')}: {defaultImageProviderName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={runImageTest}
                disabled={isImageLoading || !defaultImageModel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isImageLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                )}
                {isImageLoading ? t('prompt.generating', '生成中...') : t('settings.testImage')}
              </button>
            </div>

            {imageGenerationError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <p className="text-sm font-medium text-destructive">
                  {t('settings.imageGenerationFailed')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground break-words">
                  {imageGenerationError}
                </p>
              </div>
            )}

            {/* 生成的图片 */}
            {generatedImages.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('settings.generatedImages', '生成的图片')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generatedImages.map((imageUrl, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-border">
                      <img
                        src={imageUrl}
                        alt={`Generated ${idx + 1}`}
                        className="w-full h-auto object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {onAddImage && (
                          <button
                            type="button"
                            onClick={() => handleAddImageToPrompt(imageUrl)}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90"
                            title={t('prompt.addToPrompt', '添加到 Prompt')}
                          >
                            <PlusIcon className="w-4 h-4" aria-hidden="true" />
                            {t('prompt.addToPrompt', '添加到 Prompt')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadImage(imageUrl, idx)}
                          aria-label={t('common.download', '下载')}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80"
                          title={t('common.download', '下载')}
                        >
                          <DownloadIcon className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 无生图模型提示 */}
            {!defaultImageModel && (
              <div className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {t('settings.noImageModelHint', '请先在设置中配置生图模型')}
                </p>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
