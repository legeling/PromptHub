import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '@prompthub/shared/types';
import { ImageIcon, FolderIcon, StarIcon, PlayIcon, VideoIcon } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { resolveLocalImageSrc, resolveLocalVideoSrc } from '../../utils/media-url';

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, terms: string[], highlightClassName: string) {
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
}

const GalleryCard = memo(({
    prompt,
    onSelect,
    onToggleFavorite,
    folderName,
    highlightTerms,
    videoLabel,
    titleClassName,
}: {
    prompt: Prompt;
    onSelect: () => void;
    onToggleFavorite: (e: React.MouseEvent) => void;
    folderName?: string;
    highlightTerms: string[];
    videoLabel: string;
    titleClassName: string;
}) => {
    const { t } = useTranslation();
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const highlightClassName = 'bg-primary/15 text-primary rounded px-0.5';
    const favoriteLabel = prompt.isFavorite
        ? t('prompt.removeFromFavorites', 'Remove from Favorites')
        : t('prompt.addToFavorites', 'Add to Favorites');

    // Determine media source: prioritize image, then video
    // 确定媒体源：优先图片，其次视频
    const hasImage = prompt.images && prompt.images.length > 0 && !imageError;
    const hasVideo = prompt.videos && prompt.videos.length > 0 && !videoError;
    const imageSrc = hasImage ? resolveLocalImageSrc(prompt.images![0]) : null;
    const videoSrc = hasVideo ? resolveLocalVideoSrc(prompt.videos![0]) : null;
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        onSelect();
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={prompt.title}
            className="group relative flex flex-col app-wallpaper-panel rounded-xl overflow-hidden border border-border hover:shadow-lg transition-all duration-smooth hover:-translate-y-1 cursor-pointer h-full"
            onClick={onSelect}
            onKeyDown={handleKeyDown}
        >
            {/* Image / Video / Placeholder Area */}
            {/* 图片 / 视频 / 占位区域 */}
            <div className="aspect-[4/3] w-full bg-muted/30 relative overflow-hidden">
                {imageSrc ? (
                    <img
                        src={imageSrc}
                        alt={prompt.title}
                        className="w-full h-full object-cover transition-transform duration-slow group-hover:scale-110"
                        loading="lazy"
                        onError={() => setImageError(true)}
                    />
                ) : videoSrc ? (
                    <>
                        {/* Video thumbnail - use video element with poster or first frame */}
                        {/* 视频缩略图 - 使用 video 元素的第一帧 */}
                        <video
                            src={videoSrc}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            onError={() => setVideoError(true)}
                        />
                        {/* Play button overlay */}
                            {/* 播放按钮覆盖层 */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                <PlayIcon aria-hidden="true" className="w-6 h-6 text-primary fill-current ml-1" />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
                        <ImageIcon aria-hidden="true" className="w-12 h-12 mb-2 opacity-50" />
                    </div>
                )}

                {/* Video indicator badge (when has both image and video) */}
                {/* 视频指示器徽章（当同时有图片和视频时） */}
                {hasImage && hasVideo && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
                            <VideoIcon aria-hidden="true" className="w-3 h-3" />
                            <span>{videoLabel}</span>
                        </div>
                )}

                {/* Helper Actions Overlay */}
                {/* 快捷操作浮层 */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-base">
                    <button
                        type="button"
                        onClick={onToggleFavorite}
                        className={`p-1.5 rounded-full backdrop-blur-md bg-black/20 hover:bg-black/40 transition-colors ${prompt.isFavorite ? 'text-yellow-400' : 'text-white'
                            }`}
                        title={favoriteLabel}
                        aria-label={favoriteLabel}
                    >
                        <StarIcon aria-hidden="true" className={`w-4 h-4 ${prompt.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {/* 内容区域 */}
            <div className="flex-1 p-3 flex flex-col gap-2">
                <h3
                    className={titleClassName}
                    title={prompt.title}
                >
                    {renderHighlightedText(prompt.title, highlightTerms, highlightClassName)}
                </h3>

                {/* Tags */}
                {/* 标签 */}
                <div className="flex flex-wrap gap-1 h-5 overflow-hidden">
                    {prompt.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground truncate">
                            #{tag}
                        </span>
                    ))}
                    {prompt.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{prompt.tags.length - 3}</span>
                    )}
                </div>

                {/* Footer: Folder & Date */}
                {/* 底部：文件夹与日期 */}
                <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1 truncate max-w-[70%]">
                        <FolderIcon aria-hidden="true" className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{folderName || 'Uncategorized'}</span>
                    </div>
                    <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    );
});
GalleryCard.displayName = 'GalleryCard';

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
}: PromptGalleryViewProps & { onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void }) {
    const { t } = useTranslation();
    const folders = useFolderStore(state => state.folders);
    const galleryImageSize = (usePromptStore(state => state.galleryImageSize) ?? 'medium') as GallerySize;
    const uncategorizedLabel = t('folder.uncategorized');
    const videoLabel = t('prompt.videoLabel', 'Video');
    const folderNameMap = useMemo(
        () => new Map(folders.map((folder) => [folder.id, folder.name])),
        [folders],
    );
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

    if (prompts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                <p>{t('prompt.noPrompts', '暂无 Prompt')}</p>
            </div>
        );
    }

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();

    return (
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
