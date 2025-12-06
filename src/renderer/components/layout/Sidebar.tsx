import { useState, useEffect } from 'react';
import { StarIcon, HashIcon, PlusIcon, LayoutGridIcon, LinkIcon, SettingsIcon, MoreHorizontalIcon, GripVerticalIcon, LockIcon } from 'lucide-react';
import { useFolderStore } from '../../stores/folder.store';
import { usePromptStore } from '../../stores/prompt.store';
import { ResourcesModal } from '../resources/ResourcesModal';
import { FolderModal } from '../folder';
import { PasswordModal } from '../folder/PasswordModal';
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
  DragOverEvent,
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
}

function NavItem({ icon, label, count, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
        transition-all duration-150
        ${active
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        }
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-foreground/60">
          {count}
        </span>
      )}
    </button>
  );
}

// 可排序的文件夹项
interface SortableFolderItemProps {
  folder: Folder;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  isOver?: boolean;
  isLocked?: boolean;
}

function SortableFolderItem({ folder, isActive, onSelect, onEdit, isOver, isLocked }: SortableFolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });

  // 作为 Prompt 的放置目标
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
      {/* 拖拽手柄 */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVerticalIcon className="w-3 h-3 text-sidebar-foreground/40" />
      </button>

      <button
        onClick={onSelect}
        className={`
          flex-1 flex items-center gap-3 px-2 py-2 rounded-lg text-sm
          transition-all duration-150
          ${isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          }
        `}
      >
        <span className="text-base">{folder.icon || '📁'}</span>
        <span className="flex-1 text-left truncate flex items-center gap-1">
          {folder.name}
          {isLocked && <LockIcon className="w-3 h-3 text-muted-foreground/70" />}
        </span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent transition-all"
      >
        <MoreHorizontalIcon className="w-4 h-4 text-sidebar-foreground/50" />
      </button>
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
  const filterTags = usePromptStore((state) => state.filterTags);
  const toggleFilterTag = usePromptStore((state) => state.toggleFilterTag);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // 检测是否为 macOS 平台
    const platform = navigator.userAgent.toLowerCase();
    setIsMac(platform.includes('mac'));
  }, []);

  const favoriteCount = prompts.filter((p) => p.isFavorite).length;
  const allTags = prompts.flatMap((p) => p.tags);
  const uniqueTags = [...new Set(allTags)];

  // 处理文件夹拖拽结束
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
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* 顶部留白区域 - 仅 macOS 需要给窗口控制按钮留空间 */}
      {isMac && <div className="h-10 titlebar-drag shrink-0" />}

      {/* 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {/* 主导航 */}
        <div className="space-y-1">
          <NavItem
            icon={<LayoutGridIcon className="w-5 h-5" />}
            label={t('nav.allPrompts')}
            count={prompts.length}
            active={selectedFolderId === null && currentPage === 'home'}
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
            onClick={() => {
              selectFolder('favorites');
              if (currentPage !== 'home') onNavigate('home');
            }}
          />
        </div>

        {/* 文件夹区域 */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
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

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={folders.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {folders.map((folder) => (
                  <SortableFolderItem
                    key={folder.id}
                    folder={folder}
                    isActive={selectedFolderId === folder.id && currentPage === 'home'}
                    isLocked={folder.isPrivate && !unlockedFolderIds.has(folder.id)}
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
                {folders.length === 0 && (
                  <p className="px-3 py-4 text-sm text-sidebar-foreground/50 text-center">
                    {t('folder.empty')}
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* 标签区域 */}
        {uniqueTags.length > 0 && (
          <div className="pt-4">
            <div className="flex items-center px-3 mb-2">
              <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                {t('nav.tags')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3">
              {uniqueTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    toggleFilterTag(tag);
                    if (currentPage !== 'home') onNavigate('home');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${filterTags.includes(tag) && currentPage === 'home'
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
        )}
      </nav>

      {/* 底部操作 */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => setIsResourcesOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          <span>{t('nav.resources')}</span>
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings'
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>{t('header.settings')}</span>
        </button>
      </div>

      {/* 推荐资源弹窗 */}
      <ResourcesModal
        isOpen={isResourcesOpen}
        onClose={() => setIsResourcesOpen(false)}
      />

      {/* 文件夹弹窗 */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        folder={editingFolder}
      />

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPasswordFolder(null);
        }}
        onSubmit={(password) => {
          if (passwordFolder && password === passwordFolder.password) {
            unlockFolder(passwordFolder.id);
            selectFolder(passwordFolder.id);
            if (currentPage !== 'home') onNavigate('home');
            setIsPasswordModalOpen(false);
            setPasswordFolder(null);
          } else {
            // Error handling is inside PasswordModal? No, PasswordModal doesn't know correct password.
            // I need to handle error in PasswordModal or pass error prop?
            // PasswordModal handles empty password, but incorrect password needs to be handled here.
            // Wait, PasswordModal onSubmit just passes password.
            // I should probably show toast or alert.
            alert('密码错误');
          }
        }}
      />
    </aside>
  );
}
