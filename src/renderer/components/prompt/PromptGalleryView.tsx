
import { useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '../../../shared/types';
import { ImageIcon, FolderIcon, HashIcon, MoreHorizontalIcon, StarIcon, EditIcon, TrashIcon, CopyIcon, PlayIcon, HistoryIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';

interface PromptGalleryViewProps {
    prompts: Prompt[];
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
    folderName
}: {
    prompt: Prompt;
    onSelect: () => void;
    onToggleFavorite: (e: React.MouseEvent) => void;
    folderName?: string;
}) => {
    const imageSrc = prompt.images && prompt.images.length > 0
        ? `local-image://${prompt.images[0]}`
        : null;

    return (
        <div
            className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full"
            onClick={onSelect}
        >
            {/* Image / Placeholder Area */}
            <div className="aspect-[4/3] w-full bg-muted/30 relative overflow-hidden">
                {imageSrc ? (
                    <img
                        src={imageSrc}
                        alt={prompt.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                    </div>
                )}

                {/* Helper Actions Overlay */}
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
            <div className="flex-1 p-3 flex flex-col gap-2">
                <h3 className="font-semibold text-sm truncate leading-tight" title={prompt.title}>
                    {prompt.title}
                </h3>

                {/* Tags */}
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
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
