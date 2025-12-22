import { useState, useEffect, useRef, useCallback } from 'react';
import { StarIcon, HashIcon, PlusIcon, LayoutGridIcon, LinkIcon, SettingsIcon, MoreHorizontalIcon, GripVerticalIcon, LockIcon, ChevronLeftIcon, ChevronRightIcon, XIcon, Folder as FolderIconLucide, FolderOpen, BookOpen, Code, Database, FileText, Image, Music, Video, Archive, Package, Briefcase, GraduationCap, Palette, Rocket, Heart, Star, Zap, Coffee, Home, Settings as SettingsIconLucide, BookMarked, Bug, Calendar, Camera, CheckCircle, Circle, Cloud, Cpu, CreditCard, Crown, Flame, Gamepad2, Gift, Globe, Hammer, Headphones, Inbox, Key, Layers, Lightbulb, Mail, Map, MessageSquare, Monitor, Moon, Newspaper, PenTool, Phone, Pizza, Plane, Play, Search, Shield, ShoppingCart, Smartphone, Sparkles, Sun, Tag, Target, Terminal, Trash2, Trophy, Truck, Tv, Upload, Users, Wallet, Watch, Wrench } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { ResourcesModal } from '../resources/ResourcesModal';
import { FolderModal, PrivateFolderUnlockModal } from '../folder';
import { useTranslation } from 'react-i18next';
import type { Folder } from '../../../shared/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// Render folder icon (emoji or Lucide icon)
// 渲染文件夹图标（emoji 或 Lucide 图标）
function renderFolderIcon(iconValue: string | undefined) {
  if (!iconValue) return '📁';
  
  if (iconValue.startsWith('icon:')) {
    const iconName = iconValue.replace('icon:', '');
    const iconMap: Record<string, any> = {
      'folder': FolderIconLucide, 'folder-open': FolderOpen, 'book-open': BookOpen, 'book-marked': BookMarked,
      'code': Code, 'database': Database, 'file-text': FileText, 'image': Image, 'music': Music, 'video': Video,
      'archive': Archive, 'package': Package, 'briefcase': Briefcase, 'graduation-cap': GraduationCap,
      'palette': Palette, 'rocket': Rocket, 'heart': Heart, 'star': Star, 'zap': Zap, 'coffee': Coffee,
      'home': Home, 'settings': SettingsIconLucide, 'bug': Bug, 'calendar': Calendar, 'camera': Camera,
      'check-circle': CheckCircle, 'circle': Circle, 'cloud': Cloud, 'cpu': Cpu, 'credit-card': CreditCard,
      'crown': Crown, 'flame': Flame, 'gamepad-2': Gamepad2, 'gift': Gift, 'globe': Globe, 'hammer': Hammer,
      'headphones': Headphones, 'inbox': Inbox, 'key': Key, 'layers': Layers, 'lightbulb': Lightbulb,
      'mail': Mail, 'map': Map, 'message-square': MessageSquare, 'monitor': Monitor, 'moon': Moon,
      'newspaper': Newspaper, 'pen-tool': PenTool, 'phone': Phone, 'pizza': Pizza, 'plane': Plane,
      'play': Play, 'search': Search, 'shield': Shield, 'shopping-cart': ShoppingCart, 'smartphone': Smartphone,
      'sparkles': Sparkles, 'sun': Sun, 'tag': Tag, 'target': Target, 'terminal': Terminal, 'trash-2': Trash2,
      'trophy': Trophy, 'truck': Truck, 'tv': Tv, 'upload': Upload, 'users': Users, 'wallet': Wallet,
      'watch': Watch, 'wrench': Wrench,
    };
    const IconComponent = iconMap[iconName];
    return IconComponent ? <IconComponent className="w-5 h-5" /> : '📁';
  }
  
  return iconValue;
}

// Sortable folder item
// 可排序的文件夹项
interface SortableFolderItemProps {
  folder: Folder;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  isOver?: boolean;
  isLocked?: boolean;
  collapsed?: boolean;
}

function SortableFolderItem({ folder, isActive, onSelect, onEdit, isOver, isLocked, collapsed }: SortableFolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });

  const { setNodeRef: setDroppableRef, isOver: isDropOver } = useDroppable({
    id: `folder-drop-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={(node) => {
        setSortableRef(node);
        setDroppableRef(node);
      }}
      style={style}
      className={`group relative flex items-center ${isDropOver ? 'bg-primary/20 rounded-lg ring-2 ring-primary' : ''}`}
    >
      {/* Drag handle - hidden in collapsed mode */}
      {!collapsed && (
        <button
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity absolute left-0"
        >
          <GripVerticalIcon className="w-3 h-3 text-sidebar-foreground/40" />
        </button>
      )}

      <button
        onClick={onSelect}
        title={collapsed ? folder.name : undefined}
        className={`
          flex-1 flex ${collapsed ? 'flex-col items-center justify-center gap-1' : 'items-center gap-3 pl-4'} px-2 py-2 rounded-lg text-sm
          transition-all duration-150
          ${isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          }
        `}
      >
        <span className="text-base flex items-center justify-center w-5 h-5 shrink-0">{renderFolderIcon(folder.icon)}</span>
        {!collapsed ? (
          <span className="flex-1 text-left truncate flex items-center gap-1">
            {folder.name}
            {isLocked && <LockIcon className="w-3 h-3 text-muted-foreground/70" />}
          </span>
        ) : (
          <span className="text-[10px] leading-none text-sidebar-foreground/60 max-w-full truncate">
            {folder.name.slice(0, 2)}
          </span>
        )}
      </button>

      {!collapsed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent transition-all absolute right-1"
        >
          <MoreHorizontalIcon className="w-4 h-4 text-sidebar-foreground/50" />
        </button>
      )}
    </div>
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
  const prompts = usePromptStore((state) => state.prompts);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
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
  const [tagPopoverPos, setTagPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const tagPopoverCloseTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const platform = navigator.userAgent.toLowerCase();
    setIsMac(platform.includes('mac'));
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
    let top = rect.top - 8;
    if (top + maxHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - 12 - maxHeight);
    }
    if (top < 12) top = 12;

    if (tagPopoverCloseTimerRef.current !== null) {
      window.clearTimeout(tagPopoverCloseTimerRef.current);
      tagPopoverCloseTimerRef.current = null;
    }

    setTagPopoverPos({ top, left });
    setIsTagPopoverOpen(true);
    setIsTagPopoverVisible(false);
    requestAnimationFrame(() => {
      setIsTagPopoverVisible(true);
    });
  };

  const favoriteCount = prompts.filter((p) => p.isFavorite).length;
  const allTags = prompts.flatMap((p) => p.tags);
  const uniqueTags = [...new Set(allTags)];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = folders.findIndex((f) => f.id === active.id);
      const newIndex = folders.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(folders, oldIndex, newIndex);
        reorderFolders(newOrder.map((f) => f.id));
      }
    }
  };

  return (
    <aside
      className={`group relative z-20 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? (isMac ? 'w-20' : 'w-16') : 'w-60'
        }`}
    >
      {/* Top spacing - Extra padding for Mac traffic lights */}
      {isMac && <div className="h-12 titlebar-drag shrink-0" />}

      {/* Collapse Button */}
      <div className="absolute top-1/2 -translate-y-1/2 -right-3 z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-100">
        <button
          onClick={() => {
            setIsCollapsed(!isCollapsed);
            closeTagPopover();
          }}
          className="h-6 w-6 rounded-full border border-border bg-background shadow-sm hover:shadow-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-all duration-200"
          title={isCollapsed ? t('common.expand', '展开') : t('common.collapse', '收起')}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeftIcon className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Navigation area - scrollable folders */}
      <div className="flex-1 flex flex-col overflow-hidden px-3 py-2">
        {/* Main navigation - fixed */}
        <div className="space-y-1 shrink-0">
          <NavItem
            icon={<LayoutGridIcon className="w-5 h-5" />}
            label={t('nav.allPrompts')}
            count={prompts.length}
            active={selectedFolderId === null && currentPage === 'home'}
            collapsed={isCollapsed}
            onClick={() => {
              selectFolder(null);
              if (currentPage !== 'home') onNavigate('home');
            }}
          />
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

        {/* Folder area with tags - scrollable when many folders */}
        <div className={`flex-1 flex flex-col mt-4 min-h-0 ${folders.length > 6 ? 'overflow-hidden' : ''}`}>
          <div className={`${folders.length > 6 ? 'flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide' : 'shrink-0'}`}>
            {!isCollapsed && (
            <div className="flex items-center justify-between px-3 mb-2 translate-all duration-200">
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
              <div className="h-px bg-sidebar-border/50 my-2 mx-2" />
            )}

            <div className="space-y-0.5">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={folders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {folders.map((folder) => (
                      <SortableFolderItem
                        key={folder.id}
                        folder={folder}
                        isActive={selectedFolderId === folder.id && currentPage === 'home'}
                        isLocked={folder.isPrivate && !unlockedFolderIds.has(folder.id)}
                        collapsed={isCollapsed}
                        onSelect={() => {
                          if (folder.isPrivate && !unlockedFolderIds.has(folder.id)) {
                            setPasswordFolder(folder);
                            setIsPasswordModalOpen(true);
                          } else {
                            selectFolder(folder.id);
                            if (currentPage !== 'home') onNavigate('home');
                          }
                        }}
                        onEdit={() => {
                          setEditingFolder(folder);
                          setIsFolderModalOpen(true);
                        }}
                      />
                    ))}
                    {folders.length === 0 && !isCollapsed && (
                      <p className="px-3 py-4 text-sm text-sidebar-foreground/50 text-center">
                        {t('folder.empty')}
                      </p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
          
          {/* Tags area - follows folders directly */}
          {uniqueTags.length > 0 && (
            <div className={`shrink-0 ${folders.length > 6 ? 'mt-auto' : ''}`}>
              {!isCollapsed && (
                <div className="flex items-center justify-between px-3 mb-2 pt-2 border-t border-sidebar-border/50">
                  <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    {t('nav.tags')}
                  </span>
                  {uniqueTags.length > 8 && (
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
                <div className="flex flex-wrap gap-1.5 px-3 animate-in fade-in slide-in-from-left-2 duration-300">
                  {(showAllTags ? uniqueTags : uniqueTags.slice(0, 8)).map((tag, index) => (
                    <button
                      key={tag}
                      onClick={() => {
                        toggleFilterTag(tag);
                        if (currentPage !== 'home') onNavigate('home');
                      }}
                      style={{ animationDelay: `${index * 30}ms` }}
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
              ) : (
                <div className="pt-2 border-t border-sidebar-border/50 flex flex-col items-center gap-2">
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
      </div>

      {isTagPopoverOpen && (
        <div
          ref={tagPopoverRef}
          className={`fixed z-[9999] origin-top-left transition-all duration-150 ${isTagPopoverVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}
          style={{ top: tagPopoverPos.top, left: tagPopoverPos.left, width: 320, maxHeight: 'min(420px, calc(100vh - 24px))' }}
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
