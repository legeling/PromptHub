import { useTranslation } from "react-i18next";
import { analysisFailureKey } from "../../services/ai-failure";
import { useUIStore } from "../../stores/ui.store";
import { useToast } from "../ui/Toast";

export function useAnalysisFeedback() {
  const { showToast } = useToast();
  const { t } = useTranslation();
  function report(error: unknown, close?: () => void) {
    const key = analysisFailureKey(error);
    const settings = ["endpoint", "credentials", "request"].includes(key);
    showToast(t(`analysisFeedback.${key}`), "error", true, settings ? {
      label: t("analysisFeedback.settings"),
      run: () => {
        close?.();
        useUIStore.getState().requestSettingsSection("ai");
      },
    } : undefined);
  }

  async function save(write: () => Promise<void>, message = t("analysisFeedback.save")) {
    try {
      await write();
    } catch {
      showToast(message, "error", true, {
        label: t("analysisFeedback.retrySave"),
        run: () => { void save(write, message); },
      });
    }
  }
  return { report, save };
}
