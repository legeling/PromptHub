import type {
  AgentQuotaScope,
  AgentQuotaValue,
  AgentUsageMetric,
} from "@prompthub/shared/types";
import {
  ACCOUNT_USAGE_SCOPE,
  boundUsageMetrics,
  percentageFromUsed,
} from "./agent-usage-contract";
import {
  isRecord,
  toFiniteNumber,
  toNonEmptyString,
} from "./agent-usage-parsers";

function windowMetric(
  value: unknown,
  scope: AgentQuotaScope,
): AgentUsageMetric | null {
  if (!isRecord(value)) return null;
  const seconds = value.limit_window_seconds;
  const used = value.used_percent;
  if (
    typeof seconds !== "number" ||
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    typeof used !== "number" ||
    !Number.isFinite(used)
  )
    return null;
  const id =
    seconds === 18_000
      ? "fiveHour"
      : seconds === 604_800
        ? "sevenDay"
        : `window:${seconds}`;
  const reset = value.reset_at;
  return {
    id: scope.kind === "account" ? id : `${scope.id}:${id}`,
    label:
      seconds === 18_000
        ? "5-hour window"
        : seconds === 604_800
          ? "7-day window"
          : "Rolling window",
    scope,
    period: { kind: "rolling", durationSeconds: seconds },
    value: percentageFromUsed(used),
    resetsAt:
      typeof reset === "number" &&
      Number.isFinite(reset) &&
      reset > 0 &&
      reset * 1000 <= 8.64e15
        ? reset * 1000
        : null,
  };
}

function rateLimitMetrics(
  value: unknown,
  scope: AgentQuotaScope,
): AgentUsageMetric[] {
  if (!isRecord(value)) return [];
  const metrics = new Map<string, AgentUsageMetric>();
  for (const slot of [value.primary_window, value.secondary_window]) {
    const metric = windowMetric(slot, scope);
    if (!metric) continue;
    const previous = metrics.get(metric.id);
    // Duplicate durations describe the same bucket; retain the stricter reading.
    if (
      previous?.value.kind === "percentage" &&
      metric.value.kind === "percentage" &&
      previous.value.remainingPercent <= metric.value.remainingPercent
    )
      continue;
    metrics.set(metric.id, metric);
  }
  return [...metrics.values()].sort(
    (a, b) =>
      (a.period.kind === "rolling" ? (a.period.durationSeconds ?? 0) : 0) -
      (b.period.kind === "rolling" ? (b.period.durationSeconds ?? 0) : 0),
  );
}

function balanceMetric(
  id: string,
  label: string,
  value: AgentQuotaValue,
): AgentUsageMetric {
  return {
    id,
    label,
    scope: ACCOUNT_USAGE_SCOPE,
    period: { kind: "provider-defined", label },
    value,
    resetsAt: null,
  };
}

function creditBalance(value: unknown): AgentUsageMetric | null {
  if (!isRecord(value)) return null;
  const balance = toFiniteNumber(value.balance);
  const quota: AgentQuotaValue =
    value.unlimited === true
      ? { kind: "unlimited" }
      : balance !== null && balance >= 0 && balance <= Number.MAX_SAFE_INTEGER
        ? { kind: "balance", remainingAmount: balance, unit: "credits" }
        : { kind: "unknown" };
  return balanceMetric("creditBalance", "Credit balance", quota);
}

function resetBalance(value: unknown): AgentUsageMetric | null {
  if (!isRecord(value)) return null;
  const count = value.available_count;
  const quota: AgentQuotaValue =
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0
      ? { kind: "balance", remainingAmount: count, unit: "resets" }
      : { kind: "unknown" };
  return balanceMetric("availableResets", "Available usage resets", quota);
}

/** Official WHAM usage response; no credentials or account identifiers leave this adapter. */
export function parseCodexUsage(body: unknown): {
  metrics: AgentUsageMetric[];
  plan: string | null;
} {
  if (!isRecord(body)) return { metrics: [], plan: null };
  const metrics = rateLimitMetrics(body.rate_limit, ACCOUNT_USAGE_SCOPE);
  for (const metric of [
    creditBalance(body.credits),
    resetBalance(body.rate_limit_reset_credits),
  ]) {
    if (metric) metrics.push(metric);
  }
  if (Array.isArray(body.additional_rate_limits)) {
    for (const entry of body.additional_rate_limits.slice(0, 30)) {
      if (!isRecord(entry)) continue;
      const id = toNonEmptyString(entry.metered_feature);
      const label = toNonEmptyString(entry.limit_name);
      if (!id || !label) continue;
      metrics.push(
        ...rateLimitMetrics(entry.rate_limit, {
          kind: "model-group",
          id,
          label,
        }),
      );
    }
  }
  const plan =
    toNonEmptyString(body.plan_type)
      ?.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .trim()
      .slice(0, 120) || null;
  return { metrics: boundUsageMetrics(metrics), plan };
}
