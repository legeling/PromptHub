import type { ReactNode } from "react";

interface PromptDetailRowProps {
  label: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

/** Section heading and actions stay above full-width detail content. */
export function PromptDetailRow({
  label,
  icon,
  action,
  children,
}: PromptDetailRowProps): JSX.Element {
  return (
    <div
      data-testid="prompt-detail-row"
      className="min-w-0 border-b border-border/70 py-3"
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium leading-5 text-muted-foreground">
          <span className="shrink-0">{icon}</span>
          <span className="min-w-0">{label}</span>
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      <div
        data-testid="prompt-detail-value"
        className="min-w-0 w-full text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]"
      >
        {children}
      </div>
    </div>
  );
}
