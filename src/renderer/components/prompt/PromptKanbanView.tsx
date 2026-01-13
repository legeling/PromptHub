import { useState, useCallback, memo } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Prompt } from '../../../shared/types';
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
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';

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

// Extract variables from prompt content
function extractVariables(text: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const varName = match[1].split(':')[0].trim();
    if (!matches.includes(varName)) {
      matches.push(varName);
    }
  }
  return matches;
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
  
  const allVariables = [
    ...extractVariables(prompt.systemPrompt || ''),
    ...extractVariables(prompt.userPrompt),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

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
        group relative flex flex-col bg-card rounded-xl border transition-all duration-300
        ${isPinned 
          ? 'border-primary/50 shadow-lg shadow-primary/10 ring-2 ring-primary/20' 
          : 'border-border hover:border-primary/30 hover:shadow-md'
        }
        ${cardHeightClass} overflow-hidden
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Title */}
          <h3 
            className="font-semibold text-sm truncate cursor-pointer hover:text-primary transition-colors"
            onClick={onViewDetail}
            title={prompt.title}
          >
            {prompt.title}
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
                onClick={isExpanded ? onCollapse : onExpand}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={isExpanded ? t('common.collapse', '收起') : t('common.expand', '展开')}
              >
                {isExpanded ? <MinimizeIcon className="w-3.5 h-3.5" /> : <MaximizeIcon className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={onUnpin}
                className="p-1 rounded-md text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors"
                title={t('prompt.unpin', '取消固定')}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={onPin}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
              title={t('prompt.pin', '固定')}
            >
              <PinIcon className="w-3.5 h-3.5" />
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
            <div className={`text-xs text-foreground/80 bg-muted/30 rounded-lg p-2 ${isExpanded ? '' : 'line-clamp-4'}`}>
              {prompt.systemPrompt}
            </div>
          </div>
        )}

        {/* User Prompt Preview */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            User Prompt
          </div>
          <div className={`text-xs text-foreground/80 bg-muted/30 rounded-lg p-2 ${isExpanded ? '' : isPinned ? 'line-clamp-6' : 'line-clamp-3'}`}>
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
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 rounded-md transition-colors ${
              prompt.isFavorite 
                ? 'text-yellow-400 hover:bg-yellow-400/10' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={prompt.isFavorite ? t('prompt.unfavorite', '取消收藏') : t('prompt.favorite', '收藏')}
          >
            <StarIcon className={`w-3.5 h-3.5 ${prompt.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('prompt.copy', '复制')}
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t('prompt.edit', '编辑')}
          >
            <EditIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAiTest(); }}
            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title={t('prompt.aiTest', 'AI 测试')}
          >
            <PlayIcon className="w-3.5 h-3.5" />
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
  const folders = useFolderStore(state => state.folders);
  const kanbanColumns = usePromptStore(state => state.kanbanColumns);
  
  // State for pinned cards
  const [pinnedCards, setPinnedCards] = useState<PinnedCard[]>([]);
  // State for collapsing the entire pinned section
  const [isPinnedSectionCollapsed, setIsPinnedSectionCollapsed] = useState(false);

  const getFolderName = (folderId?: string) => {
    if (!folderId) return t('folder.uncategorized', '未分类');
    return folders.find(f => f.id === folderId)?.name || t('folder.uncategorized', '未分类');
  };

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

  const pinnedPrompts = pinnedCards
    .map(pc => prompts.find(p => p.id === pc.promptId))
    .filter(Boolean) as Prompt[];

  const unpinnedPrompts = prompts.filter(
    p => !pinnedCards.some(pc => pc.promptId === p.id)
  );

  // Check if any card is expanded
  const hasExpandedCards = pinnedCards.some(p => p.isExpanded);

  // Grid columns based on user preference (max 4 columns)
  // Use md breakpoint for 3 cols, lg for 4 cols to be more responsive
  const gridColsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }[kanbanColumns || 3];

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
              onClick={() => setIsPinnedSectionCollapsed(!isPinnedSectionCollapsed)}
              className="flex items-center gap-2 hover:text-primary transition-colors"
            >
              {isPinnedSectionCollapsed ? (
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              )}
              <PinIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {t('prompt.pinnedPrompts', '固定的 Prompt')} ({pinnedPrompts.length})
              </span>
            </button>
            {/* Quick actions */}
            <div className="flex items-center gap-1">
              {!isPinnedSectionCollapsed && (
                <button
                  onClick={hasExpandedCards ? handleCollapseAll : handleExpandAll}
                  className="px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={hasExpandedCards ? t('prompt.collapseAll', '全部收起') : t('prompt.expandAll', '全部展开')}
                >
                  {hasExpandedCards ? (
                    <><MinimizeIcon className="w-3 h-3 inline mr-1" />{t('prompt.collapseAll', '全部收起')}</>
                  ) : (
                    <><MaximizeIcon className="w-3 h-3 inline mr-1" />{t('prompt.expandAll', '全部展开')}</>
                  )}
                </button>
              )}
              <button
                onClick={handleUnpinAll}
                className="px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={t('prompt.unpinAll', '全部取消固定')}
              >
                <XIcon className="w-3 h-3 inline mr-1" />{t('prompt.unpinAll', '清空')}
              </button>
            </div>
          </div>
          {/* Pinned cards - collapsible */}
          {!isPinnedSectionCollapsed && (
            <div className="px-4 pb-4">
              <LayoutGroup id="pinned">
                <div className={`grid gap-4 ${
                  pinnedPrompts.length === 1 ? 'grid-cols-1' :
                  pinnedPrompts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                  pinnedPrompts.length === 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' :
                  'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                }`}>
                  {pinnedPrompts.map(prompt => {
                    const cardState = pinnedCards.find(pc => pc.promptId === prompt.id);
                    return (
                      <motion.div 
                        key={prompt.id}
                        layout
                        layoutId={`pinned-${prompt.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ 
                          layout: { type: "spring", stiffness: 300, damping: 30 },
                          opacity: { duration: 0.2 }
                        }}
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
                          folderName={getFolderName(prompt.folderId)}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </LayoutGroup>
            </div>
          )}
        </div>
      )}

      {/* Unpinned Cards Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <LayoutGroup>
          <div className={`grid ${gridColsClass} gap-4 pb-20`}>
            {unpinnedPrompts.map(prompt => (
              <motion.div 
                key={prompt.id}
                layout
                layoutId={prompt.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ 
                  layout: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                onContextMenu={(e) => onContextMenu(e, prompt)}
              >
                <KanbanCard
                  prompt={prompt}
                  isPinned={false}
                  isExpanded={false}
                  onPin={() => handlePin(prompt.id)}
                  onUnpin={() => {}}
                  onExpand={() => {}}
                  onCollapse={() => {}}
                  onCopy={() => onCopy(prompt)}
                  onEdit={() => onEdit(prompt)}
                  onAiTest={() => onAiTest(prompt)}
                  onToggleFavorite={() => onToggleFavorite(prompt.id)}
                  onViewDetail={() => onViewDetail(prompt)}
                  folderName={getFolderName(prompt.folderId)}
                />
              </motion.div>
            ))}
          </div>
        </LayoutGroup>
      </div>
    </div>
  );
}
