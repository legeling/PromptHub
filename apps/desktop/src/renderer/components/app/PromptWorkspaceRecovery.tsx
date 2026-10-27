import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type {
  PromptWorkspaceConflict,
  PromptWorkspaceRecoveryApi,
  PromptWorkspaceReview,
  PromptWorkspaceSource,
} from "@prompthub/shared/types/prompt-workspace-recovery";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export type RecoveryControls = Pick<
  PromptWorkspaceRecoveryApi,
  "review" | "resolve" | "restart"
> &
  Partial<Pick<PromptWorkspaceRecoveryApi, "openDataDirectory" | "quit">>;

function ConflictChoices({
  conflict,
  selected,
  disabled,
  onSelect,
}: {
  conflict: PromptWorkspaceConflict;
  selected?: PromptWorkspaceSource;
  disabled: boolean;
  onSelect: (source: PromptWorkspaceSource) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="text-lg font-semibold break-words">
        {conflict.title}
      </legend>
      <p className="break-all text-xs text-muted-foreground">
        {t(`startupRecovery.kind.${conflict.kind}`)} · {conflict.id}
      </p>
      <p className="text-sm">
        {t("startupRecovery.differences", {
          fields: conflict.differingFields.join(", "),
        })}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {conflict.variants.map((variant) => (
          <label
            key={variant.source}
            className="min-w-0 cursor-pointer rounded-xl border border-border bg-card p-4 focus-within:ring-2 focus-within:ring-primary"
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                aria-label={t(`startupRecovery.source.${variant.source}`)}
                name={conflict.key}
                checked={selected === variant.source}
                onChange={() => onSelect(variant.source)}
                className="h-4 w-4 accent-primary"
              />
              {t(`startupRecovery.source.${variant.source}`)}
            </span>
            {variant.fields === null ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("startupRecovery.absent")}
              </p>
            ) : (
              <dl className="mt-4 max-h-80 space-y-3 overflow-auto text-sm">
                {Object.entries(variant.fields).map(([field, value]) => (
                  <div key={field}>
                    <dt
                      className={
                        conflict.differingFields.includes(field)
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {field}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words font-mono text-xs">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function useRecovery(api: RecoveryControls) {
  const { t } = useTranslation();
  const [review, setReview] = useState<PromptWorkspaceReview | null>(null);
  const [choices, setChoices] = useState<Record<string, PromptWorkspaceSource>>(
    {},
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<{
    recoveryPath: string | null;
  } | null>(null);
  const action = useCallback(
    async (run: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await run();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : t("startupRecovery.failed"),
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );
  const refresh = useCallback(
    () =>
      action(async () => {
        setReview(null);
        setChoices({});
        setIndex(0);
        const result = await api.review();
        if (result.success === false) throw new Error(result.error);
        setReview(result.review);
      }),
    [action, api],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const apply = () =>
    action(async () => {
      if (!review) throw new Error(t("startupRecovery.failed"));
      const result = await api.resolve({
        fingerprint: review.fingerprint,
        choices: review.conflicts.map(({ key }) => ({
          key,
          source: choices[key],
        })),
      });
      if (result.success === false) throw new Error(result.error);
      setCompleted({ recoveryPath: result.recoveryPath });
    });
  return {
    review,
    choices,
    setChoices,
    index,
    setIndex,
    busy,
    error,
    completed,
    action,
    refresh,
    apply,
  };
}

export default function PromptWorkspaceRecovery({
  api = window.api.promptWorkspaceRecovery,
  description,
  summaryKey = "startupRecovery.summary",
}: {
  api?: RecoveryControls;
  description?: string;
  summaryKey?: string;
}): JSX.Element {
  const { t } = useTranslation();
  const state = useRecovery(api);
  const [confirming, setConfirming] = useState(false);
  const conflict = state.review?.conflicts[state.index];
  const allChosen =
    state.review !== null &&
    state.review.conflicts.every(({ key }) => Boolean(state.choices[key]));
  return (
    <main
      className="h-screen overflow-auto bg-background p-6 text-foreground sm:p-10"
      aria-busy={state.busy}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          <AlertTriangle aria-hidden="true" className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold">
            {t("startupRecovery.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {description ?? t("startupRecovery.description")}
          </p>
        </header>
        {state.error && (
          <p
            role="alert"
            className="whitespace-pre-wrap break-words rounded-xl border border-destructive p-4 text-sm"
          >
            {t("startupRecovery.failed")} {state.error}
          </p>
        )}
        {state.busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("startupRecovery.working")}
          </p>
        )}
        {state.completed ? (
          <section
            role="status"
            className="space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold">
              {t("startupRecovery.complete")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("startupRecovery.saved")}
            </p>
            {state.completed.recoveryPath && (
              <p className="break-all font-mono text-xs">
                {state.completed.recoveryPath}
              </p>
            )}
            <Button
              disabled={state.busy}
              onClick={() => void state.action(api.restart)}
            >
              {t("startupRecovery.restart")}
            </Button>
          </section>
        ) : (
          <>
            {state.review && (
              <section className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  {t(summaryKey, {
                    files: state.review.sourceFileCount,
                    conflicts: state.review.conflicts.length,
                  })}
                </p>
                {state.review.reappeared && (
                  <p className="text-sm">{t("startupRecovery.reappeared")}</p>
                )}
                {conflict && (
                  <ConflictChoices
                    conflict={conflict}
                    selected={state.choices[conflict.key]}
                    disabled={state.busy}
                    onSelect={(source) =>
                      state.setChoices((previous) => ({
                        ...previous,
                        [conflict.key]: source,
                      }))
                    }
                  />
                )}
                {conflict && (
                  <nav
                    aria-label={t("startupRecovery.navigation")}
                    className="flex items-center gap-4"
                  >
                    <Button
                      variant="secondary"
                      disabled={state.busy || state.index === 0}
                      onClick={() => state.setIndex(state.index - 1)}
                    >
                      {t("startupRecovery.previous")}
                    </Button>
                    <span className="text-sm" aria-live="polite">
                      {t("startupRecovery.position", {
                        index: state.index + 1,
                        total: state.review.conflicts.length,
                      })}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={
                        state.busy ||
                        state.index + 1 === state.review.conflicts.length
                      }
                      onClick={() => state.setIndex(state.index + 1)}
                    >
                      {t("startupRecovery.next")}
                    </Button>
                  </nav>
                )}
                <Button
                  disabled={state.busy || !allChosen}
                  onClick={() => setConfirming(true)}
                >
                  {t("startupRecovery.apply")}
                </Button>
              </section>
            )}
            <Button
              variant="secondary"
              disabled={state.busy}
              onClick={() => void state.refresh()}
            >
              {t("startupRecovery.refresh")}
            </Button>
          </>
        )}
        <footer className="flex flex-wrap gap-3 border-t border-border pt-5">
          {api.openDataDirectory && (
            <Button
              variant="secondary"
              disabled={state.busy}
              onClick={() =>
                void state.action(async () => {
                  if (!api.openDataDirectory) return;
                  const result = await api.openDataDirectory();
                  if (!result.success)
                    throw new Error(
                      result.error ?? t("startupRecovery.failed"),
                    );
                })
              }
            >
              {t("startupRecovery.openDirectory")}
            </Button>
          )}
          {api.quit && (
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => {
                if (api.quit) void state.action(api.quit);
              }}
            >
              {t("startupRecovery.quit")}
            </Button>
          )}
        </footer>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        isLoading={state.busy}
        title={t("startupRecovery.confirmTitle")}
        message={t("startupRecovery.confirmMessage")}
        confirmText={t("startupRecovery.confirm")}
        onClose={() => setConfirming(false)}
        onConfirm={() => void state.apply().then(() => setConfirming(false))}
      />
    </main>
  );
}
