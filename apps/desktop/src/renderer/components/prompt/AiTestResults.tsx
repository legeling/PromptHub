import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  CheckCircle2Icon,
  CopyIcon,
  CheckIcon,
  LoaderIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { AITestResult } from "../../services/ai";
import { CollapsibleThinking } from "../ui/CollapsibleThinking";
import { copyTextToClipboard } from "./prompt-copy-utils";
import { useToast } from "../ui/Toast";

interface Props {
  results: AITestResult[];
  loading?: boolean;
  renderContent: (text: string) => ReactNode;
  historical?: boolean;
}

export function AiTestResults({
  results,
  loading = false,
  renderContent,
  historical = false,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [copied, setCopied] = useState<number | null>(null);
  async function copy(index: number): Promise<void> {
    try {
      await copyTextToClipboard(results[index].response ?? "");
      setCopied(index);
    } catch (error) {
      console.error("Copying model response failed", error);
      showToast(t("common.error"), "error");
    }
  }
  return (
    <div
      data-testid="ai-test-results"
      className="flex min-h-0 flex-1 overflow-x-auto overscroll-contain border-t border-border"
    >
      {results.map((result, index) => (
        <article
          key={result.id ?? `${result.model}-${index}`}
          aria-label={result.model}
          className="flex min-h-0 min-w-[260px] flex-1 basis-0 flex-col border-r border-border last:border-r-0"
        >
          <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <BotIcon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h4 className="min-w-0 flex-1 break-words text-sm font-semibold">
              {result.model}
            </h4>
            <span
              className={`inline-flex items-center gap-1 text-xs ${!result.success ? "text-destructive" : "text-muted-foreground"}`}
            >
              {loading ? (
                <LoaderIcon
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : result.success ? (
                <CheckCircle2Icon
                  className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? t("prompt.testing")
                  : t("testWorkbench.durationSeconds", {
                      seconds: ((result.latency ?? 0) / 1000).toFixed(2),
                    })}
              </span>
              <span className="sr-only">
                {loading
                  ? ""
                  : t(
                      result.success
                        ? "testHistory.success"
                        : "testHistory.failed",
                    )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void copy(index)}
              disabled={!result.response}
              aria-label={t(
                copied === index
                  ? "testHistory.copied"
                  : historical
                    ? "testHistory.copy"
                    : "prompt.copyResponse",
              )}
              title={t("prompt.copyResponse")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              {copied === index ? (
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CopyIcon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-sm leading-7">
            {result.error && (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words text-destructive"
              >
                {result.error}
              </p>
            )}
            <CollapsibleThinking
              content={result.thinkingContent}
              isLoading={loading}
            />
            {result.response
              ? renderContent(result.response)
              : !result.error &&
                !loading && (
                  <p className="text-muted-foreground">
                    {t("testWorkbench.emptyResponse")}
                  </p>
                )}
          </div>
        </article>
      ))}
    </div>
  );
}
