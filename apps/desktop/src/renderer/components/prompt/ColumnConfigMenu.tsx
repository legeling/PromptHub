import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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

  // Filter configurable columns (exclude checkbox and actions)
  const configurableColumns = columns.filter(
    col => col.id !== 'checkbox' && col.id !== 'actions'
  );
  const columnConfigLabel = t('prompt.columnConfig');

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggleMenu}
        aria-label={columnConfigLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors
          ${isOpen 
            ? 'bg-primary/10 text-primary border-primary/30' 
            : 'text-muted-foreground hover:text-foreground hover:bg-accent border-border'
          }
        `}
        title={columnConfigLabel}
      >
        <SettingsIcon aria-hidden="true" className="w-3.5 h-3.5" />
        <span>{columnConfigLabel}</span>
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          role="menu"
          aria-label={columnConfigLabel}
          className="fixed w-64 py-2 rounded-lg bg-popover border border-border shadow-xl z-[9999]"
          style={{ top: menuPosition.top, right: menuPosition.right }}
        >
          <div className="px-3 py-2 border-b border-border mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {columnConfigLabel}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {configurableColumns.map((column) => (
              <button
                key={column.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={column.visible}
                onClick={() => onToggleVisibility(column.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors group"
              >
                <div className="shrink-0">
                  {column.visible ? (
                    <EyeIcon aria-hidden="true" className="w-4 h-4 text-primary" />
                  ) : (
                    <EyeOffIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${column.visible ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {t(column.label) || column.label}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                onReset();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RotateCcwIcon aria-hidden="true" className="w-4 h-4" />
              <span>{t('common.reset') || '重置'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
