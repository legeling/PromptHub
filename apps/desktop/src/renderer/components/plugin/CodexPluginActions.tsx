import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, PowerIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import type {
  CodexInstalledPlugin,
  CodexPluginOperation,
} from "@prompthub/shared/types/codex-plugin";
import { usePluginStore } from "../../stores/plugin.store";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { codexPluginErrorText } from "./codex-plugin-errors";

export function CodexPluginActions({
  plugin,
}: {
  plugin: CodexInstalledPlugin;
}): JSX.Element {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const mutate = usePluginStore((state) => state.mutateCodexPlugin);
  const [operation, setOperation] = useState<CodexPluginOperation | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async (next: CodexPluginOperation): Promise<void> => {
    setOperation(next);
    setError(null);
    try {
      await mutate({ pluginId: plugin.pluginId, operation: next });
      setConfirmRemoval(false);
      showToast(t("plugin.nativeOperationComplete"), "success");
    } catch (failure) {
      setConfirmRemoval(false);
      setError(codexPluginErrorText(failure, t));
    } finally {
      setOperation(null);
    }
  };
  const buttonClass =
    "inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";
  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-2"
      data-testid="codex-plugin-actions"
    >
      <span className="text-xs text-muted-foreground">
        {t(plugin.enabled ? "common.enabled" : "common.disabled")}
      </span>
      {plugin.sourceType !== "remote" ? (
        <button
          type="button"
          disabled={operation !== null}
          className={buttonClass}
          onClick={() => void apply(plugin.enabled ? "disable" : "enable")}
        >
          <PowerIcon aria-hidden="true" className="h-4 w-4" />
          {t(plugin.enabled ? "common.disable" : "common.enable")}
        </button>
      ) : (
        <span
          className="text-xs text-muted-foreground"
          title={t("plugin.nativeRemotePolicy")}
        >
          {t("plugin.nativeAccountManaged")}
        </span>
      )}
      <button
        type="button"
        disabled={operation !== null}
        className={buttonClass}
        onClick={() => void apply("update")}
      >
        {operation === "update" ? (
          <Loader2Icon aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
        )}
        {t("plugin.nativeUpdate")}
      </button>
      <button
        type="button"
        disabled={operation !== null}
        className={buttonClass}
        onClick={() => setConfirmRemoval(true)}
      >
        <TrashIcon aria-hidden="true" className="h-4 w-4" />
        {t("common.uninstall")}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={confirmRemoval}
        onClose={() => setConfirmRemoval(false)}
        onConfirm={() => void apply("uninstall")}
        title={t("plugin.nativeUninstallTitle")}
        message={t("plugin.nativeUninstallDescription", { name: plugin.name })}
        confirmText={t("common.uninstall")}
        variant="destructive"
        isLoading={operation !== null}
      />
    </div>
  );
}
