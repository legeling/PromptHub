import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { useToast } from "../ui/Toast";
import { SettingSection } from "./shared";

interface SafetyToggleProps {
  pressed: boolean;
  title: string;
  description: string;
  onToggle: () => void;
}

function SafetyToggle({
  pressed,
  title,
  description,
  onToggle,
}: SafetyToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
        pressed
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/30"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function BatchSafetyScan() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const scan = useSkillStore((state) => state.scanInstalledSkillSafety);
  const [isScanning, setIsScanning] = useState(false);
  const runScan = async () => {
    setIsScanning(true);
    try {
      const summary = await scan();
      const type =
        summary.blocked > 0 || summary.highRisk > 0
          ? "error"
          : summary.warn > 0
            ? "warning"
            : "success";
      showToast(
        t("settings.batchScanInstalledSkillsResult", {
          ...summary,
          defaultValue: `Checked ${summary.total} skills · blocked ${summary.blocked} · high risk ${summary.highRisk} · warn ${summary.warn}`,
        }),
        type,
      );
    } catch (error) {
      showToast(String(error), "error");
    } finally {
      setIsScanning(false);
    }
  };
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {t(
              "settings.batchScanInstalledSkills",
              "Scan All Installed Skills Now",
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "settings.batchScanInstalledSkillsDesc",
              "Manually run a safety scan on all Skills in your library to quickly find high-risk content.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runScan()}
          disabled={isScanning}
          className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isScanning
            ? t("skill.safetyScanning", "Scanning...")
            : t("skill.runSafetyAssessment", "Run Scan")}
        </button>
      </div>
    </div>
  );
}

export function SkillSafetySettingsSection() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((state) => state.skillSafetyScanEnabled);
  const method = useSettingsStore((state) => state.skillSafetyScanMethod);
  const setEnabled = useSettingsStore(
    (state) => state.setSkillSafetyScanEnabled,
  );
  const setMethod = useSettingsStore((state) => state.setSkillSafetyScanMethod);
  return (
    <SettingSection title={t("settings.contentScanTitle")}>
      <div className="space-y-3 p-4">
        <SafetyToggle
          pressed={enabled}
          title={t("settings.contentScanEnable")}
          description={t("settings.contentScanDescription")}
          onToggle={() => setEnabled(!enabled)}
        />
        {enabled && (
          <>
            <label className="block text-sm">
              {t("settings.contentScanMethod")}
              <select
                className="ml-3 rounded border border-border bg-card p-2"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value === "ai" ? "ai" : "static")
                }
              >
                <option value="static">
                  {t("settings.contentScanStatic")}
                </option>
                <option value="ai">{t("settings.contentScanAI")}</option>
              </select>
            </label>
            <BatchSafetyScan />
          </>
        )}
      </div>
    </SettingSection>
  );
}
