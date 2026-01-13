import { useState, useEffect, useRef, useCallback } from 'react';
import { StarIcon, HashIcon, PlusIcon, LayoutGridIcon, LinkIcon, SettingsIcon, ChevronLeftIcon, ChevronRightIcon, XIcon, ChevronDownIcon, ChevronUpIcon, ImageIcon, MessageSquareTextIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { useSettingsStore } from '../../stores/settings.store';
import { ResourcesModal } from '../resources/ResourcesModal';
import { FolderModal, PrivateFolderUnlockModal } from '../folder';
import { useTranslation } from 'react-i18next';
import type { Folder } from '../../../shared/types';
import { SortableTree } from './tree/SortableTree';
import type { FlattenedItem } from './tree/utilities';

type PageType = 'home' | 'settings';

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

function NavItem({ icon, label, count, active, onClick, collapsed }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`
        w-full flex ${collapsed ? 'flex-col items-center gap-1' : 'items-center gap-3'} px-3 py-2 rounded-lg text-sm
        transition-all duration-200
        ${active
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        }
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {count !== undefined && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-foreground/60">
              {count}
            </span>
          )}
        </>
      )}

      {collapsed && (
        <span className="text-[10px] leading-none text-sidebar-foreground/60 max-w-full truncate">
          {label.slice(0, 2)}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const selectFolder = useFolderStore((state) => state.selectFolder);
  const reorderFolders = useFolderStore((state) => state.reorderFolders);
  const unlockedFolderIds = useFolderStore((state) => state.unlockedFolderIds);
  const unlockFolder = useFolderStore((state) => state.unlockFolder);
  const expandedIds = useFolderStore((state) => state.expandedIds);
  const toggleExpand = useFolderStore((state) => state.toggleExpand);
  const updateFolder = useFolderStore((state) => state.updateFolder);
  const prompts = usePromptStore((state) => state.prompts);
  const promptTypeFilter = usePromptStore((state) => state.promptTypeFilter);
  const setPromptTypeFilter = usePromptStore((state) => state.setPromptTypeFilter);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordFolder, setPasswordFolder] = useState<Folder | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const filterTags = usePromptStore((state) => state.filterTags);
  const toggleFilterTag = usePromptStore((state) => state.toggleFilterTag);
  const clearFilterTags = usePromptStore((state) => state.clearFilterTags);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isTagPopoverVisible, setIsTagPopoverVisible] = useState(false);
  const [tagPopoverPos, setTagPopoverPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 });
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const tagPopoverCloseTimerRef = useRef<number | null>(null);

  // Resize state
  const tagsSectionHeight = useSettingsStore((state) => state.tagsSectionHeight);
  const setTagsSectionHeight = useSettingsStore((state) => state.setTagsSectionHeight);
  const isTagsCollapsed = useSettingsStore((state) => state.isTagsSectionCollapsed);
  const setIsTagsCollapsed = useSettingsStore((state) => state.setIsTagsSectionCollapsed);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLElement>(null);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
  
    useEffect(() => {
      const platform = navigator.userAgent.toLowerCase();
      setIsMac(platform.includes('mac'));

      const checkFullscreen = async () => {
        if (window.electron?.isFullscreen) {
          const full = await window.electron.isFullscreen();
          setIsFullscreen(full);
        }
      };
      
      checkFullscreen();
      window.addEventListener('resize', checkFullscreen);
      return () => window.removeEventListener('resize', checkFullscreen);
    }, []);
  
    useEffect(() => {
      return () => {
        if (tagPopoverCloseTimerRef.current !== null) {
          window.clearTimeout(tagPopoverCloseTimerRef.current);
          tagPopoverCloseTimerRef.current = null;
        }
      };
    }, []);
  
    const closeTagPopover = useCallback(() => {
      setIsTagPopoverVisible(false);
      if (tagPopoverCloseTimerRef.current !== null) {
        window.clearTimeout(tagPopoverCloseTimerRef.current);
        tagPopoverCloseTimerRef.current = null;
      }
      tagPopoverCloseTimerRef.current = window.setTimeout(() => {
        setIsTagPopoverOpen(false);
        tagPopoverCloseTimerRef.current = null;
      }, 160);
    }, []);
  
    useEffect(() => {
      if (!isTagPopoverOpen) return;
  
      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (!target) return;
        if (tagPopoverRef.current?.contains(target)) return;
        if (tagButtonRef.current?.contains(target)) return;
        closeTagPopover();
      };
  
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeTagPopover();
      };
  
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);
  
      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [closeTagPopover, isTagPopoverOpen]);
  
        const openTagPopover = () => {
          const el = tagButtonRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
      
          const width = 320;
          const maxHeight = Math.min(420, Math.max(240, window.innerHeight - 24));
          
          let left = rect.right + 12;
          if (left + width > window.innerWidth - 12) {
            left = Math.max(12, rect.left - width - 12);
          }
      
          // 彻底修复定位：根据按钮所在屏幕位置，决定是用 top 还是 bottom 定位
          // Fix positioning: use top or bottom depending on button's screen position
          const isInBottomHalf = rect.top > window.innerHeight / 2;
          const newPos: { top?: number; bottom?: number; left: number } = { left };
      
          if (isInBottomHalf) {
            // 底部对齐逻辑：设置 bottom 距离，让弹窗向上生长
            // Bottom alignment: set bottom distance, let popover grow upwards
            newPos.bottom = window.innerHeight - rect.bottom + 8;
          } else {
            // 顶部对齐逻辑：设置 top 距离
            // Top alignment: set top distance
            newPos.top = rect.top - 8;
            if (newPos.top + maxHeight > window.innerHeight - 12) {
              newPos.top = Math.max(12, window.innerHeight - 12 - maxHeight);
            }
          }
      
          if (tagPopoverCloseTimerRef.current !== null) {
            window.clearTimeout(tagPopoverCloseTimerRef.current);
            tagPopoverCloseTimerRef.current = null;
          }
      
          setTagPopoverPos(newPos);
          setIsTagPopoverOpen(true);
          setIsTagPopoverVisible(false);
          requestAnimationFrame(() => {
            setIsTagPopoverVisible(true);
          });
        };      const favoriteCount = prompts.filter((p) => p.isFavorite).length;
      const allTags = prompts.flatMap((p) => p.tags);
      const uniqueTags = [...new Set(allTags)];
    
        const moveFolder = useFolderStore((state) => state.moveFolder);
      
          const handleReorderFolders = useCallback(async (newItems: FlattenedItem[], activeId: string) => {
            // Get the projected state of the moved item
            const activeItem = newItems.find(item => item.id === activeId);
            if (!activeItem) return;
        
            // Find new position relative to siblings in the projected list
            const siblings = newItems.filter(item => item.parentId === activeItem.parentId);
            const newIndex = siblings.findIndex(item => item.id === activeItem.id);
        
            if (newIndex !== -1) {
              await moveFolder(activeId, activeItem.parentId, newIndex);
            }
          }, [moveFolder]);      // Resize handler
      const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        dragStartY.current = e.clientY;
        dragStartHeight.current = tagsSectionHeight;
        document.body.style.cursor = 'ns-resize';
      };
    
      useEffect(() => {
        if (!isResizing) return;
    
              const handleMouseMove = (e: MouseEvent) => {
                const deltaY = dragStartY.current - e.clientY;
                const newHeight = dragStartHeight.current + deltaY;
                
                const minHeight = 140; // Roughly 3 rows of tags + header
                const maxHeight = window.innerHeight - 300; // Leave space for folders and nav
                
                setTagsSectionHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
              };    
        const handleMouseUp = () => {
          setIsResizing(false);
          document.body.style.cursor = '';
        };
    
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    
        return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };
      }, [isResizing, setTagsSectionHeight]);
  return (
    <aside
      ref={sidebarRef}
      className={`group relative z-20 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? (isMac ? 'w-20' : 'w-16') : 'w-60'
        }`}
    >
      {/* Top spacing - Extra padding for Mac traffic lights */}
      {isMac && !isFullscreen && <div className="h-12 titlebar-drag shrink-0" />}

      {/* Collapse Button */}
      <div className="absolute top-1/2 -translate-y-1/2 -right-3 z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-100">
        <button
          onClick={() => {
            setIsCollapsed(!isCollapsed);
            closeTagPopover();
          }}
          className="h-12 w-7 rounded-full border border-border bg-background shadow-sm hover:shadow-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-all duration-200"
          title={isCollapsed ? t('common.expand', '展开') : t('common.collapse', '收起')}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeftIcon className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Navigation area - Fixed top */}
      <div className="flex-shrink-0 flex flex-col px-3 py-2">
        <div className="space-y-1 shrink-0">
          {/* Filter Group: Segmented Control when expanded, Vertical Icons when collapsed */}
          {!isCollapsed ? (
            <div className="mb-2">
              <div className="grid grid-cols-3 gap-1 p-1 bg-sidebar-accent/40 rounded-lg">
                <button
                  onClick={() => {
                    setPromptTypeFilter('all');
                    selectFolder(null);
                    if (currentPage !== 'home') onNavigate('home');
                  }}
                  className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-200 ${
                    selectedFolderId === null && currentPage === 'home' && promptTypeFilter === 'all'
                      ? 'bg-background shadow-sm text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  }`}
                  title={t('nav.allPrompts')}
                >
                  <LayoutGridIcon className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-medium leading-none">{t('filter.all', '全部')}</span>
                </button>
                <button
                  onClick={() => {
                    setPromptTypeFilter('text');
                    selectFolder(null);
                    if (currentPage !== 'home') onNavigate('home');
                  }}
                  className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-200 ${
                    selectedFolderId === null && currentPage === 'home' && promptTypeFilter === 'text'
                      ? 'bg-background shadow-sm text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  }`}
                  title={t('nav.textPrompts', '文本提示词')}
                >
                  <MessageSquareTextIcon className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-medium leading-none">{t('filter.text', '文本')}</span>
                </button>
                <button
                  onClick={() => {
                    setPromptTypeFilter('image');
                    selectFolder(null);
                    if (currentPage !== 'home') onNavigate('home');
                  }}
                  className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-200 ${
                    selectedFolderId === null && currentPage === 'home' && promptTypeFilter === 'image'
                      ? 'bg-background shadow-sm text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  }`}
                  title={t('nav.imagePrompts', '绘图提示词')}
                >
                  <ImageIcon className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-medium leading-none">{t('filter.image', '绘图')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <NavItem
                icon={<LayoutGridIcon className="w-5 h-5" />}
                label={t('nav.allPrompts')}
                count={prompts.length}
                active={selectedFolderId === null && currentPage === 'home' && promptTypeFilter === 'all'}
                collapsed={true}
                onClick={() => {
                  setPromptTypeFilter('all');
                  selectFolder(null);
                  if (currentPage !== 'home') onNavigate('home');
                }}
              />
              <NavItem
                icon={<MessageSquareTextIcon className="w-5 h-5" />}
                label={t('nav.textPrompts', '文本提示词')}
                count={prompts.filter(p => !p.promptType || p.promptType === 'text').length}
                active={promptTypeFilter === 'text' && selectedFolderId === null && currentPage === 'home'}
                collapsed={true}
                onClick={() => {
                  setPromptTypeFilter('text');
                  selectFolder(null);
                  if (currentPage !== 'home') onNavigate('home');
                }}
              />
              <NavItem
                icon={<ImageIcon className="w-5 h-5" />}
                label={t('nav.imagePrompts', '绘图提示词')}
                count={prompts.filter(p => p.promptType === 'image').length}
                active={promptTypeFilter === 'image' && selectedFolderId === null && currentPage === 'home'}
                collapsed={true}
                onClick={() => {
                  setPromptTypeFilter('image');
                  selectFolder(null);
                  if (currentPage !== 'home') onNavigate('home');
                }}
              />
            </div>
          )}
          <NavItem
            icon={<StarIcon className="w-5 h-5" />}
            label={t('nav.favorites')}
            count={favoriteCount}
            active={selectedFolderId === 'favorites' && currentPage === 'home'}
            collapsed={isCollapsed}
            onClick={() => {
              selectFolder('favorites');
              if (currentPage !== 'home') onNavigate('home');
            }}
          />
        </div>
      </div>

      {/* Main body area - split into Folders (grow) and Tags (fixed/resizable bottom) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Folders Section - This takes all available space and scroll internally */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-2">
          {!isCollapsed && (
            <div className="flex items-center justify-between px-6 mb-2 shrink-0">
              <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider truncate">
                {t('nav.folders')}
              </span>
              <button
                onClick={() => {
                  setEditingFolder(null);
                  setIsFolderModalOpen(true);
                }}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-primary transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {isCollapsed && (
            <div className="h-px bg-sidebar-border/50 my-2 mx-4 shrink-0" />
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-4">
            <SortableTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              expandedIds={expandedIds}
              unlockedFolderIds={unlockedFolderIds}
              isCollapsed={isCollapsed}
              currentPage={currentPage}
              onSelectFolder={(folder) => {
                if (folder.isPrivate && !unlockedFolderIds.has(folder.id)) {
                  setPasswordFolder(folder);
                  setIsPasswordModalOpen(true);
                } else {
                  selectFolder(folder.id);
                  if (currentPage !== 'home') onNavigate('home');
                }
              }}
              onEditFolder={(folder) => {
                setEditingFolder(folder);
                setIsFolderModalOpen(true);
              }}
              onToggleExpand={toggleExpand}
              onReorderFolders={handleReorderFolders}
            />
            {folders.length === 0 && !isCollapsed && (
              <p className="px-3 py-4 text-sm text-sidebar-foreground/50 text-center">
                {t('folder.empty')}
              </p>
            )}
          </div>
        </div>
        
        {/* Resize Handle - Visual divider */}
        {uniqueTags.length > 0 && !isCollapsed && !isTagsCollapsed && (
          <div 
            className={`h-1 cursor-ns-resize hover:bg-primary/40 transition-colors z-30 shrink-0 mx-2 rounded-full ${isResizing ? 'bg-primary/60' : 'bg-transparent'}`}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Tags Section - Hard pinned to the bottom */}
        {uniqueTags.length > 0 && (
          <div 
            className={`shrink-0 flex flex-col overflow-hidden bg-sidebar ${isCollapsed ? 'items-center' : ''}`}
            style={{ height: isCollapsed || isTagsCollapsed ? 'auto' : `${tagsSectionHeight}px` }}
          >
            {!isCollapsed && (
              <div className="flex items-center justify-between px-6 py-2 border-t border-sidebar-border/50 shrink-0">
                <button 
                  onClick={() => setIsTagsCollapsed(!isTagsCollapsed)}
                  className="flex items-center gap-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/80 transition-colors"
                >
                  {isTagsCollapsed ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                  {t('nav.tags')}
                </button>
                {!isTagsCollapsed && uniqueTags.length > 8 && (
                  <button
                    onClick={() => setShowAllTags(!showAllTags)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAllTags ? t('common.collapse') : `${t('common.showAll')} ${uniqueTags.length}`}
                  </button>
                )}
              </div>
            )}

            {!isCollapsed ? (
              !isTagsCollapsed && (
                <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-hide animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(showAllTags ? uniqueTags : uniqueTags.slice(0, 8)).map((tag, index) => (
                      <button
                        key={tag}
                        onClick={() => {
                          toggleFilterTag(tag);
                          if (currentPage !== 'home') onNavigate('home');
                        }}
                        style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-200 animate-in fade-in slide-in-from-left-1 ${filterTags.includes(tag) && currentPage === 'home'
                          ? 'bg-primary text-white'
                          : 'bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white'
                          }`}
                      >
                        <HashIcon className="w-3 h-3" />
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="pt-2 border-t border-sidebar-border/50 flex flex-col items-center gap-2 pb-2">
                <button
                  ref={tagButtonRef}
                  onClick={() => {
                    if (isTagPopoverOpen) {
                      closeTagPopover();
                    } else {
                      openTagPopover();
                      if (currentPage !== 'home') onNavigate('home');
                    }
                  }}
                  title={t('nav.tags')}
                  className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors duration-200 ${filterTags.length > 0 && currentPage === 'home'
                    ? 'bg-primary text-white'
                    : 'bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white'
                    }`}
                >
                  <HashIcon className="w-4 h-4" />
                  <span className="text-[10px] leading-none mt-0.5">
                    {filterTags.length > 0 ? filterTags.length : t('nav.tags').slice(0, 2)}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isTagPopoverOpen && (
        <div
          ref={tagPopoverRef}
          className={`fixed z-[9999] transition-all duration-150 ${
            tagPopoverPos.bottom !== undefined ? 'origin-bottom-left' : 'origin-top-left'
          } ${isTagPopoverVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}
          style={{ 
            top: tagPopoverPos.top,
            bottom: tagPopoverPos.bottom,
            left: tagPopoverPos.left, 
            width: 320, 
            maxHeight: 'min(420px, calc(100vh - 24px))' 
          }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-medium text-foreground">
                {t('nav.tags')}
              </div>
              <div className="flex items-center gap-2">
                {filterTags.length > 0 && (
                  <button
                    onClick={() => {
                      clearFilterTags();
                      if (currentPage !== 'home') onNavigate('home');
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('common.clear', '清空')}
                  </button>
                )}
                <button
                  onClick={closeTagPopover}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {uniqueTags.map((tag) => {
                  const active = filterTags.includes(tag) && currentPage === 'home';
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        toggleFilterTag(tag);
                        if (currentPage !== 'home') onNavigate('home');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${active
                        ? 'bg-primary text-white'
                        : 'bg-muted text-foreground/80 hover:bg-primary hover:text-white'
                        }`}
                    >
                      <HashIcon className="w-4 h-4" />
                      <span className="truncate max-w-[14rem]">{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => setIsResourcesOpen(true)}
          title={isCollapsed ? t('nav.resources') : undefined}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors`}
        >
          <LinkIcon className="w-4 h-4" />
          {!isCollapsed && <span>{t('nav.resources')}</span>}
        </button>
        <button
          onClick={() => onNavigate('settings')}
          title={isCollapsed ? t('header.settings') : undefined}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings'
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
        >
          <SettingsIcon className="w-4 h-4" />
          {!isCollapsed && <span>{t('header.settings')}</span>}
        </button>
      </div>

      <ResourcesModal isOpen={isResourcesOpen} onClose={() => setIsResourcesOpen(false)} />
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        folder={editingFolder}
      />
      {isPasswordModalOpen && passwordFolder && (
        <PrivateFolderUnlockModal
          isOpen={isPasswordModalOpen}
          folderName={passwordFolder.name}
          onClose={() => {
            setIsPasswordModalOpen(false);
            setPasswordFolder(null);
          }}
          onSuccess={() => {
            if (passwordFolder) {
              unlockFolder(passwordFolder.id);
              selectFolder(passwordFolder.id);
              if (currentPage !== 'home') onNavigate('home');
            }
            setIsPasswordModalOpen(false);
            setPasswordFolder(null);
          }}
        />
      )}
    </aside>
  );
}
