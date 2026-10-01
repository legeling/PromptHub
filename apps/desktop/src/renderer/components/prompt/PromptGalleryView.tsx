import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '@prompthub/shared/types';
import { ImageIcon } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { GalleryCard } from './PromptGalleryCard';
import { PromptBatchActionBar } from './PromptBatchActionBar';
import { PromptListEmptyState } from './PromptListEmptyState';
import { usePromptBatchSelection } from './usePromptBatchSelection';

interface PromptGalleryViewProps {
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
    /** Batch actions (v0.6.2): when present, cards show selection checkboxes. */
    onBatchTags?: (ids: string[]) => void;
    onBatchFavorite?: (ids: string[], favorite: boolean) => void;
    onBatchMove?: (ids: string[], folderId: string | undefined) => void;
    onBatchDelete?: (ids: string[]) => void;
}

type GallerySize = 'small' | 'medium' | 'large';

const GAP_PX = 16; // gap-4
const PADDING_X = 16; // p-4 horizontal padding
const PADDING_TOP = 20;
const PADDING_BOTTOM = 96;
const ROW_GAP_PX = 16;

// Target column widths chosen so the visible column count matches what the
// previous Tailwind responsive grid produced for typical viewport sizes:
// - small  ~150px columns (was grid-cols-3 .. 2xl:grid-cols-8)
// - medium ~240px columns (was grid-cols-2 .. 2xl:grid-cols-6)
// - large  ~340px columns (was grid-cols-1 .. xl:grid-cols-4)
// We size by container width because the gallery can live inside a resizable
// pane (ColumnResizer); the original Tailwind grid sized by viewport, which
// gave wrong column counts when the pane was narrowed.
// 目标列宽：使容器在常见尺寸下显示的列数与原本 Tailwind 响应式 grid 一致。
// 用容器宽度计算（而非 viewport），因为画廊所在面板可以被 ColumnResizer
// 拖动，原 Tailwind 视口断点在面板变窄时会算错列数。
const TARGET_COLUMN_WIDTH: Record<GallerySize, number> = {
    small: 150,
    medium: 240,
    large: 340,
};

const COLUMN_LIMITS: Record<GallerySize, { min: number; max: number }> = {
    small: { min: 3, max: 8 },
    medium: { min: 2, max: 6 },
    large: { min: 1, max: 4 },
};

function getColumnsForSize(size: GallerySize, width: number): number {
    if (width <= 0) return COLUMN_LIMITS[size].min;
    const target = TARGET_COLUMN_WIDTH[size];
    const raw = Math.floor((width + GAP_PX) / (target + GAP_PX));
    return Math.max(COLUMN_LIMITS[size].min, Math.min(COLUMN_LIMITS[size].max, raw));
}

// Estimated row height while measureElement hasn't run yet. The card uses
// `aspect-[4/3]` plus ~70px of footer content, so we approximate that.
// virtualizer 第一次渲染前用来估高的值。卡片是 aspect-[4/3] 加约 70px 的底部
// 内容，所以这里粗略估算一下。
function estimateRowHeight(columnWidth: number): number {
    const mediaHeight = (columnWidth / 4) * 3;
    return Math.round(mediaHeight + 120);
}

export function PromptGalleryView({
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
    onBatchTags,
    onBatchFavorite,
    onBatchMove,
    onBatchDelete,
}: PromptGalleryViewProps) {
    const { t } = useTranslation();
    const folders = useFolderStore(state => state.folders);
    const galleryImageSize = (usePromptStore(state => state.galleryImageSize) ?? 'medium') as GallerySize;
    const uncategorizedLabel = t('folder.uncategorized');
    const videoLabel = t('prompt.videoLabel', 'Video');
    const canBatch = Boolean(onBatchTags || onBatchFavorite || onBatchMove || onBatchDelete);
    const folderNameMap = useMemo(
        () => new Map(folders.map((folder) => [folder.id, folder.name])),
        [folders],
    );
    const scopeIds = useMemo(() => prompts.map((prompt) => prompt.id), [prompts]);
    const allIdSet = useMemo(() => new Set(scopeIds), [scopeIds]);
    const selection = usePromptBatchSelection({
        allIdSet,
        scopeIds: canBatch ? scopeIds : [],
    });
    const titleClassName = useMemo(() => {
        if (galleryImageSize === 'large') {
            return 'font-semibold text-sm leading-snug break-words line-clamp-2';
        }

        return 'font-semibold text-sm leading-snug break-words whitespace-pre-wrap';
    }, [galleryImageSize]);

    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Track the inner content width (scroll container minus padding) so the
    // column count tracks real layout. We can't read this once on mount because
    // the parent panel can be resized via the ColumnResizer.
    // 监听内容容器宽度（去掉内边距），以便列数能跟随真实布局变化；不能只在
    // mount 时算一次，因为父级 prompt list pane 可以拖动调整宽度。
    useEffect(() => {
        const node = scrollParentRef.current;
        if (!node) return;
        const update = () => {
            const inner = Math.max(0, node.clientWidth - PADDING_X * 2);
            setContainerWidth(inner);
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
        () => Math.max(1, getColumnsForSize(galleryImageSize, containerWidth || 1)),
        [galleryImageSize, containerWidth],
    );

    const rowCount = useMemo(
        () => Math.ceil(prompts.length / columns),
        [prompts.length, columns],
    );
    const promptOrderKey = useMemo(
        () => prompts.map((prompt) => prompt.id).join('\u001f'),
        [prompts],
    );

    const columnWidth = useMemo(() => {
        if (containerWidth <= 0) return 240;
        return Math.max(0, (containerWidth - GAP_PX * (columns - 1)) / columns);
    }, [containerWidth, columns]);

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => estimateRowHeight(columnWidth) + ROW_GAP_PX,
        overscan: 4,
        getItemKey: (rowIndex) => {
            const firstPromptId = prompts[rowIndex * columns]?.id;
            return firstPromptId ? `${firstPromptId}__${columns}` : `row-${rowIndex}-${columns}`;
        },
    });

    useEffect(() => {
        scrollParentRef.current?.scrollTo({ top: 0 });
    }, [promptOrderKey]);

    // Shared batch-bar handlers keep the "clear after action" timing of the
    // table view so both views behave identically.
    // 与表格视图相同的“操作后清除选择”时机，保证两视图行为一致。
    const batch = {
        clear: selection.clear,
        onFavorite: (ids: string[], favorite: boolean) => {
            onBatchFavorite?.(ids, favorite);
            selection.clear();
        },
        onMove: (ids: string[], folderId: string | undefined) => {
            onBatchMove?.(ids, folderId);
            selection.clear();
        },
        onDelete: (ids: string[]) => {
            onBatchDelete?.(ids);
            selection.clear();
        },
        onTag: onBatchTags
            ? (ids: string[]) => onBatchTags(ids)
            : undefined,
    };

    if (prompts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <PromptListEmptyState />
            </div>
        );
    }

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();

    return (
        <>
            {canBatch && (
                <PromptBatchActionBar
                    selectedIds={selection.selectedIdList}
                    totalCount={prompts.length}
                    onClear={batch.clear}
                    onFavorite={batch.onFavorite}
                    onMove={batch.onMove}
                    onDelete={batch.onDelete}
                    onTag={batch.onTag}
                />
            )}
            <div ref={scrollParentRef} className="flex-1 min-h-0 overflow-y-auto">
            <div
                style={{
                    height: `${totalHeight + PADDING_TOP + PADDING_BOTTOM}px`,
                    paddingLeft: `${PADDING_X}px`,
                    paddingRight: `${PADDING_X}px`,
                    paddingTop: `${PADDING_TOP}px`,
                    paddingBottom: `${PADDING_BOTTOM}px`,
                    position: 'relative',
                    boxSizing: 'border-box',
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
                                left: PADDING_X,
                                right: PADDING_X,
                                transform: `translateY(${virtualRow.start + PADDING_TOP}px)`,
                                paddingBottom: `${ROW_GAP_PX}px`,
                                boxSizing: 'border-box',
                            }}
                        >
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                    columnGap: `${GAP_PX}px`,
                                }}
                            >
                                {rowItems.map((prompt) => (
                                    <div
                                        key={prompt.id}
                                        onContextMenu={(e) => onContextMenu(e, prompt)}
                                        className="h-full"
                                    >
                                        <GalleryCard
                                            prompt={prompt}
                                            onSelect={() => onViewDetail(prompt)}
                                            onToggleFavorite={(e) => {
                                                e.stopPropagation();
                                                onToggleFavorite(prompt.id);
                                            }}
                                            folderName={prompt.folderId ? (folderNameMap.get(prompt.folderId) || uncategorizedLabel) : uncategorizedLabel}
                                            highlightTerms={highlightTerms}
                                            videoLabel={videoLabel}
                                            titleClassName={titleClassName}
                                            selectable={canBatch}
                                            selected={selection.selectedIds.has(prompt.id)}
                                            onToggleSelect={() => selection.toggle(prompt.id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            </div>
        </>
    );
}
