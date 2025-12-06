import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, PlayIcon, EditIcon, TrashIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon, FolderIcon, Trash2Icon } from 'lucide-react';
import type { Prompt } from '../../../shared/types';
import { useFolderStore } from '../../stores/folder.store';

// 自定义 Checkbox 组件
function Checkbox({ checked, onChange, className = '' }: { checked: boolean; onChange: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${checked
        ? 'bg-primary border-primary text-white'
        : 'border-gray-300 dark:border-gray-600 hover:border-primary/50 bg-white dark:bg-gray-800'
        } ${className}`}
    >
      {checked && (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

interface PromptTableViewProps {
  prompts: Prompt[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onAiTest: (prompt: Prompt) => void;
  onVersionHistory: (prompt: Prompt) => void;
  onViewDetail: (prompt: Prompt) => void;
  aiResults?: Record<string, string>; // promptId -> AI 响应结果
  onBatchFavorite?: (ids: string[], favorite: boolean) => void;
  onBatchMove?: (ids: string[], folderId: string | undefined) => void;
  onBatchDelete?: (ids: string[]) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function PromptTableView({
  prompts,
  onSelect,
  onToggleFavorite,
  onCopy,
  onEdit,
  onDelete,
  onAiTest,
  onVersionHistory,
  onViewDetail,
  aiResults = {},
  onBatchFavorite,
  onBatchMove,
  onBatchDelete,
  onContextMenu,
}: PromptTableViewProps) {
  const { t } = useTranslation();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const folders = useFolderStore((state) => state.folders);

  // 分页
  const totalPages = Math.ceil(prompts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPrompts = prompts.slice(startIndex, endIndex);

  // 提取变量数量
  const getVariableCount = (prompt: Prompt) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    const text = (prompt.systemPrompt || '') + prompt.userPrompt;
    while ((match = regex.exec(text)) !== null) {
      matches.add(match[1]);
    }
    return matches.size;
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 处理复制
  const handleCopy = async (prompt: Prompt) => {
    await onCopy(prompt);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 切换页面
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // 多选功能
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === currentPrompts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPrompts.map(p => p.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // 批量操作
  const handleBatchFavorite = (favorite: boolean) => {
    if (onBatchFavorite && selectedIds.size > 0) {
      onBatchFavorite(Array.from(selectedIds), favorite);
      clearSelection();
    }
  };

  const handleBatchMove = (folderId: string | undefined) => {
    if (onBatchMove && selectedIds.size > 0) {
      onBatchMove(Array.from(selectedIds), folderId);
      clearSelection();
      setShowFolderMenu(false);
    }
  };

  const handleBatchDelete = () => {
    if (onBatchDelete && selectedIds.size > 0) {
      onBatchDelete(Array.from(selectedIds));
      clearSelection();
    }
  };

  // 是否有选中项
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex flex-col h-full">
      {/* 批量操作栏 */}
      {hasSelection && (
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="text-sm text-primary font-medium">
            {t('prompt.selected', { count: selectedIds.size }) || `已选择 ${selectedIds.size} 项`}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => handleBatchFavorite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-yellow-500/30 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
            >
              <StarIcon className="w-4 h-4" />
              {t('prompt.batchFavorite') || '批量收藏'}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <FolderIcon className="w-4 h-4" />
                {t('prompt.batchMove') || '批量移动'}
              </button>
              {showFolderMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => handleBatchMove(undefined)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors rounded-md"
                    >
                      {t('prompt.noFolder') || '不选择文件夹'}
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleBatchMove(folder.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 rounded-md"
                      >
                        <span>{folder.icon}</span>
                        <span>{folder.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2Icon className="w-4 h-4" />
              {t('prompt.batchDelete') || '批量删除'}
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:bg-accent transition-colors"
            >
              {t('common.cancel') || '取消'}
            </button>
          </div>
        </div>
      )}

      {/* 表格 - 支持横向滚动 */}
      <div className="flex-1 overflow-auto px-4 py-2">
        <div className="rounded-xl border border-border overflow-x-auto bg-card">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted/30 dark:bg-muted/20 border-b border-border">
                {/* 多选框 */}
                <th className="w-[50px] px-4 py-3">
                  <Checkbox
                    checked={currentPrompts.length > 0 && selectedIds.size === currentPrompts.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap min-w-[140px]">
                  {t('prompt.title')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap min-w-[180px]">
                  {t('prompt.userPrompt')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap min-w-[180px]">
                  {t('prompt.aiResponse')}
                </th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap w-[60px]">
                  {t('prompt.variables')}
                </th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap w-[70px]">
                  {t('prompt.usageCount')}
                </th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap w-[140px] sticky right-0 z-30 bg-muted/30 dark:bg-muted/20 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  {t('prompt.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentPrompts.map((prompt) => {
                const isSelected = selectedIds.has(prompt.id);
                const aiContent = prompt.lastAiResponse || aiResults[prompt.id] || '';
                return (
                  <tr
                    key={prompt.id}
                    onContextMenu={(e) => onContextMenu(e, prompt)}
                    className={`border-b border-border/50 last:border-b-0 hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    {/* 多选框 */}
                    <td className="w-[50px] px-4 py-3">
                      <Checkbox checked={isSelected} onChange={() => toggleSelect(prompt.id)} />
                    </td>
                    {/* 标题 - 可点击查看详情 */}
                    <td className="px-4 py-3 min-w-[140px]">
                      <button
                        onClick={() => onViewDetail(prompt)}
                        className="font-medium text-primary hover:text-primary/80 hover:underline truncate max-w-[140px] text-left"
                        title={prompt.title}
                      >
                        {prompt.title}
                      </button>
                    </td>

                    {/* Prompt 内容预览 */}
                    <td className="px-4 py-3 min-w-[180px]">
                      <p
                        className="text-muted-foreground text-xs line-clamp-2 max-w-[200px] cursor-help"
                        title={prompt.userPrompt}
                      >
                        {prompt.userPrompt.slice(0, 100)}{prompt.userPrompt.length > 100 ? '...' : ''}
                      </p>
                    </td>

                    {/* AI 响应预览 */}
                    <td className="px-4 py-3 min-w-[180px]">
                      {aiContent ? (
                        <p
                          className="text-muted-foreground text-xs line-clamp-2 max-w-[200px] cursor-help"
                          title={aiContent}
                        >
                          {aiContent.slice(0, 100)}{aiContent.length > 100 ? '...' : ''}
                        </p>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">-</span>
                      )}
                    </td>

                    {/* 变量数 */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs ${getVariableCount(prompt) > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        {getVariableCount(prompt) || '-'}
                      </span>
                    </td>

                    {/* 使用次数 */}
                    <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                      {prompt.usageCount || 0}
                    </td>

                    {/* 操作 - 固定在右侧 */}
                    <td className={`px-2 py-3 sticky right-0 z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-primary/5' : 'bg-card'} dark:bg-card`}>
                      <div
                        className="flex items-center justify-center gap-0.5 bg-card dark:bg-card rounded-lg px-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 复制 */}
                        <button
                          onClick={() => handleCopy(prompt)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title={t('prompt.copy')}
                        >
                          {copiedId === prompt.id ? (
                            <CheckIcon className="w-4 h-4 text-green-500" />
                          ) : (
                            <CopyIcon className="w-4 h-4" />
                          )}
                        </button>

                        {/* AI 测试 */}
                        <button
                          onClick={() => onAiTest(prompt)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title={t('prompt.aiTest')}
                        >
                          <PlayIcon className="w-4 h-4" />
                        </button>

                        {/* 版本历史 */}
                        <button
                          onClick={() => onVersionHistory(prompt)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title={t('prompt.history')}
                        >
                          <HistoryIcon className="w-4 h-4" />
                        </button>

                        {/* 收藏 */}
                        <button
                          onClick={() => onToggleFavorite(prompt.id)}
                          className={`p-1.5 rounded-lg transition-colors ${prompt.isFavorite
                            ? 'text-yellow-500 hover:bg-yellow-500/10'
                            : 'text-muted-foreground hover:text-yellow-500 hover:bg-accent'
                            }`}
                          title={prompt.isFavorite ? t('nav.favorites') : t('prompt.addToFavorites')}
                        >
                          <StarIcon className={`w-4 h-4 ${prompt.isFavorite ? 'fill-current' : ''}`} />
                        </button>

                        {/* 编辑 */}
                        <button
                          onClick={() => onEdit(prompt)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title={t('prompt.edit')}
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>

                        {/* 删除 */}
                        <button
                          onClick={() => onDelete(prompt)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title={t('prompt.delete')}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {prompts.length === 0 && (
          <div className="flex items-center justify-center h-40 text-muted-foreground rounded-xl border border-border bg-card mt-2">
            {t('prompt.noPrompts')}
          </div>
        )}
      </div>

      {/* 分页 */}
      {prompts.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('prompt.promptCount', { count: prompts.length })}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* 每页条数 */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('prompt.pageSize') || '每页'}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-md bg-muted border border-border text-foreground text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* 页码 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`w-8 h-8 rounded-md text-sm transition-colors ${currentPage === page
                        ? 'bg-primary text-white'
                        : 'hover:bg-accent'
                        }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
