import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  HistoryIcon,
  RefreshCwIcon,
  Trash2Icon,
  PlayIcon,
  GitCompareIcon,
} from "lucide-react";
import type { PromptTestRun } from "@prompthub/shared/types/prompt-test-history";
import type { usePromptTestHistory } from "./usePromptTestHistory";
import { AiTestResults } from "./AiTestResults";

type HistoryState = ReturnType<typeof usePromptTestHistory>;

export function PromptTestHistory({
  history,
}: {
  history: HistoryState;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("testHistory.title")}
      className="flex min-h-0 w-[30%] min-w-40 max-w-72 shrink-0 flex-col border-r border-border bg-card"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <HistoryIcon
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h3 className="flex-1 text-sm font-semibold">
          {t("testHistory.title")}
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.loading && (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            {t("testHistory.loading")}
          </p>
        )}
        {history.rows.map((row) => (
          <button
            type="button"
            key={row.id}
            disabled={history.loading}
            onClick={() => void history.open(row.id)}
            aria-current={history.selected?.id === row.id ? "page" : undefined}
            className={`flex w-full flex-col gap-1 border-b border-l-2 border-border px-3 py-2.5 text-left disabled:opacity-50 ${history.selected?.id === row.id ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-accent"}`}
          >
            <span
              className="flex w-full min-w-0 items-center gap-2"
              title={t(
                row.mode === "single"
                  ? "prompt.aiTest"
                  : "settings.multiModelCompare",
              )}
            >
              {row.mode === "single" ? (
                <PlayIcon
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <GitCompareIcon
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <time
                className="truncate text-xs leading-5"
                title={new Date(row.createdAt).toLocaleString()}
              >
                {new Date(row.createdAt).toLocaleString()}
              </time>
              <span className="sr-only">
                {t(
                  row.mode === "single"
                    ? "prompt.aiTest"
                    : "settings.multiModelCompare",
                )}
              </span>
            </span>
            <span className="flex w-full min-w-0 items-center gap-2 text-xs leading-4 text-muted-foreground">
              <span
                className="min-w-0 flex-1 truncate"
                title={row.models.join(" · ")}
              >
                {row.models.join(" · ")}
              </span>
              <span className="shrink-0">
                {t("testHistory.results", {
                  succeeded: row.successCount,
                  total: row.resultCount,
                })}
              </span>
            </span>
          </button>
        ))}
        {history.more && (
          <button
            type="button"
            disabled={history.loading}
            onClick={() => void history.load(history.rows.length)}
            className="p-3 text-sm text-primary"
          >
            {t("testHistory.more")}
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={history.loading}
        onClick={() => void history.load()}
        className="flex shrink-0 items-center gap-2 border-t border-border p-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
        {t("testHistory.refresh")}
      </button>
    </nav>
  );
}

export function PromptTestHistoryDetail({
  run,
  loading,
  onDelete,
  renderContent,
}: {
  run: PromptTestRun;
  loading: boolean;
  onDelete: () => Promise<void>;
  renderContent: (text: string) => ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div
      data-testid="test-history-detail"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <p className="flex-1 text-xs text-muted-foreground">
          {new Date(run.createdAt).toLocaleString()} · v{run.promptVersion}
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => setConfirmDelete(true)}
          aria-label={t("testHistory.delete")}
          title={t("testHistory.delete")}
          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-3 bg-destructive/5 px-5 py-3 text-sm">
          <span>{t("testHistory.deleteConfirm")}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onDelete()}
            className="text-destructive"
          >
            {t("common.delete")}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>
            {t("common.cancel")}
          </button>
        </div>
      )}
      <details className="mx-5 my-3 shrink-0 border-b border-border pb-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("testHistory.input")}
        </summary>
        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          <h4 className="text-xs text-muted-foreground">
            {t("prompt.systemPromptLabel")}
          </h4>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {run.systemPrompt}
          </pre>
          <h4 className="text-xs text-muted-foreground">
            {t("prompt.userPromptLabel")}
          </h4>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {run.userPrompt}
          </pre>
          <h4 className="text-xs text-muted-foreground">
            {t("prompt.outputFormat")}
          </h4>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {run.outputFormat}
          </pre>
          {run.attachmentNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("testHistory.attachments")}: {run.attachmentNames.join(", ")}
            </p>
          )}
        </div>
      </details>
      <p className="mx-5 mb-2 line-clamp-2 shrink-0 text-sm text-muted-foreground">
        {run.userPrompt}
      </p>
      <h3 className="flex shrink-0 items-center gap-3 px-5 py-3 text-sm font-semibold">
        {t(
          run.mode === "single" ? "prompt.aiResponse" : "testWorkbench.results",
        )}
        <span className="font-normal text-muted-foreground">
          {t("testHistory.results", {
            succeeded: run.results.filter((result) => result.success).length,
            total: run.results.length,
          })}
        </span>
      </h3>
      <AiTestResults
        results={run.results}
        renderContent={renderContent}
        historical
      />
    </div>
  );
}
