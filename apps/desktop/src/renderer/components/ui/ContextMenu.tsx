
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { ChevronRightIcon, CornerDownRightIcon } from 'lucide-react';

export interface ContextMenuItem {
    label: string;
    description?: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'destructive';
    shortcut?: string;
    disabled?: boolean;
    insetLevel?: number;
    children?: ContextMenuItem[];
    childrenClassName?: string;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const closeSubmenuTimerRef = useRef<number | null>(null);
    const [openSubmenu, setOpenSubmenu] = useState<{ index: number; direction: 'left' | 'right'; top: number } | null>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenSubmenu(null);
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
            if (closeSubmenuTimerRef.current) {
                window.clearTimeout(closeSubmenuTimerRef.current);
            }
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose, x, y]);

    const cancelScheduledSubmenuClose = () => {
        if (closeSubmenuTimerRef.current) {
            window.clearTimeout(closeSubmenuTimerRef.current);
            closeSubmenuTimerRef.current = null;
        }
    };

    const scheduleSubmenuClose = (index: number) => {
        cancelScheduledSubmenuClose();
        closeSubmenuTimerRef.current = window.setTimeout(() => {
            setOpenSubmenu((current) => (current?.index === index ? null : current));
            closeSubmenuTimerRef.current = null;
        }, 140);
    };

    const handleOpenSubmenu = (index: number, element: HTMLDivElement) => {
        cancelScheduledSubmenuClose();
        const rect = element.getBoundingClientRect();
        const estimatedSubmenuWidth = 256;
        const estimatedSubmenuHeight = 280;
        const direction = rect.right + estimatedSubmenuWidth > window.innerWidth - 8 ? 'left' : 'right';
        const availableTop = window.innerHeight - rect.top - estimatedSubmenuHeight - 8;
        const top = Math.max(8 - rect.top, availableTop < -4 ? availableTop : -4);

        setOpenSubmenu({ index, direction, top });
    };

    const handleMenuClose = () => {
        setOpenSubmenu(null);
        onClose();
    };

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[99999] min-w-[160px] py-1 bg-popover rounded-md border border-border shadow-lg animate-in fade-in zoom-in-95 duration-quick ease-enter"
            style={{ left: x, top: y }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.map((item, index) => {
                const hasChildren = Boolean(item.children?.length);
                const isSubmenuOpen = openSubmenu?.index === index;

                return (
                    <div
                        key={index}
                        className="relative"
                        onMouseEnter={(event) => {
                            if (hasChildren) {
                                handleOpenSubmenu(index, event.currentTarget);
                                return;
                            }

                            setOpenSubmenu(null);
                        }}
                        onMouseLeave={() => {
                            if (hasChildren) {
                                scheduleSubmenuClose(index);
                            }
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (item.disabled || hasChildren) {
                                    return;
                                }

                                item.onClick?.();
                                handleMenuClose();
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
                            {hasChildren && <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>

                        {hasChildren && isSubmenuOpen ? (
                            <div
                                className={clsx(
                                    "absolute top-0 z-[100000]",
                                    openSubmenu?.direction === 'left'
                                        ? "right-full mr-1 translate-x-2 pr-2"
                                        : "left-full ml-1 -translate-x-2 pl-2",
                                )}
                                style={{ top: openSubmenu.top }}
                                onMouseEnter={cancelScheduledSubmenuClose}
                                onMouseLeave={() => scheduleSubmenuClose(index)}
                            >
                                <div
                                    className={clsx(
                                        "min-w-[220px] rounded-md border border-border bg-popover py-1 shadow-lg",
                                        item.childrenClassName,
                                    )}
                                >
                                    {item.children?.map((child, childIndex) => (
                                        <button
                                            key={`${index}-${childIndex}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (child.disabled) {
                                                    return;
                                                }

                                                child.onClick?.();
                                                handleMenuClose();
                                            }}
                                            disabled={child.disabled}
                                            style={child.insetLevel ? ({ paddingLeft: `${12 + child.insetLevel * 18}px` } as CSSProperties) : undefined}
                                            className={clsx(
                                                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                                                "hover:bg-accent hover:text-accent-foreground",
                                                child.variant === 'destructive' && "text-destructive hover:text-destructive",
                                                child.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
                                            )}
                                        >
                                            {child.insetLevel ? (
                                                <CornerDownRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                            ) : null}
                                            {child.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{child.icon}</span>}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{child.label}</span>
                                                {child.description ? (
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {child.description}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {child.shortcut && <span className="ml-2 text-xs text-muted-foreground">{child.shortcut}</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>,
        document.body
    );
}
