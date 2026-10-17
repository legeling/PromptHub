import type { ReactElement } from "react";
import { ListChecksIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePromptStore } from "../../stores/prompt.store";

export function PromptSelectionToggle({
  count,
}: {
  count: number;
}): ReactElement | null {
  const { t } = useTranslation();
  const active = usePromptStore((state) => state.isBatchSelectionActive);
  const enter = usePromptStore((state) => state.enterBatchSelection);
  const exit = usePromptStore((state) => state.exitBatchSelection);
  if (active && count > 0) return null;
  const Icon = active ? XIcon : ListChecksIcon;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!active && count === 0}
      onClick={active ? exit : enter}
      className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {t(active ? "common.cancel" : "prompt.multiSelect")}
    </button>
  );
}
