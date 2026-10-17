import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  HistoryIcon,
  PlayIcon,
  GitCompareIcon,
  ImageIcon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from "lucide-react";
import {
  PromptTestHistory,
  PromptTestHistoryDetail,
} from "./PromptTestHistory";
import { usePromptTestHistory } from "./usePromptTestHistory";

interface Props {
  promptId: string;
  title: string;
  mode: "single" | "compare" | "image";
  onMode: (mode: "single" | "compare" | "image") => void;
  onClose: () => void;
  revision: number;
  children: ReactNode;
  renderContent: (text: string) => ReactNode;
}

export function AiTestDrawer({
  promptId,
  title,
  mode,
  onMode,
  onClose,
  revision,
  children,
  renderContent,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const tabId = useId();
  const history = usePromptTestHistory(
    promptId,
    revision,
    showHistory && mode !== "image",
  );
  const dialogRef = useRef<HTMLElement>(null);
  const visibleMode = showHistory ? "history" : mode;
  useEffect(() => {
    const trigger = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("prompt.aiTest")}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialogRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className={`absolute right-0 top-0 flex h-full flex-col border-l border-border bg-card text-foreground shadow-xl outline-none animate-in slide-in-from-right-8 fade-in duration-base ease-enter ${expanded ? "w-full" : mode === "image" ? "w-[min(760px,100vw)]" : "w-[min(1440px,72vw)] max-lg:w-[90vw] max-md:w-full"}`}
    >
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <BotIcon
            className="h-6 w-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("prompt.aiTest")}</h2>
            <p className="truncate text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={t(expanded ? "common.collapse" : "common.expand")}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          >
            {expanded ? (
              <Minimize2Icon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize2Icon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        role="tablist"
        aria-label={t("prompt.aiTest")}
        className="flex shrink-0 gap-5 border-b border-border px-5"
        onKeyDown={(event) => {
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            ),
          );
          const index = tabs.findIndex((tab) => tab === document.activeElement);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index - 1 + tabs.length) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        {(mode === "image"
          ? (["image"] as const)
          : (["single", "compare", "history"] as const)
        ).map((value) => (
          <button
            type="button"
            key={value}
            role="tab"
            id={`${tabId}-${value}`}
            aria-controls={`${tabId}-panel`}
            aria-selected={visibleMode === value}
            tabIndex={visibleMode === value ? 0 : -1}
            onClick={() => {
              setShowHistory(value === "history");
              if (value !== "history") onMode(value);
            }}
            className={`inline-flex items-center gap-2 border-b-2 py-3 text-sm font-medium ${visibleMode === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {value === "single" ? (
              <PlayIcon className="h-4 w-4" aria-hidden="true" />
            ) : value === "compare" ? (
              <GitCompareIcon className="h-4 w-4" aria-hidden="true" />
            ) : value === "history" ? (
              <HistoryIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {t(
              value === "single"
                ? "prompt.aiTest"
                : value === "compare"
                  ? "settings.multiModelCompare"
                  : value === "history"
                    ? "testHistory.title"
                    : "settings.testImage",
            )}
          </button>
        ))}
      </div>
      {showHistory && history.error && (
        <p role="alert" className="shrink-0 px-5 py-2 text-sm text-destructive">
          {t("testHistory.loadError")}
        </p>
      )}
      <section
        role="tabpanel"
        id={`${tabId}-panel`}
        aria-labelledby={`${tabId}-${visibleMode}`}
        className="flex min-h-0 flex-1"
      >
        {showHistory && <PromptTestHistory history={history} />}
        {showHistory && !history.selected && (
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <HistoryIcon className="h-8 w-8" aria-hidden="true" />
            <p>
              {t(
                history.loading
                  ? "testHistory.loading"
                  : history.error
                    ? "testHistory.loadError"
                    : "testHistory.empty",
              )}
            </p>
          </div>
        )}
        <div
          hidden={showHistory}
          className={
            showHistory ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"
          }
        >
          {children}
        </div>
        {showHistory && history.selected && (
          <PromptTestHistoryDetail
            key={history.selected.id}
            run={history.selected}
            loading={history.loading}
            onDelete={history.remove}
            renderContent={renderContent}
          />
        )}
      </section>
    </aside>
  );
}
