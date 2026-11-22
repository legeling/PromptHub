import { isPromptUpdateConflict } from "@prompthub/shared/utils/prompt-update-condition";
import { useTranslation } from "react-i18next";
import { analysisFailureKey } from "../../services/ai-failure";
import { useUIStore } from "../../stores/ui.store";
import { useToast } from "../ui/Toast";

export function useAnalysisFeedback() {
  const { showToast } = useToast();
  const { t } = useTranslation();
  function report(error: unknown, options: { close?: () => void; retry?: () => void; saved?: boolean } = {}) {
    const key = analysisFailureKey(error);
    const reason = t(`analysisFeedback.${key}`);
    const message = options.saved ? t("analysisFeedback.saved", { reason }) : reason;
    if (["endpoint", "credentials", "request"].includes(key)) {
      showToast(message, "error", true, {
        label: t("analysisFeedback.settings"),
        run: () => {
          options.close?.();
          useUIStore.getState().requestSettingsSection("ai");
        },
      });
    } else if (options.retry) {
      showToast(message, "error", true, {
        label: t("analysisFeedback.retry"),
        run: options.retry,
      });
    } else {
      showToast(message, "error");
    }
  }

  async function save(write: () => Promise<void>, message = t("analysisFeedback.save")) {
    try {
      await write();
    } catch (error) {
      if (isPromptUpdateConflict(error)) {
        showToast(t("analysisFeedback.changed"), "warning");
        return;
      }
      showToast(message, "error", true, {
        label: t("analysisFeedback.retrySave"),
        run: () => { void save(write, message); },
      });
    }
  }
  return { report, save };
}
