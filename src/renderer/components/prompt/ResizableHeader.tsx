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
      className={`relative ${className}`}
      style={{ width: column.width, minWidth: column.minWidth }}
    >
      {children}
      {column.resizable && (
        <div
          className={`
            absolute top-0 right-0 h-full w-1 cursor-col-resize
            hover:bg-primary/50 active:bg-primary
            transition-colors duration-150
            ${isResizing ? 'bg-primary' : 'bg-transparent'}
          `}
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </th>
  );
}
