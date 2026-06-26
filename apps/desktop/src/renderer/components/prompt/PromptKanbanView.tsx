import { useState, useCallback, memo, useEffect, useMemo, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '@prompthub/shared/types';
import {
  XIcon,
  StarIcon,
  CopyIcon,
  EditIcon,
  PlayIcon,
  MaximizeIcon,
  MinimizeIcon,
  PinIcon,
  FolderIcon,
  SparklesIcon,
  BracesIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { Reveal } from '../ui/motion';
import { parsePromptVariables } from './prompt-modal-utils';

interface PromptKanbanViewProps {
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
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
}

interface PinnedCard {
  promptId: string;
  isExpanded: boolean;
}

// Kanban Card Component
const KanbanCard = memo(({
  prompt,
  isPinned,
  isExpanded,
  onPin,
  onUnpin,
  onExpand,
  onCollapse,
  onCopy,
  onEdit,
  onAiTest,
  onToggleFavorite,
  onViewDetail,
  folderName,
}: {
  prompt: Prompt;
  isPinned: boolean;
  isExpanded: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onAiTest: () => void;
  onToggleFavorite: () => void;
  onViewDetail: () => void;
  folderName: string;
}) => {
  const { t } = useTranslation();
  const expandLabel = isExpanded ? t('common.collapse', '收起') : t('common.expand', '展开');
  const pinLabel = t('prompt.pin', '固定');
  const unpinLabel = t('prompt.unpin', '取消固定');
  const favoriteLabel = prompt.isFavorite
    ? t('prompt.removeFromFavorites', 'Remove from Favorites')
    : t('prompt.addToFavorites', 'Add to Favorites');
  const copyLabel = t('prompt.copy', '复制');
  const editLabel = t('prompt.edit', '编辑');
  const aiTestLabel = t('prompt.aiTest', 'AI 测试');
  const viewDetailLabel = t('prompt.viewDetail', '查看详情');

  const allVariables = [
    ...parsePromptVariables(prompt.systemPrompt || ''),
    ...parsePromptVariables(prompt.userPrompt),
  ].map((variable) => variable.name)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  // Fixed heights for alignment:
  // - Pinned expanded: 500px
  // - Pinned normal: 320px (fixed, not max-h, for alignment)
  // - Unpinned: 280px
  const cardHeightClass = isExpanded
    ? 'h-[500px]'
    : isPinned
      ? 'h-[320px]'
      : 'h-[280px]';

  return (
    <div
      className={`
        group relative flex flex-col app-wallpaper-panel rounded-xl border transition-all duration-smooth
        ${isPinned
          ? 'border-primary/50 shadow-lg shadow-primary/10 ring-2 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:shadow-md'
        }
        ${cardHeightClass} overflow-hidden
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 app-wallpaper-surface flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Title */}
          <h3 className="min-w-0 text-sm font-semibold">
            <button
              type="button"
              className="min-w-0 max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
              onClick={onViewDetail}
              title={prompt.title}
              aria-label={`${viewDetailLabel}: ${prompt.title}`}
            >
              {prompt.title}
            </button>
          </h3>

          {/* Favorite star */}
          {prompt.isFavorite && (
            <StarIcon className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPinned ? (
            <>
              <button
                type="button"
                onClick={isExpanded ? onCollapse : onExpand}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={expandLabel}
                aria-label={expandLabel}
                aria-expanded={isExpanded}
              >
                {isExpanded ? <MinimizeIcon aria-hidden="true" className="w-3.5 h-3.5" /> : <MaximizeIcon aria-hidden="true" className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={onUnpin}
                className="p-1 rounded-md text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors"
                title={unpinLabel}
                aria-label={unpinLabel}
              >
                <XIcon aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onPin}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
              title={pinLabel}
              aria-label={pinLabel}
            >
              <PinIcon aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content - flex-1 to fill remaining space */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Description */}
        {prompt.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {prompt.description}
          </p>
        )}

        {/* Variables */}
        {allVariables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <BracesIcon className="w-3 h-3 text-muted-foreground mt-0.5" />
            {allVariables.slice(0, isPinned ? 10 : 5).map(v => (
              <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-mono">
                {`{{${v}}}`}
              </span>
            ))}
            {allVariables.length > (isPinned ? 10 : 5) && (
              <span className="text-[10px] text-muted-foreground">+{allVariables.length - (isPinned ? 10 : 5)}</span>
            )}
          </div>
        )}

        {/* System Prompt Preview */}
        {prompt.systemPrompt && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <SparklesIcon className="w-3 h-3" />
              System Prompt
            </div>
            <div className={`text-xs text-foreground/80 app-wallpaper-surface rounded-lg p-2 border border-border/70 ${isExpanded ? '' : 'line-clamp-4'}`}>
              {prompt.systemPrompt}
            </div>
          </div>
        )}

        {/* User Prompt Preview */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            User Prompt
          </div>
          <div className={`text-xs text-foreground/80 app-wallpaper-surface rounded-lg p-2 border border-border/70 ${isExpanded ? '' : isPinned ? 'line-clamp-6' : 'line-clamp-3'}`}>
            {prompt.userPrompt}
          </div>
        </div>

        {/* Tags */}
        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prompt.tags.slice(0, 5).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                #{tag}
              </span>
            ))}
            {prompt.tags.length > 5 && (
              <span className="text-[10px] text-muted-foreground">+{prompt.tags.length - 5}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer - fixed at bottom */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50 bg-muted/20 flex-shrink-0">
        {/* Meta info */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <FolderIcon className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{folderName}</span>
          </div>
          <span>•</span>
          <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 rounded-md transition-colors ${
              prompt.isFavorite
                ? 'text-yellow-400 hover:bg-yellow-400/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={favoriteLabel}
            aria-label={favoriteLabel}
            aria-pressed={prompt.isFavorite}
          >
            <StarIcon aria-hidden="true" className={`w-3.5 h-3.5 ${prompt.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={copyLabel}
            aria-label={copyLabel}
          >
            <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={editLabel}
            aria-label={editLabel}
          >
            <EditIcon aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAiTest(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title={aiTestLabel}
            aria-label={aiTestLabel}
          >
            <PlayIcon aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

export function PromptKanbanView({
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
  onContextMenu,
}: PromptKanbanViewProps) {
  const { t } = useTranslation();
  const pinnedSectionId = useId();
  const folders = useFolderStore(state => state.folders);
  const kanbanColumns = usePromptStore(state => state.kanbanColumns);
  const uncategorizedLabel = t('folder.uncategorized', '未分类');

  // State for pinned cards
  const [pinnedCards, setPinnedCards] = useState<PinnedCard[]>([]);
  // State for collapsing the entire pinned section
  const [isPinnedSectionCollapsed, setIsPinnedSectionCollapsed] = useState(false);

  const folderNameMap = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const promptMap = useMemo(
    () => new Map(prompts.map((prompt) => [prompt.id, prompt])),
    [prompts],
  );
  const pinnedCardStateMap = useMemo(
    () => new Map(pinnedCards.map((card) => [card.promptId, card])),
    [pinnedCards],
  );
  const pinnedPromptIdSet = useMemo(
    () => new Set(pinnedCards.map((card) => card.promptId)),
    [pinnedCards],
  );

  const handlePin = useCallback((promptId: string) => {
    setPinnedCards(prev => {
      // Max 4 pinned cards
      if (prev.length >= 4) {
        return [...prev.slice(1), { promptId, isExpanded: false }];
      }
      return [...prev, { promptId, isExpanded: false }];
    });
  }, []);

  const handleUnpin = useCallback((promptId: string) => {
    setPinnedCards(prev => prev.filter(p => p.promptId !== promptId));
  }, []);

  const handleExpand = useCallback((promptId: string) => {
    setPinnedCards(prev => prev.map(p =>
      p.promptId === promptId ? { ...p, isExpanded: true } : p
    ));
  }, []);

  const handleCollapse = useCallback((promptId: string) => {
    setPinnedCards(prev => prev.map(p =>
      p.promptId === promptId ? { ...p, isExpanded: false } : p
    ));
  }, []);

  // Quick actions for pinned cards
  const handleExpandAll = useCallback(() => {
    setPinnedCards(prev => prev.map(p => ({ ...p, isExpanded: true })));
  }, []);

  const handleCollapseAll = useCallback(() => {
    setPinnedCards(prev => prev.map(p => ({ ...p, isExpanded: false })));
  }, []);

  const handleUnpinAll = useCallback(() => {
    setPinnedCards([]);
  }, []);

  const pinnedPrompts = useMemo(
    () =>
      pinnedCards
        .map((card) => promptMap.get(card.promptId))
        .filter(Boolean) as Prompt[],
    [pinnedCards, promptMap],
  );

  const unpinnedPrompts = useMemo(
    () => prompts.filter((prompt) => !pinnedPromptIdSet.has(prompt.id)),
    [prompts, pinnedPromptIdSet],
  );

  // Check if any card is expanded
  const hasExpandedCards = useMemo(
    () => pinnedCards.some((card) => card.isExpanded),
    [pinnedCards],
  );
  const pinnedSectionLabel = t('prompt.pinnedPrompts', '固定的 Prompt');
  const expandAllLabel = t('prompt.expandAll', '全部展开');
  const collapseAllLabel = t('prompt.collapseAll', '全部收起');
  const unpinAllLabel = t('prompt.unpinAll', '全部取消固定');

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <SparklesIcon className="w-16 h-16 mb-4 opacity-20" />
        <p>{t('prompt.noPrompts', '暂无 Prompt')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Pinned Cards Section */}
      {pinnedPrompts.length > 0 && (
        <div className="flex-shrink-0 border-b border-border bg-muted/20">
          {/* Header - always visible */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              type="button"
              onClick={() => setIsPinnedSectionCollapsed(!isPinnedSectionCollapsed)}
              className="flex items-center gap-2 hover:text-primary transition-colors"
              aria-expanded={!isPinnedSectionCollapsed}
              aria-controls={pinnedSectionId}
            >
              {isPinnedSectionCollapsed ? (
                <ChevronRightIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              )}
              <PinIcon aria-hidden="true" className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {pinnedSectionLabel} ({pinnedPrompts.length})
              </span>
            </button>
            {/* Quick actions */}
            <div className="flex items-center gap-1">
              {!isPinnedSectionCollapsed && (
                <button
                  type="button"
                  onClick={hasExpandedCards ? handleCollapseAll : handleExpandAll}
                  className="px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={hasExpandedCards ? collapseAllLabel : expandAllLabel}
                  aria-label={hasExpandedCards ? collapseAllLabel : expandAllLabel}
                >
                  {hasExpandedCards ? (
                    <><MinimizeIcon aria-hidden="true" className="w-3 h-3 inline mr-1" />{collapseAllLabel}</>
                  ) : (
                    <><MaximizeIcon aria-hidden="true" className="w-3 h-3 inline mr-1" />{expandAllLabel}</>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleUnpinAll}
                className="px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={unpinAllLabel}
                aria-label={unpinAllLabel}
              >
                <XIcon aria-hidden="true" className="w-3 h-3 inline mr-1" />{unpinAllLabel}
              </button>
            </div>
          </div>
          {/* Pinned cards - collapsible */}
          {!isPinnedSectionCollapsed && (
            <div id={pinnedSectionId} className="px-4 pb-4">
              <div className={`grid gap-4 ${
                pinnedPrompts.length === 1 ? 'grid-cols-1' :
                pinnedPrompts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                pinnedPrompts.length === 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' :
                'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              }`}>
                {pinnedPrompts.map(prompt => {
                  const cardState = pinnedCardStateMap.get(prompt.id);
                  return (
                    <Reveal
                      key={prompt.id}
                      intent="enter"
                      variant="fade-zoom"
                      onContextMenu={(e) => onContextMenu(e, prompt)}
                    >
                      <KanbanCard
                        prompt={prompt}
                        isPinned={true}
                        isExpanded={cardState?.isExpanded || false}
                        onPin={() => {}}
                        onUnpin={() => handleUnpin(prompt.id)}
                        onExpand={() => handleExpand(prompt.id)}
                        onCollapse={() => handleCollapse(prompt.id)}
                        onCopy={() => onCopy(prompt)}
                        onEdit={() => onEdit(prompt)}
                        onAiTest={() => onAiTest(prompt)}
                        onToggleFavorite={() => onToggleFavorite(prompt.id)}
                        onViewDetail={() => onViewDetail(prompt)}
                        folderName={prompt.folderId ? (folderNameMap.get(prompt.folderId) || uncategorizedLabel) : uncategorizedLabel}
                      />
                    </Reveal>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unpinned Cards Grid */}
      <UnpinnedKanbanGrid
        prompts={unpinnedPrompts}
        kanbanColumnPreference={kanbanColumns || 3}
        folderNameMap={folderNameMap}
        uncategorizedLabel={uncategorizedLabel}
        onPin={handlePin}
        onCopy={onCopy}
        onEdit={onEdit}
        onAiTest={onAiTest}
        onToggleFavorite={onToggleFavorite}
        onViewDetail={onViewDetail}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

// Kanban target column widths chosen to roughly match the previous
// Tailwind viewport-based grid, but driven by container width so the
// resizable pane stays visually consistent.
// 看板目标列宽：用容器宽度而非 viewport 决定列数，避免父级面板尺寸变化
// 时列数与原 Tailwind 响应式 grid 不一致。
const KANBAN_TARGET_COLUMN_WIDTH = 280;

const UNPINNED_CARD_HEIGHT = 280; // h-[280px] from KanbanCard
const KANBAN_GAP_PX = 16; // gap-4
const KANBAN_PADDING_PX = 16; // p-4
const KANBAN_BOTTOM_GUTTER = 80; // pb-20

function getKanbanColumns(preference: 2 | 3 | 4, width: number): number {
  if (width <= 0) return 1;
  const raw = Math.floor((width + KANBAN_GAP_PX) / (KANBAN_TARGET_COLUMN_WIDTH + KANBAN_GAP_PX));
  return Math.max(1, Math.min(preference, raw));
}

interface UnpinnedKanbanGridProps {
  prompts: Prompt[];
  kanbanColumnPreference: 2 | 3 | 4;
  folderNameMap: Map<string, string>;
  uncategorizedLabel: string;
  onPin: (promptId: string) => void;
  onCopy: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onAiTest: (prompt: Prompt) => void;
  onToggleFavorite: (promptId: string) => void;
  onViewDetail: (prompt: Prompt) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
}

/**
 * Virtualized grid for the kanban unpinned section. Cards have a fixed height
 * (280 px) so estimateSize is exact; we still call measureElement to handle
 * future variant heights without revisiting the math.
 *
 * Earlier revisions used framer-motion `motion.div` with layout animations
 * here, which churned on every virtualization mount/unmount during scroll.
 * Both pinned and unpinned grids now rely on `tailwindcss-animate` plus the
 * shared `<Reveal>` primitive (pinned only), keeping motion lightweight and
 * predictable across virtualized scrolling.
 */
function UnpinnedKanbanGrid({
  prompts,
  kanbanColumnPreference,
  folderNameMap,
  uncategorizedLabel,
  onPin,
  onCopy,
  onEdit,
  onAiTest,
  onToggleFavorite,
  onViewDetail,
  onContextMenu,
}: UnpinnedKanbanGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const containerWidthRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const nextWidth = Math.max(0, node.clientWidth - KANBAN_PADDING_PX * 2);
      if (containerWidthRef.current !== nextWidth) {
        containerWidthRef.current = nextWidth;
        setContainerWidth(nextWidth);
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const columns = useMemo(
    () => Math.max(1, getKanbanColumns(kanbanColumnPreference, containerWidth || 1)),
    [kanbanColumnPreference, containerWidth],
  );
  const rowCount = useMemo(
    () => Math.ceil(prompts.length / columns),
    [prompts.length, columns],
  );
  const promptOrderKey = useMemo(
    () => prompts.map((prompt) => prompt.id).join('\u001f'),
    [prompts],
  );

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => UNPINNED_CARD_HEIGHT + KANBAN_GAP_PX,
    overscan: 4,
    getItemKey: (rowIndex) => {
      const firstPromptId = prompts[rowIndex * columns]?.id;
      return firstPromptId ? `${firstPromptId}__${columns}` : `row-${rowIndex}-${columns}`;
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [promptOrderKey]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        style={{
          position: 'relative',
          height: `${totalHeight + KANBAN_BOTTOM_GUTTER}px`,
          paddingLeft: `${KANBAN_PADDING_PX}px`,
          paddingRight: `${KANBAN_PADDING_PX}px`,
          paddingTop: `${KANBAN_PADDING_PX}px`,
          paddingBottom: `${KANBAN_BOTTOM_GUTTER}px`,
        }}
      >
        {virtualRows.map((virtualRow) => {
          const rowStart = virtualRow.index * columns;
          const rowItems = prompts.slice(rowStart, rowStart + columns);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: KANBAN_PADDING_PX,
                right: KANBAN_PADDING_PX,
                transform: `translateY(${virtualRow.start + KANBAN_PADDING_PX}px)`,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${KANBAN_GAP_PX}px`,
                }}
              >
                {rowItems.map((prompt) => (
                  <div
                    key={prompt.id}
                    onContextMenu={(e) => onContextMenu(e, prompt)}
                  >
                    <KanbanCard
                      prompt={prompt}
                      isPinned={false}
                      isExpanded={false}
                      onPin={() => onPin(prompt.id)}
                      onUnpin={() => {}}
                      onExpand={() => {}}
                      onCollapse={() => {}}
                      onCopy={() => onCopy(prompt)}
                      onEdit={() => onEdit(prompt)}
                      onAiTest={() => onAiTest(prompt)}
                      onToggleFavorite={() => onToggleFavorite(prompt.id)}
                      onViewDetail={() => onViewDetail(prompt)}
                      folderName={
                        prompt.folderId
                          ? folderNameMap.get(prompt.folderId) || uncategorizedLabel
                          : uncategorizedLabel
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
