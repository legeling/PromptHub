import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  CopyIcon,
  GitBranchIcon,
  GripVerticalIcon,
  ImageIcon,
  LinkIcon,
  StarIcon,
  XIcon,
} from 'lucide-react';
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptGraphRelationKind,
  PromptRelation,
  PromptRelationKind,
} from '@prompthub/shared/types';

type DropPosition = 'before' | 'after' | 'inside';
type PendingRelationDrop = {
  sourcePromptId: string;
  targetPromptId: string;
  x: number;
  y: number;
};

interface RelationBadge {
  kind: PromptGraphRelationKind;
  count: number;
}

const RELATION_DROP_OPTIONS: PromptRelationKind[] = [
  'grouped_under',
  'related_to',
  'variant_of',
  'depends_on',
  'next_step',
];

interface PromptListViewProps {
  prompts: Prompt[];
  relations?: PromptRelation[];
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
  onCreateRelation?: (data: CreatePromptRelationDTO) => Promise<unknown> | unknown;
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

function getRelationMenuPosition(
  event: ReactDragEvent,
): Pick<PendingRelationDrop, 'x' | 'y'> {
  const menuWidth = 184;
  const menuHeight = 232;
  const viewportWidth = window.innerWidth || menuWidth + 16;
  const viewportHeight = window.innerHeight || menuHeight + 16;
  const clientX = Number.isFinite(event.clientX) ? event.clientX : 8;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : 8;

  return {
    x: Math.min(
      Math.max(8, clientX),
      Math.max(8, viewportWidth - menuWidth - 8),
    ),
    y: Math.min(
      Math.max(8, clientY),
      Math.max(8, viewportHeight - menuHeight - 8),
    ),
  };
}

function renderRelationOptionIcon(kind: PromptRelationKind) {
  const className = 'w-3.5 h-3.5';

  switch (kind) {
    case 'grouped_under':
      return <GitBranchIcon className={className} />;
    case 'related_to':
      return <LinkIcon className={className} />;
    case 'variant_of':
      return <GitBranchIcon className={className} />;
    case 'depends_on':
      return <CornerDownRightIcon className={className} />;
    case 'next_step':
      return <ArrowRightIcon className={className} />;
  }
}

export function PromptListView({
  prompts,
  relations = [],
  selectedId,
  selectedIds,
  onSelect,
  onToggleFavorite,
  onCopy,
  onContextMenu,
  onMovePrompt,
  onCreateRelation,
}: PromptListViewProps) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const [pendingRelationDrop, setPendingRelationDrop] =
    useState<PendingRelationDrop | null>(null);
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

  const relationBadgesByPrompt = useMemo(() => {
    const badgeMap = new Map<string, Map<PromptGraphRelationKind, number>>();

    const addBadge = (promptId: string, kind: PromptGraphRelationKind) => {
      if (!promptById.has(promptId)) {
        return;
      }

      const current = badgeMap.get(promptId) ?? new Map();
      current.set(kind, (current.get(kind) ?? 0) + 1);
      badgeMap.set(promptId, current);
    };

    for (const relation of relations) {
      addBadge(relation.sourcePromptId, relation.kind);
      addBadge(relation.targetPromptId, relation.kind);
    }

    return new Map(
      [...badgeMap.entries()].map(([promptId, counts]) => [
        promptId,
        [...counts.entries()]
          .sort(
            ([left], [right]) =>
              RELATION_DROP_OPTIONS.indexOf(left) -
              RELATION_DROP_OPTIONS.indexOf(right),
          )
          .map<RelationBadge>(([kind, count]) => ({
            kind,
            count,
          })),
      ]),
    );
  }, [promptById, relations]);

  const getRelationLabel = useCallback(
    (kind: PromptRelationKind) => t(`prompt.relationships.${kind}`),
    [t],
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
      setPendingRelationDrop(null);
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
      if (
        nextDropPosition !== 'inside' &&
        !canMoveToParent(draggingId, getVisibleParentId(targetPrompt))
      ) {
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
        setPendingRelationDrop({
          sourcePromptId: draggingId,
          targetPromptId: targetPrompt.id,
          ...getRelationMenuPosition(event),
        });
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

  const commitRelationDrop = useCallback(
    async (kind: PromptRelationKind) => {
      if (!pendingRelationDrop) {
        return;
      }

      const { sourcePromptId, targetPromptId } = pendingRelationDrop;

      if (kind === 'grouped_under') {
        if (canMoveToParent(sourcePromptId, targetPromptId)) {
          setExpandedIds((current) => new Set(current).add(targetPromptId));
          onMovePrompt(
            sourcePromptId,
            targetPromptId,
            getChildren(targetPromptId).length,
          );
        }
        setPendingRelationDrop(null);
        return;
      }

      setPendingRelationDrop(null);
      await onCreateRelation?.({
        sourcePromptId,
        targetPromptId,
        kind,
      });
    },
    [
      canMoveToParent,
      getChildren,
      onCreateRelation,
      onMovePrompt,
      pendingRelationDrop,
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
      const relationBadges = relationBadgesByPrompt.get(prompt.id) ?? [];

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
              {relationBadges.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                  {relationBadges.map((badge) => (
                    <span
                      key={badge.kind}
                      className="inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                      title={getRelationLabel(badge.kind)}
                    >
                      {getRelationLabel(badge.kind)}
                      {badge.count > 1 && <span>{badge.count}</span>}
                    </span>
                  ))}
                </div>
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
      getRelationLabel,
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
      relationBadgesByPrompt,
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
      {pendingRelationDrop && (
        <div
          className="fixed z-50 w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{
            left: pendingRelationDrop.x,
            top: pendingRelationDrop.y,
          }}
          role="menu"
          aria-label={t('prompt.relationships.menuLabel')}
          onClick={(event) => event.stopPropagation()}
        >
          {RELATION_DROP_OPTIONS.map((kind) => {
            const disabled =
              (kind === 'grouped_under' &&
                !canMoveToParent(
                  pendingRelationDrop.sourcePromptId,
                  pendingRelationDrop.targetPromptId,
                )) ||
              (kind !== 'grouped_under' && !onCreateRelation);

            return (
              <button
                key={kind}
                type="button"
                disabled={disabled}
                onClick={() => void commitRelationDrop(kind)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                role="menuitem"
              >
                {renderRelationOptionIcon(kind)}
                <span>{getRelationLabel(kind)}</span>
              </button>
            );
          })}
          <div className="mt-1 border-t border-border/70 pt-1">
            <button
              type="button"
              onClick={() => setPendingRelationDrop(null)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t('prompt.relationships.cancel')}
              aria-label={t('prompt.relationships.cancel')}
            >
              <XIcon className="w-3.5 h-3.5" />
              <span>{t('prompt.relationships.cancel')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
