import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, ImageIcon, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import type { Prompt } from '@prompthub/shared/types';

interface PromptListViewProps {
  prompts: Prompt[];
  selectedId: string | null;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
  onMovePrompt: (promptId: string, newParentId: string | null, newOrder: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function PromptListView({
  prompts,
  selectedId,
  selectedIds,
  onSelect,
  onToggleFavorite,
  onCopy,
  onContextMenu,
  onMovePrompt,
}: PromptListViewProps) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId || draggingId) return;

      const selectedPrompt = prompts.find(p => p.id === selectedId);
      if (!selectedPrompt) return;

      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        
        if (e.shiftKey) {
          // Shift+Tab: outdent (move to parent level)
          if (selectedPrompt.parentId) {
            const siblings = prompts.filter(p => p.parentId === selectedPrompt.parentId);
            const parentPrompt = prompts.find(p => p.id === selectedPrompt.parentId);
            const newOrder = parentPrompt ? prompts.filter(p => p.parentId === parentPrompt?.parentId).length : prompts.filter(p => p.parentId === null).length;
            onMovePrompt(selectedId, parentPrompt?.parentId || null, newOrder);
          }
        } else {
          // Tab: indent (move to previous sibling's child)
          const siblings = prompts.filter(p => p.parentId === selectedPrompt.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
          const currentIndex = siblings.findIndex(s => s.id === selectedId);
          
          if (currentIndex > 0) {
            const prevSibling = siblings[currentIndex - 1];
            const childCount = prompts.filter(p => p.parentId === prevSibling.id).length;
            onMovePrompt(selectedId, prevSibling.id, childCount);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, prompts, onMovePrompt, draggingId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return t('common.yesterday') || '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}${t('common.daysAgo') || '天前'}`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  const toggleExpand = useCallback((promptId: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(promptId)) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });
  }, []);

  const hasChildren = useCallback((promptId: string) => {
    return prompts.some(p => p.parentId === promptId);
  }, [prompts]);

  const getChildren = useCallback((parentId: string | null) => {
    return prompts
      .filter(p => p.parentId === parentId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [prompts]);

  const handleDragStart = useCallback((e: React.DragEvent, promptId: string) => {
    setDraggingId(promptId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', promptId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, promptId: string) => {
    e.preventDefault();
    if (draggingId !== promptId) {
      setDropTargetId(promptId);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      
      if (y < height / 3) {
        setDropPosition('before');
      } else if (y > height * 2 / 3) {
        setDropPosition('after');
      } else {
        setDropPosition('inside');
      }
    }
  }, [draggingId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetPromptId: string) => {
    e.preventDefault();
    if (draggingId && draggingId !== targetPromptId) {
      const targetPrompt = prompts.find(p => p.id === targetPromptId);
      const draggingPrompt = prompts.find(p => p.id === draggingId);
      
      if (targetPrompt && draggingPrompt) {
        if (dropPosition === 'inside') {
          const childCount = prompts.filter(p => p.parentId === targetPromptId).length;
          onMovePrompt(draggingId, targetPromptId, childCount);
        } else {
          const newParentId = targetPrompt.parentId;
          let targetOrder = targetPrompt.order || 0;
          
          if (dropPosition === 'after') {
            targetOrder += 1;
          }
          
          if (draggingPrompt.parentId === newParentId && draggingPrompt.order && draggingPrompt.order < targetOrder) {
            targetOrder -= 1;
          }
          
          onMovePrompt(draggingId, newParentId, targetOrder);
        }
      }
    }
    setDraggingId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [draggingId, dropPosition, prompts, onMovePrompt]);

  const isSelected = useCallback((promptId: string) => {
    return selectedId === promptId || selectedIds.includes(promptId);
  }, [selectedId, selectedIds]);

  const isDragging = useCallback((promptId: string) => {
    return draggingId === promptId;
  }, [draggingId]);

  const isDropTarget = useCallback((promptId: string) => {
    return dropTargetId === promptId;
  }, [dropTargetId]);

  const renderTreeNode = useCallback((prompt: Prompt, depth: number) => {
    const hasKids = hasChildren(prompt.id);
    const isExpanded = expandedIds.has(prompt.id);

    return (
      <div key={prompt.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, prompt.id)}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragEnter={(e) => handleDragEnter(e, prompt.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, prompt.id)}
          onClick={() => onSelect(prompt.id)}
          onContextMenu={(e) => onContextMenu(e, prompt)}
          className={`
            flex items-center gap-3 px-3 py-2.5 border-b border-border/50 cursor-pointer
            transition-colors duration-quick relative
            ${isSelected(prompt.id)
              ? 'bg-primary/10 border-l-2 border-l-primary'
              : isDropTarget(prompt.id) && dropPosition === 'inside'
                ? 'bg-primary/20 border-l-2 border-l-primary'
                : 'hover:bg-accent/50'
            }
            ${isDragging(prompt.id) ? 'opacity-50' : ''}
            ${isDropTarget(prompt.id) && dropPosition === 'inside' ? 'ring-2 ring-primary/50 ring-inset' : ''}
            ${isDropTarget(prompt.id) && dropPosition === 'before' ? 'border-t-2 border-t-primary' : ''}
            ${isDropTarget(prompt.id) && dropPosition === 'after' ? 'border-b-2 border-b-primary' : ''}
          `}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <div className="flex items-center gap-1">
            {hasKids && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(prompt.id);
                }}
                className="p-0.5 rounded hover:bg-accent transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            )}
            {!hasKids && <span className="w-5" />}
            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-0 hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className={`font-medium text-sm leading-snug break-words line-clamp-2 ${
                  isSelected(prompt.id) ? 'text-primary' : 'text-foreground'
                }`}
                title={prompt.title}
              >
                {prompt.title}
              </h3>
              {prompt.isFavorite && (
                <StarIcon className="w-3 h-3 flex-shrink-0 fill-yellow-400 text-yellow-400" />
              )}
            </div>
            {prompt.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">
                {prompt.description}
              </p>
            )}
            {prompt.images && prompt.images.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <ImageIcon className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{prompt.images.length}</span>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 w-12 text-center">
            <span className="text-xs text-muted-foreground">
              {prompt.usageCount || 0}
            </span>
          </div>

          <div className="flex-shrink-0 w-16 text-right">
            <span className="text-xs text-muted-foreground">
              {formatDate(prompt.updatedAt)}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(prompt);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={t('prompt.copy')}
            >
              <CopyIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(prompt.id);
              }}
              className={`p-1.5 rounded-md transition-colors ${prompt.isFavorite
                ? 'text-yellow-500 hover:bg-yellow-500/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              title={prompt.isFavorite ? t('nav.favorites') : t('prompt.addToFavorites') || '添加收藏'}
            >
              <StarIcon className={`w-3.5 h-3.5 ${prompt.isFavorite ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {hasKids && isExpanded && (
          <div>
            {getChildren(prompt.id).map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [hasChildren, expandedIds, toggleExpand, getChildren, isSelected, isDragging, isDropTarget, dropPosition, onSelect, onContextMenu, handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop, onCopy, onToggleFavorite, t]);

  const rootNodes = getChildren(null);

  return (
    <div className="flex flex-col">
      {rootNodes.map((node) => renderTreeNode(node, 0))}
    </div>
  );
}