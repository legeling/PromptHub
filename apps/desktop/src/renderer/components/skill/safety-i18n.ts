import type { TFunction } from "i18next";
import type {
  SkillSafetyFinding,
  SkillSafetyLevel,
  SkillSafetyReport,
} from "@prompthub/shared/types";

function getSeverityCounts(report: SkillSafetyReport) {
  const high = report.findings.filter(
    (finding) => finding.severity === "high",
  ).length;
  const warn = report.findings.filter(
    (finding) => finding.severity === "warn",
  ).length;
  const info = report.findings.filter(
    (finding) => finding.severity === "info",
  ).length;
  return { high, warn, info };
}

export function getSkillSafetyLevelLabel(
  t: TFunction,
  level: SkillSafetyLevel,
): string {
  switch (level) {
    case "safe":
      return t("skill.safetyLevelSafe", "Safe");
    case "warn":
      return t("skill.safetyLevelWarn", "Caution");
    case "high-risk":
      return t("skill.safetyLevelHighRisk", "High Risk");
    case "blocked":
      return t("skill.safetyLevelBlocked", "Blocked");
    default:
      return level;
  }
}

export function getSkillSafetySummary(
  t: TFunction,
  report: SkillSafetyReport,
): string {
  const { high, warn } = getSeverityCounts(report);

  switch (report.level) {
    case "safe":
      return t("skill.safetySummarySafe", {
        count: report.checkedFileCount,
        defaultValue:
          "No obvious malicious patterns found. {{count}} file(s) checked.",
      });
    case "warn":
      return t("skill.safetySummaryWarn", {
        warn,
        count: report.checkedFileCount,
        defaultValue:
          "Found {{warn}} caution(s) across {{count}} file(s). Review the source before adding or running.",
      });
    case "high-risk":
      return t("skill.safetySummaryHighRisk", {
        high,
        warn,
        count: report.checkedFileCount,
        defaultValue:
          "Found {{high}} high-risk issue(s) and {{warn}} warning(s) across {{count}} file(s). Manual review recommended.",
      });
    case "blocked":
      return t("skill.safetySummaryBlocked", {
        high,
        warn,
        count: report.checkedFileCount,
        defaultValue:
          "Dangerous patterns detected across {{count}} file(s). Installation is blocked.",
      });
    default:
      return report.summary;
  }
}

export function getSkillSafetyFindingTitle(
  t: TFunction,
  finding: SkillSafetyFinding,
): string {
  const key = `skill.safetyFinding.${finding.code}`;
  const localized = t(key, { defaultValue: "" });
  return localized || finding.title;
}

export function getSkillSafetyMethodLabel(
  t: TFunction,
  report: SkillSafetyReport,
): string {
  return report.scanMethod === "preflight"
    ? t("skill.safetyScanMethodPreflight")
    : t("skill.safetyScanMethodAI", "AI-assisted");
}

export function getSkillSafetyMethodDescription(
  t: TFunction,
  report: SkillSafetyReport,
): string {
  if (report.scanMethod === "preflight") {
    return t("skill.safetyScanMethodPreflightDesc");
  }
  return t(
    "skill.safetyScanMethodAIDesc",
    "AI scan reviews the SKILL.md and relevant repo files with model context, so it is the primary signal for installation decisions.",
  );
}
