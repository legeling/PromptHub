import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsIcon, EyeIcon, EyeOffIcon, RotateCcwIcon } from 'lucide-react';
import type { ColumnConfig } from '../../hooks/useTableConfig';

interface ColumnConfigMenuProps {
  columns: ColumnConfig[];
  onToggleVisibility: (columnId: string) => void;
  onReset: () => void;
}

export function ColumnConfigMenu({
  columns,
  onToggleVisibility,
  onReset,
}: ColumnConfigMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter configurable columns (exclude checkbox and actions)
  const configurableColumns = columns.filter(
    col => col.id !== 'checkbox' && col.id !== 'actions'
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          p-1.5 rounded-md transition-colors
          ${isOpen 
            ? 'bg-primary/10 text-primary' 
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }
        `}
        title={t('prompt.columnConfig') || '列设置'}
      >
        <SettingsIcon className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 py-2 rounded-lg bg-popover border border-border shadow-xl z-50">
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('prompt.columnConfig') || '列设置'}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {configurableColumns.map((column) => (
              <button
                key={column.id}
                onClick={() => onToggleVisibility(column.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                {column.visible ? (
                  <EyeIcon className="w-4 h-4 text-primary" />
                ) : (
                  <EyeOffIcon className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={column.visible ? 'text-foreground' : 'text-muted-foreground'}>
                  {t(column.label) || column.label}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => {
                onReset();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RotateCcwIcon className="w-4 h-4" />
              <span>{t('common.reset') || '重置'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
