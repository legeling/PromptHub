import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCwIcon } from "lucide-react";

export function ResourceDistributionNotice({
  unknown,
  error,
  onRefresh,
}: {
  unknown: number;
  error?: string | null;
  onRefresh: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!unknown && !error) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-6 py-2 text-xs text-muted-foreground"
    >
      <span title={error ?? undefined}>
        {error
          ? t("resourceLibrary.statusFailed")
          : t("resourceLibrary.statusUnknown", { count: unknown })}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        aria-label={t("common.refresh")}
        title={t("common.refresh")}
        className="rounded-md p-1.5 hover:bg-accent"
      >
        <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
