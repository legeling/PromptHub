import { RefreshCwIcon } from "lucide-react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { requestConfirmation } from "../ui/confirmation";
import { useToast } from "../ui/Toast";
import {
  discardWorkspaceEdits,
  isWorkspaceProtected,
  refreshWorkspace,
  useWorkspaceRefreshState,
} from "../../services/workspace-refresh";
import type { WorkspaceDomain } from "../../services/local-data-refresh";

export function WorkspaceRefreshButton({
  domain,
}: {
  domain: WorkspaceDomain;
}): JSX.Element {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const pending = useWorkspaceRefreshState((state) => state.pending[domain]);
  const [confirming, setConfirming] = useState(false);
  const run = async () => {
    if (pending || confirming) return;
    setConfirming(true);
    try {
      if (isWorkspaceProtected(domain)) {
        const discard = await requestConfirmation({
          message: t("workspaceRefresh.draftWarning"),
          confirmText: t("workspaceRefresh.discard"),
          variant: "destructive",
        });
        if (!discard) return;
        let discarded = false;
        flushSync(() => {
          discarded = discardWorkspaceEdits(domain);
        });
        if (!discarded) {
          showToast(t("workspaceRefresh.protected"), "info");
          return;
        }
      }
      const result = await refreshWorkspace(domain);
      showToast(
        t(`workspaceRefresh.${result}`),
        result === "updated" ? "success" : "info",
      );
    } catch (error) {
      console.error("Workspace refresh failed:", error);
      showToast(t("workspaceRefresh.failed"), "error");
    } finally {
      setConfirming(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={pending || confirming}
      aria-label={t("workspaceRefresh.action")}
      title={t("workspaceRefresh.action")}
      aria-busy={!!pending}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-accent disabled:opacity-50 [-webkit-app-region:no-drag]"
    >
      <RefreshCwIcon
        aria-hidden="true"
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      />
      <span className="hidden sm:inline">{t("workspaceRefresh.action")}</span>
    </button>
  );
}
