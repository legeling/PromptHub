
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'destructive';
    shortcut?: string;
    disabled?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }

        // Adjust position if menu goes off screen
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) {
                menuRef.current.style.left = `${window.innerWidth - rect.width - 8}px`;
            }
            if (y + rect.height > window.innerHeight) {
                menuRef.current.style.top = `${window.innerHeight - rect.height - 8}px`;
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose, x, y]);

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[99999] min-w-[160px] py-1 bg-popover rounded-md border border-border shadow-lg animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.map((item, index) => (
                <button
                    key={index}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!item.disabled) {
                            item.onClick();
                            onClose();
                        }
                    }}
                    disabled={item.disabled}
                    className={clsx(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        item.variant === 'destructive' && "text-destructive hover:text-destructive",
                        item.disabled && "opacity-50 cursor-not-allowed pointer-events-none"
                    )}
                >
                    {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut && <span className="text-xs text-muted-foreground ml-2">{item.shortcut}</span>}
                </button>
            ))}
        </div>,
        document.body
    );
}
