import { CSSProperties, HTMLAttributes, forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRightIcon, MoreHorizontalIcon, LockIcon } from 'lucide-react';
import type { Folder } from '../../../../shared/types';
import { renderFolderIcon } from '../folderIconHelper';
import { indentationWidth } from './utilities';

export interface SortableTreeItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'id'> {
  id: string;
  folder: Folder;
  depth: number;
  indentationWidth: number;
  indicator?: boolean;
  collapsed?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  isActive?: boolean;
  isLocked?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onToggleExpand?: () => void;
  style?: CSSProperties;
}

export const SortableTreeItem = forwardRef<HTMLLIElement, SortableTreeItemProps>(
  ({
    id,
    folder,
    depth,
    indentationWidth,
    indicator,
    collapsed,
    hasChildren,
    isExpanded,
    isActive,
    isLocked,
    onSelect,
    onEdit,
    onToggleExpand,
    style: styleProp,
    ...props
  }, ref) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style: CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      ...styleProp,
    };

    const paddingLeft = collapsed ? 0 : depth * indentationWidth;

    return (
      <li
        ref={setNodeRef}
        style={style}
        data-tree-item
        className={`list-none box-border mb-0.5 relative select-none transition-opacity duration-150 ${isDragging ? 'z-50 opacity-0' : 'opacity-100'}`}
        {...props}
      >
        <div
          {...attributes}
          {...listeners}
          className={`
            group/folder relative flex items-center transition-[background-color] duration-200 rounded-lg min-h-[32px] cursor-default
            ${isActive
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }
          `}
          style={{
            paddingLeft: paddingLeft + 8
          }}
        >
          {/* 1. Collapse/Expand Arrow - Larger hit area */}
          {!collapsed && (
            <div className="flex items-center justify-center w-6 h-6 shrink-0 mr-0.5 relative z-30">
              {hasChildren && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.();
                  }}
                  className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <ChevronRightIcon
                    className={`
                      w-4 h-4 transition-transform duration-200 text-sidebar-foreground/40
                      ${isExpanded ? 'rotate-90' : ''}
                    `}
                  />
                </button>
              )}
            </div>
          )}

          {/* 2. Folder Content */}
          <div
            onClick={onSelect}
            className={`
              flex-1 flex items-center gap-2 py-1.5 rounded-lg text-sm select-none overflow-hidden
              ${collapsed ? 'flex-col justify-center gap-1' : ''}
            `}
          >
            <span className="text-base flex items-center justify-center w-5 h-5 shrink-0">
              {renderFolderIcon(folder.icon)}
            </span>

            {!collapsed ? (
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <span className="truncate font-normal tracking-tight">
                  {folder.name}
                </span>
                {isLocked && <LockIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground/70" />}
              </div>
            ) : (
              <span className="text-[10px] leading-none text-sidebar-foreground/60 max-w-full truncate">
                {folder.name.slice(0, 2)}
              </span>
            )}
          </div>

          {/* 3. Edit Button */}
          {!collapsed && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
              className={`
                p-1.5 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all mr-1 z-30
                ${isActive ? 'opacity-60' : ''}
              `}
            >
              <MoreHorizontalIcon className="w-4 h-4 text-sidebar-foreground/50" />
            </button>
          )}
        </div>
      </li>
    );
  }
);
