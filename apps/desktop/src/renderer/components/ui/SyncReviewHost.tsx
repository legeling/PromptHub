import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type {
  CausalSyncResolution,
  CausalSyncReview,
  DesktopCausalSyncRequest,
  SyncResourceIdentity,
} from "@prompthub/shared/types/causal-sync";
import { useSyncReviewStore } from "../../stores/sync-review.store";
import { runDesktopCausalSync } from "../../services/causal-sync";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Select } from "./Select";

function resourceKey(resource: SyncResourceIdentity): string {
  return JSON.stringify([resource.resourceType, resource.resourceId]);
}
function conflictResources(review: CausalSyncReview): SyncResourceIdentity[] {
  if (review.status !== "conflict") return [];
  const resources = new Map<string, SyncResourceIdentity>();
  for (const conflict of review.conflicts) {
    resources.set(resourceKey(conflict), conflict);
    if (conflict.reference)
      resources.set(resourceKey(conflict.reference), conflict.reference);
  }
  return [...resources.values()];
}

function ReviewForm({
  review,
  provider,
}: {
  review: CausalSyncReview;
  provider: DesktopCausalSyncRequest["provider"];
}): ReactElement {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const resources = conflictResources(review);
  const submit = async (baseline?: "local" | "remote") => {
    setBusy(true);
    setMessage("");
    try {
      const resolution: CausalSyncResolution = baseline
        ? { kind: "baseline", token: review.token, choice: baseline }
        : {
            kind: "conflicts",
            token: review.token,
            choices: resources.map((resource) => ({
              resourceType: resource.resourceType,
              resourceId: resource.resourceId,
              choice: choices[resourceKey(resource)],
            })),
          };
      // Copy identity only; conflict details are observations, not request fields.
      if (resolution.kind === "conflicts")
        resolution.choices = resolution.choices.map(
          ({ resourceType, resourceId, choice }) => ({
            resourceType,
            resourceId,
            choice,
          }),
        );
      const result = await runDesktopCausalSync(provider, resolution);
      if (!result.success) setMessage(result.message);
    } catch {
      setMessage(t("syncReview.failed"));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const result = await runDesktopCausalSync(provider);
      setMessage(result.success ? "" : result.message);
    } catch {
      setMessage(t("syncReview.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          review.status === "baseline-required"
            ? "syncReview.baselineDescription"
            : "syncReview.conflictDescription",
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("syncReview.recoveryDescription")}
      </p>
      {resources.length > 0 && (
        <div className="space-y-3">
          {resources.map((resource) => {
            const key = resourceKey(resource),
              label = review.labels?.[key] ?? resource.resourceId;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={label}>
                    {label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`syncReview.types.${resource.resourceType}`)}
                  </p>
                </div>
                <Select
                  value={choices[key] ?? ""}
                  disabled={busy}
                  ariaLabel={t("syncReview.chooseFor", { name: label })}
                  placeholder={t("syncReview.choose")}
                  options={[
                    { value: "local", label: t("syncReview.local") },
                    { value: "remote", label: t("syncReview.remote") },
                  ]}
                  onChange={(value) => {
                    if (value === "local" || value === "remote")
                      setChoices((previous) => ({ ...previous, [key]: value }));
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
          {t("syncReview.refresh")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => useSyncReviewStore.setState({ isOpen: false })}
        >
          {t("common.cancel")}
        </Button>
        {review.status === "baseline-required" ? (
          <>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => void submit("local")}
            >
              {t("syncReview.useLocalBaseline")}
            </Button>
            <Button
              disabled={busy || review.reason === "remote-missing"}
              onClick={() => void submit("remote")}
            >
              {t("syncReview.useRemoteBaseline")}
            </Button>
          </>
        ) : (
          <Button
            disabled={
              busy ||
              resources.some((resource) => !choices[resourceKey(resource)])
            }
            onClick={() => void submit()}
          >
            {t("syncReview.apply")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SyncReviewHost(): ReactElement | null {
  const { t } = useTranslation(),
    pending = useSyncReviewStore((state) => state.pending),
    isOpen = useSyncReviewStore((state) => state.isOpen);
  if (!pending) return null;
  return (
    <>
      {!isOpen && (
        <Button
          className="fixed bottom-5 right-5 z-50"
          onClick={() => useSyncReviewStore.setState({ isOpen: true })}
        >
          {t("syncReview.open")}
        </Button>
      )}
      <Modal
        isOpen={isOpen}
        title={t("syncReview.title")}
        size="lg"
        onClose={() => useSyncReviewStore.setState({ isOpen: false })}
      >
        <ReviewForm
          key={pending.review.token}
          review={pending.review}
          provider={pending.provider}
        />
      </Modal>
    </>
  );
}
