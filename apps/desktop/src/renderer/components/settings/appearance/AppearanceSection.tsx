import { useId, type ReactElement, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { useSettingsSearchTarget } from "../settings-search-target";

export function AppearanceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  const id = useId();
  const { ref, highlighted } = useSettingsSearchTarget(title);
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      tabIndex={highlighted ? -1 : undefined}
      data-setting-target={highlighted || undefined}
      className={`min-w-0 space-y-3 border-b border-border/70 pb-5 last:border-0 last:pb-0 ${highlighted ? "rounded-xl outline-none ring-2 ring-primary/50 ring-offset-4 ring-offset-background" : ""}`}
    >
      <div className="space-y-1">
        <h3 id={id} className="text-sm font-medium text-muted-foreground">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

export function AppearanceChoice({
  selected,
  label,
  onClick,
  children,
  className = "",
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`relative min-w-0 rounded-xl border p-3 text-left transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card/60 hover:border-primary/50 hover:bg-card"} ${className}`}
    >
      {children}
      {selected && (
        <span className="absolute right-2.5 top-2.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon aria-hidden="true" className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
