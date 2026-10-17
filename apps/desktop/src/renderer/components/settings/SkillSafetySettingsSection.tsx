import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { useToast } from "../ui/Toast";
import { Select } from "../ui/Select";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";

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
    <SettingItem label={t("settings.batchScanInstalledSkills")}>
      <button
        type="button"
        onClick={() => void runScan()}
        disabled={isScanning}
        className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isScanning
          ? t("skill.safetyScanning", "Scanning...")
          : t("skill.runSafetyAssessment", "Run Scan")}
      </button>
    </SettingItem>
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
      <SettingItem label={t("settings.contentScanEnable")}>
        <ToggleSwitch
          ariaLabel={t("settings.contentScanEnable")}
          checked={enabled}
          onChange={setEnabled}
        />
      </SettingItem>
      {enabled && (
        <>
          <SettingItem label={t("settings.contentScanMethod")}>
            <Select
              className="w-48 shrink-0"
              ariaLabel={t("settings.contentScanMethod")}
              value={method}
              onChange={(value) => {
                if (value === "ai" || value === "static") setMethod(value);
              }}
              options={[
                { value: "static", label: t("settings.contentScanStatic") },
                { value: "ai", label: t("settings.contentScanAI") },
              ]}
            />
          </SettingItem>
          <BatchSafetyScan />
        </>
      )}
    </SettingSection>
  );
}
