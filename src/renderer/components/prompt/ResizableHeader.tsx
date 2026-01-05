import { useState, useCallback, useRef } from 'react';
import type { ColumnConfig } from '../../hooks/useTableConfig';

interface ResizableHeaderProps {
  column: ColumnConfig;
  children: React.ReactNode;
  onResize: (columnId: string, width: number) => void;
  className?: string;
}

export function ResizableHeader({
  column,
  children,
  onResize,
  className = '',
}: ResizableHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!column.resizable) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = column.width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(column.minWidth, startWidthRef.current + diff);
      onResize(column.id, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [column, onResize]);

  return (
    <th
      className="relative p-0"
      style={{ width: column.width, minWidth: column.minWidth }}
    >
      {/* 背景和内容容器 */}
      <div className={`bg-muted/30 dark:bg-muted/20 h-full ${className}`}>
        {children}
      </div>
      
      {/* 拖拽手柄 - 放在最外层，使用高 z-index */}
      {column.resizable && (
        <div
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-50"
          style={{ transform: 'translateX(50%)' }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 可见的拖拽条 / Visible resize bar */}
          <div 
            className={`
              absolute top-1 bottom-1 left-1/2 -translate-x-1/2 w-0.5 rounded-full
              transition-all duration-150
              ${isResizing ? 'bg-primary w-1' : isHovering ? 'bg-primary/70' : 'bg-transparent'}
            `}
          />
        </div>
      )}
    </th>
  );
}
