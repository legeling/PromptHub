import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePromptStore } from '../../stores/prompt.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSettingsStore } from '../../stores/settings.store';
import { StarIcon, CopyIcon, HistoryIcon, HashIcon, SparklesIcon, EditIcon, TrashIcon, CheckIcon, PlayIcon, LoaderIcon, XIcon, GitCompareIcon, ClockIcon, GlobeIcon } from 'lucide-react';
import { EditPromptModal, VersionHistoryModal, VariableInputModal, PromptListHeader, PromptListView, PromptTableView, AiTestModal, PromptDetailModal, PromptGalleryView } from '../prompt';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult, StreamCallbacks } from '../../services/ai';
import { useTranslation } from 'react-i18next';
import type { Prompt, PromptVersion } from '../../../shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { defaultSchema } from 'hast-util-sanitize';

// Prompt 卡片组件（紧凑版本）
function PromptCard({
  prompt,
  isSelected,
  onSelect,
  onContextMenu
}: {
  prompt: Prompt;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'bg-primary text-white'
          : 'bg-card hover:bg-accent'
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium truncate text-sm">{prompt.title}</h3>
        {prompt.isFavorite && (
          <StarIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'fill-white text-white' : 'fill-yellow-400 text-yellow-400'
            }`} />
        )}
      </div>
      {prompt.description && (
        <p className={`text-xs truncate mt-0.5 ${isSelected ? 'text-white/70' : 'text-muted-foreground'
          }`}>
          {prompt.description}
        </p>
      )}
    </div>
  );
}

export function MainContent() {
  const { t, i18n } = useTranslation();
  const prompts = usePromptStore((state) => state.prompts);
  const selectedId = usePromptStore((state) => state.selectedId);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const deletePrompt = usePromptStore((state) => state.deletePrompt);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const filterTags = usePromptStore((state) => state.filterTags);
  const sortBy = usePromptStore((state) => state.sortBy);
  const sortOrder = usePromptStore((state) => state.sortOrder);
  const viewMode = usePromptStore((state) => state.viewMode);
  const incrementUsageCount = usePromptStore((state) => state.incrementUsageCount);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const folders = useFolderStore((state) => state.folders);

  const [copied, setCopied] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [isAiTestVariableModalOpen, setIsAiTestVariableModalOpen] = useState(false);
  const [isCompareVariableModalOpen, setIsCompareVariableModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prompt: Prompt } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; prompt: Prompt | null }>({ isOpen: false, prompt: null });
  const renderMarkdownPref = useSettingsStore((state) => state.renderMarkdown);
  const setRenderMarkdownPref = useSettingsStore((state) => state.setRenderMarkdown);
  const [renderMarkdownEnabled, setRenderMarkdownEnabled] = useState(renderMarkdownPref);
  const [showEnglish, setShowEnglish] = useState(false);
  const { showToast } = useToast();

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return !(lang.startsWith('zh'));
  }, [i18n.language]);

  // 按 prompt ID 保存测试状态和结果（持久化）
  const [promptTestStates, setPromptTestStates] = useState<Record<string, {
    isTestingAI: boolean;
    isComparingModels: boolean;
    aiResponse: string | null;
    aiThinking: string | null;
    compareResults: AITestResult[] | null;
    compareError: string | null;
  }>>({});

  // 获取当前 prompt 的测试状态和结果
  const currentState = selectedId ? promptTestStates[selectedId] : null;
  const isTestingAI = currentState?.isTestingAI || false;
  const isComparingModels = currentState?.isComparingModels || false;
  const aiResponse = currentState?.aiResponse || null;
  const aiThinking = currentState?.aiThinking || null;
  const compareResults = currentState?.compareResults || null;
  const compareError = currentState?.compareError || null;

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

  // 切换 Folder 时重置选中的 Prompt (隐私保护)
  useEffect(() => {
    selectPrompt(null);
  }, [selectedFolderId, selectPrompt]);

  // 切换 Prompt 时重置选中的模型
  useEffect(() => {
    setSelectedModelIds([]);
  }, [selectedId]);

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

  const markdownComponents = useMemo(() => ({
    h1: (props: any) => <h1 className="text-2xl font-bold mb-4 text-foreground" {...props} />,
    h2: (props: any) => <h2 className="text-xl font-semibold mb-3 mt-5 text-foreground" {...props} />,
    h3: (props: any) => <h3 className="text-lg font-semibold mb-3 mt-4 text-foreground" {...props} />,
    h4: (props: any) => <h4 className="text-base font-semibold mb-2 mt-3 text-foreground" {...props} />,
    p: (props: any) => <p className="mb-3 leading-relaxed text-foreground/90" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    code: (props: any) => <code className="px-1 py-0.5 rounded bg-muted font-mono text-[13px]" {...props} />,
    pre: (props: any) => (
      <pre className="p-3 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed" {...props} />
    ),
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-border pl-3 text-muted-foreground italic mb-3" {...props} />
    ),
    hr: () => <hr className="my-4 border-border" />,
    table: (props: any) => <table className="table-auto border-collapse w-full text-sm mb-3" {...props} />,
    th: (props: any) => (
      <th className="border border-border px-2 py-1 bg-muted text-left font-medium" {...props} />
    ),
    td: (props: any) => <td className="border border-border px-2 py-1" {...props} />,
    a: (props: any) => <a className="text-primary hover:underline" {...props} target="_blank" rel="noreferrer" />,
    strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
    em: (props: any) => <em className="italic text-foreground/90" {...props} />,
  }), []);

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
          {content}
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

  // AI 测试函数（支持变量替换后的 prompt）
  const runAiTest = async (systemPrompt: string | undefined, userPrompt: string, promptId?: string) => {
    // 卡片视图不使用弹窗，直接在页面内显示结果
    // setShowAiPanel(true);  // 移除：不再打开 AiTestModal
    setIsTestingAI(true);
    setAiResponse(null);
    setAiThinking(null);
    setIsAiTestVariableModalOpen(false);

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

      if (useStream) {
        setAiResponse('');
        if (useThinking) setAiThinking('');
      }

      const result = await chatCompletion(singleChatConfig as any, messages, useStream ? {
        streamCallbacks: {
          onContent: (chunk) => setAiResponse((prev) => (prev ?? '') + chunk),
          onThinking: (chunk) => setAiThinking((prev) => (prev ?? '') + chunk),
        },
      } : undefined);
      setAiResponse(result.content);
      setAiThinking(result.thinkingContent || null);
    } catch (error) {
      setAiResponse(`${t('common.error')}: ${error instanceof Error ? error.message : t('common.error')}`);
      showToast(t('toast.aiFailed'), 'error');
    } finally {
      setIsTestingAI(false);
    }
  };

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
      // 支持流式：提前渲染占位结果，让用户能看到"正在流式输出"的差异
      setCompareResults(
        selectedConfigs.map((c) => ({
          success: true,
          response: '',
          thinkingContent: '',
          latency: 0,
          model: c.model,
          provider: c.provider,
        }))
      );

      // 为启用流式的模型创建流式回调 Map
      const streamCallbacksMap = new Map<string, StreamCallbacks>();
      for (const cfg of selectedConfigs) {
        if (cfg.chatParams?.stream) {
          streamCallbacksMap.set(cfg.id, {
            onContent: (chunk: string) => {
              setCompareResults((prev) => {
                if (!prev) return prev;
                return prev.map((r) =>
                  r.model === cfg.model && r.provider === cfg.provider
                    ? { ...r, response: (r.response || '') + chunk }
                    : r
                );
              });
            },
            onThinking: (chunk: string) => {
              setCompareResults((prev) => {
                if (!prev) return prev;
                return prev.map((r) =>
                  r.model === cfg.model && r.provider === cfg.provider
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
      // 流式模式下，结果已经在回调中更新，这里只做最终同步（确保非流式模型的结果也正确显示）
      setCompareResults(result.results);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsComparingModels(false);
    }
  };

  // 过滤 Prompts - 使用 useMemo 确保正确响应 searchQuery 变化
  const filteredPrompts = useMemo(() => {
    let result = prompts;

    if (selectedFolderId === 'favorites') {
      result = result.filter((p) => p.isFavorite);
    } else if (selectedFolderId) {
      result = result.filter((p) => p.folderId === selectedFolderId);
    } else {
      // 在"全部 Prompts"视图中，隐藏私密文件夹的内容
      const privateFolderIds = folders.filter(f => f.isPrivate).map(f => f.id);
      if (privateFolderIds.length > 0) {
        result = result.filter(p => !p.folderId || !privateFolderIds.includes(p.folderId));
      }
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.userPrompt.toLowerCase().includes(query) ||
          (p.userPromptEn ? p.userPromptEn.toLowerCase().includes(query) : false) ||
          (p.systemPrompt ? p.systemPrompt.toLowerCase().includes(query) : false) ||
          (p.systemPromptEn ? p.systemPromptEn.toLowerCase().includes(query) : false)
      );
    }

    // 标签筛选（多选：必须包含所有选中的标签）
    if (filterTags.length > 0) {
      result = result.filter((p) =>
        filterTags.every(tag => p.tags.includes(tag))
      );
    }

    return result;
  }, [prompts, selectedFolderId, searchQuery, filterTags, folders]);

  // 排序
  const sortedPrompts = useMemo(() => {
    const sorted = [...filteredPrompts];
    sorted.sort((a, b) => {
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

  // 用于表格视图的编辑 prompt
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  // AI 测试弹窗状态
  const [isAiTestModalOpen, setIsAiTestModalOpen] = useState(false);
  const [aiTestPrompt, setAiTestPrompt] = useState<Prompt | null>(null);
  // AI 响应缓存（用于列表视图预览）
  const [aiResponseCache, setAiResponseCache] = useState<Record<string, string>>({});
  const setViewMode = usePromptStore((state) => state.setViewMode);

  // 处理复制 Prompt
  const handleCopyPrompt = async (prompt: Prompt) => {
    const text = prompt.userPrompt;
    await navigator.clipboard.writeText(text);
    await incrementUsageCount(prompt.id);
    showToast(t('toast.copied'), 'success', showCopyNotification);
  };

  // 处理删除 Prompt（表格视图用）
  const handleDeletePrompt = useCallback((prompt: Prompt) => {
    setDeleteConfirm({ isOpen: true, prompt });
  }, []);

  // 确认删除
  const confirmDelete = useCallback(async () => {
    if (deleteConfirm.prompt) {
      await deletePrompt(deleteConfirm.prompt.id);
      showToast(t('prompt.promptDeleted'), 'success');
    }
    setDeleteConfirm({ isOpen: false, prompt: null });
  }, [deleteConfirm.prompt, deletePrompt, showToast, t]);

  // 处理 AI 测试（表格视图用 - 弹窗模式）
  const handleAiTestFromTable = (prompt: Prompt) => {
    if (!canRunSingleAiTest) {
      showToast(t('toast.configAI'), 'error');
      return;
    }
    setAiTestPrompt(prompt);
    setIsAiTestModalOpen(true);
  };

  // 查看详情弹窗状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  // 版本历史弹窗状态
  const [isVersionModalOpenTable, setIsVersionModalOpenTable] = useState(false);
  const [versionHistoryPrompt, setVersionHistoryPrompt] = useState<Prompt | null>(null);

  // 查看详情 - 弹窗显示
  const handleViewDetail = (prompt: Prompt) => {
    setDetailPrompt(prompt);
    setIsDetailModalOpen(true);
  };

  // 版本历史
  const handleVersionHistory = (prompt: Prompt) => {
    setVersionHistoryPrompt(prompt);
    setIsVersionModalOpenTable(true);
  };

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

  // 保存 AI 响应到 Prompt
  const handleSaveAiResponse = async (promptId: string, response: string) => {
    await updatePrompt(promptId, { lastAiResponse: response });
    // 同时更新缓存以便立即显示
    setAiResponseCache((prev) => ({ ...prev, [promptId]: response }));
  };

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

  return (
    <main className="flex-1 relative overflow-hidden bg-background">
      {/* 列表视图模式 */}
      <div 
        className={`absolute inset-0 flex flex-col bg-background transition-opacity duration-200 ease-in-out ${
          viewMode === 'list' 
            ? 'opacity-100 z-10 pointer-events-auto' 
            : 'opacity-0 z-0 pointer-events-none'
        }`}
      >
        {/* 顶部：排序 + 视图切换 */}
        <PromptListHeader count={sortedPrompts.length} />

        {/* 表格视图 */}
        <div className="flex-1 overflow-hidden">
          <PromptTableView
            prompts={sortedPrompts}
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

      {/* Gallery 视图 */}
      <div 
        className={`absolute inset-0 flex flex-col bg-background transition-opacity duration-200 ease-in-out ${
          viewMode === 'gallery' 
            ? 'opacity-100 z-10 pointer-events-auto' 
            : 'opacity-0 z-0 pointer-events-none'
        }`}
      >
        <PromptListHeader count={sortedPrompts.length} />
        <PromptGalleryView
          prompts={sortedPrompts}
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

      {/* 卡片视图模式：左右分栏 */}
      <div 
        className={`absolute inset-0 flex overflow-hidden bg-background transition-opacity duration-200 ease-in-out ${
          viewMode === 'card' 
            ? 'opacity-100 z-10 pointer-events-auto' 
            : 'opacity-0 z-0 pointer-events-none'
        }`}
      >
        {/* Prompt 列表 */}
        <div className="w-80 border-r border-border flex flex-col bg-card/50">
          {/* 列表头部：排序 + 视图切换 */}
          <PromptListHeader count={sortedPrompts.length} />

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
                    isSelected={selectedId === prompt.id}
                    onSelect={() => selectPrompt(prompt.id)}
                    onContextMenu={(e) => handleContextMenu(e, prompt)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prompt 详情 - iOS 风格 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPrompt ? (
            <>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto px-6 py-4">
              {/* 标题区域 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground mb-1">{selectedPrompt.title}</h2>
                  {selectedPrompt.description && (
                    <p className="text-sm text-muted-foreground">{selectedPrompt.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* 语言切换按钮 */}
                  {(selectedPrompt.systemPromptEn || selectedPrompt.userPromptEn) && (
                    <button
                      onClick={() => setShowEnglish(!showEnglish)}
                      className={`
                        flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-95 mr-1
                        ${showEnglish 
                          ? 'bg-primary text-white' 
                          : 'bg-accent text-muted-foreground hover:text-foreground'
                        }
                      `}
                      title={showEnglish ? t('prompt.showChinese') : t('prompt.showEnglish')}
                    >
                      <GlobeIcon className="w-3.5 h-3.5" />
                      {showEnglish ? 'EN' : 'ZH'}
                    </button>
                  )}

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

              {/* 图片 */}
              {selectedPrompt.images && selectedPrompt.images.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-3">
                    {selectedPrompt.images.map((img, index) => (
                      <div key={index} className="rounded-lg overflow-hidden border border-border shadow-sm">
                        <img
                          src={`local-image://${img}`}
                          alt={`image-${index}`}
                          className="max-w-[160px] max-h-[160px] object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                          onClick={() => setPreviewImage(img)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

                  {/* 模型选择列表 */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {aiModels.map((model) => {
                      const isSelected = selectedModelIds.includes(model.id);
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
                            <div className="bg-muted/20 border border-border/60 rounded-md p-2 max-h-24 overflow-y-auto">
                              <div className="text-[10px] font-medium text-muted-foreground mb-1">
                                {t('settings.thinkingContent', '思考过程')}
                              </div>
                              <div className="text-[10px] leading-relaxed whitespace-pre-wrap">
                                {res.thinkingContent}
                              </div>
                            </div>
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
                      {aiThinking !== null && (
                        <div className="bg-muted/30 border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            {t('settings.thinkingContent', '思考过程')}
                          </div>
                          <div className="text-xs leading-relaxed whitespace-pre-wrap">
                            {aiThinking || t('common.loading', '处理中...')}
                          </div>
                        </div>
                      )}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {aiResponse}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
            {/* 操作按钮 - 固定底部 */}
            <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-6 py-3">
              <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
                <button
                  onClick={async () => {
                    // 根据语言模式选择内容
                    const currentUserPrompt = showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt;
                    const currentSystemPrompt = showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt;
                    
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
                    // 根据语言模式选择内容
                    const currentUserPrompt = showEnglish ? (selectedPrompt.userPromptEn || selectedPrompt.userPrompt) : selectedPrompt.userPrompt;
                    const currentSystemPrompt = showEnglish ? (selectedPrompt.systemPromptEn || selectedPrompt.systemPrompt) : selectedPrompt.systemPrompt;
                    
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
            </>
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

      {/* 共享弹窗 */}
      
      {/* 编辑弹窗 */}
      {editingPrompt && (
        <EditPromptModal
          isOpen={!!editingPrompt}
          onClose={() => setEditingPrompt(null)}
          prompt={editingPrompt}
        />
      )}

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

      {/* 图片预览弹窗 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageSrc={previewImage}
      />

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
