import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, ImageIcon } from 'lucide-react';
import type { Prompt } from '../../../shared/types';

interface PromptListViewProps {
  prompts: Prompt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
}

export function PromptListView({
  prompts,
  selectedId,
  onSelect,
  onToggleFavorite,
  onCopy,
  onContextMenu,
}: PromptListViewProps) {
  const { t } = useTranslation();

  // 格式化日期
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

  return (
    <div className="flex flex-col">
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          onClick={() => onSelect(prompt.id)}
          onContextMenu={(e) => onContextMenu(e, prompt)}
          className={`
            flex items-center gap-3 px-3 py-2.5 border-b border-border/50 cursor-pointer
            transition-colors duration-150
            ${selectedId === prompt.id
              ? 'bg-primary/10 border-l-2 border-l-primary'
              : 'hover:bg-accent/50'
            }
          `}
        >
          {/* 标题和描述 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`font-medium text-sm truncate ${selectedId === prompt.id ? 'text-primary' : 'text-foreground'
                }`}>
                {prompt.title}
              </h3>
              {prompt.isFavorite && (
                <StarIcon className="w-3 h-3 flex-shrink-0 fill-yellow-400 text-yellow-400" />
              )}
            </div>
            {prompt.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
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

          {/* 使用次数 */}
          <div className="flex-shrink-0 w-12 text-center">
            <span className="text-xs text-muted-foreground">
              {prompt.usageCount || 0}
            </span>
          </div>

          {/* 更新时间 */}
          <div className="flex-shrink-0 w-16 text-right">
            <span className="text-xs text-muted-foreground">
              {formatDate(prompt.updatedAt)}
            </span>
          </div>

          {/* 操作按钮 */}
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
      ))}
    </div>
  );
}
