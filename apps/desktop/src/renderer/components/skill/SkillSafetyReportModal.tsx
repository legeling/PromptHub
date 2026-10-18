import { useMemo } from "react";
import { getRuntimeCapabilities } from "../../runtime";
import { useTranslation } from "react-i18next";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import { Modal } from "../ui";
import { groupSkillSafetyFindings } from "./detail-utils";
import {
  getSkillSafetyFindingTitle,
  getSkillSafetyMethodDescription,
  getSkillSafetyMethodLabel,
  getSkillSafetySummary,
} from "./safety-i18n";

interface SkillSafetyReportModalProps {
  isOpen: boolean;
  isScanning: boolean;
  report: SkillSafetyReport | null;
  onClose: () => void;
  onRescan: () => void | Promise<void>;
}

const CONTENT_CODES = new Set([
  "shell-pipe-exec",
  "dangerous-delete",
  "encoded-powershell",
  "encoded-shell-bootstrap",
  "privilege-escalation",
  "system-persistence",
  "secret-access",
  "security-bypass",
  "network-exfil",
  "exec-bit",
  "network-bootstrap",
  "env-mutation",
]);
const SOURCE_CODES = new Set([
  "untrusted-source-host",
  "external-audits",
  "internal-source",
  "unknown-source",
  "invalid-source-url",
  "insecure-source-url",
]);
const REPO_CODES = new Set([
  "persistence-file",
  "high-risk-binary",
  "script-file",
]);

function getSafetyTone(level: SkillSafetyReport["level"]): string {
  if (level === "blocked") {
    return "border-destructive/40 bg-destructive/5 text-destructive";
  }
  if (level === "high-risk") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300";
  }
  if (level === "warn") {
    return "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function SkillSafetyReportModal({
  isOpen,
  isScanning,
  report,
  onClose,
  onRescan,
}: SkillSafetyReportModalProps) {
  const { t, i18n } = useTranslation();
  const groupedFindings = useMemo(
    () => groupSkillSafetyFindings(report?.findings ?? []),
    [report?.findings],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("skill.safetyModalTitle", "Safety Report")}
      size="lg"
    >
      {report ? (
        <div className="space-y-5">
          <SafetyReportHeader report={report} />
          {report.scanMethod === "ai" ? (
            <SafetyDimensions report={report} />
          ) : null}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t border-border pt-3">
            <span>
              {t("skill.safetyFilesChecked", "{{count}} file(s) checked", {
                count: report.checkedFileCount,
              })}
            </span>
            <span>
              {t("skill.safetyScanMethod", "Method")}:{" "}
              {getSkillSafetyMethodLabel(t, report)}
            </span>
            <span>
              {t("skill.safetyScanTime", "Scanned")}:{" "}
              {new Date(report.scannedAt).toLocaleString(
                i18n.language || undefined,
              )}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {getSkillSafetyMethodDescription(t, report)}
          </p>
          <SafetyFindings findings={groupedFindings} />
          {getRuntimeCapabilities().skillSafetyScan ? (
            <div className="flex items-center justify-end border-t border-border pt-4">
              <button
                type="button"
                onClick={() => void onRescan()}
                disabled={isScanning}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`}
                />
                {isScanning
                  ? t("skill.safetyScanning", "Scanning...")
                  : t("skill.safetyRescan", "Rescan")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function SafetyReportHeader({ report }: { report: SkillSafetyReport }) {
  const { t } = useTranslation();
  const levelLabel = {
    safe: t("skill.safetyLevelSafe", "Safe"),
    warn: t("skill.safetyLevelWarn", "Needs review"),
    "high-risk": t("skill.safetyLevelHighRisk", "High risk"),
    blocked: t("skill.safetyLevelBlocked", "Blocked"),
  }[report.level];

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold w-fit ${getSafetyTone(report.level)}`}
        >
          {report.level === "safe" ? (
            <ShieldCheckIcon className="w-4 h-4" />
          ) : (
            <ShieldAlertIcon className="w-4 h-4" />
          )}
          {levelLabel ?? report.level}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {getSkillSafetySummary(t, report)}
        </p>
      </div>
      {report.score !== undefined ? (
        <div
          className="flex flex-col items-center shrink-0 cursor-help"
          title={t(
            "skill.safetyScoreDesc",
            "Score 0–100 (higher = safer). Based on risk level and number of findings: blocked 0–10, high-risk 20–40, caution 50–70, safe 80–100.",
          )}
        >
          <span className="text-2xl font-bold text-foreground">
            {report.score}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t("skill.safetyScore", "Score")} / 100
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SafetyDimensions({ report }: { report: SkillSafetyReport }) {
  const { t } = useTranslation();
  const findings = report.findings ?? [];
  const dimensions = [
    {
      key: "content",
      label: t("skill.safetyDimContent", "Content patterns"),
      description: t(
        "skill.safetyDimContentDesc",
        "AI review of SKILL.md instructions and suspicious repo files for dangerous commands, privilege escalation, secret access, prompt injection, and exfiltration behavior.",
      ),
      count: findings.filter((finding) => CONTENT_CODES.has(finding.code))
        .length,
    },
    {
      key: "source",
      label: t("skill.safetyDimSource", "Source trust"),
      description: t(
        "skill.safetyDimSourceDesc",
        "Source provenance preflight plus AI context review for missing provenance, malformed URLs, custom hosts, and restricted internal addresses.",
      ),
      count: findings.filter((finding) => SOURCE_CODES.has(finding.code))
        .length,
    },
    {
      key: "repo",
      label: t("skill.safetyDimRepo", "Repository structure"),
      description: t(
        "skill.safetyDimRepoDesc",
        "Repository tree review for executable scripts, bundled binaries, persistence-related files, and other risky packaging signals surfaced to the AI scan.",
      ),
      count: findings.filter((finding) => REPO_CODES.has(finding.code)).length,
    },
  ];
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
        {t("skill.safetyDimensionTitle", "Scoring Dimensions")}
      </p>
      {dimensions.map((dimension) => (
        <div
          key={dimension.key}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-foreground truncate">
              {dimension.label}
            </span>
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-help shrink-0"
              title={dimension.description}
            >
              ?
            </span>
          </div>
          <span
            className={`text-xs font-medium shrink-0 ${
              dimension.count === 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {dimension.count === 0
              ? t("skill.safetyDimNoFindings", "Clean")
              : t("skill.safetyDimFindings", "{{count}} finding(s)", {
                  count: dimension.count,
                })}
          </span>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50 leading-relaxed">
        {t(
          "skill.safetyScoreFormula",
          "Score formula: level sets the base range (blocked 0–10 · high-risk 20–40 · caution 50–70 · safe 80–100), then each finding deducts points within that range.",
        )}
      </p>
    </div>
  );
}

function SafetyFindings({
  findings,
}: {
  findings: ReturnType<typeof groupSkillSafetyFindings>;
}) {
  const { t } = useTranslation();
  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircleIcon className="w-4 h-4 shrink-0" />
        {t("skill.safetyNoFindings", "No issues found")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {findings.map((finding, index) => (
        <SafetyFinding key={`${finding.code}-${index}`} finding={finding} />
      ))}
    </div>
  );
}

function SafetyFinding({
  finding,
}: {
  finding: ReturnType<typeof groupSkillSafetyFindings>[number];
}) {
  const { t } = useTranslation();
  const config = {
    high: {
      className: "border-red-500/30 bg-red-500/5",
      icon: <AlertTriangleIcon className="w-4 h-4 text-destructive shrink-0" />,
      badge: "bg-red-500/15 text-red-700 dark:text-red-400",
      label: t("skill.safetySeverityHigh", "High"),
    },
    warn: {
      className: "border-amber-500/30 bg-amber-500/5",
      icon: <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />,
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      label: t("skill.safetySeverityWarn", "Warning"),
    },
    info: {
      className: "border-blue-500/20 bg-blue-500/5",
      icon: <InfoIcon className="w-4 h-4 text-blue-500 shrink-0" />,
      badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      label: t("skill.safetySeverityInfo", "Info"),
    },
  }[finding.severity];
  return (
    <div className={`rounded-lg border px-4 py-3 ${config.className}`}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {getSkillSafetyFindingTitle(t, finding)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.badge}`}
            >
              {config.label}
            </span>
            {finding.count > 1 ? (
              <span className="text-[10px] text-muted-foreground font-medium">
                × {finding.count}
              </span>
            ) : null}
            {finding.filePaths[0] ? (
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                {finding.filePaths[0]}
              </span>
            ) : null}
          </div>
          {finding.detail ? (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {finding.detail}
            </p>
          ) : null}
          {finding.evidences[0] ? (
            <code className="mt-1.5 block text-[11px] bg-muted/60 rounded px-2 py-1 text-muted-foreground font-mono break-all">
              {finding.evidences[0]}
            </code>
          ) : null}
          {finding.filePaths.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {finding.filePaths.slice(1, 5).map((filePath) => (
                <span
                  key={filePath}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-mono"
                >
                  {filePath}
                </span>
              ))}
              {finding.filePaths.length > 5 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  +{finding.filePaths.length - 5}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
