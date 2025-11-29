import { useState } from 'react';
import { usePromptStore } from '../../stores/prompt.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSettingsStore } from '../../stores/settings.store';
import { StarIcon, CopyIcon, HistoryIcon, HashIcon, ClockIcon, SparklesIcon, EditIcon, TrashIcon, CheckIcon, PlayIcon, LoaderIcon, XIcon, GitCompareIcon } from 'lucide-react';
import { EditPromptModal, VersionHistoryModal } from '../prompt';
import { useToast } from '../ui/Toast';
import { chatCompletion, buildMessagesFromPrompt, multiModelCompare, AITestResult } from '../../services/ai';
import { useTranslation } from 'react-i18next';
import type { Prompt, PromptVersion } from '../../../shared/types';

// Prompt 卡片组件（暂时禁用拖拽，优先保证点击功能）
function PromptCard({ 
  prompt, 
  isSelected, 
  onSelect 
}: { 
  prompt: Prompt; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        w-full text-left p-4 rounded-xl cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'bg-primary text-white'
          : 'bg-card hover:bg-accent'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold truncate">{prompt.title}</h3>
        <div className="flex items-center gap-1">
          {prompt.isFavorite && (
            <StarIcon className={`w-4 h-4 flex-shrink-0 ${
              isSelected ? 'fill-white text-white' : 'fill-yellow-400 text-yellow-400'
            }`} />
          )}
        </div>
      </div>
      {prompt.description && (
        <p className={`text-sm truncate mb-2 ${
          isSelected ? 'text-white/80' : 'text-muted-foreground'
        }`}>
          {prompt.description}
        </p>
      )}
      <div className={`flex items-center gap-3 text-xs ${
        isSelected ? 'text-white/60' : 'text-muted-foreground'
      }`}>
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          {new Date(prompt.updatedAt).toLocaleDateString()}
        </span>
        <span>v{prompt.version}</span>
      </div>
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
  const filterTag = usePromptStore((state) => state.filterTag);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [isComparingModels, setIsComparingModels] = useState(false);
  const [compareModelsInput, setCompareModelsInput] = useState('');
  const [compareResults, setCompareResults] = useState<AITestResult[] | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const { showToast } = useToast();
  
  // AI 配置
  const aiProvider = useSettingsStore((state) => state.aiProvider);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const aiApiUrl = useSettingsStore((state) => state.aiApiUrl);
  const aiModel = useSettingsStore((state) => state.aiModel);

  const handleRestoreVersion = async (version: PromptVersion) => {
    if (selectedPrompt) {
      await updatePrompt(selectedPrompt.id, {
        systemPrompt: version.systemPrompt,
        userPrompt: version.userPrompt,
      });
      showToast('已恢复到历史版本', 'success');
    }
  };

  // 过滤 Prompts
  let filteredPrompts = prompts;

  if (selectedFolderId === 'favorites') {
    filteredPrompts = filteredPrompts.filter((p) => p.isFavorite);
  } else if (selectedFolderId) {
    filteredPrompts = filteredPrompts.filter((p) => p.folderId === selectedFolderId);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredPrompts = filteredPrompts.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.userPrompt.toLowerCase().includes(query)
    );
  }

  // 标签筛选
  if (filterTag) {
    filteredPrompts = filteredPrompts.filter((p) => p.tags.includes(filterTag));
  }

  const selectedPrompt = prompts.find((p) => p.id === selectedId);

  return (
    <main className="flex-1 flex overflow-hidden bg-background">
      {/* Prompt 列表 - iOS 风格卡片 */}
      <div className="w-80 border-r border-border overflow-y-auto bg-card/50">
        {filteredPrompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <SparklesIcon className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground mb-1">{t('prompt.noPrompts')}</p>
            <p className="text-sm text-muted-foreground">{t('prompt.addFirst')}</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredPrompts.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                isSelected={selectedId === prompt.id}
                onSelect={() => selectPrompt(prompt.id)}
              />
            ))}
          </div>
        )}
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
                更新于 {new Date(selectedPrompt.updatedAt).toLocaleString('zh-CN', { 
                  year: 'numeric', 
                  month: '2-digit', 
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
                版本 {selectedPrompt.version}
              </span>
            </div>

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
            <div className="mb-8 p-5 rounded-2xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-4">
                <GitCompareIcon className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">多模型对比</span>
                <span className="text-xs text-muted-foreground">同一 Prompt，使用多个模型对比响应</span>
              </div>
              <div className="flex flex-col gap-2 mb-3">
                <label className="text-xs text-muted-foreground">模型列表（逗号分隔，将自动包含当前模型 {aiModel}）</label>
                <input
                  type="text"
                  value={compareModelsInput}
                  onChange={(e) => setCompareModelsInput(e.target.value)}
                  placeholder="例如：gpt-4o,gpt-4o-mini,deepseek-chat"
                  className="h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={async () => {
                  if (!aiApiKey || !aiApiUrl || !aiModel) {
                    showToast('请先在设置中配置 AI 模型', 'error');
                    return;
                  }
                  if (!selectedPrompt) return;

                  const extraModels = compareModelsInput
                    .split(',')
                    .map((m) => m.trim())
                    .filter((m) => m.length > 0 && m !== aiModel);

                  const uniqueModels = Array.from(new Set([aiModel, ...extraModels]));

                  if (uniqueModels.length < 2) {
                    showToast('请至少配置两个不同的模型名称', 'error');
                    return;
                  }

                  const configs = uniqueModels.map((modelName) => ({
                    provider: aiProvider,
                    apiKey: aiApiKey,
                    apiUrl: aiApiUrl,
                    model: modelName,
                  }));

                  const messages = buildMessagesFromPrompt(
                    selectedPrompt.systemPrompt,
                    selectedPrompt.userPrompt
                  );

                  setIsComparingModels(true);
                  setCompareResults(null);
                  setCompareError(null);
                  try {
                    const result = await multiModelCompare(configs, messages);
                    setCompareResults(result.results);
                  } catch (error) {
                    setCompareError(error instanceof Error ? error.message : '未知错误');
                  } finally {
                    setIsComparingModels(false);
                  }
                }}
                disabled={isComparingModels}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isComparingModels ? (
                  <LoaderIcon className="w-3 h-3 animate-spin" />
                ) : (
                  <GitCompareIcon className="w-3 h-3" />
                )}
                <span>{isComparingModels ? '对比中...' : '开始对比测试'}</span>
              </button>

              {compareError && (
                <p className="mt-2 text-xs text-red-500">{compareError}</p>
              )}

              {compareResults && compareResults.length > 0 && (
                <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {compareResults.map((res) => (
                    <div
                      key={`${res.provider}-${res.model}`}
                      className={`p-3 rounded-lg border text-xs space-y-2 ${
                        res.success ? 'border-emerald-400/50 bg-emerald-500/5' : 'border-red-400/50 bg-red-500/5'
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

            {/* 操作按钮 - iOS 风格 */}
            <div className="flex items-center gap-3 flex-wrap">
              <button 
                onClick={() => {
                  const text = selectedPrompt.systemPrompt 
                    ? `System: ${selectedPrompt.systemPrompt}\n\nUser: ${selectedPrompt.userPrompt}`
                    : selectedPrompt.userPrompt;
                  navigator.clipboard.writeText(text);
                  setCopied(true);
                  showToast('已复制到剪贴板', 'success');
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-primary text-white text-sm font-medium
                  hover:bg-primary/90
                  transition-colors duration-150
                "
              >
                {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                <span>{copied ? '已复制' : '复制 Prompt'}</span>
              </button>
              <button 
                onClick={async () => {
                  if (!aiApiKey) {
                    showToast('请先在设置中配置 AI 模型', 'error');
                    return;
                  }
                  setShowAiPanel(true);
                  setIsTestingAI(true);
                  setAiResponse(null);
                  try {
                    const messages = buildMessagesFromPrompt(
                      selectedPrompt.systemPrompt,
                      selectedPrompt.userPrompt
                    );
                    const response = await chatCompletion(
                      { provider: aiProvider, apiKey: aiApiKey, apiUrl: aiApiUrl, model: aiModel },
                      messages
                    );
                    setAiResponse(response);
                  } catch (error) {
                    setAiResponse(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
                    showToast('AI 调用失败', 'error');
                  } finally {
                    setIsTestingAI(false);
                  }
                }}
                disabled={isTestingAI}
                className="
                  flex items-center gap-2 h-10 px-5 rounded-lg
                  bg-green-500 text-white text-sm font-medium
                  hover:bg-green-600 disabled:opacity-50
                  transition-colors duration-150
                "
              >
                {isTestingAI ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-4 h-4" />}
                <span>{isTestingAI ? '测试中...' : 'AI 测试'}</span>
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
                <span>历史版本</span>
              </button>
              <button 
                onClick={async () => {
                  if (confirm('确定要删除这个 Prompt 吗？')) {
                    await deletePrompt(selectedPrompt.id);
                    showToast('Prompt 已删除', 'success');
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
                <span>删除</span>
              </button>
            </div>

            {/* AI 测试结果面板 */}
            {showAiPanel && (
              <div className="mt-6 p-5 rounded-2xl bg-card border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">AI 响应</span>
                    <span className="text-xs text-muted-foreground">({aiModel})</span>
                  </div>
                  <button
                    onClick={() => setShowAiPanel(false)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <XIcon className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 font-mono text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {isTestingAI ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <LoaderIcon className="w-4 h-4 animate-spin" />
                      <span>正在调用 AI...</span>
                    </div>
                  ) : aiResponse ? (
                    aiResponse
                  ) : (
                    <span className="text-muted-foreground">等待响应...</span>
                  )}
                </div>
                {aiResponse && !isTestingAI && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(aiResponse);
                      showToast('已复制 AI 响应', 'success');
                    }}
                    className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CopyIcon className="w-3 h-3" />
                    复制响应
                  </button>
                )}
              </div>
            )}

            {/* 编辑弹窗 */}
            <EditPromptModal
              isOpen={isEditModalOpen}
              onClose={() => setIsEditModalOpen(false)}
              prompt={selectedPrompt}
            />

            {/* 历史版本弹窗 */}
            <VersionHistoryModal
              isOpen={isVersionModalOpen}
              onClose={() => setIsVersionModalOpen(false)}
              prompt={selectedPrompt}
              onRestore={handleRestoreVersion}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
              <SparklesIcon className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">选择一个 Prompt</h3>
            <p className="text-muted-foreground max-w-sm">
              从左侧列表选择一个 Prompt 查看详情，或点击「新建」创建新的 Prompt
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
