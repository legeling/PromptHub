import { useRef, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '../../../shared/types';
import { ImageIcon, FolderIcon, HashIcon, MoreHorizontalIcon, StarIcon, EditIcon, TrashIcon, CopyIcon, PlayIcon, HistoryIcon, VideoIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';

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
    highlightTerms
}: {
    prompt: Prompt;
    onSelect: () => void;
    onToggleFavorite: (e: React.MouseEvent) => void;
    folderName?: string;
    highlightTerms: string[];
}) => {
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const highlightClassName = 'bg-primary/15 text-primary rounded px-0.5';
    
    // Determine media source: prioritize image, then video
    // 确定媒体源：优先图片，其次视频
    const hasImage = prompt.images && prompt.images.length > 0 && !imageError;
    const hasVideo = prompt.videos && prompt.videos.length > 0 && !videoError;
    const imageSrc = hasImage ? `local-image://${prompt.images![0]}` : null;
    const videoSrc = hasVideo ? `local-video://${prompt.videos![0]}` : null;

    return (
        <div
            className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full"
            onClick={onSelect}
        >
            {/* Image / Video / Placeholder Area */}
            {/* 图片 / 视频 / 占位区域 */}
            <div className="aspect-[4/3] w-full bg-muted/30 relative overflow-hidden">
                {imageSrc ? (
                    <img
                        src={imageSrc}
                        alt={prompt.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
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
                                <PlayIcon className="w-6 h-6 text-primary fill-current ml-1" />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                    </div>
                )}

                {/* Video indicator badge (when has both image and video) */}
                {/* 视频指示器徽章（当同时有图片和视频时） */}
                {hasImage && hasVideo && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
                        <VideoIcon className="w-3 h-3" />
                        <span>视频</span>
                    </div>
                )}

                {/* Helper Actions Overlay */}
                {/* 快捷操作浮层 */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        onClick={onToggleFavorite}
                        className={`p-1.5 rounded-full backdrop-blur-md bg-black/20 hover:bg-black/40 transition-colors ${prompt.isFavorite ? 'text-yellow-400' : 'text-white'
                            }`}
                    >
                        <StarIcon className={`w-4 h-4 ${prompt.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {/* 内容区域 */}
            <div className="flex-1 p-3 flex flex-col gap-2">
                <h3 className="font-semibold text-sm truncate leading-tight" title={prompt.title}>
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
                        <FolderIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{folderName || 'Uncategorized'}</span>
                    </div>
                    <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    );
});

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
    const galleryImageSize = usePromptStore(state => state.galleryImageSize);

    const getFolderName = (folderId?: string) => {
        if (!folderId) return t('folder.uncategorized', '未分类');
        return folders.find(f => f.id === folderId)?.name || t('folder.uncategorized', '未分类');
    };

    if (prompts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                <p>{t('prompt.noPrompts', '暂无 Prompt')}</p>
            </div>
        );
    }

    const gridCols = {
        small: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8',
        medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        large: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    }[galleryImageSize || 'medium'];

    return (
        <div className="h-full overflow-y-auto p-4 content-start">
            <div className={`grid ${gridCols} gap-4 pb-20`}>
                {prompts.map(prompt => (
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
                            folderName={getFolderName(prompt.folderId)}
                            highlightTerms={highlightTerms}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
