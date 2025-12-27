import { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  MeasuringStrategy,
  defaultDropAnimationSideEffects,
  DropAnimation,
  pointerWithin,
  closestCenter,
  CollisionDetection,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { SortableTreeItem } from './SortableTreeItem';
import { getFlattenedTree, getProjection, removeChildrenOf, indentationWidth, FlattenedItem } from './utilities';
import type { Folder } from '../../../../shared/types';

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};

interface SortableTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  unlockedFolderIds: Set<string>;
  isCollapsed: boolean;
  currentPage: string;
  onSelectFolder: (folder: Folder) => void;
  onEditFolder: (folder: Folder) => void;
  onToggleExpand: (folderId: string) => void;
  onReorderFolders: (items: FlattenedItem[], activeId: string) => void;
}

const ITEM_HEIGHT = 33; 

export function SortableTree({
  folders,
  selectedFolderId,
  expandedIds,
  unlockedFolderIds,
  isCollapsed,
  currentPage,
  onSelectFolder,
  onEditFolder,
  onToggleExpand,
  onReorderFolders,
}: SortableTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [minHeight, setMinHeight] = useState<number | null>(null);
  const [itemHeight, setItemHeight] = useState(ITEM_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastOverIdRef = useRef<string | null>(null);
  const justDraggedRef = useRef(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { distance: 8 } 
    }),
    useSensor(KeyboardSensor, {})
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
  }, []);

  const { setNodeRef: setBottomDroppableRef } = useDroppable({
    id: 'tree-bottom-spacer',
  });

  // 1. 获取完整的扁平化树
  const flattenedItems = useMemo(() => {
    return getFlattenedTree(folders, expandedIds);
  }, [folders, expandedIds]);
  const hasChildrenById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const folder of folders) {
      if (folder.parentId !== undefined && folder.parentId !== null) {
        map.set(folder.parentId, true);
      }
    }
    return map;
  }, [folders]);
  const activeHasChildren = activeId ? hasChildrenById.has(activeId) : false;

  // 2. 稳定的渲染列表：拖拽期间不改变物理顺序，防止抖动
  const itemsToRender = useMemo(() => {
    // 过滤掉被拖拽项的子节点
    if (activeId) {
      return removeChildrenOf(flattenedItems, [activeId]);
    }
    return flattenedItems;
  }, [flattenedItems, activeId]);

  // 3. 计算投影（基于当前的 overId 和 offsetLeft）
  const projected = useMemo(() => {
    if (activeId && overId) {
      const actualOverId =
        overId === 'tree-bottom-spacer' && itemsToRender.length > 0
          ? itemsToRender[itemsToRender.length - 1].id
          : overId;

      const nextProjection = getProjection(
        itemsToRender,
        activeId,
        actualOverId,
        offsetLeft,
        indentationWidth
      );
      if (activeHasChildren && nextProjection.depth > 0) {
        return { depth: 0, parentId: null };
      }
      return nextProjection;
    }
    return null;
  }, [itemsToRender, activeId, overId, offsetLeft, activeHasChildren]);

  const activeItem = activeId 
    ? flattenedItems.find(({ id }) => id === activeId) 
    : null;

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const firstItem = containerRef.current.querySelector('[data-tree-item]') as HTMLElement | null;
    if (!firstItem) return;
    const styles = window.getComputedStyle(firstItem);
    const marginTop = Number.parseFloat(styles.marginTop || '0');
    const marginBottom = Number.parseFloat(styles.marginBottom || '0');
    const nextHeight = firstItem.getBoundingClientRect().height + marginTop + marginBottom;
    if (Number.isFinite(nextHeight) && nextHeight > 0 && Math.abs(nextHeight - itemHeight) > 0.5) {
      setItemHeight(nextHeight);
    }
  }, [itemsToRender.length, isCollapsed, itemHeight]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setOverId(event.active.id as string);
    lastOverIdRef.current = event.active.id as string;
    justDraggedRef.current = true;
    document.body.style.setProperty('cursor', 'grabbing');

    if (containerRef.current) {
      setMinHeight(containerRef.current.offsetHeight);
    }
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setOffsetLeft(event.delta.x);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const nextOverId = event.over?.id as string | undefined;
    if (nextOverId) {
      lastOverIdRef.current = nextOverId;
      setOverId(nextOverId);
      return;
    }
    if (lastOverIdRef.current) {
      setOverId(lastOverIdRef.current);
    }
  }, []);

  const resetState = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setMinHeight(null);
    document.body.style.removeProperty('cursor');
    window.setTimeout(() => {
      justDraggedRef.current = false;
      lastOverIdRef.current = null;
    }, 80);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { over } = event;
    
    if (activeId && over && projected) {
      const actualOverId = over.id === 'tree-bottom-spacer' && itemsToRender.length > 0
        ? itemsToRender[itemsToRender.length - 1].id
        : over.id as string;

      const activeIndex = itemsToRender.findIndex(({ id }) => id === activeId);
      const overIndex = itemsToRender.findIndex(({ id }) => id === actualOverId);
      
      if (activeIndex !== -1 && overIndex !== -1) {
        // 1. Perform the physical reorder on the rendered list
        const reordered = arrayMove(itemsToRender, activeIndex, overIndex);
        
        // 2. Find the item in its new position and apply the projected depth/parent
        const movedItemIndex = reordered.findIndex(item => item.id === activeId);
        if (movedItemIndex !== -1) {
          reordered[movedItemIndex] = {
            ...reordered[movedItemIndex],
            depth: projected.depth,
            parentId: projected.parentId
          };
        }
        
        // 3. Persist changes
        onReorderFolders(reordered, activeId);
      }
    }

    resetState();
  }, [activeId, itemsToRender, projected, onReorderFolders, resetState]);

  const handleDragCancel = useCallback(() => {
    resetState();
  }, [resetState]);

  const handleSelectFolder = useCallback(
    (folder: Folder) => {
      if (justDraggedRef.current) return;
      onSelectFolder(folder);
    },
    [onSelectFolder]
  );

  // 计算指示线位置索引
  const overIndex = useMemo(() => {
    if (!overId) return -1;
    if (overId === 'tree-bottom-spacer') return itemsToRender.length - 1;
    return itemsToRender.findIndex(item => item.id === overId);
  }, [overId, itemsToRender]);

  const activeIndex = useMemo(() => {
    if (!activeId) return -1;
    return itemsToRender.findIndex(item => item.id === activeId);
  }, [activeId, itemsToRender]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div 
        ref={containerRef} 
        className="relative flex flex-col min-h-[200px]"
        style={{ height: minHeight ?? 'auto' }}
      >
        <SortableContext items={itemsToRender.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {itemsToRender.map((item) => (
              <SortableTreeItem
                key={item.id}
                id={item.id}
                folder={item}
                style={item.id === activeId ? { opacity: 0.2 } : undefined}
                depth={item.id === activeId && projected ? projected.depth : item.depth}
                indentationWidth={indentationWidth}
                collapsed={isCollapsed}
                hasChildren={hasChildrenById.has(item.id)}
                isExpanded={expandedIds.has(item.id)}
                isActive={selectedFolderId === item.id && currentPage === 'home'}
                isLocked={item.isPrivate && !unlockedFolderIds.has(item.id)}
                onSelect={() => handleSelectFolder(item)}
                onEdit={() => onEditFolder(item)}
                onToggleExpand={() => onToggleExpand(item.id)}
              />
            ))}
          </div>
        </SortableContext>

        {/* 底部感应区 */}
        <div 
          ref={setBottomDroppableRef} 
          className="flex-1 min-h-[60px] w-full mt-1"
          style={{ display: activeId ? 'block' : 'none' }}
        />

        {/* Yuque-style 精准指示线 */}
        {activeId && overId && projected && overIndex !== -1 && (
          <div 
            className="absolute left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none flex items-center transition-all duration-100 ease-out"
            style={{
              top: (overIndex + (activeIndex < overIndex ? 1 : 0)) * itemHeight - 1,
              left: (projected.depth * indentationWidth) + 12,
              width: `calc(100% - ${(projected.depth * indentationWidth) + 24}px)`,
              boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)'
            }}
          >
            <div className="absolute -left-1 w-2 h-2 rounded-full bg-primary border-2 border-background shadow-sm" />
          </div>
        )}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={dropAnimationConfig} zIndex={1000}>
          {activeItem ? (
            <div style={{ listStyle: 'none' }}>
              <SortableTreeItem
                id={activeItem.id}
                folder={activeItem}
                depth={projected?.depth ?? activeItem.depth}
                indentationWidth={indentationWidth}
                collapsed={isCollapsed}
                hasChildren={hasChildrenById.has(activeItem.id)}
                isExpanded={expandedIds.has(activeItem.id)}
                isActive={selectedFolderId === activeItem.id && currentPage === 'home'}
                isLocked={activeItem.isPrivate && !unlockedFolderIds.has(activeItem.id)}
                style={{
                  backgroundColor: 'var(--sidebar-accent)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  opacity: 0.95,
                  borderRadius: '8px',
                  cursor: 'grabbing'
                }}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
