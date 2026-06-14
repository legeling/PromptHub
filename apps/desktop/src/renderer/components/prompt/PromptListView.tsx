import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  GripVerticalIcon,
  ImageIcon,
  StarIcon,
} from 'lucide-react';
import type { Prompt } from '@prompthub/shared/types';

type DropPosition = 'before' | 'after' | 'inside';

interface PromptListViewProps {
  prompts: Prompt[];
  selectedId: string | null;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onContextMenu: (e: ReactMouseEvent, prompt: Prompt) => void;
  onMovePrompt: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function comparePromptTreeOrder(a: Prompt, b: Prompt): number {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

function getDropPosition(event: ReactDragEvent<HTMLElement>): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = event.clientY - rect.top;

  if (y < rect.height / 3) {
    return 'before';
  }

  if (y > (rect.height * 2) / 3) {
    return 'after';
  }

  return 'inside';
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
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const promptById = useMemo(() => {
    return new Map(prompts.map((prompt) => [prompt.id, prompt]));
  }, [prompts]);

  const getVisibleParentId = useCallback(
    (prompt: Prompt): string | null => {
      if (!prompt.parentId || prompt.parentId === prompt.id) {
        return null;
      }

      return promptById.has(prompt.parentId) ? prompt.parentId : null;
    },
    [promptById],
  );

  const childrenByParent = useMemo(() => {
    const groups = new Map<string | null, Prompt[]>();

    for (const prompt of prompts) {
      const parentId = getVisibleParentId(prompt);
      const siblings = groups.get(parentId) ?? [];
      siblings.push(prompt);
      groups.set(parentId, siblings);
    }

    for (const siblings of groups.values()) {
      siblings.sort(comparePromptTreeOrder);
    }

    return groups;
  }, [getVisibleParentId, prompts]);

  const getChildren = useCallback(
    (parentId: string | null) => childrenByParent.get(parentId) ?? [],
    [childrenByParent],
  );

  const isDescendantOf = useCallback(
    (candidateId: string, ancestorId: string): boolean => {
      let current = promptById.get(candidateId);
      const visited = new Set<string>();

      while (current) {
        const parentId = getVisibleParentId(current);
        if (!parentId) {
          return false;
        }
        if (parentId === ancestorId) {
          return true;
        }
        if (visited.has(parentId)) {
          return false;
        }

        visited.add(parentId);
        current = promptById.get(parentId);
      }

      return false;
    },
    [getVisibleParentId, promptById],
  );

  const canMoveToParent = useCallback(
    (promptId: string, parentId: string | null): boolean => {
      return (
        !parentId ||
        (parentId !== promptId && !isDescendantOf(parentId, promptId))
      );
    },
    [isDescendantOf],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedId || draggingId) return;

      const selectedPrompt = promptById.get(selectedId);
      if (!selectedPrompt) return;
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey) return;

      event.preventDefault();

      const currentParentId = getVisibleParentId(selectedPrompt);

      if (event.shiftKey) {
        if (!currentParentId) return;

        const parentPrompt = promptById.get(currentParentId);
        const grandParentId = parentPrompt
          ? getVisibleParentId(parentPrompt)
          : null;
        const parentSiblings = getChildren(grandParentId);
        const parentIndex = parentSiblings.findIndex(
          (prompt) => prompt.id === currentParentId,
        );

        onMovePrompt(
          selectedId,
          grandParentId,
          parentIndex >= 0 ? parentIndex + 1 : parentSiblings.length,
        );
        return;
      }

      const siblings = getChildren(currentParentId);
      const currentIndex = siblings.findIndex(
        (prompt) => prompt.id === selectedId,
      );
      if (currentIndex <= 0) return;

      const previousSibling = siblings[currentIndex - 1];
      setExpandedIds((current) => new Set(current).add(previousSibling.id));
      onMovePrompt(selectedId, previousSibling.id, getChildren(previousSibling.id).length);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    draggingId,
    getChildren,
    getVisibleParentId,
    onMovePrompt,
    promptById,
    selectedId,
  ]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    if (diffDays === 1) {
      return t('common.yesterday') || '昨天';
    }

    if (diffDays < 7) {
      return `${diffDays}${t('common.daysAgo') || '天前'}`;
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleExpand = useCallback((promptId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(promptId)) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback(
    (event: ReactDragEvent, promptId: string) => {
      setDraggingId(promptId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', promptId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const updateDropTarget = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetPrompt: Prompt) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      if (!draggingId || draggingId === targetPrompt.id) {
        setDropTargetId(null);
        setDropPosition(null);
        return;
      }

      const nextDropPosition = getDropPosition(event);
      const nextParentId =
        nextDropPosition === 'inside'
          ? targetPrompt.id
          : getVisibleParentId(targetPrompt);

      if (!canMoveToParent(draggingId, nextParentId)) {
        setDropTargetId(null);
        setDropPosition(null);
        return;
      }

      setDropTargetId(targetPrompt.id);
      setDropPosition(nextDropPosition);
    },
    [canMoveToParent, draggingId, getVisibleParentId],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent, targetPrompt: Prompt) => {
      event.preventDefault();

      if (!draggingId || draggingId === targetPrompt.id || !dropPosition) {
        handleDragEnd();
        return;
      }

      if (dropPosition === 'inside') {
        if (canMoveToParent(draggingId, targetPrompt.id)) {
          setExpandedIds((current) => new Set(current).add(targetPrompt.id));
          onMovePrompt(draggingId, targetPrompt.id, getChildren(targetPrompt.id).length);
        }
        handleDragEnd();
        return;
      }

      const nextParentId = getVisibleParentId(targetPrompt);
      if (!canMoveToParent(draggingId, nextParentId)) {
        handleDragEnd();
        return;
      }

      const targetSiblings = getChildren(nextParentId).filter(
        (prompt) => prompt.id !== draggingId,
      );
      const targetIndex = targetSiblings.findIndex(
        (prompt) => prompt.id === targetPrompt.id,
      );
      const nextOrder =
        targetIndex < 0
          ? targetSiblings.length
          : targetIndex + (dropPosition === 'after' ? 1 : 0);

      onMovePrompt(draggingId, nextParentId, nextOrder);
      handleDragEnd();
    },
    [
      canMoveToParent,
      draggingId,
      dropPosition,
      getChildren,
      getVisibleParentId,
      handleDragEnd,
      onMovePrompt,
    ],
  );

  const isSelected = useCallback(
    (promptId: string) => selectedId === promptId || selectedIds.includes(promptId),
    [selectedId, selectedIds],
  );

  const isDragging = useCallback(
    (promptId: string) => draggingId === promptId,
    [draggingId],
  );

  const isDropTarget = useCallback(
    (promptId: string) => dropTargetId === promptId,
    [dropTargetId],
  );

  const renderTreeNode = useCallback(
    (prompt: Prompt, depth: number, ancestors: Set<string>) => {
      const nextAncestors = new Set(ancestors).add(prompt.id);
      const children = getChildren(prompt.id).filter(
        (child) => !nextAncestors.has(child.id),
      );
      const hasKids = children.length > 0;
      const isExpanded = expandedIds.has(prompt.id);

      return (
        <div key={prompt.id}>
          <div
            draggable
            onDragStart={(event) => handleDragStart(event, prompt.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => updateDropTarget(event, prompt)}
            onDragEnter={(event) => updateDropTarget(event, prompt)}
            onDragLeave={handleDragLeave}
            onDrop={(event) => handleDrop(event, prompt)}
            onClick={() => onSelect(prompt.id)}
            onContextMenu={(event) => onContextMenu(event, prompt)}
            className={`
              flex items-center gap-3 px-3 py-2.5 border-b border-border/50 cursor-pointer
              transition-colors duration-quick relative
              ${
                isSelected(prompt.id)
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : isDropTarget(prompt.id) && dropPosition === 'inside'
                    ? 'bg-primary/20 border-l-2 border-l-primary'
                    : 'hover:bg-accent/50'
              }
              ${isDragging(prompt.id) ? 'opacity-50' : ''}
              ${
                isDropTarget(prompt.id) && dropPosition === 'inside'
                  ? 'ring-2 ring-primary/50 ring-inset'
                  : ''
              }
              ${
                isDropTarget(prompt.id) && dropPosition === 'before'
                  ? 'border-t-2 border-t-primary'
                  : ''
              }
              ${
                isDropTarget(prompt.id) && dropPosition === 'after'
                  ? 'border-b-2 border-b-primary'
                  : ''
              }
            `}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            <div className="flex items-center gap-1">
              {hasKids ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpand(prompt.id);
                  }}
                  className="p-0.5 rounded hover:bg-accent transition-colors"
                  aria-label={isExpanded ? 'Collapse prompt' : 'Expand prompt'}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <GripVerticalIcon className="w-4 h-4 text-muted-foreground cursor-grab opacity-0 hover:opacity-100 transition-opacity" />
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
                  <span className="text-xs text-muted-foreground">
                    {prompt.images.length}
                  </span>
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
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCopy(prompt);
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={t('prompt.copy')}
              >
                <CopyIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(prompt.id);
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  prompt.isFavorite
                    ? 'text-yellow-500 hover:bg-yellow-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title={
                  prompt.isFavorite
                    ? t('nav.favorites')
                    : t('prompt.addToFavorites') || '添加收藏'
                }
              >
                <StarIcon
                  className={`w-3.5 h-3.5 ${
                    prompt.isFavorite ? 'fill-current' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {hasKids && isExpanded && (
            <div>
              {children.map((child) =>
                renderTreeNode(child, depth + 1, nextAncestors),
              )}
            </div>
          )}
        </div>
      );
    },
    [
      dropPosition,
      expandedIds,
      formatDate,
      getChildren,
      handleDragEnd,
      handleDragLeave,
      handleDragStart,
      handleDrop,
      isDragging,
      isDropTarget,
      isSelected,
      onContextMenu,
      onCopy,
      onSelect,
      onToggleFavorite,
      t,
      toggleExpand,
      updateDropTarget,
    ],
  );

  const rootNodes = useMemo(() => {
    const attachedIds = new Set<string>();

    const collect = (prompt: Prompt, ancestors: Set<string>) => {
      if (ancestors.has(prompt.id)) {
        return;
      }

      attachedIds.add(prompt.id);
      const nextAncestors = new Set(ancestors).add(prompt.id);
      for (const child of getChildren(prompt.id)) {
        collect(child, nextAncestors);
      }
    };

    const roots = getChildren(null);
    for (const root of roots) {
      collect(root, new Set());
    }

    const detached = prompts
      .filter((prompt) => !attachedIds.has(prompt.id))
      .sort(comparePromptTreeOrder);

    return [...roots, ...detached];
  }, [getChildren, prompts]);

  return (
    <div className="flex flex-col overflow-y-auto">
      {rootNodes.map((node) => renderTreeNode(node, 0, new Set()))}
    </div>
  );
}
