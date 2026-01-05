import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sortBy = usePromptStore((state) => state.sortBy);
  const sortOrder = usePromptStore((state) => state.sortOrder);
  const viewMode = usePromptStore((state) => state.viewMode);
  const setSortBy = usePromptStore((state) => state.setSortBy);
  const setSortOrder = usePromptStore((state) => state.setSortOrder);
  const setViewMode = usePromptStore((state) => state.setViewMode);
  const galleryImageSize = usePromptStore((state) => state.galleryImageSize);
  const setGalleryImageSize = usePromptStore((state) => state.setGalleryImageSize);

  // Sort options
  // 排序选项
  const sortOptions: SortOption[] = [
    { label: t('prompt.sortNewest'), sortBy: 'updatedAt', sortOrder: 'desc' },
    { label: t('prompt.sortOldest'), sortBy: 'updatedAt', sortOrder: 'asc' },
    { label: t('prompt.sortTitleAsc'), sortBy: 'title', sortOrder: 'asc' },
    { label: t('prompt.sortTitleDesc'), sortBy: 'title', sortOrder: 'desc' },
    { label: t('prompt.sortMostUsed'), sortBy: 'usageCount', sortOrder: 'desc' },
    { label: t('prompt.sortLeastUsed'), sortBy: 'usageCount', sortOrder: 'asc' },
  ];

  // Get currently selected sort option
  // Get currently selected sort option
  // 获取当前选中的排序选项
  const currentOption = sortOptions.find(
    (opt) => opt.sortBy === sortBy && opt.sortOrder === sortOrder
  ) || sortOptions[0];

  // Click outside to close dropdown
  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate dropdown position
  const updateMenuPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  const handleToggleMenu = () => {
    if (!isOpen) {
      updateMenuPosition();
    }
    setIsOpen(!isOpen);
  };

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
      {/* Left side: Prompt count */}
      {/* 左侧：Prompt 数量 */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {t('prompt.promptCount', { count })}
      </span>

      {/* Right side: Sort + View toggle */}
      {/* 右侧：排序 + 视图切换 */}
      <div className="flex items-center gap-1">
        {/* Sort dropdown */}
        {/* 排序下拉 */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={handleToggleMenu}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors"
          >
            <span className="text-muted-foreground">{currentOption.label}</span>
            <ChevronDownIcon className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && createPortal(
            <div 
              ref={dropdownRef}
              className="fixed w-32 py-1 rounded-lg bg-popover border border-border shadow-lg z-[9999]"
              style={{ top: menuPosition.top, right: menuPosition.right }}
            >
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
            </div>,
            document.body
          )}
        </div>

        {/* Image size control - Only shown in Gallery mode */}
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

        {/* View toggle buttons - with sliding indicator */}
        {/* 视图切换按钮 - 带滑动指示器 */}
        <div className="relative flex items-center rounded-md border border-border overflow-hidden bg-muted/30">
          {/* Sliding indicator */}
          {/* 滑动指示器 */}
          <div
            className="absolute h-full bg-primary rounded-[3px] transition-all duration-200 ease-out"
            style={{
              width: 'calc(100% / 3)',
              left: viewMode === 'card' ? '0%' : viewMode === 'gallery' ? 'calc(100% / 3)' : 'calc(200% / 3)',
            }}
          />
          <button
            onClick={() => setViewMode('card')}
            className={`relative z-10 p-1.5 transition-colors duration-200 ${viewMode === 'card'
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground'
              }`}
            title={t('prompt.viewCard')}
          >
            <LayoutGridIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('gallery')}
            className={`relative z-10 p-1.5 transition-colors duration-200 ${viewMode === 'gallery'
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground'
              }`}
            title={t('prompt.viewGallery', '图片视图')}
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`relative z-10 p-1.5 transition-colors duration-200 ${viewMode === 'list'
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground'
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
