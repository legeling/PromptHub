import { useEffect, useMemo, useRef, useState, useCallback, type DragEvent as ReactDragEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, PlayIcon, EditIcon, TrashIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, HistoryIcon, FolderIcon, Trash2Icon, GripVerticalIcon, CornerDownRightIcon, GitBranchIcon } from 'lucide-react';
import type { Prompt } from '@prompthub/shared/types';
import { useFolderStore } from '../../stores/folder.store';
import { useTableConfig, type ColumnConfig } from '../../hooks/useTableConfig';
import { ResizableHeader } from './ResizableHeader';
import { ColumnConfigMenu } from './ColumnConfigMenu';
import { parsePromptVariables } from './prompt-modal-utils';
import {
  flattenPromptTree,
  getPromptHierarchyMeta,
  getPromptDropPosition,
  getPromptMoveTarget,
  type PromptDropPosition,
} from './prompt-drag-utils';

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

function handleRowActionClick(
  event: MouseEvent<HTMLButtonElement>,
  action: () => void,
) {
  event.stopPropagation();
  action();
}

// Custom Checkbox component
// 自定义 Checkbox 组件
function Checkbox({
  checked,
  onChange,
  ariaLabel,
  className = '',
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${checked
        ? 'bg-primary border-primary text-white'
        : 'border-gray-300 dark:border-gray-600 hover:border-primary/50 bg-white dark:bg-gray-800'
        } ${className}`}
    >
      {checked && (
        <svg aria-hidden="true" className="w-3 h-3" viewBox="0 0 12 12" fill="none">
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
  onMovePrompt?: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void> | void;
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
  onMovePrompt,
}: PromptTableViewProps) {
  const { t, i18n } = useTranslation();
  const highlightClassName = 'bg-primary/15 text-primary rounded px-0.5';
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<PromptDropPosition | null>(null);
  const [collapsedPromptIds, setCollapsedPromptIds] = useState<Set<string>>(() => new Set());
  const folders = useFolderStore((state) => state.folders);
  const promptIds = useMemo(() => new Set(prompts.map((prompt) => prompt.id)), [prompts]);
  const effectiveCollapsedPromptIds = useMemo(
    () => (highlightTerms.length > 0 ? new Set<string>() : collapsedPromptIds),
    [collapsedPromptIds, highlightTerms.length],
  );
  const tablePromptNodes = useMemo(
    () =>
      flattenPromptTree(prompts, effectiveCollapsedPromptIds, {
        siblingOrder: "input",
      }),
    [effectiveCollapsedPromptIds, prompts],
  );
  const promptOrderKey = useMemo(
    () => tablePromptNodes.map((node) => node.prompt.id).join("\u001f"),
    [tablePromptNodes],
  );
  const nodeDepthById = useMemo(
    () => new Map(tablePromptNodes.map((node) => [node.prompt.id, node.depth])),
    [tablePromptNodes],
  );
  const hierarchyMeta = useMemo(() => getPromptHierarchyMeta(prompts), [prompts]);

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
  const copyLabel = t('prompt.copy');
  const aiTestLabel = t('prompt.aiTest');
  const historyLabel = t('prompt.history');
  const editLabel = t('prompt.edit');
  const deleteLabel = t('prompt.delete');

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
      clearCopyTimer();
    };
  }, [clearCopyTimer]);

  useEffect(() => {
    setCurrentPage(1);
  }, [promptOrderKey]);

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
  const totalPages = Math.max(1, Math.ceil(tablePromptNodes.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPrompts = tablePromptNodes
    .slice(startIndex, endIndex)
    .map((node) => node.prompt);
  const currentPageAllSelected =
    currentPrompts.length > 0 && currentPrompts.every((prompt) => selectedIds.has(prompt.id));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setSelectedIds((currentIds) => {
      const visibleIds = new Set(Array.from(currentIds).filter((id) => promptIds.has(id)));
      return visibleIds.size === currentIds.size ? currentIds : visibleIds;
    });
  }, [promptIds]);

  useEffect(() => {
    setCollapsedPromptIds((currentIds) => {
      const visibleIds = new Set(Array.from(currentIds).filter((id) => promptIds.has(id)));
      return visibleIds.size === currentIds.size ? currentIds : visibleIds;
    });
  }, [promptIds]);

  // Extract variable count
  // 提取变量数量
  const getVariableCount = (prompt: Prompt) => {
    const text =
      (prompt.systemPrompt || '') +
      prompt.userPrompt +
      (prompt.systemPromptEn || '') +
      (prompt.userPromptEn || '');
    return new Set(parsePromptVariables(text).map((variable) => variable.name)).size;
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
    if (!isMountedRef.current) {
      return;
    }
    clearCopyTimer();
    setCopiedId(prompt.id);
    copyTimerRef.current = setTimeout(() => {
      setCopiedId(null);
      copyTimerRef.current = null;
    }, 2000);
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

  const togglePromptCollapse = (promptId: string) => {
    setCollapsedPromptIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(promptId)) {
        nextIds.delete(promptId);
      } else {
        nextIds.add(promptId);
      }
      return nextIds;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (currentPageAllSelected) {
        currentPrompts.forEach((prompt) => nextIds.delete(prompt.id));
        return nextIds;
      }

      currentPrompts.forEach((prompt) => nextIds.add(prompt.id));
      return nextIds;
    });
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

  const resetDropState = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLTableRowElement>, promptId: string) => {
      if (!onMovePrompt) return;
      setDraggingId(promptId);
      setDropTargetId(null);
      setDropPosition(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-prompthub-prompt-id', promptId);
      event.dataTransfer.setData('text/plain', promptId);
    },
    [onMovePrompt],
  );

  const updateDropTarget = useCallback(
    (event: ReactDragEvent<HTMLTableRowElement>, targetPromptId: string) => {
      if (!onMovePrompt) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const sourcePromptId =
        draggingId ||
        event.dataTransfer.getData('application/x-prompthub-prompt-id') ||
        event.dataTransfer.getData('text/plain');
      if (!sourcePromptId || sourcePromptId === targetPromptId) {
        setDropTargetId(null);
        setDropPosition(null);
        return;
      }

      const nextDropPosition = getPromptDropPosition(
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
      );
      const moveTarget = getPromptMoveTarget(
        prompts,
        sourcePromptId,
        targetPromptId,
        nextDropPosition,
      );

      if (!moveTarget) {
        setDropTargetId(null);
        setDropPosition(null);
        return;
      }

      setDropTargetId(targetPromptId);
      setDropPosition(nextDropPosition);
    },
    [draggingId, onMovePrompt, prompts],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLTableRowElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLTableRowElement>, targetPromptId: string) => {
      if (!onMovePrompt) return;
      event.preventDefault();

      const sourcePromptId =
        draggingId ||
        event.dataTransfer.getData('application/x-prompthub-prompt-id') ||
        event.dataTransfer.getData('text/plain');
      if (!sourcePromptId || sourcePromptId === targetPromptId || !dropPosition) {
        resetDropState();
        return;
      }

      const moveTarget = getPromptMoveTarget(
        prompts,
        sourcePromptId,
        targetPromptId,
        dropPosition,
      );
      resetDropState();

      if (!moveTarget) {
        return;
      }

      await onMovePrompt(sourcePromptId, moveTarget.parentId, moveTarget.order);
    },
    [draggingId, dropPosition, onMovePrompt, prompts, resetDropState],
  );

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
              type="button"
              onClick={() => handleBatchFavorite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-yellow-500/30 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
            >
              <StarIcon aria-hidden="true" className="w-4 h-4" />
              {t('prompt.batchFavorite') || '批量收藏'}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <FolderIcon aria-hidden="true" className="w-4 h-4" />
                {t('prompt.batchMove') || '批量移动'}
              </button>
              {showFolderMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => handleBatchMove(undefined)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors rounded-md"
                    >
                      {t('prompt.noFolder') || '不选择文件夹'}
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
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
              type="button"
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2Icon aria-hidden="true" className="w-4 h-4" />
              {t('prompt.batchDelete') || '批量删除'}
            </button>
            <button
              type="button"
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
        <div className="rounded-xl border border-border overflow-x-auto app-wallpaper-panel">
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
                          checked={currentPageAllSelected}
                          onChange={toggleSelectAll}
                          ariaLabel={t('prompt.selectAllPrompts', 'Select all prompts')}
                        />
                      </th>
                    );
                  }

                  if (column.id === 'actions') {
                    return (
                      <th
                        key={column.id}
                        className="sticky right-0 z-40 p-0 app-wallpaper-surface-strong shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]"
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
                const promptDepth = nodeDepthById.get(prompt.id) ?? 0;
                const promptChildCount = hierarchyMeta.childCountById.get(prompt.id) ?? 0;
                const promptParentTitle = hierarchyMeta.parentTitleById.get(prompt.id);
                const isPromptCollapsed = effectiveCollapsedPromptIds.has(prompt.id);

                // Helper to render cell content based on column id
                // 根据列 ID 渲染单元格内容的辅助函数
                const renderCell = (column: ColumnConfig) => {
                  const colWidth = { width: column.width, minWidth: column.minWidth };
                  const favoriteLabel = prompt.isFavorite
                    ? t('prompt.removeFromFavorites')
                    : t('prompt.addToFavorites');

                  switch (column.id) {
                    case 'checkbox':
                      return (
                        <td key={column.id} className="px-4 py-3" style={colWidth}>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelect(prompt.id)}
                            ariaLabel={t('prompt.selectPromptRow', {
                              title: prompt.title,
                              defaultValue: 'Select {{title}}',
                            })}
                          />
                        </td>
                      );

                    case 'title':
                      return (
                        <td
                          key={column.id}
                          className={`relative px-4 py-3 ${promptDepth > 0 ? 'bg-primary/[0.02]' : ''}`}
                          style={colWidth}
                        >
                          {promptDepth > 0 && (
                            <>
                              <span
                                aria-hidden="true"
                                className="absolute bottom-3 top-3 w-px bg-primary/30"
                                style={{ left: `${16 + (promptDepth - 1) * 16 + 6}px` }}
                              />
                              <span
                                aria-hidden="true"
                                className="absolute h-px w-3 bg-primary/30"
                                style={{ left: `${16 + (promptDepth - 1) * 16 + 6}px`, top: '1.35rem' }}
                              />
                            </>
                          )}
                          <div
                            className="flex min-w-0 items-center gap-2"
                            style={{ paddingLeft: `${promptDepth * 16}px` }}
                          >
                            {promptChildCount > 0 ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  togglePromptCollapse(prompt.id);
                                }}
                                aria-label={t(isPromptCollapsed ? 'prompt.expandPrompt' : 'prompt.collapsePrompt', {
                                  title: prompt.title,
                                })}
                                title={t(isPromptCollapsed ? 'prompt.expandPrompt' : 'prompt.collapsePrompt', {
                                  title: prompt.title,
                                })}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                {isPromptCollapsed ? (
                                  <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              <span aria-hidden="true" className="h-5 w-5 shrink-0" />
                            )}
                            <GripVerticalIcon
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/55"
                            />
                            {promptDepth > 0 && (
                              <CornerDownRightIcon
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0 text-primary/70"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => onViewDetail(prompt)}
                              className="font-medium text-primary hover:text-primary/80 hover:underline truncate text-left block"
                              style={{ maxWidth: column.width - 56 }}
                              title={prompt.title}
                            >
                              {renderHighlightedText(prompt.title, highlightTerms, highlightClassName)}
                            </button>
                            {promptChildCount > 0 && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                                aria-label={t('prompt.childPromptCountShort', { count: promptChildCount })}
                              >
                                <GitBranchIcon aria-hidden="true" className="h-3 w-3" />
                                {t('prompt.childPromptCountShort', { count: promptChildCount })}
                              </span>
                            )}
                          </div>
                          {promptParentTitle && (
                            <div
                              className="mt-1 inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                              style={{ marginLeft: `${promptDepth * 16 + 22}px` }}
                            >
                              <CornerDownRightIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                              <span className="shrink-0">{t('prompt.parentPrompt')}</span>
                              <span className="truncate">{promptParentTitle}</span>
                            </div>
                          )}
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
                           className="sticky right-0 z-30 p-0 app-wallpaper-surface-strong shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]"
                          style={colWidth}
                        >
                          {isSelected && <div className="absolute inset-0 bg-primary/5 pointer-events-none" />}
                          <div className="relative flex items-center justify-center gap-0.5 px-2 py-3">
                            {/* Copy */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => handleCopy(prompt))}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title={copyLabel}
                              aria-label={copyLabel}
                            >
                              {copiedId === prompt.id ? (
                                <CheckIcon aria-hidden="true" className="w-4 h-4 text-green-500" />
                              ) : (
                                <CopyIcon aria-hidden="true" className="w-4 h-4" />
                              )}
                            </button>

                            {/* AI test */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => onAiTest(prompt))}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title={aiTestLabel}
                              aria-label={aiTestLabel}
                            >
                              <PlayIcon aria-hidden="true" className="w-4 h-4" />
                            </button>

                            {/* Version history */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => onVersionHistory(prompt))}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title={historyLabel}
                              aria-label={historyLabel}
                            >
                              <HistoryIcon aria-hidden="true" className="w-4 h-4" />
                            </button>

                            {/* Favorite */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => onToggleFavorite(prompt.id))}
                              className={`p-1.5 rounded-lg transition-colors ${prompt.isFavorite
                                ? 'text-yellow-500 hover:bg-yellow-500/10'
                                : 'text-muted-foreground hover:text-yellow-500 hover:bg-accent'
                                }`}
                              title={favoriteLabel}
                              aria-label={favoriteLabel}
                            >
                              <StarIcon aria-hidden="true" className={`w-4 h-4 ${prompt.isFavorite ? 'fill-current' : ''}`} />
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => onEdit(prompt))}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title={editLabel}
                              aria-label={editLabel}
                            >
                              <EditIcon aria-hidden="true" className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={(event) => handleRowActionClick(event, () => onDelete(prompt))}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title={deleteLabel}
                              aria-label={deleteLabel}
                            >
                              <TrashIcon aria-hidden="true" className="w-4 h-4" />
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
                    draggable={Boolean(onMovePrompt)}
                    onDragStart={(event) => handleDragStart(event, prompt.id)}
                    onDragEnd={resetDropState}
                    onDragOver={(event) => updateDropTarget(event, prompt.id)}
                    onDragEnter={(event) => updateDropTarget(event, prompt.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(event) => handleDrop(event, prompt.id)}
                    onContextMenu={(e) => onContextMenu(e, prompt)}
                    className={`border-b border-border/50 last:border-b-0 hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors ${
                      isSelected ? 'bg-primary/5' : ''
                    } ${
                      draggingId === prompt.id ? 'opacity-50' : ''
                    } ${
                      dropTargetId === prompt.id && dropPosition === 'inside'
                        ? 'bg-primary/10 outline outline-2 outline-primary/30 outline-offset-[-2px]'
                        : ''
                    } ${
                      dropTargetId === prompt.id && dropPosition === 'before'
                        ? 'border-t-2 border-t-primary'
                        : ''
                    } ${
                      dropTargetId === prompt.id && dropPosition === 'after'
                        ? 'border-b-2 border-b-primary'
                        : ''
                    }`}
                  >
                    {getVisibleColumns().map(renderCell)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {prompts.length === 0 && (
          <div className="flex items-center justify-center h-40 text-muted-foreground rounded-xl border border-border app-wallpaper-surface mt-2">
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
                aria-label={t('prompt.pageSize', 'Per page')}
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
	                type="button"
	                onClick={() => goToPage(currentPage - 1)}
	                disabled={currentPage === 1}
                aria-label={t('prompt.previousPage', 'Previous page')}
                className="p-1.5 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon aria-hidden="true" className="w-4 h-4" />
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
	                      type="button"
	                      onClick={() => goToPage(page)}
                      aria-label={t('prompt.pageNumber', {
                        page,
                        defaultValue: 'Page {{page}}',
                      })}
                      aria-current={currentPage === page ? 'page' : undefined}
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
	                type="button"
	                onClick={() => goToPage(currentPage + 1)}
	                disabled={currentPage === totalPages}
                aria-label={t('prompt.nextPage', 'Next page')}
                className="p-1.5 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
