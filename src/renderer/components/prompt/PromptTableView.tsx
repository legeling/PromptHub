import { useMemo, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, PlayIcon, EditIcon, TrashIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon, FolderIcon, Trash2Icon } from 'lucide-react';
import type { Prompt } from '../../../shared/types';
import { useFolderStore } from '../../stores/folder.store';
import { useTableConfig, type ColumnConfig } from '../../hooks/useTableConfig';
import { ResizableHeader } from './ResizableHeader';
import { ColumnConfigMenu } from './ColumnConfigMenu';

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, terms: string[], highlightClassName: string): ReactNode {
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

// Custom Checkbox component
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
  highlightTerms?: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onAiTest: (prompt: Prompt) => void;
  onVersionHistory: (prompt: Prompt) => void;
  onViewDetail: (prompt: Prompt) => void;
  // aiResults: promptId -> AI response
  // aiResults：promptId -> AI 响应结果
  aiResults?: Record<string, string>; // promptId -> AI 响应结果
  onBatchFavorite?: (ids: string[], favorite: boolean) => void;
  onBatchMove?: (ids: string[], folderId: string | undefined) => void;
  onBatchDelete?: (ids: string[]) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function PromptTableView({
  prompts,
  highlightTerms = [],
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
  const { t, i18n } = useTranslation();
  const highlightClassName = 'bg-primary/15 text-primary rounded px-0.5';
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const folders = useFolderStore((state) => state.folders);
  
  // Table column configuration
  // 表格列配置
  const {
    columns,
    toggleColumnVisibility,
    updateColumnWidth,
    resetToDefaults,
    getVisibleColumns,
  } = useTableConfig();

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return !(lang.startsWith('zh'));
  }, [i18n.language]);

  const renderTextPreview = (content?: string) => {
    if (!content) {
      return <span className="text-muted-foreground/40 text-xs">-</span>;
    }
    // Show plain text only; truncate to a single line
    // 只显示纯文本，截断为单行
    const plainText = content.replace(/\n/g, ' ').trim();
    return (
      <span className="text-xs text-muted-foreground truncate block max-w-[220px]" title={content}>
        {renderHighlightedText(plainText, highlightTerms, highlightClassName)}
      </span>
    );
  };

  // Pagination
  // 分页
  const totalPages = Math.ceil(prompts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPrompts = prompts.slice(startIndex, endIndex);

  // Extract variable count
  // 提取变量数量
  const getVariableCount = (prompt: Prompt) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    const text =
      (prompt.systemPrompt || '') +
      prompt.userPrompt +
      (prompt.systemPromptEn || '') +
      (prompt.userPromptEn || '');
    while ((match = regex.exec(text)) !== null) {
      matches.add(match[1]);
    }
    return matches.size;
  };

  // Format date
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

  // Handle copy
  // 处理复制
  const handleCopy = async (prompt: Prompt) => {
    await onCopy(prompt);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Change page
  // 切换页面
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Multi-select
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

  // Batch actions
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

  // Whether there are selected items
  // 是否有选中项
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Batch actions bar */}
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

      {/* Table - supports horizontal scrolling */}
      {/* 表格 - 支持横向滚动 */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {/* Table toolbar / 表格工具栏 */}
        <div className="flex items-center justify-end mb-2">
          <ColumnConfigMenu
            columns={columns}
            onToggleVisibility={toggleColumnVisibility}
            onReset={resetToDefaults}
          />
        </div>
        <div className="rounded-xl border border-border overflow-x-auto bg-card">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted/30 dark:bg-muted/20 border-b border-border">
                {getVisibleColumns().map((column) => {
                  // Render different content based on column id
                  // 根据列 ID 渲染不同内容
                  if (column.id === 'checkbox') {
                    return (
                      <th key={column.id} className="px-4 py-3" style={{ width: column.width }}>
                        <Checkbox
                          checked={currentPrompts.length > 0 && selectedIds.size === currentPrompts.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    );
                  }
                  
                  if (column.id === 'actions') {
                    return (
                      <th
                        key={column.id}
                        className="sticky right-0 z-40 p-0 bg-card shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]"
                        style={{ width: column.width }}
                      >
                        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/20" />
                        <div className="relative flex items-center justify-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                          <span>{t('prompt.actions')}</span>
                        </div>
                      </th>
                    );
                  }

                  // Regular columns with resizable headers
                  // 常规列，支持拖拽调整宽度
                  const isCenter = column.id === 'variables' || column.id === 'usageCount';
                  return (
                    <ResizableHeader
                      key={column.id}
                      column={column}
                      onResize={updateColumnWidth}
                      className={`${isCenter ? 'text-center' : 'text-left'} px-4 py-3 font-medium text-muted-foreground whitespace-nowrap`}
                    >
                      {t(column.label)}
                    </ResizableHeader>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {currentPrompts.map((prompt) => {
                const isSelected = selectedIds.has(prompt.id);
                const aiContent = prompt.lastAiResponse || aiResults[prompt.id] || '';
                
                // Helper to render cell content based on column id
                // 根据列 ID 渲染单元格内容的辅助函数
                const renderCell = (column: ColumnConfig) => {
                  const colWidth = { width: column.width, minWidth: column.minWidth };
                  
                  switch (column.id) {
                    case 'checkbox':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <Checkbox checked={isSelected} onChange={() => toggleSelect(prompt.id)} />
                        </td>
                      );
                    
                    case 'title':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <button
                            onClick={() => onViewDetail(prompt)}
                            className="font-medium text-primary hover:text-primary/80 hover:underline truncate text-left block"
                            style={{ maxWidth: column.width - 32 }}
                            title={prompt.title}
                          >
                            {renderHighlightedText(prompt.title, highlightTerms, highlightClassName)}
                          </button>
                        </td>
                      );

                    case 'description':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <span 
                            className="text-xs text-muted-foreground truncate block" 
                            style={{ maxWidth: column.width - 32 }}
                            title={prompt.description}
                          >
                            {renderHighlightedText(prompt.description || '-', highlightTerms, highlightClassName)}
                          </span>
                        </td>
                      );

                    case 'systemPrompt':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <span 
                            className="text-xs text-muted-foreground truncate block" 
                            style={{ maxWidth: column.width - 32 }}
                            title={preferEnglish ? (prompt.systemPromptEn || prompt.systemPrompt) : prompt.systemPrompt}
                          >
                            {renderTextPreview(preferEnglish ? (prompt.systemPromptEn || prompt.systemPrompt) : prompt.systemPrompt)}
                          </span>
                        </td>
                      );
                    
                    case 'userPrompt':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <span 
                            className="text-xs text-muted-foreground truncate block" 
                            style={{ maxWidth: column.width - 32 }}
                            title={preferEnglish ? (prompt.userPromptEn || prompt.userPrompt) : prompt.userPrompt}
                          >
                            {renderTextPreview(preferEnglish ? (prompt.userPromptEn || prompt.userPrompt) : prompt.userPrompt)}
                          </span>
                        </td>
                      );
                    
                    case 'aiResponse':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <span 
                            className="text-xs text-muted-foreground truncate block" 
                            style={{ maxWidth: column.width - 32 }}
                            title={aiContent}
                          >
                            {renderTextPreview(aiContent)}
                          </span>
                        </td>
                      );
                    
                    case 'variables':
                      return (
                        <td key={column.id} className="px-4 py-3 text-center" style={colWidth}>
                          <span className={`text-xs ${getVariableCount(prompt) > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {getVariableCount(prompt) || '-'}
                          </span>
                        </td>
                      );
                    
                    case 'usageCount':
                      return (
                        <td key={column.id} className="px-4 py-3 text-center text-muted-foreground text-xs" style={colWidth}>
                          {prompt.usageCount || 0}
                        </td>
                      );

                    case 'tags':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                            {prompt.tags && prompt.tags.length > 0 ? (
                              prompt.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground truncate max-w-[80px]">
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                            {prompt.tags && prompt.tags.length > 2 && (
                              <span className="text-[10px] text-muted-foreground/50">+{prompt.tags.length - 2}</span>
                            )}
                          </div>
                        </td>
                      );

                    case 'updatedAt':
                      return (
                        <td key={column.id} className="px-4 py-3 text-xs text-muted-foreground" style={colWidth}>
                          <span title={new Date(prompt.updatedAt).toLocaleString()}>
                            {new Date(prompt.updatedAt).toLocaleDateString()}
                          </span>
                        </td>
                      );
                    
                    case 'actions':
                      return (
                        <td 
                          key={column.id}
                          className="sticky right-0 z-30 p-0 bg-card shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]"
                          style={colWidth}
                        >
                          {isSelected && <div className="absolute inset-0 bg-primary/5 pointer-events-none" />}
                          <div
                            className="relative flex items-center justify-center gap-0.5 px-2 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Copy */}
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

                            {/* AI test */}
                            <button
                              onClick={() => onAiTest(prompt)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title={t('prompt.aiTest')}
                            >
                              <PlayIcon className="w-4 h-4" />
                            </button>

                            {/* Version history */}
                            <button
                              onClick={() => onVersionHistory(prompt)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title={t('prompt.history')}
                            >
                              <HistoryIcon className="w-4 h-4" />
                            </button>

                            {/* Favorite */}
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

                            {/* Edit */}
                            <button
                              onClick={() => onEdit(prompt)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title={t('prompt.edit')}
                            >
                              <EditIcon className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => onDelete(prompt)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title={t('prompt.delete')}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      );
                    
                    default:
                      return null;
                  }
                };

                return (
                  <tr
                    key={prompt.id}
                    onContextMenu={(e) => onContextMenu(e, prompt)}
                    className={`border-b border-border/50 last:border-b-0 hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    {getVisibleColumns().map(renderCell)}
                  </tr>
                );
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

      {/* Pagination */}
      {/* 分页 */}
      {prompts.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('prompt.promptCount', { count: prompts.length })}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Page size */}
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

            {/* Page navigation */}
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
