import type { TFunction } from "i18next";
import { BadgeCheckIcon, CoinsIcon, RotateCcwIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AgentUsageMetric } from "@prompthub/shared/types";
import {
  getAgentUsageTone,
  getAgentUsageVisual,
  getUsageMetricRemainingPercent,
  formatAgentUsagePlan,
  type AgentUsagePresentationGroup,
  type AgentUsageTone,
} from "./agent-usage-presentation";

const METER_TONE_CLASS: Record<AgentUsageTone, string> = {
  normal: "bg-primary",
  warning: "bg-amber-500",
  critical: "bg-destructive",
};

const RING_TONE_CLASS: Record<AgentUsageTone, string> = {
  normal: "text-primary",
  warning: "text-amber-500",
  critical: "text-destructive",
};

const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const KNOWN_METRIC_LABEL_KEYS: Record<string, string> = {
  fiveHour: "agents.usageTab.fiveHourWindow",
  sevenDay: "agents.usageTab.sevenDayWindow",
  sevenDayOpus: "agents.usageTab.sevenDayOpusWindow",
  weekly: "agents.usageTab.weeklyWindow",
  rolling: "agents.usageTab.rollingWindow",
  premium: "agents.usageTab.premiumRequests",
  chat: "agents.usageTab.chatRequests",
  promptCredits: "agents.usageTab.promptCredits",
  creditBalance: "agents.usageTab.creditBalance",
  availableResets: "agents.usageTab.availableResets",
};

export function resolveAgentUsageMetricLabel(
  metric: AgentUsageMetric,
  t: TFunction,
): string {
  if (metric.scope.kind === "model") return metric.scope.label;
  const knownKey = KNOWN_METRIC_LABEL_KEYS[metric.id];
  if (knownKey) return t(knownKey);
  if (metric.period.kind === "calendar") {
    const key = {
      day: "agents.usageTab.dailyWindow",
      week: "agents.usageTab.weeklyWindow",
      month: "agents.usageTab.monthlyWindow",
      "billing-cycle": "agents.usageTab.billingCycle",
    }[metric.period.unit];
    return t(key);
  }
  if (
    metric.period.kind === "rolling" &&
    metric.period.durationSeconds !== null
  ) {
    const seconds = metric.period.durationSeconds;
    if (seconds === 18_000) return t("agents.usageTab.fiveHourWindow");
    if (seconds === 604_800) return t("agents.usageTab.sevenDayWindow");
    return t("agents.usageTab.rollingWindowDuration", {
      minutes: seconds / 60,
    });
  }
  if (metric.period.kind === "provider-defined") {
    return t("agents.usageTab.providerQuota");
  }
  return metric.label;
}

export function resolveAgentUsageGroupLabel(
  group: AgentUsagePresentationGroup,
  t: TFunction,
): string | null {
  if (group.label) return group.label;
  if (group.scopeKind === "feature") return t("agents.usageTab.featuresGroup");
  if (group.scopeKind === "model") return t("agents.usageTab.modelsGroup");
  return null;
}

export function formatAgentUsageReset(
  resetsAt: number | null,
  t: TFunction,
): string {
  if (resetsAt === null) return "";
  const remainingMinutes = Math.max(
    0,
    Math.ceil((resetsAt - Date.now()) / 60_000),
  );
  if (remainingMinutes === 0) return t("agents.usageTab.resetDue");
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  if (days > 0) {
    return t("agents.usageTab.resetsInDaysHours", { days, hours });
  }
  return t("agents.usageTab.resetsInHoursMinutes", {
    hours,
    minutes: remainingMinutes % 60,
  });
}

export function AgentUsagePlanBadge({
  plan,
  agentId,
  compact = false,
}: {
  plan: string;
  agentId?: string;
  compact?: boolean;
}) {
  const displayPlan = formatAgentUsagePlan(plan, agentId);
  return (
    <span
      data-usage-plan
      title={displayPlan}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 font-semibold text-primary ${
        compact
          ? "max-w-28 px-1.5 py-0.5 text-[11px]"
          : "max-w-48 px-2 py-1 text-xs"
      }`}
    >
      <BadgeCheckIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{displayPlan}</span>
    </span>
  );
}

function UsageBalanceValue({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: "credits" | "resets";
}) {
  const Icon = unit === "credits" ? CoinsIcon : RotateCcwIcon;
  return (
    <div data-usage-visual="stat" className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function AgentUsageMeter({
  metric,
  compact = false,
}: {
  metric: AgentUsageMetric;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const label = resolveAgentUsageMetricLabel(metric, t);
  const remaining = getUsageMetricRemainingPercent(metric);
  const reset = formatAgentUsageReset(metric.resetsAt, t);
  const tone = remaining === null ? "normal" : getAgentUsageTone(remaining);
  const visual = getAgentUsageVisual(metric);
  const formatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const valueText =
    metric.value.kind === "balance"
      ? formatter.format(metric.value.remainingAmount)
      : metric.value.kind === "unlimited"
        ? t("agents.usageTab.unlimited")
        : metric.value.kind === "unknown" || remaining === null
          ? t("agents.usageTab.unknownValue")
          : t("agents.usageTab.remainingPercent", { remaining });
  const amountText =
    metric.value.kind === "amount"
      ? t("agents.usageTab.quotaRemainingOf", {
          remaining: formatter.format(metric.value.remainingAmount),
          total: formatter.format(metric.value.limitAmount),
          unit: metric.value.unit,
        })
      : "";

  if (metric.value.kind === "balance") {
    return (
      <UsageBalanceValue
        label={label}
        value={valueText}
        unit={metric.value.unit}
      />
    );
  }

  if (visual === "ring" && remaining !== null) {
    const sizeClass = compact ? "h-11 w-11" : "h-14 w-14";
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div
          role="progressbar"
          data-usage-visual="ring"
          aria-label={t("agents.usageTab.remainingProgressLabel", {
            metric: label,
            remaining,
          })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remaining}
          className={`relative shrink-0 ${sizeClass}`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 52 52"
            className="h-full w-full -rotate-90"
          >
            <circle
              cx="26"
              cy="26"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted"
            />
            <circle
              cx="26"
              cy="26"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - remaining / 100)}
              className={`transition-[stroke-dashoffset] duration-500 ease-out ${RING_TONE_CLASS[tone]}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-foreground">
            {remaining}%
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {label}
          </div>
          {reset ? (
            <div className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
              {reset}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "min-w-0" : "min-w-0 py-1"}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
          {valueText}
        </span>
      </div>
      {remaining !== null ? (
        <div
          role="progressbar"
          data-usage-visual="bar"
          aria-label={t("agents.usageTab.remainingProgressLabel", {
            metric: label,
            remaining,
          })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remaining}
          className={`${compact ? "mt-1.5 h-1" : "mt-2 h-1.5"} w-full overflow-hidden rounded-full bg-muted`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${METER_TONE_CLASS[tone]}`}
            style={{ width: `${remaining}%` }}
          />
        </div>
      ) : null}
      {amountText || reset ? (
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate tabular-nums">{amountText}</span>
          <span className="shrink-0 tabular-nums">{reset}</span>
        </div>
      ) : null}
    </div>
  );
}
