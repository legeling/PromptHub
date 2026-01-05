import { useState, useCallback, useEffect } from 'react';

export interface ColumnConfig {
  id: string;
  label: string;
  description?: string;  // 列描述 / Column description
  visible: boolean;
  width: number;
  minWidth: number;
  maxWidth?: number;
  resizable: boolean;
  reorderable: boolean;
  sticky?: 'left' | 'right';
}

export interface TableConfig {
  columns: ColumnConfig[];
  columnOrder: string[];
}

const STORAGE_KEY = 'prompthub-table-config';

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: '', visible: true, width: 40, minWidth: 40, resizable: false, reorderable: false, sticky: 'left' },
  { id: 'title', label: 'prompt.title', visible: true, width: 160, minWidth: 100, maxWidth: 300, resizable: true, reorderable: true },
  { id: 'description', label: 'prompt.description', visible: false, width: 200, minWidth: 100, maxWidth: 400, resizable: true, reorderable: true },
  { id: 'systemPrompt', label: 'prompt.systemPrompt', visible: false, width: 200, minWidth: 100, maxWidth: 400, resizable: true, reorderable: true },
  { id: 'userPrompt', label: 'prompt.userPrompt', visible: true, width: 220, minWidth: 120, maxWidth: 400, resizable: true, reorderable: true },
  { id: 'aiResponse', label: 'prompt.aiResponse', visible: true, width: 220, minWidth: 120, maxWidth: 400, resizable: true, reorderable: true },
  { id: 'tags', label: 'prompt.tags', visible: false, width: 150, minWidth: 80, maxWidth: 300, resizable: true, reorderable: true },
  { id: 'variables', label: 'prompt.variables', visible: true, width: 80, minWidth: 60, maxWidth: 120, resizable: true, reorderable: true },
  { id: 'usageCount', label: 'prompt.usageCount', visible: true, width: 90, minWidth: 70, maxWidth: 120, resizable: true, reorderable: true },
  { id: 'updatedAt', label: 'prompt.updatedAt', visible: false, width: 140, minWidth: 120, maxWidth: 200, resizable: true, reorderable: true },
  { id: 'actions', label: 'prompt.actions', visible: true, width: 140, minWidth: 120, resizable: false, reorderable: false, sticky: 'right' },
];

const DEFAULT_ORDER = DEFAULT_COLUMNS.map(col => col.id);

export function useTableConfig() {
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_ORDER);

  // Load config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as TableConfig;
        // Merge with defaults to handle new columns
        // 关键属性（resizable, minWidth, sticky, reorderable）始终使用默认值
        // Critical properties always use default values
        const mergedColumns = DEFAULT_COLUMNS.map(defaultCol => {
          const savedCol = parsed.columns.find(c => c.id === defaultCol.id);
          if (!savedCol) return defaultCol;
          
          // Only restore user-customizable properties (visible, width)
          // 只恢复用户可自定义的属性
          return {
            ...defaultCol,
            visible: savedCol.visible ?? defaultCol.visible,
            width: savedCol.width ?? defaultCol.width,
          };
        });
        setColumns(mergedColumns);
        // Only use saved order if it contains all current column ids
        if (parsed.columnOrder && parsed.columnOrder.length === DEFAULT_ORDER.length) {
          setColumnOrder(parsed.columnOrder);
        }
      }
    } catch (e) {
      console.warn('Failed to load table config:', e);
    }
  }, []);

  // Save config to localStorage
  const saveConfig = useCallback((cols: ColumnConfig[], order: string[]) => {
    try {
      const config: TableConfig = { columns: cols, columnOrder: order };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save table config:', e);
    }
  }, []);

  // Toggle column visibility
  const toggleColumnVisibility = useCallback((columnId: string) => {
    setColumns(prev => {
      const updated = prev.map(col =>
        col.id === columnId ? { ...col, visible: !col.visible } : col
      );
      saveConfig(updated, columnOrder);
      return updated;
    });
  }, [columnOrder, saveConfig]);

  // Update column width
  const updateColumnWidth = useCallback((columnId: string, width: number) => {
    setColumns(prev => {
      const updated = prev.map(col => {
        if (col.id !== columnId) return col;
        const clampedWidth = Math.max(
          col.minWidth,
          col.maxWidth ? Math.min(width, col.maxWidth) : width
        );
        return { ...col, width: clampedWidth };
      });
      saveConfig(updated, columnOrder);
      return updated;
    });
  }, [columnOrder, saveConfig]);

  // Reorder columns
  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    setColumnOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      saveConfig(columns, newOrder);
      return newOrder;
    });
  }, [columns, saveConfig]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setColumns(DEFAULT_COLUMNS);
    setColumnOrder(DEFAULT_ORDER);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get ordered and visible columns
  const getVisibleColumns = useCallback(() => {
    const stickyLeft = columns.filter(c => c.sticky === 'left' && c.visible);
    const stickyRight = columns.filter(c => c.sticky === 'right' && c.visible);
    const reorderable = columnOrder
      .map(id => columns.find(c => c.id === id))
      .filter((c): c is ColumnConfig => c !== undefined && c.visible && !c.sticky);
    
    return [...stickyLeft, ...reorderable, ...stickyRight];
  }, [columns, columnOrder]);

  return {
    columns,
    columnOrder,
    toggleColumnVisibility,
    updateColumnWidth,
    reorderColumns,
    resetToDefaults,
    getVisibleColumns,
  };
}
