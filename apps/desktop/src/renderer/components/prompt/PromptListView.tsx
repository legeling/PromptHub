import { useTranslation } from 'react-i18next';
import { StarIcon, CopyIcon, ImageIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { Prompt } from '@prompthub/shared/types';

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

  const selectPrompt = (id: string) => {
    onSelect(id);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    selectPrompt(id);
  };

  // Format date
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
      {prompts.map((prompt) => {
        const isSelected = selectedId === prompt.id;
        const copyLabel = t('prompt.copy', 'Copy Prompt');
        const favoriteLabel = prompt.isFavorite
          ? t('prompt.removeFromFavorites', 'Remove from Favorites')
          : t('prompt.addToFavorites', 'Add to Favorites');

        return (
          <div
            key={prompt.id}
            onContextMenu={(e) => onContextMenu(e, prompt)}
            className={`
              flex items-center gap-3 px-3 py-2.5 border-b border-border/50 cursor-pointer
              transition-colors duration-quick
              ${isSelected
                ? 'bg-primary/10 border-l-2 border-l-primary'
                : 'hover:bg-accent/50'
              }
            `}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={prompt.title}
              aria-pressed={isSelected}
              onClick={() => selectPrompt(prompt.id)}
              onKeyDown={(event) => handleRowKeyDown(event, prompt.id)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              {/* Title and description */}
              {/* 标题和描述 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className={`font-medium text-sm leading-snug break-words line-clamp-2 ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                    title={prompt.title}
                  >
                    {prompt.title}
                  </h3>
                  {prompt.isFavorite && (
                    <StarIcon aria-hidden="true" className="w-3 h-3 flex-shrink-0 fill-yellow-400 text-yellow-400" />
                  )}
                </div>
                {prompt.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">
                    {prompt.description}
                  </p>
                )}
                {prompt.images && prompt.images.length > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <ImageIcon aria-hidden="true" className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{prompt.images.length}</span>
                  </div>
                )}
              </div>

              {/* Usage count */}
              {/* 使用次数 */}
              <div className="flex-shrink-0 w-12 text-center">
                <span className="text-xs text-muted-foreground">
                  {prompt.usageCount || 0}
                </span>
              </div>

              {/* Update time */}
              {/* 更新时间 */}
              <div className="flex-shrink-0 w-16 text-right">
                <span className="text-xs text-muted-foreground">
                  {formatDate(prompt.updatedAt)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            {/* 操作按钮 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(prompt);
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={copyLabel}
                aria-label={copyLabel}
              >
                <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(prompt.id);
                }}
                className={`p-1.5 rounded-md transition-colors ${prompt.isFavorite
                  ? 'text-yellow-500 hover:bg-yellow-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title={favoriteLabel}
                aria-label={favoriteLabel}
              >
                <StarIcon aria-hidden="true" className={`w-3.5 h-3.5 ${prompt.isFavorite ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
