import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayIcon, LoaderIcon, CopyIcon, CheckIcon, GitCompareIcon, ImageIcon, PlusIcon, DownloadIcon, BracesIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { CollapsibleThinking } from '../ui/CollapsibleThinking';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult, generateImage } from '../../services/ai';
import { useSettingsStore } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import type { Prompt } from '../../../shared/types';

interface AiTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
  filledSystemPrompt?: string;
  filledUserPrompt?: string;
  onUsageIncrement?: (promptId: string) => void;
  onSaveResponse?: (promptId: string, response: string) => void;
  onAddImage?: (imageUrl: string) => void; // Add: Add generated image to Prompt
  // 新增：将生成的图片添加到 Prompt
}

export function AiTestModal({
  isOpen,
  onClose,
  prompt,
  filledSystemPrompt,
  filledUserPrompt,
  onUsageIncrement,
  onSaveResponse,
  onAddImage,
}: AiTestModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'single' | 'compare' | 'image'>('single');
  // Separate loading states for single model and multi-model
  // 分离单模型和多模型的 loading 状态
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [thinkingContent, setThinkingContent] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<AITestResult[] | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
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

  // AI settings
  // AI 设置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiModels = useSettingsStore((state) => state.aiModels);

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    // Currently Prompt only provides EN version fields: non-Chinese interface defaults to using English version (use if available, fallback to Chinese if not)
    // 目前 Prompt 只提供 EN 版本字段：非中文界面默认优先使用英文版（有则用，无则回退中文）
    return !(lang.startsWith('zh'));
  }, [i18n.language]);

  const defaultChatModel = useMemo(() => {
    const chatModels = aiModels.filter((m) => (m.type ?? 'chat') === 'chat');
    return chatModels.find((m) => m.isDefault) ?? chatModels[0] ?? null;
  }, [aiModels]);

  // Get default image generation model
  // 获取默认生图模型
  const defaultImageModel = useMemo(() => {
    const imageModels = aiModels.filter((m) => m.type === 'image');
    return imageModels.find((m) => m.isDefault) ?? imageModels[0] ?? null;
  }, [aiModels]);

  // Get all image generation models
  // 获取所有生图模型
  const imageModels = useMemo(() => {
    return aiModels.filter((m) => m.type === 'image');
  }, [aiModels]);

  // Extract variables
  // 提取变量
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  };

  // Get all variables
  // 获取所有变量
  const allVariables = useMemo(() => {
    if (!prompt) return [];
    const sysText = preferEnglish ? (prompt.systemPromptEn || prompt.systemPrompt || '') : (prompt.systemPrompt || '');
    const userText = preferEnglish ? (prompt.userPromptEn || prompt.userPrompt) : prompt.userPrompt;
    const sysVars = extractVariables(sysText);
    const userVars = extractVariables(userText);
    return [...new Set([...sysVars, ...userVars])];
  }, [prompt, preferEnglish]);

  // Build single model configuration - must be called before all conditional returns
  // 构建单模型配置 - 必须在所有条件返回之前调用
  const buildSingleConfig = useCallback(() => {
    if (defaultChatModel) {
      return {
        id: defaultChatModel.id,
        provider: defaultChatModel.provider,
        apiKey: defaultChatModel.apiKey,
        apiUrl: defaultChatModel.apiUrl,
        model: defaultChatModel.model,
        chatParams: defaultChatModel.chatParams,
      };
    }
    // 兼容旧版单模型配置
    return {
      provider: aiProvider,
      apiKey: aiApiKey,
      apiUrl: aiApiUrl,
      model: aiModel,
    };
  }, [defaultChatModel, aiProvider, aiApiKey, aiApiUrl, aiModel]);

  const singleConfigForUi = useMemo(() => buildSingleConfig(), [buildSingleConfig]);
  const canRunSingleTest = !!(singleConfigForUi.apiKey && singleConfigForUi.apiUrl && singleConfigForUi.model);

  // 替换变量
  const replaceVariables = useCallback((text: string): string => {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      return variableValues[varName] || match;
    });
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

  // 重置状态
  useEffect(() => {
    if (isOpen && prompt) {
      setAiResponse(null);
      setThinkingContent(null);
      setCompareResults(null);
      setGeneratedImages([]);
      setIsSingleLoading(false);
      setIsCompareLoading(false);
      setIsImageLoading(false);
      // 初始化变量值
      const initialValues: Record<string, string> = {};
      allVariables.forEach((v) => {
        initialValues[v] = '';
      });
      setVariableValues(initialValues);
    }
  }, [isOpen, prompt?.id, allVariables]);

  // 如果没有 prompt，返回 null（所有 hooks 已在上面调用完毕）
  if (!prompt) return null;

  // 单模型测试
  const runSingleTest = async () => {
    const config = buildSingleConfig();
    if (!config.apiKey || !config.apiUrl || !config.model) return;

    setIsSingleLoading(true);
    setAiResponse(null);
    setThinkingContent(null);

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    try {
      const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);
      const useStream = !!config.chatParams?.stream;
      const useThinking = !!config.chatParams?.enableThinking;

      if (useStream) {
        setAiResponse('');
        if (useThinking) setThinkingContent('');
      }

      const result = await chatCompletion(
        // 注意：显式传递 stream 和 enableThinking 参数
        // Note: Explicitly pass stream and enableThinking parameters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config as any,
        messages,
        {
          stream: useStream,
          enableThinking: useThinking,
          streamCallbacks: useStream
            ? {
              onContent: (chunk) => setAiResponse((prev) => (prev ?? '') + chunk),
              onThinking: (chunk) => setThinkingContent((prev) => (prev ?? '') + chunk),
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

      // IMPORTANT: Don't overwrite streamed content in stream mode!
      // 重要：流式模式下不要覆盖已流式更新的内容！
      if (!useStream) {
        setAiResponse(result.content);
        setThinkingContent(result.thinkingContent || null);
      }

      // 保存 AI 响应到 Prompt / Save AI response to Prompt
      if (onSaveResponse && result.content) {
        onSaveResponse(prompt.id, result.content);
      }
    } catch (error) {
      setAiResponse(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`);
    } finally {
      setIsSingleLoading(false);
    }
  };

  // 多模型对比
  const runCompare = async () => {
    if (selectedModelIds.length < 2) return;

    setIsCompareLoading(true);
    setCompareResults(null);

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    const selectedConfigs = aiModels
      .filter((m) => selectedModelIds.includes(m.id))
      .map((m) => ({
        id: m.id,
        provider: m.provider,
        apiKey: m.apiKey,
        apiUrl: m.apiUrl,
        model: m.model,
        chatParams: m.chatParams,
      }));

    const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);

    try {
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
              setCompareResults((prev) => {
                if (!prev) return prev;
                return prev.map((r) =>
                  (r as any).id === cfg.id
                    ? { ...r, response: (r.response || '') + chunk }
                    : r
                );
              });
            },
            onThinking: (chunk: string) => {
              setCompareResults((prev) => {
                if (!prev) return prev;
                return prev.map((r) =>
                  (r as any).id === cfg.id
                    ? { ...r, thinkingContent: (r.thinkingContent || '') + chunk }
                    : r
                );
              });
            },
          });
        }
      }

      const result = await multiModelCompare(selectedConfigs as any, messages, {
        streamCallbacksMap,
      });
      setCompareResults(result.results);
    } catch (error) {
      // Handle error
    } finally {
      setIsCompareLoading(false);
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
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 生图测试
  const runImageTest = async () => {
    if (!defaultImageModel) {
      showToast(t('settings.configImageModel', '请先配置生图模型'), 'error');
      return;
    }

    setIsImageLoading(true);
    setGeneratedImages([]);

    // 增加使用次数
    if (onUsageIncrement) {
      onUsageIncrement(prompt.id);
    }

    try {
      const config = {
        provider: defaultImageModel.provider,
        apiKey: defaultImageModel.apiKey,
        apiUrl: defaultImageModel.apiUrl,
        model: defaultImageModel.model,
      };

      const result = await generateImage(config, userPrompt, { n: 1 });

      const urls: string[] = [];
      for (const item of result.data) {
        if (item.url) {
          urls.push(item.url);
        } else if (item.b64_json) {
          // 将 base64 转换为 data URL
          urls.push(`data:image/png;base64,${item.b64_json}`);
        }
      }

      setGeneratedImages(urls);
      if (urls.length > 0) {
        showToast(t('settings.imageGenSuccess', '图片生成成功'), 'success');
      }
    } catch (error) {
      showToast(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`, 'error');
    } finally {
      setIsImageLoading(false);
    }
  };

  // 将生成的图片添加到 Prompt
  const handleAddImageToPrompt = async (imageUrl: string) => {
    if (!onAddImage) return;

    try {
      // 如果是外部 URL，需要先下载到本地
      if (imageUrl.startsWith('http')) {
        const fileName = await window.electron?.downloadImage?.(imageUrl);
        if (fileName) {
          onAddImage(fileName);
          showToast(t('prompt.imageAddedToPrompt', '图片已添加到 Prompt'), 'success');
        } else {
          showToast(t('prompt.uploadFailed', '图片添加失败'), 'error');
        }
      } else if (imageUrl.startsWith('data:')) {
        // base64 图片，需要保存到本地
        // 提取 base64 数据（去掉 data:image/png;base64, 前缀）
        const base64Data = imageUrl.split(',')[1];
        const fileName = `generated-${Date.now()}.png`;
        await window.electron?.saveImageBase64?.(fileName, base64Data);
        onAddImage(fileName);
        showToast(t('prompt.imageAddedToPrompt', '图片已添加到 Prompt'), 'success');
      }
    } catch (error) {
      showToast(t('prompt.uploadFailed', '图片添加失败'), 'error');
    }
  };

  // 下载图片
  const handleDownloadImage = async (imageUrl: string, index: number) => {
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `generated-image-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(t('common.downloadSuccess', '下载成功'), 'success');
    } catch (error) {
      showToast(t('common.downloadFailed', '下载失败'), 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('prompt.aiTest')}
      size="2xl"
    >
      <div className="space-y-4">
        {/* 模式切换 */}
        <div className="flex items-center gap-2 border-b border-border pb-4 flex-wrap">
          <button
            onClick={() => setMode('single')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'single'
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
          >
            <PlayIcon className="w-4 h-4" />
            {t('prompt.aiTest')}
          </button>
          <button
            onClick={() => setMode('compare')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'compare'
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
          >
            <GitCompareIcon className="w-4 h-4" />
            {t('settings.multiModelCompare')}
          </button>
          <button
            onClick={() => setMode('image')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'image'
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
          >
            <ImageIcon className="w-4 h-4" />
            {t('settings.testImage')}
          </button>
        </div>

        {/* 变量填充 */}
        {allVariables.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <BracesIcon className="w-4 h-4" />
              {t('prompt.fillVariables')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allVariables.map((variable) => (
                <div key={variable} className="space-y-1">
                  <label className="text-xs text-muted-foreground font-mono">{`{{${variable}}}`}</label>
                  <input
                    type="text"
                    value={variableValues[variable] || ''}
                    onChange={(e) => setVariableValues((prev) => ({ ...prev, [variable]: e.target.value }))}
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
          <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.userPrompt')}</h4>
          <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap">{userPrompt}</p>
          </div>
        </div>

        {/* 单模型测试 */}
        {mode === 'single' && (
          <div className="space-y-4">
            {/* 输出格式选择器 (Issue #38) */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">{t('prompt.outputFormat')}</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setOutputFormat('text')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${outputFormat === 'text'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatText')}
                </button>
                <button
                  onClick={() => setOutputFormat('json_object')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${outputFormat === 'json_object'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                >
                  {t('prompt.outputFormatJson')}
                </button>
                <button
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
                      placeholder="response"
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
                onClick={runSingleTest}
                disabled={isSingleLoading || !canRunSingleTest}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSingleLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
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
                    onClick={() => handleCopy(aiResponse)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                    {copied ? t('prompt.copied') : t('prompt.copyResponse')}
                  </button>
                </div>
                {/* Thinking process / 思考过程（如果有） */}
                <CollapsibleThinking
                  content={thinkingContent}
                  isLoading={isSingleLoading}
                />

                <div className="bg-card border border-border rounded-lg p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{aiResponse}</p>
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
                {aiModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => toggleModelSelection(model.id)}
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
                onClick={runCompare}
                disabled={isCompareLoading || selectedModelIds.length < 2}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isCompareLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <GitCompareIcon className="w-4 h-4" />
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
                    className={`p-3 rounded-lg border ${res.success ? 'border-border bg-card' : 'border-destructive/50 bg-destructive/5'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium truncate">{res.model}</span>
                      <span className="text-[10px] text-muted-foreground">{res.latency}ms</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                      {res.success ? (res.response || '(空)') : (res.error || '未知错误')}
                    </p>
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
        {mode === 'image' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">
                  {t('settings.model')}: {defaultImageModel?.model || t('settings.noImageModel', '未配置生图模型')}
                </span>
                {defaultImageModel && (
                  <p className="text-xs text-muted-foreground">
                    {t('settings.provider')}: {defaultImageModel.provider}
                  </p>
                )}
              </div>
              <button
                onClick={runImageTest}
                disabled={isImageLoading || !defaultImageModel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isImageLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                {isImageLoading ? t('prompt.generating', '生成中...') : t('settings.testImage')}
              </button>
            </div>

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
                            onClick={() => handleAddImageToPrompt(imageUrl)}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90"
                            title={t('prompt.addToPrompt', '添加到 Prompt')}
                          >
                            <PlusIcon className="w-4 h-4" />
                            {t('prompt.addToPrompt', '添加到 Prompt')}
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadImage(imageUrl, idx)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80"
                          title={t('common.download', '下载')}
                        >
                          <DownloadIcon className="w-4 h-4" />
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
                <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('settings.noImageModelHint', '请先在设置中配置生图模型')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
