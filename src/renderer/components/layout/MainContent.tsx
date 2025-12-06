import { useState, useEffect, useMemo } from 'react';
import { usePromptStore } from '../../stores/prompt.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSettingsStore } from '../../stores/settings.store';
import { StarIcon, CopyIcon, HistoryIcon, HashIcon, SparklesIcon, EditIcon, TrashIcon, CheckIcon, PlayIcon, LoaderIcon, XIcon, GitCompareIcon, ClockIcon } from 'lucide-react';
import { EditPromptModal, VersionHistoryModal, VariableInputModal, PromptListHeader, PromptListView, PromptTableView, AiTestModal, PromptDetailModal, PromptGalleryView } from '../prompt';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { useToast } from '../ui/Toast';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult } from '../../services/ai';
import { useTranslation } from 'react-i18next';
import type { Prompt, PromptVersion } from '../../../shared/types';

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
  const { t } = useTranslation();
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

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [isAiTestVariableModalOpen, setIsAiTestVariableModalOpen] = useState(false);
  const [isCompareVariableModalOpen, setIsCompareVariableModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prompt: Prompt } | null>(null);
  const { showToast } = useToast();

  // 按 prompt ID 保存测试状态和结果（持久化）
  const [promptTestStates, setPromptTestStates] = useState<Record<string, {
    isTestingAI: boolean;
    isComparingModels: boolean;
    aiResponse: string | null;
    compareResults: AITestResult[] | null;
    compareError: string | null;
  }>>({});

  // 获取当前 prompt 的测试状态和结果
  const currentState = selectedId ? promptTestStates[selectedId] : null;
  const isTestingAI = currentState?.isTestingAI || false;
  const isComparingModels = currentState?.isComparingModels || false;
  const aiResponse = currentState?.aiResponse || null;
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

  const setAiResponse = (response: string | null) => {
    if (selectedId) updatePromptState(selectedId, { aiResponse: response });
  };

  const setCompareResults = (results: AITestResult[] | null) => {
    if (selectedId) updatePromptState(selectedId, { compareResults: results });
  };

  const setCompareError = (error: string | null) => {
    if (selectedId) updatePromptState(selectedId, { compareError: error });
  };

  // 切换 Folder 时重置选中的 Prompt (隐私保护)
  useEffect(() => {
    selectPrompt(null);
  }, [selectedFolderId, selectPrompt]);

  // 切换 Prompt 时重置选中的模型（但保留测试结果和状态）
  useEffect(() => {
    setSelectedModelIds([]);
    // 如果当前 prompt 有测试结果，显示 AI 面板
    if (selectedId && promptTestStates[selectedId]?.aiResponse) {
      setShowAiPanel(true);
    } else {
      setShowAiPanel(false);
    }
  }, [selectedId, promptTestStates]);

  // AI 配置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const showCopyNotification = useSettingsStore((state) => state.showCopyNotification);

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
    setShowAiPanel(true);
    setIsTestingAI(true);
    setAiResponse(null);
    setIsAiTestVariableModalOpen(false);

    // 增加使用次数
    const targetId = promptId || selectedId;
    if (targetId) {
      await incrementUsageCount(targetId);
    }

    try {
      const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);
      const response = await chatCompletion(
        { provider: aiProvider, apiKey: aiApiKey, apiUrl: aiApiUrl, model: aiModel },
        messages
      );
      setAiResponse(response);
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
        provider: m.provider,
        apiKey: m.apiKey,
        apiUrl: m.apiUrl,
        model: m.model,
      }));

    const messages = buildMessagesFromPrompt(systemPrompt, userPrompt);

    setIsComparingModels(true);
    setCompareResults(null);
    setCompareError(null);
    try {
      const result = await multiModelCompare(selectedConfigs, messages);
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
          p.userPrompt.toLowerCase().includes(query)
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
  const handleDeletePrompt = async (prompt: Prompt) => {
    if (confirm(t('prompt.confirmDeletePrompt'))) {
      await deletePrompt(prompt.id);
      showToast(t('prompt.promptDeleted'), 'success');
    }
  };

  // 处理 AI 测试（表格视图用 - 弹窗模式）
  const handleAiTestFromTable = (prompt: Prompt) => {
    if (!aiApiKey) {
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
      label: t('prompt.viewDetails', '查看详情'),
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

  // 列表视图模式：整个区域是表格
  if (viewMode === 'list') {
    return (
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
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

        {/* 编辑弹窗 */}
        {editingPrompt && (
          <EditPromptModal
            isOpen={true}
            onClose={() => setEditingPrompt(null)}
            prompt={editingPrompt}
          />
        )}

        {/* AI 测试弹窗 */}
        <AiTestModal
          isOpen={isAiTestModalOpen}
          onClose={() => {
            setIsAiTestModalOpen(false);
            setAiTestPrompt(null);
          }}
          prompt={aiTestPrompt}
          onUsageIncrement={handleAiUsageIncrement}
          onSaveResponse={handleSaveAiResponse}
        />

        {/* 查看详情弹窗 */}
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

        {/* 版本历史弹窗 */}
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

  // Gallery 视图
  if (viewMode === 'gallery') {
    return (
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
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

        {/* 编辑弹窗 */}
        {editingPrompt && (
          <EditPromptModal
            isOpen={true}
            onClose={() => setEditingPrompt(null)}
            prompt={editingPrompt}
          />
        )}

        {/* AI 测试弹窗 */}
        <AiTestModal
          isOpen={isAiTestModalOpen}
          onClose={() => {
            setIsAiTestModalOpen(false);
            setAiTestPrompt(null);
          }}
          prompt={aiTestPrompt}
          onUsageIncrement={handleAiUsageIncrement}
          onSaveResponse={handleSaveAiResponse}
        />

        {/* 查看详情弹窗 */}
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

        {/* 版本历史弹窗 */}
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

  // 卡片视图模式：左右分栏
  return (
    <main className="flex-1 flex overflow-hidden bg-background">
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
      <div className="flex-1 overflow-y-auto">
        {selectedPrompt ? (
          <div className="max-w-3xl mx-auto p-8">
            {/* 标题区域 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-foreground mb-2">{selectedPrompt.title}</h2>
                {selectedPrompt.description && (
                  <p className="text-muted-foreground">{selectedPrompt.description}</p>
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
                  onClick={() => setIsEditModalOpen(true)}
                  className="p-2.5 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200 active:scale-95"
                >
                  <EditIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 元信息 */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4" />
                {t('prompt.updatedAt')} {new Date(selectedPrompt.updatedAt).toLocaleString()}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
                {t('prompt.versionLabel', { version: selectedPrompt.version })}
              </span>
            </div>

            {/* 图片 */}
            {selectedPrompt.images && selectedPrompt.images.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('prompt.images', '参考图片')}</h4>
                <div className="flex flex-wrap gap-4">
                  {selectedPrompt.images.map((img, index) => (
                    <div key={index} className="rounded-lg overflow-hidden border border-border shadow-sm">
                      <img
                        src={`local-image://${img}`}
                        alt={`image-${index}`}
                        className="max-w-[200px] max-h-[200px] object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                        onClick={() => setPreviewImage(img)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 标签 */}
            {selectedPrompt.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
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
            {selectedPrompt.systemPrompt && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    System Prompt
                  </span>
                </div>
                <div className="p-5 rounded-2xl bg-card border border-border font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedPrompt.systemPrompt}
                </div>
              </div>
            )}

            {/* User Prompt */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  User Prompt
                </span>
              </div>
              <div className="p-5 rounded-2xl bg-card border border-border font-mono text-sm leading-relaxed whitespace-pre-wrap">
                {selectedPrompt.userPrompt}
              </div>
            </div>

            {/* 多模型对比区域 */}
            {aiModels.length > 0 && (
              <div className="mb-8 p-5 rounded-2xl bg-card border border-border">
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

                      // 检查是否有变量
                      const variableRegex = /\{\{([^}]+)\}\}/g;
                      const hasVariables = variableRegex.test(selectedPrompt.userPrompt) ||
                        (selectedPrompt.systemPrompt && variableRegex.test(selectedPrompt.systemPrompt));

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
                        <div className="text-[11px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {res.success ? (res.response || '(空)') : (res.error || '未知错误')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 - iOS 风格 */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={async () => {
                  // 检查是否有变量
                  const variableRegex = /\{\{([^}]+)\}\}/g;
                  const hasVariables = variableRegex.test(selectedPrompt.userPrompt) ||
                    (selectedPrompt.systemPrompt && variableRegex.test(selectedPrompt.systemPrompt));

                  if (hasVariables) {
                    setIsVariableModalOpen(true);
                  } else {
                    const text = selectedPrompt.userPrompt;
                    await navigator.clipboard.writeText(text);
                    await incrementUsageCount(selectedPrompt.id);
                    setCopied(true);
                    showToast(t('toast.copied'), 'success', showCopyNotification);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-primary text-white text-sm font-medium
                  hover:bg-primary/90
                  transition-colors duration-150
                "
              >
                {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                <span>{copied ? t('prompt.copied') : t('prompt.copy')}</span>
              </button>
              <button
                onClick={() => {
                  if (!aiApiKey) {
                    showToast(t('toast.configAI'), 'error');
                    return;
                  }
                  // 检查是否有变量
                  const variableRegex = /\{\{([^}]+)\}\}/g;
                  const hasVariables = variableRegex.test(selectedPrompt.userPrompt) ||
                    (selectedPrompt.systemPrompt && variableRegex.test(selectedPrompt.systemPrompt));

                  if (hasVariables) {
                    setIsAiTestVariableModalOpen(true);
                  } else {
                    // 没有变量，直接测试
                    runAiTest(selectedPrompt.systemPrompt, selectedPrompt.userPrompt);
                  }
                }}
                disabled={isTestingAI}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-primary/90 text-white text-sm font-medium
                  hover:bg-primary disabled:opacity-50
                  transition-colors duration-150
                "
              >
                {isTestingAI ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-4 h-4" />}
                <span>{isTestingAI ? t('prompt.testing') : t('prompt.aiTest')}</span>
              </button>
              <button
                onClick={() => setIsVersionModalOpen(true)}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-card border border-border text-sm font-medium
                  hover:bg-accent
                  transition-colors duration-150
                "
              >
                <HistoryIcon className="w-4 h-4" />
                <span>{t('prompt.history')}</span>
              </button>
              <button
                onClick={async () => {
                  if (confirm(t('prompt.confirmDeletePrompt'))) {
                    await deletePrompt(selectedPrompt.id);
                    showToast(t('prompt.promptDeleted'), 'success');
                  }
                }}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-card border border-destructive/30 text-destructive text-sm font-medium
                  hover:bg-destructive/10
                  transition-colors duration-150
                "
              >
                <TrashIcon className="w-4 h-4" />
                <span>{t('prompt.delete')}</span>
              </button>
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

      {/* 编辑弹窗 */}
      {selectedPrompt && (
        <EditPromptModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          prompt={selectedPrompt}
        />
      )}

      {/* AI 测试弹窗（变量输入） */}
      <AiTestModal
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        prompt={selectedPrompt || null}
        onUsageIncrement={handleAiUsageIncrement}
        onSaveResponse={handleSaveAiResponse}
      />

      {/* 变量输入弹窗（用于复制） */}
      {
        selectedPrompt && (
          <VariableInputModal
            isOpen={isVariableModalOpen}
            onClose={() => setIsVariableModalOpen(false)}
            promptId={selectedPrompt.id}
            systemPrompt={selectedPrompt.systemPrompt}
            userPrompt={selectedPrompt.userPrompt}
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
        )
      }

      {/* 变量输入弹窗（用于 AI 测试） */}
      {
        selectedPrompt && (
          <VariableInputModal
            isOpen={isAiTestVariableModalOpen}
            onClose={() => setIsAiTestVariableModalOpen(false)}
            promptId={selectedPrompt.id}
            systemPrompt={selectedPrompt.systemPrompt}
            userPrompt={selectedPrompt.userPrompt}
            mode="aiTest"
            onAiTest={(filledSystemPrompt, filledUserPrompt) => {
              runAiTest(filledSystemPrompt, filledUserPrompt);
            }}
            isAiTesting={isTestingAI}
          />
        )
      }

      {/* 变量输入弹窗（用于多模型对比） */}
      {
        selectedPrompt && (
          <VariableInputModal
            isOpen={isCompareVariableModalOpen}
            onClose={() => setIsCompareVariableModalOpen(false)}
            promptId={selectedPrompt.id}
            systemPrompt={selectedPrompt.systemPrompt}
            userPrompt={selectedPrompt.userPrompt}
            mode="aiTest"
            onAiTest={(filledSystemPrompt, filledUserPrompt) => {
              runModelCompare(filledSystemPrompt, filledUserPrompt);
            }}
            isAiTesting={isComparingModels}
          />
        )
      }
      {/* 版本历史弹窗 */}
      {selectedPrompt && (
        <VersionHistoryModal
          isOpen={isVersionModalOpen}
          onClose={() => setIsVersionModalOpen(false)}
          prompt={selectedPrompt}
          onRestore={handleRestoreVersion}
        />
      )}

      {/* 图片预览弹窗 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageSrc={previewImage}
      />
    </main>
  );
}
