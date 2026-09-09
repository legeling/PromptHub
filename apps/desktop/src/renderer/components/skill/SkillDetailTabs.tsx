import { useSettingsStore } from "../../stores/settings.store";
import { useTranslation } from "react-i18next";
import {
  BookOpenIcon,
  CodeIcon,
  FolderOpenIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from "lucide-react";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import type { SkillDetailTab } from "./skill-detail-types";

interface SkillDetailTabsProps {
  activeTab: SkillDetailTab;
  canEditFiles: boolean;
  isScanningSafety: boolean;
  safetyReport: SkillSafetyReport | null;
  safetyTone: string;
  onOpenSafetyReport: () => void;
  onRunSafetyScan: () => unknown | Promise<unknown>;
  onSelectTab: (tab: SkillDetailTab) => void;
}

export function SkillDetailTabs({
  activeTab,
  canEditFiles,
  isScanningSafety,
  safetyReport,
  safetyTone,
  onOpenSafetyReport,
  onRunSafetyScan,
  onSelectTab,
}: SkillDetailTabsProps) {
  const { t } = useTranslation();
  const scanEnabled = useSettingsStore((state) => state.skillSafetyScanEnabled);
  return (
    <div className="flex items-center px-6 gap-6 border-b border-border bg-accent/20">
      <TabButton
        active={activeTab === "preview"}
        icon={<BookOpenIcon className="w-4 h-4" aria-hidden="true" />}
        label={t("common.preview", "Preview")}
        onClick={() => onSelectTab("preview")}
      />
      <TabButton
        active={activeTab === "code"}
        icon={<CodeIcon className="w-4 h-4" aria-hidden="true" />}
        label={t("common.content", "Source / Content")}
        onClick={() => onSelectTab("code")}
      />
      {canEditFiles ? (
        <TabButton
          active={activeTab === "files"}
          icon={<FolderOpenIcon className="w-4 h-4" aria-hidden="true" />}
          label={t("skill.files", "Files")}
          onClick={() => onSelectTab("files")}
        />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (safetyReport && !isScanningSafety) onOpenSafetyReport();
          else if (!isScanningSafety) void onRunSafetyScan();
        }}
        disabled={isScanningSafety || (!safetyReport && !scanEnabled)}
        title={
          !scanEnabled && !safetyReport
            ? t("settings.contentScanDisabled")
            : safetyReport
              ? t("skill.safetyModalTitle", "Safety Report")
              : t("skill.safetyAssessmentEmpty", "No safety scan run yet")
        }
        className={`ml-auto my-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
          safetyReport
            ? safetyTone
            : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
        }`}
      >
        {isScanningSafety ? (
          <ShieldAlertIcon
            className="w-3.5 h-3.5 animate-pulse"
            aria-hidden="true"
          />
        ) : safetyReport?.level === "safe" ? (
          <ShieldCheckIcon className="w-3.5 h-3.5" aria-hidden="true" />
        ) : safetyReport ? (
          <ShieldAlertIcon className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ShieldIcon className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        {getSafetyLabel({ isScanningSafety, safetyReport, t })}
      </button>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-3 text-sm font-semibold relative transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
      ) : null}
    </button>
  );
}

function getSafetyLabel({
  isScanningSafety,
  safetyReport,
  t,
}: {
  isScanningSafety: boolean;
  safetyReport: SkillSafetyReport | null;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (isScanningSafety) return t("skill.safetyScanning", "Scanning...");
  if (!safetyReport) return t("skill.safetyAssessment", "Safety Assessment");
  const level = {
    safe: t("skill.safetyLevelSafe", "Safe"),
    warn: t("skill.safetyLevelWarn", "Needs review"),
    "high-risk": t("skill.safetyLevelHighRisk", "High risk"),
    blocked: t("skill.safetyLevelBlocked", "Blocked"),
  }[safetyReport.level];
  return `${t("skill.safetyLevelLabel", "Risk Level")} - ${level ?? safetyReport.level}`;
}
