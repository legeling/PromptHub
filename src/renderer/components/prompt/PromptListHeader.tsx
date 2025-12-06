import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, LayoutGridIcon, ListIcon, ImageIcon } from 'lucide-react';
import { usePromptStore, SortBy, SortOrder, ViewMode } from '../../stores/prompt.store';

interface SortOption {
  label: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

interface PromptListHeaderProps {
  count: number;
}

export function PromptListHeader({ count }: PromptListHeaderProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortBy = usePromptStore((state) => state.sortBy);
  const sortOrder = usePromptStore((state) => state.sortOrder);
  const viewMode = usePromptStore((state) => state.viewMode);
  const setSortBy = usePromptStore((state) => state.setSortBy);
  const setSortOrder = usePromptStore((state) => state.setSortOrder);
  const setViewMode = usePromptStore((state) => state.setViewMode);
  const galleryImageSize = usePromptStore((state) => state.galleryImageSize);
  const setGalleryImageSize = usePromptStore((state) => state.setGalleryImageSize);

  // 排序选项
  const sortOptions: SortOption[] = [
    { label: t('prompt.sortNewest'), sortBy: 'updatedAt', sortOrder: 'desc' },
    { label: t('prompt.sortOldest'), sortBy: 'updatedAt', sortOrder: 'asc' },
    { label: t('prompt.sortTitleAsc'), sortBy: 'title', sortOrder: 'asc' },
    { label: t('prompt.sortTitleDesc'), sortBy: 'title', sortOrder: 'desc' },
    { label: t('prompt.sortMostUsed'), sortBy: 'usageCount', sortOrder: 'desc' },
    { label: t('prompt.sortLeastUsed'), sortBy: 'usageCount', sortOrder: 'asc' },
  ];

  // 获取当前选中的排序选项
  const currentOption = sortOptions.find(
    (opt) => opt.sortBy === sortBy && opt.sortOrder === sortOrder
  ) || sortOptions[0];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSort = (option: SortOption) => {
    setSortBy(option.sortBy);
    setSortOrder(option.sortOrder);
    setIsOpen(false);
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'card' ? 'list' : 'card');
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
      {/* 左侧：Prompt 数量 */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {t('prompt.promptCount', { count })}
      </span>

      {/* 右侧：排序 + 视图切换 */}
      <div className="flex items-center gap-1">
        {/* 排序下拉 */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors"
          >
            <span className="text-muted-foreground">{currentOption.label}</span>
            <ChevronDownIcon className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-lg bg-popover border border-border shadow-lg z-50">
              {sortOptions.map((option) => (
                <button
                  key={`${option.sortBy}-${option.sortOrder}`}
                  onClick={() => handleSelectSort(option)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors ${option.sortBy === sortBy && option.sortOrder === sortOrder
                    ? 'text-primary font-medium'
                    : 'text-foreground'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 图片大小控制 - 仅在 Gallery 模式显示 */}
        {viewMode === 'gallery' && (
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-2">
            <button
              onClick={() => setGalleryImageSize('small')}
              className={`px-2 py-1 text-xs transition-colors ${galleryImageSize === 'small' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'}`}
              title={t('prompt.sizeSmall', '小图')}
            >
              S
            </button>
            <button
              onClick={() => setGalleryImageSize('medium')}
              className={`px-2 py-1 text-xs transition-colors ${galleryImageSize === 'medium' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'}`}
              title={t('prompt.sizeMedium', '中图')}
            >
              M
            </button>
            <button
              onClick={() => setGalleryImageSize('large')}
              className={`px-2 py-1 text-xs transition-colors ${galleryImageSize === 'large' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'}`}
              title={t('prompt.sizeLarge', '大图')}
            >
              L
            </button>
          </div>
        )}

        {/* 视图切换按钮 */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 transition-colors ${viewMode === 'card'
              ? 'bg-primary text-white'
              : 'bg-transparent text-muted-foreground hover:bg-accent'
              }`}
            title={t('prompt.viewCard')}
          >
            <LayoutGridIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('gallery')}
            className={`p-1.5 transition-colors ${viewMode === 'gallery'
              ? 'bg-primary text-white'
              : 'bg-transparent text-muted-foreground hover:bg-accent'
              }`}
            title={t('prompt.viewGallery', '图片视图')}
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 transition-colors ${viewMode === 'list'
              ? 'bg-primary text-white'
              : 'bg-transparent text-muted-foreground hover:bg-accent'
              }`}
            title={t('prompt.viewList')}
          >
            <ListIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
