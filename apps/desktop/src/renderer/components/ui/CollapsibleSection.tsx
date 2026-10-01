import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

export interface CollapsibleSectionProps {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A keyboard-accessible collapsible container whose content stays mounted
 * when collapsed (display-only toggle). Used by the prompt editor so
 * secondary fields never lose form state on collapse.
 * 可折叠分组容器：收起时仅隐藏、不卸载，表单状态不受影响。
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 transition-transform duration-base ${
            open ? "" : "-rotate-90"
          }`}
        />
        {title}
      </button>
      <div
        id={contentId}
        hidden={!open}
        className="space-y-4 pt-1"
      >
        {children}
      </div>
    </section>
  );
}
