import { useState, useCallback, useEffect, useMemo, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { PromptSummary } from '@prompthub/shared/types';
import {
  XIcon,
  MaximizeIcon,
  MinimizeIcon,
  PinIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { Reveal } from '../ui/motion';
import { KanbanCard } from './PromptKanbanCard';

interface PromptKanbanViewProps {
  prompts: PromptSummary[];
  highlightTerms?: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: PromptSummary) => void;
  onEdit: (prompt: PromptSummary) => void;
  onDelete: (prompt: PromptSummary) => void;
  onAiTest: (prompt: PromptSummary) => void;
  onVersionHistory: (prompt: PromptSummary) => void;
  onViewDetail: (prompt: PromptSummary) => void;
  onContextMenu: (e: React.MouseEvent, prompt: PromptSummary) => void;
}

interface PinnedCard {
  promptId: string;
  isExpanded: boolean;
}

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
        .filter(Boolean) as PromptSummary[],
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
  const pinnedSectionLabel = t('prompt.pinnedPrompts', '固定的 PromptSummary');
  const expandAllLabel = t('prompt.expandAll', '全部展开');
  const collapseAllLabel = t('prompt.collapseAll', '全部收起');
  const unpinAllLabel = t('prompt.unpinAll', '全部取消固定');

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <SparklesIcon className="w-16 h-16 mb-4 opacity-20" />
        <p>{t('prompt.noPrompts', '暂无 PromptSummary')}</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
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

// The minimum card width leaves room for the compact metadata/action footer.
// Column preferences apply whenever that width fits inside the current pane.
const KANBAN_MIN_COLUMN_WIDTH = 240;

const UNPINNED_CARD_HEIGHT = 280;
const KANBAN_GAP_PX = 16; // gap-4
const KANBAN_PADDING_PX = 16; // p-4
const KANBAN_BOTTOM_GUTTER = 80; // pb-20
const KANBAN_CARD_HEIGHT_PROPERTY = "--prompt-kanban-card-height";

function getKanbanColumns(preference: 2 | 3 | 4, width: number): number {
  if (width <= 0) return 1;
  const raw = Math.floor((width + KANBAN_GAP_PX) / (KANBAN_MIN_COLUMN_WIDTH + KANBAN_GAP_PX));
  return Math.max(1, Math.min(preference, raw));
}

interface UnpinnedKanbanGridProps {
  prompts: PromptSummary[];
  kanbanColumnPreference: 2 | 3 | 4;
  folderNameMap: Map<string, string>;
  uncategorizedLabel: string;
  onPin: (promptId: string) => void;
  onCopy: (prompt: PromptSummary) => void;
  onEdit: (prompt: PromptSummary) => void;
  onAiTest: (prompt: PromptSummary) => void;
  onToggleFavorite: (promptId: string) => void;
  onViewDetail: (prompt: PromptSummary) => void;
  onContextMenu: (e: React.MouseEvent, prompt: PromptSummary) => void;
}

/**
 * Virtualized grid for the kanban unpinned section. Cards have a fixed height
 * (280 px) plus a measured row gap. The card inherits its height from the
 * row's CSS variable so measurement and styling share the same source.
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
  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${KANBAN_GAP_PX}px`,
    [KANBAN_CARD_HEIGHT_PROPERTY]: `${UNPINNED_CARD_HEIGHT}px`,
  };

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      <div
        style={{
          position: 'relative',
          height: `${totalHeight + KANBAN_PADDING_PX + KANBAN_BOTTOM_GUTTER}px`,
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
                paddingBottom: KANBAN_GAP_PX,
                boxSizing: "border-box",
              }}
            >
              <div
                className="grid"
                style={gridStyle}
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
