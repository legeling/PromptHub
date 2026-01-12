import { useState, useEffect, useMemo, useCallback, Children, isValidElement, cloneElement } from 'react';
import { flushSync } from 'react-dom';
import { usePromptStore, ViewMode } from '../../stores/prompt.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSettingsStore } from '../../stores/settings.store';
import { StarIcon, CopyIcon, HistoryIcon, HashIcon, SparklesIcon, EditIcon, TrashIcon, CheckIcon, PlayIcon, LoaderIcon, XIcon, GitCompareIcon, ClockIcon, GlobeIcon, PinIcon } from 'lucide-react';
import { EditPromptModal, VersionHistoryModal, VariableInputModal, PromptListHeader, PromptListView, PromptTableView, AiTestModal, PromptDetailModal, PromptGalleryView } from '../prompt';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { LocalImage } from '../ui/LocalImage';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CollapsibleThinking } from '../ui/CollapsibleThinking';
import { useToast } from '../ui/Toast';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult, StreamCallbacks } from '../../services/ai';
import { useTranslation } from 'react-i18next';
import type { Prompt, PromptVersion } from '../../../shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { defaultSchema } from 'hast-util-sanitize';

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHighlightTerms(searchQuery: string): string[] {
  const queryLower = (searchQuery || '').trim().toLowerCase().slice(0, 128);
  if (!queryLower) return [];

  const keywords = queryLower
    .split(/\s+/)
    .filter((k) => k.length > 0 && k.length <= 64);
  const compact = queryLower.replace(/\s+/g, '');

  const terms = [...keywords];
  if (compact && compact.length <= 64 && !terms.includes(compact)) terms.push(compact);

  return Array.from(new Set(terms))
    .filter(Boolean)
    .slice(0, 20)
    .sort((a, b) => b.length - a.length);
}

function renderHighlightedText(text: string, terms: string[], highlightClassName: string) {
  if (!text || terms.length === 0) return text;

  const pattern = terms.map(escapeRegExp).join('|');
  if (!pattern) return text;

  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      return (
        <span key={idx} className={highlightClassName}>
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderHighlightedChildren(children: any, terms: string[], highlightClassName: string, skipTypes: any[]) {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return renderHighlightedText(child, terms, highlightClassName);
    }

    if (!isValidElement(child)) return child;

    if (skipTypes.includes(child.type)) return child;

    const props = (child.props ?? {}) as any;
    const nextChildren = renderHighlightedChildren(props.children, terms, highlightClassName, skipTypes);
    return cloneElement(child as any, { ...props, children: nextChildren });
  });
}

// Prompt card component (compact version)
// Prompt 卡片组件（紧凑版本）
function PromptCard({
  prompt,
  isSelected,
  onSelect,
  onContextMenu,
  highlightTerms
}: {
  prompt: Prompt;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  highlightTerms: string[];
}) {
  const highlightClassName = isSelected
    ? 'bg-white/20 text-white rounded px-0.5'
    : 'bg-primary/15 text-primary rounded px-0.5';

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg cursor-pointer
        transition-all duration-200 animate-in fade-in slide-in-from-left-2
        ${isSelected
          ? 'bg-primary text-white'
          : 'bg-card hover:bg-accent'
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {prompt.isPinned && (
            <PinIcon className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-white' : 'text-primary'}`} />
          )}
          <h3 className="font-medium truncate text-sm">
            {renderHighlightedText(prompt.title, highlightTerms, highlightClassName)}
          </h3>
        </div>
        {prompt.isFavorite && (
          <StarIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'fill-white text-white' : 'fill-yellow-400 text-yellow-400'
            }`} />
        )}
      </div>
      {prompt.description && (
        <p className={`text-xs truncate mt-0.5 ${isSelected ? 'text-white/70' : 'text-muted-foreground'
          }`}>
          {renderHighlightedText(prompt.description, highlightTerms, highlightClassName)}
        </p>
      )}
    </div>
  );
}

export function MainContent() {
  const { t, i18n } = useTranslation();
  const prompts = usePromptStore((state) => state.prompts);
  const selectedId = usePromptStore((state) => state.selectedId);
  const selectedIds = usePromptStore((state) => state.selectedIds);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const setSelectedIds = usePromptStore((state) => state.setSelectedIds);
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const togglePinned = usePromptStore((state) => state.togglePinned);
  const deletePrompt = usePromptStore((state) => state.deletePrompt);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const filterTags = usePromptStore((state) => state.filterTags);
  const sortBy = usePromptStore((state) => state.sortBy);
  const sortOrder = usePromptStore((state) => state.sortOrder);
  const viewMode = usePromptStore((state) => state.viewMode);
  const incrementUsageCount = usePromptStore((state) => state.incrementUsageCount);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const unlockedFolderIds = useFolderStore((state) => state.unlockedFolderIds);
  const folders = useFolderStore((state) => state.folders);

  const [copied, setCopied] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [isAiTestVariableModalOpen, setIsAiTestVariableModalOpen] = useState(false);
  const [isCompareVariableModalOpen, setIsCompareVariableModalOpen] = useState(false);
  // 用于列表/画廊视图复制时的变量弹窗
  const [isCopyVariableModalOpen, setIsCopyVariableModalOpen] = useState(false);
  const [copyPrompt, setCopyPrompt] = useState<Prompt | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prompt: Prompt } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; prompt: Prompt | null }>({ isOpen: false, prompt: null });
  const renderMarkdownPref = useSettingsStore((state) => state.renderMarkdown);
  const setRenderMarkdownPref = useSettingsStore((state) => state.setRenderMarkdown);
  const [renderMarkdownEnabled, setRenderMarkdownEnabled] = useState(renderMarkdownPref);
  const [showEnglish, setShowEnglish] = useState(false);
  const { showToast } = useToast();

  const handleSelectPrompt = useCallback((prompt: Prompt, e: React.MouseEvent) => {
    // Check if we are in multi-select mode (Ctrl/Cmd/Shift)
    // 检查是否在多选模式 (Ctrl/Cmd/Shift)
    if (e.metaKey || e.ctrlKey) {
      // Toggle selection
      if (selectedIds.includes(prompt.id)) {
        setSelectedIds(selectedIds.filter(id => id !== prompt.id));
      } else {
        setSelectedIds([...selectedIds, prompt.id]);
      }
    } else if (e.shiftKey) {
      // Range selection (simplified: add to selection for now)
      // 范围选择（简化：目前只添加到选择）
      // Ideally this would find the range between last selected and current
      if (!selectedIds.includes(prompt.id)) {
        setSelectedIds([...selectedIds, prompt.id]);
      }
    } else {
      // Single select
      // 单选
      selectPrompt(prompt.id);
    }
  }, [selectedIds, selectPrompt, setSelectedIds]);

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return !(lang.startsWith('zh'));
  }, [i18n.language]);

  const uiLangTag = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    if (!lang) return 'LANG';
    if (lang.startsWith('zh')) return 'ZH';
    if (lang.startsWith('ja')) return 'JA';
    if (lang.startsWith('en')) return 'EN';
    return lang.split('-')[0].toUpperCase();
  }, [i18n.language]);

  const highlightTerms = useMemo(() => getHighlightTerms(searchQuery), [searchQuery]);

  // Store test states/results by prompt ID (persisted in component state)
  // 按 prompt ID 保存测试状态和结果（持久化）
  const [promptTestStates, setPromptTestStates] = useState<Record<string, {
    isTestingAI: boolean;
    isComparingModels: boolean;
    aiResponse: string | null;
    aiThinking: string | null;
    compareResults: AITestResult[] | null;
    compareError: string | null;
  }>>({});

  // Get current prompt test state and results
  // 获取当前 prompt 的测试状态和结果
  const currentState = selectedId ? promptTestStates[selectedId] : null;
  const isTestingAI = currentState?.isTestingAI || false;
  const isComparingModels = currentState?.isComparingModels || false;
  const compareResults = currentState?.compareResults || null;
  const compareError = currentState?.compareError || null;

  // Separate streaming state for real-time display (bypasses complex state updates)
  // 独立的流式状态，用于实时显示（绕过复杂的状态更新）
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Use streaming content when actively streaming, otherwise use stored state
  // 流式传输时使用流式内容，否则使用存储的状态
  const aiResponse = isStreaming ? streamingContent : (currentState?.aiResponse || null);
  const aiThinking = isStreaming ? streamingThinking : (currentState?.aiThinking || null);

  // Update current prompt test state
  // 更新当前 prompt 的测试状态
  const updatePromptState = (promptId: string, updates: Partial<typeof currentState>) => {
    setPromptTestStates(prev => ({
      ...prev,
      [promptId]: {
        isTestingAI: prev[promptId]?.isTestingAI || false,
        isComparingModels: prev[promptId]?.isComparingModels || false,
        aiResponse: prev[promptId]?.aiResponse || null,
        aiThinking: prev[promptId]?.aiThinking || null,
        compareResults: prev[promptId]?.compareResults || null,
        compareError: prev[promptId]?.compareError || null,
        ...updates
      }
    }));
  };

  const setIsTestingAI = (testing: boolean) => {
    if (selectedId) updatePromptState(selectedId, { isTestingAI: testing });
  };

  const setIsComparingModels = (comparing: boolean) => {
    if (selectedId) updatePromptState(selectedId, { isComparingModels: comparing });
  };

  const setAiResponse = (response: string | null | ((prev: string | null) => string | null)) => {
    if (selectedId) {
      if (typeof response === 'function') {
        const currentValue = promptTestStates[selectedId]?.aiResponse || null;
        updatePromptState(selectedId, { aiResponse: response(currentValue) });
      } else {
        updatePromptState(selectedId, { aiResponse: response });
      }
    }
  };

  const setAiThinking = (thinking: string | null | ((prev: string | null) => string | null)) => {
    if (selectedId) {
      if (typeof thinking === 'function') {
        const currentValue = promptTestStates[selectedId]?.aiThinking || null;
        updatePromptState(selectedId, { aiThinking: thinking(currentValue) });
      } else {
        updatePromptState(selectedId, { aiThinking: thinking });
      }
    }
  };

  const setCompareResults = (results: AITestResult[] | null | ((prev: AITestResult[] | null) => AITestResult[] | null)) => {
    if (selectedId) {
      if (typeof results === 'function') {
        const currentValue = promptTestStates[selectedId]?.compareResults || null;
        updatePromptState(selectedId, { compareResults: results(currentValue) });
      } else {
        updatePromptState(selectedId, { compareResults: results });
      }
    }
  };

  const setCompareError = (error: string | null) => {
    if (selectedId) updatePromptState(selectedId, { compareError: error });
  };

  // Reset selected prompt when switching folders (privacy)
  // 切换 Folder 时重置选中的 Prompt (隐私保护)
  useEffect(() => {
    selectPrompt(null);
  }, [selectedFolderId, selectPrompt]);

  // Reset selected models when switching prompts
  // 切换 Prompt 时重置选中的模型
  useEffect(() => {
    setSelectedModelIds([]);
  }, [selectedId]);

  // AI configuration
  // AI 配置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const showCopyNotification = useSettingsStore((state) => state.showCopyNotification);

  const defaultChatModel = useMemo(() => {
    const chatModels = aiModels.filter((m) => (m.type ?? 'chat') === 'chat');
    return chatModels.find((m) => m.isDefault) ?? chatModels[0] ?? null;
  }, [aiModels]);

  const singleChatConfig = useMemo(() => {
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
    return { provider: aiProvider, apiKey: aiApiKey, apiUrl: aiApiUrl, model: aiModel };
  }, [defaultChatModel, aiProvider, aiApiKey, aiApiUrl, aiModel]);

  const canRunSingleAiTest = !!(singleChatConfig.apiKey && singleChatConfig.apiUrl && singleChatConfig.model);

  useEffect(() => {
    setRenderMarkdownEnabled(renderMarkdownPref);
  }, [renderMarkdownPref]);

  const sanitizeSchema: any = useMemo(() => {
    const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes } };
    schema.attributes.code = [...(schema.attributes.code || []), ['className']];
    schema.attributes.span = [...(schema.attributes.span || []), ['className']];
    schema.attributes.pre = [...(schema.attributes.pre || []), ['className']];
    return schema;
  }, []);

  const rehypePlugins = useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }] as any,
      [rehypeSanitize, sanitizeSchema] as any,
    ],
    [sanitizeSchema],
  );

  const highlightClassName = useMemo(() => 'bg-primary/15 text-primary rounded px-0.5', []);

  const markdownComponents = useMemo(() => {
    const Code = (props: any) => <code className="px-1 py-0.5 rounded bg-muted font-mono text-[13px]" {...props} />;
    const Pre = (props: any) => (
      <pre className="p-3 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed" {...props} />
    );
    const skipTypes = [Code, Pre];

    const withHighlight = (Tag: any, className: string) => (props: any) => (
      <Tag className={className} {...props}>
        {renderHighlightedChildren(props.children, highlightTerms, highlightClassName, skipTypes)}
      </Tag>
    );

    return {
      h1: withHighlight('h1', 'text-2xl font-bold mb-4 text-foreground'),
      h2: withHighlight('h2', 'text-xl font-semibold mb-3 mt-5 text-foreground'),
      h3: withHighlight('h3', 'text-lg font-semibold mb-3 mt-4 text-foreground'),
      h4: withHighlight('h4', 'text-base font-semibold mb-2 mt-3 text-foreground'),
      p: withHighlight('p', 'mb-3 leading-relaxed text-foreground/90'),
      ul: withHighlight('ul', 'list-disc pl-5 mb-3 space-y-1'),
      ol: withHighlight('ol', 'list-decimal pl-5 mb-3 space-y-1'),
      li: withHighlight('li', 'leading-relaxed'),
      code: Code,
      pre: Pre,
      blockquote: withHighlight('blockquote', 'border-l-4 border-border pl-3 text-muted-foreground italic mb-3'),
      hr: () => <hr className="my-4 border-border" />,
      table: (props: any) => <table className="table-auto border-collapse w-full text-sm mb-3" {...props} />,
      th: withHighlight('th', 'border border-border px-2 py-1 bg-muted text-left font-medium'),
      td: withHighlight('td', 'border border-border px-2 py-1'),
      a: (props: any) => (
        <a className="text-primary hover:underline" {...props} target="_blank" rel="noreferrer">
          {renderHighlightedChildren(props.children, highlightTerms, highlightClassName, skipTypes)}
        </a>
      ),
      strong: withHighlight('strong', 'font-semibold text-foreground'),
      em: withHighlight('em', 'italic text-foreground/90'),
    };
  }, [highlightTerms, highlightClassName]);

  const renderPromptContent = (content?: string) => {
    if (!content) {
      return (
        <div className="p-4 rounded-xl bg-card border border-border text-sm text-muted-foreground">
          {t('prompt.noContent')}
        </div>
      );
    }

    if (!renderMarkdownEnabled) {
      return (
        <div className="p-4 rounded-xl bg-card border border-border font-mono text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {renderHighlightedText(content, highlightTerms, highlightClassName)}
        </div>
      );
    }

    return (
      <div className="p-4 rounded-xl bg-card border border-border text-[15px] leading-relaxed markdown-content space-y-3 break-words">
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

  const toggleRenderMarkdown = () => {
    const next = !renderMarkdownEnabled;
    setRenderMarkdownEnabled(next);
    setRenderMarkdownPref(next);
  };

  const handleRestoreVersion = async (version: PromptVersion) => {
    if (selectedPrompt) {
      await updatePrompt(selectedPrompt.id, {
        systemPrompt: version.systemPrompt,
        userPrompt: version.userPrompt,
      });
      showToast(t('toast.restored'), 'success');
    }
  };

  // AI test function (supports variable substitution)
  // AI 测试函数（支持变量替换后的 prompt）
  const runAiTest = async (systemPrompt: string | undefined, userPrompt: string, promptId?: string) => {
    // Do not use modal in card view; render results inline
    // 卡片视图不使用弹窗，直接在页面内显示结果
    // setShowAiPanel(true);  // Removed: do not open AiTestModal
    // setShowAiPanel(true);  // 移除：不再打开 AiTestModal
    setIsTestingAI(true);
    setAiResponse(null);
    setAiThinking(null);
    setIsAiTestVariableModalOpen(false);

    // Increment usage count
    // 增加使用次数
    const targetId = promptId || selectedId;
    if (targetId) {
      await incrementUsageCount(targetId);
    }

    try {
      if (!canRunSingleAiTest) {
        throw new Error(t('toast.configAI') || '请先配置 AI');
      }
      const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);
      const useStream = !!singleChatConfig.chatParams?.stream;
      const useThinking = !!singleChatConfig.chatParams?.enableThinking;

      // Debug: Log stream configuration / 调试：记录流式配置
      console.log('[MainContent] AI Test - Stream:', useStream, 'Thinking:', useThinking);
      console.log('[MainContent] chatParams:', singleChatConfig.chatParams);

      if (useStream) {
        // Start streaming mode - use independent state for real-time updates
        // 开始流式模式 - 使用独立状态进行实时更新
        setIsStreaming(true);
        setStreamingContent('');
        setStreamingThinking('');
      }

      // Use refs for buffering raw data / 使用 ref 缓冲原始数据
      const fullContentRef = { current: '' };
      const fullThinkingRef = { current: '' };

      let contentRafId: number | null = null;
      let thinkingRafId: number | null = null;

      const scheduleContentFlush = () => {
        if (contentRafId !== null) return;
        contentRafId = requestAnimationFrame(() => {
          contentRafId = null;
          flushSync(() => {
            setStreamingContent(fullContentRef.current);
          });
        });
      };

      const scheduleThinkingFlush = () => {
        if (thinkingRafId !== null) return;
        thinkingRafId = requestAnimationFrame(() => {
          thinkingRafId = null;
          flushSync(() => {
            setStreamingThinking(fullThinkingRef.current);
          });
        });
      };

      const result = await chatCompletion(singleChatConfig as any, messages, {
        stream: useStream,
        enableThinking: useThinking,
        streamCallbacks: useStream ? {
          onContent: (chunk) => {
            fullContentRef.current += chunk;
            scheduleContentFlush();
          },
          onThinking: (chunk) => {
            fullThinkingRef.current += chunk;
            scheduleThinkingFlush();
          },
          onComplete: (fullContent, thinkingContent) => {
            console.log(`[Stream UI] Complete!`);
            if (contentRafId !== null) {
              cancelAnimationFrame(contentRafId);
              contentRafId = null;
            }
            if (thinkingRafId !== null) {
              cancelAnimationFrame(thinkingRafId);
              thinkingRafId = null;
            }
            // End streaming mode and save to persistent state
            // 结束流式模式并保存到持久状态
            setIsStreaming(false);
            setAiResponse(fullContent);
            if (thinkingContent) {
              setAiThinking(thinkingContent);
            }
          }
        } : undefined,
      });

      // Final consistency guarantee
      // 最终一致性保证
      if (!useStream) {
        setAiResponse(result.content);
        setAiThinking(result.thinkingContent || null);
      } else {
        // Ensure streaming state is off and content is saved
        setIsStreaming(false);
        setAiResponse(fullContentRef.current || result.content);
        if (fullThinkingRef.current) {
          setAiThinking(fullThinkingRef.current);
        }
      }
    } catch (error) {
      setIsStreaming(false);
      setAiResponse(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`);
      showToast(t('toast.aiFailed'), 'error');
    } finally {
      setIsTestingAI(false);
    }
  };

  // Multi-model comparison (supports variable substitution)
  // 多模型对比函数（支持变量替换后的 prompt）
  const runModelCompare = async (systemPrompt: string | undefined, userPrompt: string) => {
    setIsCompareVariableModalOpen(false);
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

    setIsComparingModels(true);
    setCompareError(null);

    try {
      // Streaming support: render placeholder results early so users can see streaming progress
      // 支持流式：提前渲染占位结果，让用户能看到"正在流式输出"的差异
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

      // Create stream callbacks map for streaming-enabled models
      // 为启用流式的模型创建流式回调 Map
      const streamCallbacksMap = new Map<string, StreamCallbacks>();
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
      // In streaming mode, results are updated via callbacks; sync once more for non-streaming models
      // 流式模式下，结果已经在回调中更新，这里只做最终同步（确保非流式模型的结果也正确显示）
      setCompareResults(result.results);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsComparingModels(false);
    }
  };

  // Filter prompts - use useMemo to respond correctly to searchQuery changes
  // 过滤 Prompts - 使用 useMemo 确保正确响应 searchQuery 变化
  const filteredPrompts = useMemo(() => {
    let result = prompts;

    if (selectedFolderId === 'favorites') {
      result = result.filter((p) => p.isFavorite);
    } else if (selectedFolderId) {
      const childFolderIds = folders
        .filter((folder) => folder.parentId === selectedFolderId)
        .map((folder) => folder.id);
      const visibleFolderIds = new Set([selectedFolderId, ...childFolderIds]);
      const lockedFolderIds = new Set(
        folders
          .filter((folder) => folder.isPrivate && !unlockedFolderIds.has(folder.id))
          .map((folder) => folder.id)
      );
      result = result.filter(
        (p) => p.folderId && visibleFolderIds.has(p.folderId) && !lockedFolderIds.has(p.folderId)
      );
    } else {
      // In the "All Prompts" view, hide contents of private folders
      // 在"全部 Prompts"视图中，隐藏私密文件夹的内容
      const privateFolderIds = folders.filter(f => f.isPrivate).map(f => f.id);
      if (privateFolderIds.length > 0) {
        result = result.filter(p => !p.folderId || !privateFolderIds.includes(p.folderId));
      }
    }

    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      const queryCompact = queryLower.replace(/\s+/g, '');
      const keywords = queryLower.split(/\s+/).filter((k) => k.length > 0);

      const isSubsequence = (needle: string, haystack: string) => {
        if (!needle) return true;
        if (needle.length > haystack.length) return false;
        let i = 0;
        for (let j = 0; j < haystack.length && i < needle.length; j++) {
          if (haystack[j] === needle[i]) i++;
        }
        return i === needle.length;
      };

      // Scoring logic: 100 for title exact, 50 for title include, 20 for desc include, 10 for prompts include
      // 评分逻辑：标题精确匹配 100，标题包含 50，描述包含 20，Prompt 包含 10
      result = result.map(p => {
        let score = 0;
        const titleLower = p.title.toLowerCase();
        const descLower = (p.description || '').toLowerCase();
        const userPromptLower = p.userPrompt.toLowerCase();

        // Exact title match
        if (titleLower === queryLower) score += 100;
        // Title includes query
        else if (titleLower.includes(queryLower)) score += 50;
        // Subsequence title match
        else if (queryCompact.length >= 2 && isSubsequence(queryCompact, titleLower.replace(/\s+/g, ''))) score += 30;

        // Description includes query
        if (descLower.includes(queryLower)) score += 20;

        // All keywords match anywhere
        const searchableText = [
          p.title,
          p.description || '',
          p.userPrompt,
          p.userPromptEn || '',
          p.systemPrompt || '',
          p.systemPromptEn || '',
        ].join(' ').toLowerCase();

        if (keywords.every(k => searchableText.includes(k))) {
          score += 10;
        }

        // Final score check
        return { prompt: p, score };
      })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.prompt);
    }

    // Tag filtering (multi-select: must contain all selected tags)
    // 标签筛选（多选：必须包含所有选中的标签）
    if (filterTags.length > 0) {
      result = result.filter((p) =>
        filterTags.every(tag => p.tags.includes(tag))
      );
    }

    return result;
  }, [prompts, selectedFolderId, searchQuery, filterTags, folders, unlockedFolderIds]);

  // Sorting (pinned prompts always first)
  // 排序（置顶的始终在最前面）
  const sortedPrompts = useMemo(() => {
    const sorted = [...filteredPrompts];
    sorted.sort((a, b) => {
      // Pinned items first
      // 置顶的排在前面
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      let comparison = 0;
      switch (sortBy) {
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'usageCount':
          comparison = (a.usageCount || 0) - (b.usageCount || 0);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [filteredPrompts, sortBy, sortOrder]);

  const selectedPrompt = prompts.find((p) => p.id === selectedId);

  // Auto-select prompt language based on UI language (if English version exists)
  // 根据界面语言自动选择 Prompt 语言（如果有英文版本）
  useEffect(() => {
    if (!selectedPrompt) {
      setShowEnglish(false);
      return;
    }
    const hasEnglish = !!(selectedPrompt.systemPromptEn || selectedPrompt.userPromptEn);
    if (!hasEnglish) {
      setShowEnglish(false);
      return;
    }
    setShowEnglish(preferEnglish);
  }, [selectedPrompt?.id, selectedPrompt?.systemPromptEn, selectedPrompt?.userPromptEn, preferEnglish]);

  // Editing prompt for table view
  // 用于表格视图的编辑 prompt
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  // AI test modal state
  // AI 测试弹窗状态
  const [isAiTestModalOpen, setIsAiTestModalOpen] = useState(false);
  const [aiTestPrompt, setAiTestPrompt] = useState<Prompt | null>(null);
  // AI response cache (for list view preview)
  // AI 响应缓存（用于列表视图预览）
  const [aiResponseCache, setAiResponseCache] = useState<Record<string, string>>({});
  const setViewMode = usePromptStore((state) => state.setViewMode);

  // Handle copying prompt - check for variables first
  // 处理复制 Prompt - 先检查是否有变量
  const handleCopyPrompt = async (prompt: Prompt) => {
    // 检测是否包含变量 (排除系统变量)
    const VARIABLE_REGEX = /\{\{([^}:]+)(?::([^}]*))?\}\}/g;
    const SYSTEM_VARIABLES = ['CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_DATETIME', 'CURRENT_YEAR', 'CURRENT_MONTH', 'CURRENT_DAY', 'CURRENT_WEEKDAY'];
    const combined = `${prompt.systemPrompt || ''}\n${prompt.userPrompt}`;
    const matches = [...combined.matchAll(VARIABLE_REGEX)];
    const hasUserVariables = matches.some(m => !SYSTEM_VARIABLES.includes(m[1].trim()));
    
    if (hasUserVariables) {
      // 有变量，打开弹窗让用户填写
      setCopyPrompt(prompt);
      setIsCopyVariableModalOpen(true);
    } else {
      // 没有变量，直接复制
      const text = prompt.userPrompt;
      await navigator.clipboard.writeText(text);
      await incrementUsageCount(prompt.id);
      showToast(t('toast.copied'), 'success', showCopyNotification);
    }
  };

  // Handle deleting prompt (for table view)
  // 处理删除 Prompt（表格视图用）
  const handleDeletePrompt = useCallback((prompt: Prompt) => {
    setDeleteConfirm({ isOpen: true, prompt });
  }, []);

  // Confirm delete
  // 确认删除
  const confirmDelete = useCallback(async () => {
    if (deleteConfirm.prompt) {
      await deletePrompt(deleteConfirm.prompt.id);
      showToast(t('prompt.promptDeleted'), 'success');
    }
    setDeleteConfirm({ isOpen: false, prompt: null });
  }, [deleteConfirm.prompt, deletePrompt, showToast, t]);

  // Handle AI test (table view - modal)
  // 处理 AI 测试（表格视图用 - 弹窗模式）
  const handleAiTestFromTable = (prompt: Prompt) => {
    if (!canRunSingleAiTest) {
      showToast(t('toast.configAI'), 'error');
      return;
    }
    setAiTestPrompt(prompt);
    setIsAiTestModalOpen(true);
  };

  // Detail modal state
  // 查看详情弹窗状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  // Version history modal state
  // 版本历史弹窗状态
  const [isVersionModalOpenTable, setIsVersionModalOpenTable] = useState(false);
  const [versionHistoryPrompt, setVersionHistoryPrompt] = useState<Prompt | null>(null);

  // View details - show modal
  // 查看详情 - 弹窗显示
  const handleViewDetail = (prompt: Prompt) => {
    setDetailPrompt(prompt);
    setIsDetailModalOpen(true);
  };

  // Version history
  // 版本历史
  const handleVersionHistory = (prompt: Prompt) => {
    setVersionHistoryPrompt(prompt);
    setIsVersionModalOpenTable(true);
  };

  // Restore version (table view)
  // 恢复版本（表格视图用）
  const handleRestoreVersionFromTable = async (version: PromptVersion) => {
    if (versionHistoryPrompt) {
      await updatePrompt(versionHistoryPrompt.id, {
        systemPrompt: version.systemPrompt,
        userPrompt: version.userPrompt,
      });
      showToast(t('toast.restored'), 'success');
      setIsVersionModalOpenTable(false);
      setVersionHistoryPrompt(null);
    }
  };

  // Context menu anchor (also used by table view)
  // 处理 AI 测试使用次数增加并缓存结果
  const handleContextMenu = (e: React.MouseEvent, prompt: Prompt) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, prompt });
  };

  const menuItems: ContextMenuItem[] = contextMenu ? [
    {
      label: t('prompt.viewDetail'),
      icon: <CheckIcon className="w-4 h-4" />, // CheckIcon placeholder, logic implies View Detail
      onClick: () => handleViewDetail(contextMenu.prompt),
    },
    {
      label: t('prompt.edit'),
      icon: <EditIcon className="w-4 h-4" />,
      onClick: () => setEditingPrompt(contextMenu.prompt),
    },
    {
      label: t('prompt.copy'),
      icon: <CopyIcon className="w-4 h-4" />,
      onClick: () => handleCopyPrompt(contextMenu.prompt),
    },
    {
      label: contextMenu.prompt.isFavorite ? (t('prompt.removeFromFavorites') || '取消收藏') : (t('prompt.addToFavorites') || '收藏'),
      icon: <StarIcon className={`w-4 h-4 ${contextMenu.prompt.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />,
      onClick: () => toggleFavorite(contextMenu.prompt.id),
    },
    {
      label: contextMenu.prompt.isPinned ? t('prompt.unpin') : t('prompt.pin'),
      icon: <PinIcon className={`w-4 h-4 ${contextMenu.prompt.isPinned ? 'fill-primary text-primary' : ''}`} />,
      onClick: () => togglePinned(contextMenu.prompt.id),
    },
    {
      label: t('prompt.aiTest'),
      icon: <PlayIcon className="w-4 h-4" />,
      onClick: () => handleAiTestFromTable(contextMenu.prompt),
    },
    {
      label: t('prompt.history'),
      icon: <HistoryIcon className="w-4 h-4" />,
      onClick: () => handleVersionHistory(contextMenu.prompt),
    },
    {
      label: t('prompt.delete'),
      icon: <TrashIcon className="w-4 h-4" />,
      variant: 'destructive',
      onClick: () => handleDeletePrompt(contextMenu.prompt),
    },
  ] : [];

  const handleAiUsageIncrement = async (id: string, model?: string) => {
    await incrementUsageCount(id);
  };

  // Save AI response into prompt
  // 保存 AI 响应到 Prompt
  const handleSaveAiResponse = async (promptId: string, response: string) => {
    await updatePrompt(promptId, { lastAiResponse: response });
    // Update cache as well for immediate UI refresh
    // 同时更新缓存以便立即显示
    setAiResponseCache((prev) => ({ ...prev, [promptId]: response }));
  };

  // Batch operations
  // 批量操作函数
  const handleBatchFavorite = async (ids: string[], favorite: boolean) => {
    for (const id of ids) {
      if (favorite) {
        const prompt = prompts.find(p => p.id === id);
        if (prompt && !prompt.isFavorite) {
          await toggleFavorite(id);
        }
      }
    }
    showToast(t('toast.batchFavorited') || `已收藏 ${ids.length} 个 Prompt`, 'success');
  };

  const handleBatchMove = async (ids: string[], folderId: string | undefined) => {
    for (const id of ids) {
      await updatePrompt(id, { folderId });
    }
    showToast(t('toast.batchMoved') || `已移动 ${ids.length} 个 Prompt`, 'success');
  };

  const handleBatchDelete = async (ids: string[]) => {
    if (!confirm(t('prompt.confirmBatchDelete', { count: ids.length }) || `确定要删除这 ${ids.length} 个 Prompt 吗？`)) {
      return;
    }
    for (const id of ids) {
      await deletePrompt(id);
    }
    showToast(t('toast.batchDeleted') || `已删除 ${ids.length} 个 Prompt`, 'success');
  };

  const getViewClass = (mode: ViewMode, layout: 'col' | 'row' = 'col') => {
    const isActive = viewMode === mode;
    const layoutClass = layout === 'col' ? 'flex flex-col' : 'flex overflow-hidden';
    return `absolute inset-0 ${layoutClass} bg-background transition-opacity ease-out ${
      isActive
        ? 'opacity-100 z-10 pointer-events-auto duration-200'
        : 'opacity-0 z-0 pointer-events-none duration-0'
    }`;
  };

  return (
    <main className="flex-1 relative overflow-hidden bg-background">
      {/* List view mode */}
      {/* 列表视图模式 */}
      <div
        className={getViewClass('list')}
      >
        {/* Top: sort + view switch */}
        {/* 顶部：排序 + 视图切换 */}
        <PromptListHeader count={sortedPrompts.length} />

        {/* Table view */}
        {/* 表格视图 */}
        <div className="flex-1 overflow-hidden">
          <PromptTableView
            prompts={sortedPrompts}
            highlightTerms={highlightTerms}
            onSelect={(id) => selectPrompt(id)}
            onToggleFavorite={toggleFavorite}
            onCopy={handleCopyPrompt}
            onEdit={(prompt) => setEditingPrompt(prompt)}
            onDelete={handleDeletePrompt}
            onAiTest={handleAiTestFromTable}
            onVersionHistory={handleVersionHistory}
            onViewDetail={handleViewDetail}
            aiResults={aiResponseCache}
            onBatchFavorite={handleBatchFavorite}
            onBatchMove={handleBatchMove}
            onBatchDelete={handleBatchDelete}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>

      {/* Gallery view */}
      {/* Gallery 视图 */}
      <div
        className={getViewClass('gallery')}
      >
        <PromptListHeader count={sortedPrompts.length} />
        <PromptGalleryView
          prompts={sortedPrompts}
          highlightTerms={highlightTerms}
          onSelect={(id) => selectPrompt(id)}
          onToggleFavorite={toggleFavorite}
          onCopy={handleCopyPrompt}
          onEdit={(prompt) => setEditingPrompt(prompt)}
          onDelete={handleDeletePrompt}
          onAiTest={handleAiTestFromTable}
          onVersionHistory={handleVersionHistory}
          onViewDetail={handleViewDetail}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Card view mode: two-column layout */}
      {/* 卡片视图模式：左右分栏 */}
      <div
        className={getViewClass('card', 'row')}
      >
        {/* Prompt list */}
        {/* Prompt 列表 */}
        <div className="w-80 border-r border-border flex flex-col bg-card/50">
          {/* List header: sort + view switch */}
          {/* 列表头部：排序 + 视图切换 */}
          <PromptListHeader count={sortedPrompts.length} />

          {/* List content */}
          {/* 列表内容 */}
          <div className="flex-1 overflow-y-auto">
            {sortedPrompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <SparklesIcon className="w-8 h-8 text-primary" />
                </div>
                <p className="text-lg font-medium text-foreground mb-1">{t('prompt.noPrompts')}</p>
                <p className="text-sm text-muted-foreground">{t('prompt.addFirst')}</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {sortedPrompts.map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    isSelected={selectedIds.includes(prompt.id)}
                    onSelect={(e) => handleSelectPrompt(prompt, e)}
                    onContextMenu={(e) => handleContextMenu(e, prompt)}
                    highlightTerms={highlightTerms}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prompt details - iOS style */}
        {/* Prompt 详情 - iOS 风格 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPrompt ? (
            <div key={selectedPrompt.id} className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-3 duration-200">
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-6 py-4">
                  {/* Title section */}
                  {/* 标题区域 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-foreground mb-1">{selectedPrompt.title}</h2>
                      {selectedPrompt.description && (
                        <p className="text-sm text-muted-foreground">{selectedPrompt.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleFavorite(selectedPrompt.id)}
                        className={`
                      p-2.5 rounded-xl transition-all duration-200
                      ${selectedPrompt.isFavorite
                            ? 'text-yellow-500 bg-yellow-500/10'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }
                      active:scale-95
                    `}
                      >
                        <StarIcon className={`w-5 h-5 ${selectedPrompt.isFavorite ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        onClick={() => setEditingPrompt(selectedPrompt)}
                        className="p-2.5 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200 active:scale-95"
                      >
                        <EditIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata */}
                  {/* 元信息 */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {new Date(selectedPrompt.updatedAt).toLocaleString()}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
                      v{selectedPrompt.version}
                    </span>
                  </div>

                  {/* Images */}
                  {/* 图片 */}
                  {selectedPrompt.images && selectedPrompt.images.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-3">
                        {selectedPrompt.images.map((img, index) => (
                          <div key={index} className="rounded-lg overflow-hidden border border-border shadow-sm">
                            <LocalImage
                              src={img}
                              alt={`image-${index}`}
                              className="max-w-[160px] max-h-[160px] object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                              fallbackClassName="w-[160px] h-[120px]"
                              onClick={() => setPreviewImage(img)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {/* 标签 */}
                  {selectedPrompt.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {selectedPrompt.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground"
                        >
                          <HashIcon className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Source / 来源 */}
                  {selectedPrompt.source && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-1.5">
                        <GlobeIcon className="w-3.5 h-3.5" />
                        {t('prompt.source')}
                      </div>
                      <div className="text-sm bg-muted/30 rounded-xl p-3 border border-border/50 break-all">
                        {selectedPrompt.source.startsWith('http') ? (
                          <a href={selectedPrompt.source} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 inline-flex">
                            <span className="truncate max-w-full">{selectedPrompt.source}</span>
                          </a>
                        ) : (
                          <span className="text-foreground/90">{selectedPrompt.source}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes / 备注 */}
                  {selectedPrompt.notes && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-1.5">
                        {t('prompt.notes')}
                      </div>
                      <div className="text-sm bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 text-foreground/80 italic">
                        {selectedPrompt.notes}
                      </div>
                    </div>
                  )}

                  {/* Language toggle button */}
                  {/* 语言切换按钮 */}
                  {(selectedPrompt.systemPromptEn || selectedPrompt.userPromptEn) && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => setShowEnglish(!showEnglish)}
                        className={
                          `flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-95 ` +
                          (showEnglish
                            ? 'bg-primary text-white'
                            : 'bg-accent text-muted-foreground hover:text-foreground')
                        }
                        title={showEnglish ? t('prompt.showLocalized', '显示当前语言') : t('prompt.showEnglish')}
                        type="button"
                      >
                        <GlobeIcon className="w-3.5 h-3.5" />
                        {showEnglish ? 'EN' : uiLangTag}
                      </button>
                    </div>
                  )}

                  {/* System Prompt */}
                  {(showEnglish ? selectedPrompt.systemPromptEn : selectedPrompt.systemPrompt) && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          System Prompt
                          {showEnglish && <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">EN</span>}
                        </span>
                      </div>
                      {renderPromptContent(showEnglish ? (selectedPrompt.systemPromptEn || '') : (selectedPrompt.systemPrompt || ''))}
                    </div>
                  )}

                  {/* User Prompt */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        User Prompt
                        {showEnglish && <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">EN</span>}
                      </span>
                      <button
                        type="button"
                        onClick={toggleRenderMarkdown}
                        className="text-[12px] px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        {renderMarkdownEnabled ? t('prompt.showPlain', '显示原文') : t('prompt.showMarkdown', 'Markdown')}
                      </button>
                    </div>
                    {renderPromptContent(showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt)}
                  </div>

                  {/* Multi-model comparison */}
                  {/* 多模型对比区域 */}
                  {aiModels.length > 0 && (
                    <div className="mb-4 p-4 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <GitCompareIcon className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">{t('settings.multiModelCompare')}</span>
                          <span className="text-xs text-muted-foreground">{t('prompt.selectModelsHint')}</span>
                        </div>
                      </div>

                      {/* Model selection list */}
                      {/* 模型选择列表 */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {aiModels.map((model) => {
                          const isSelected = selectedModelIds.includes(model.id);
                          // Get provider display name
                          // 获取供应商简称
                          const providerName = model.name || model.provider;
                          const displayName = `${providerName} | ${model.model}`;
                          return (
                            <button
                              key={model.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedModelIds(selectedModelIds.filter((id) => id !== model.id));
                                } else {
                                  setSelectedModelIds([...selectedModelIds, model.id]);
                                }
                              }}
                              className={`
                            px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                            ${isSelected
                                  ? 'bg-primary text-white'
                                  : 'bg-muted hover:bg-accent text-foreground'
                                }
                          `}
                              title={displayName}
                            >
                              {model.model}
                              {model.isDefault && (
                                <span className="ml-1 opacity-60">★</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-3">
                        {selectedModelIds.length > 0 && (
                          <button
                            onClick={() => setSelectedModelIds([])}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t('prompt.clearSelection')}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (selectedModelIds.length < 2) {
                              showToast(t('prompt.selectAtLeast2'), 'error');
                              return;
                            }
                            if (!selectedPrompt) return;

                            // Check variables (create a new regex per string to avoid global flag state)
                            // 检查是否有变量（为每个字符串创建新的正则实例，避免全局标志导致的状态问题）
                            const hasVariables =
                              /\{\{([^}]+)\}\}/.test(selectedPrompt.userPrompt) ||
                              (selectedPrompt.systemPrompt && /\{\{([^}]+)\}\}/.test(selectedPrompt.systemPrompt));

                            if (hasVariables) {
                              setIsCompareVariableModalOpen(true);
                            } else {
                              runModelCompare(selectedPrompt.systemPrompt, selectedPrompt.userPrompt);
                            }
                          }}
                          disabled={isComparingModels || selectedModelIds.length < 2}
                          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {isComparingModels ? (
                            <LoaderIcon className="w-3 h-3 animate-spin" />
                          ) : (
                            <GitCompareIcon className="w-3 h-3" />
                          )}
                          <span>{isComparingModels ? t('prompt.comparing') : t('prompt.compareModels', { count: selectedModelIds.length })}</span>
                        </button>
                      </div>

                      {compareError && (
                        <p className="mt-3 text-xs text-red-500">{compareError}</p>
                      )}

                      {compareResults && compareResults.length > 0 && (
                        <div className="mt-4 grid md:grid-cols-2 gap-3">
                          {compareResults.map((res) => (
                            <div
                              key={`${res.provider}-${res.model}`}
                              className={`p-3 rounded-lg border text-xs space-y-2 ${res.success ? 'border-emerald-400/50 bg-emerald-500/5' : 'border-red-400/50 bg-red-500/5'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium truncate">
                                  {res.model}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {res.latency}ms
                                </div>
                              </div>
                              {res.success && res.thinkingContent && (
                                <CollapsibleThinking
                                  content={res.thinkingContent}
                                  className="text-[10px]"
                                />
                              )}
                              <div className="text-[11px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {res.success ? (res.response || '(空)') : (res.error || '未知错误')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI response panel */}
                  {/* AI 测试响应区域 */}
                  {(isTestingAI || aiResponse) && (
                    <div className="mb-4 p-4 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <SparklesIcon className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">{t('prompt.aiResponse', 'AI 响应')}</span>
                          <span className="text-xs text-muted-foreground">({aiModel})</span>
                        </div>
                        {aiResponse && (
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(aiResponse);
                              showToast(t('toast.copied'), 'success');
                            }}
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                            title={t('prompt.copy')}
                          >
                            <CopyIcon className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      {isTestingAI ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <LoaderIcon className="w-4 h-4 animate-spin" />
                          <span className="text-sm">{t('prompt.testing', '测试中...')}</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Collapsible thinking process / 可折叠的思考过程 */}
                          <CollapsibleThinking
                            content={aiThinking}
                            isLoading={isTestingAI}
                          />
                          <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {aiResponse}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Action buttons - sticky bottom */}
              {/* 操作按钮 - 固定底部 */}
              <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-6 py-3">
                <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
                  <button
                    onClick={async () => {
                      // Select content based on language mode
                      // 根据语言模式选择内容
                      const currentUserPrompt = showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt;
                      const currentSystemPrompt = showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt;

                      // Check variables (create a new regex per string to avoid global flag state)
                      // 检查是否有变量（为每个字符串创建新的正则实例，避免全局标志导致的状态问题）
                      const hasVariables =
                        /\{\{([^}]+)\}\}/.test(currentUserPrompt) ||
                        (currentSystemPrompt && /\{\{([^}]+)\}\}/.test(currentSystemPrompt));

                      if (hasVariables) {
                        setIsVariableModalOpen(true);
                      } else {
                        await navigator.clipboard.writeText(currentUserPrompt);
                        await incrementUsageCount(selectedPrompt.id);
                        setCopied(true);
                        showToast(t('toast.copied'), 'success', showCopyNotification);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    <span>{copied ? t('prompt.copied') : t('prompt.copy')}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!canRunSingleAiTest) {
                        showToast(t('toast.configAI'), 'error');
                        return;
                      }
                      // Select content based on language mode
                      // 根据语言模式选择内容
                      const currentUserPrompt = showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt;
                      const currentSystemPrompt = showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt;

                      // Check variables (create a new regex per string to avoid global flag state)
                      // 检查是否有变量（为每个字符串创建新的正则实例，避免全局标志导致的状态问题）
                      const hasVariables =
                        /\{\{([^}]+)\}\}/.test(currentUserPrompt) ||
                        (currentSystemPrompt && /\{\{([^}]+)\}\}/.test(currentSystemPrompt));

                      if (hasVariables) {
                        setIsAiTestVariableModalOpen(true);
                      } else {
                        runAiTest(currentSystemPrompt, currentUserPrompt);
                      }
                    }}
                    disabled={isTestingAI}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary/90 text-white text-sm font-medium hover:bg-primary disabled:opacity-50 transition-colors"
                  >
                    {isTestingAI ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-4 h-4" />}
                    <span>{isTestingAI ? t('prompt.testing') : t('prompt.aiTest')}</span>
                  </button>
                  <button
                    onClick={() => handleVersionHistory(selectedPrompt)}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent transition-colors"
                  >
                    <HistoryIcon className="w-4 h-4" />
                    <span>{t('prompt.history')}</span>
                  </button>
                  <button
                    onClick={() => handleDeletePrompt(selectedPrompt)}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                    <span>{t('prompt.delete')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
                <SparklesIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p>{t('prompt.selectPrompt')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Shared modals */}
      {/* 共享弹窗 */}

      {/* Edit modal */}
      {/* 编辑弹窗 */}
      {editingPrompt && (
        <EditPromptModal
          isOpen={!!editingPrompt}
          onClose={() => setEditingPrompt(null)}
          prompt={editingPrompt}
        />
      )}

      {/* AI test modal (for List/Gallery view) */}
      {/* AI 测试弹窗 (用于 List/Gallery 视图) */}
      <AiTestModal
        isOpen={isAiTestModalOpen}
        onClose={() => {
          setIsAiTestModalOpen(false);
          setAiTestPrompt(null);
        }}
        prompt={aiTestPrompt}
        onUsageIncrement={handleAiUsageIncrement}
        onSaveResponse={handleSaveAiResponse}
        onAddImage={async (fileName) => {
          // Add generated image to the currently tested prompt
          // 将生成的图片添加到当前测试的 Prompt
          if (aiTestPrompt) {
            const newImages = [...(aiTestPrompt.images || []), fileName];
            await updatePrompt(aiTestPrompt.id, { images: newImages });
            setAiTestPrompt({
              ...aiTestPrompt,
              images: newImages,
            });
          }
        }}
      />

      {/* Detail modal (for List/Gallery view) */}
      {/* 查看详情弹窗 (用于 List/Gallery 视图) */}
      <PromptDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailPrompt(null);
        }}
        prompt={detailPrompt}
        onCopy={handleCopyPrompt}
        onEdit={(prompt) => setEditingPrompt(prompt)}
      />

      {/* Variable input modal (copy) - choose content by language mode */}
      {/* 变量输入弹窗（用于复制） - 根据语言模式选择内容 */}
      {selectedPrompt && (
        <VariableInputModal
          isOpen={isVariableModalOpen}
          onClose={() => setIsVariableModalOpen(false)}
          promptId={selectedPrompt.id}
          systemPrompt={showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt}
          userPrompt={showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt}
          mode="copy"
          onCopy={async (text) => {
            await navigator.clipboard.writeText(text);
            await incrementUsageCount(selectedPrompt.id);
            setCopied(true);
            showToast(t('toast.copied'), 'success', showCopyNotification);
            setTimeout(() => setCopied(false), 2000);
            setIsVariableModalOpen(false);
          }}
        />
      )}

      {/* Variable input modal (AI test) - choose content by language mode */}
      {/* 变量输入弹窗（用于 AI 测试） - 根据语言模式选择内容 */}
      {selectedPrompt && (
        <VariableInputModal
          isOpen={isAiTestVariableModalOpen}
          onClose={() => setIsAiTestVariableModalOpen(false)}
          promptId={selectedPrompt.id}
          systemPrompt={showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt}
          userPrompt={showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt}
          mode="aiTest"
          onAiTest={(filledSystemPrompt, filledUserPrompt) => {
            runAiTest(filledSystemPrompt, filledUserPrompt);
          }}
          isAiTesting={isTestingAI}
        />
      )}

      {/* Variable input modal (multi-model compare) - choose content by language mode */}
      {/* 变量输入弹窗（用于多模型对比） - 根据语言模式选择内容 */}
      {selectedPrompt && (
        <VariableInputModal
          isOpen={isCompareVariableModalOpen}
          onClose={() => setIsCompareVariableModalOpen(false)}
          promptId={selectedPrompt.id}
          systemPrompt={showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt}
          userPrompt={showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt}
          mode="aiTest"
          onAiTest={(filledSystemPrompt, filledUserPrompt) => {
            runModelCompare(filledSystemPrompt, filledUserPrompt);
          }}
          isAiTesting={isComparingModels}
        />
      )}

      {/* Variable input modal (copy from list/gallery view) */}
      {/* 变量输入弹窗（列表/画廊视图复制用） */}
      {copyPrompt && (
        <VariableInputModal
          isOpen={isCopyVariableModalOpen}
          onClose={() => {
            setIsCopyVariableModalOpen(false);
            setCopyPrompt(null);
          }}
          promptId={copyPrompt.id}
          systemPrompt={copyPrompt.systemPrompt}
          userPrompt={copyPrompt.userPrompt}
          mode="copy"
          onCopy={async (text) => {
            await navigator.clipboard.writeText(text);
            await incrementUsageCount(copyPrompt.id);
            setCopied(true);
            showToast(t('toast.copied'), 'success', showCopyNotification);
            setTimeout(() => setCopied(false), 2000);
            setIsCopyVariableModalOpen(false);
            setCopyPrompt(null);
          }}
        />
      )}

      {/* Version history modal (unified) */}
      {/* 版本历史弹窗 (Unified) */}
      {versionHistoryPrompt && (
        <VersionHistoryModal
          isOpen={isVersionModalOpenTable}
          onClose={() => {
            setIsVersionModalOpenTable(false);
            setVersionHistoryPrompt(null);
          }}
          prompt={versionHistoryPrompt}
          onRestore={handleRestoreVersionFromTable}
        />
      )}

      {/* Image preview modal */}
      {/* 图片预览弹窗 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageSrc={previewImage}
      />

      {/* Delete confirm dialog */}
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, prompt: null })}
        onConfirm={confirmDelete}
        title={t('prompt.delete')}
        message={t('prompt.confirmDeletePrompt')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        variant="destructive"
      />

      {/* Context menu */}
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </main>
  );
}
