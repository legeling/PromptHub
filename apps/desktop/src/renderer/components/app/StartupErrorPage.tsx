import { useMemo, useState, type ReactElement } from "react";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { copyTextToClipboard } from "../../utils/clipboard";
import { formatStartupErrorLog } from "../../utils/startup-error-log";
import { IndexedDbRecoveryRequired } from "../../services/migrations/indexeddb";
import { IndexedDbRecovery } from "./IndexedDbRecovery";

function reloadWindow(): void {
  window.location.reload();
}

function StartupErrorActions({
  log,
  reload,
}: {
  log: string;
  reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<
    "idle" | "pending" | "copied" | "failed"
  >("idle");
  const copy = async (): Promise<void> => {
    setCopyState("pending");
    try {
      await copyTextToClipboard(log);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => void copy()} disabled={copyState === "pending"}>
          <CopyIcon aria-hidden="true" className="h-4 w-4" />
          {t("common.copyErrorLog")}
        </Button>
        <Button variant="secondary" onClick={reload}>
          <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
          {t("common.reloadPromptHub")}
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {copyState === "copied" && t("common.errorLogCopied")}
        {copyState === "failed" && t("common.errorLogCopyFailed")}
      </p>
    </>
  );
}

export function StartupErrorPage({
  error,
  reload = reloadWindow,
}: {
  error: Error;
  reload?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const log = useMemo(() => formatStartupErrorLog(error), [error]);
  if (error instanceof IndexedDbRecoveryRequired)
    return <IndexedDbRecovery reload={reload} />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
      <div role="alert" className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">
          {t("common.storageInitializationFailed")}
        </h1>
        <p>{t("common.storageInitializationFailedDescription")}</p>
      </div>
      <StartupErrorActions key={log} log={log} reload={reload} />
      <details className="w-full max-w-2xl text-left">
        <summary className="cursor-pointer rounded text-sm focus-visible:outline focus-visible:outline-primary">
          {t("common.errorDetails")}
        </summary>
        <pre
          data-testid="startup-error-log"
          tabIndex={0}
          className="mt-3 max-h-64 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 text-xs"
        >
          {log}
        </pre>
      </details>
    </main>
  );
}
