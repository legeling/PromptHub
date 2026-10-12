import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export const BATCH_MENU_ITEM =
  "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

interface PromptBatchMenuProps {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
  onClose?: () => void;
}

function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ),
  );
  const index = items.findIndex((item) => item === document.activeElement);
  const next =
    event.key === "ArrowDown"
      ? (index + 1) % items.length
      : event.key === "ArrowUp"
        ? (index - 1 + items.length) % items.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : null;
  if (next !== null) {
    event.preventDefault();
    items[next]?.focus();
  }
}

function usePromptBatchMenu(onClose: PromptBatchMenuProps["onClose"]) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);
  const finish = useCallback(() => {
    dismiss();
    triggerRef.current?.focus();
  }, [dismiss]);
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const outside = (event: MouseEvent): void => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      )
        dismiss();
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, dismiss]);
  return { open, setOpen, containerRef, triggerRef, menuRef, dismiss, finish };
}

/** Action menus for prompt selection and batch commands, including folder choices. */
export function PromptBatchMenu({
  label,
  trigger,
  children,
  align = "left",
  className = "",
  onClose,
}: PromptBatchMenuProps): ReactElement {
  const menu = usePromptBatchMenu(onClose);
  const id = useId();
  return (
    <div
      ref={menu.containerRef}
      className={`relative ${className}`}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          menu.dismiss();
      }}
    >
      <button
        ref={menu.triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? id : undefined}
        onClick={() => (menu.open ? menu.dismiss() : menu.setOpen(true))}
        className="flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {trigger}
      </button>
      {menu.open ? (
        <div
          ref={menu.menuRef}
          id={id}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-50 mt-1 max-h-72 w-44 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              menu.finish();
              return;
            }
            moveMenuFocus(event);
          }}
        >
          {children(menu.finish)}
        </div>
      ) : null}
    </div>
  );
}
