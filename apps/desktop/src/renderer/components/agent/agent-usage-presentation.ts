import type {
  AgentQuotaScope,
  AgentUsageMetric,
} from "@prompthub/shared/types";
import {
  formatAgentUsagePlan,
  getPrimaryUsageMetric,
  getUsageMetricRemainingPercent,
} from "@prompthub/shared/utils/agent-usage-presentation";

export {
  formatAgentUsagePlan,
  getPrimaryUsageMetric,
  getUsageMetricRemainingPercent,
};

export const MAX_AGENT_USAGE_METRICS = 64;
export const COLLAPSED_MODEL_METRICS = 4;

export type AgentUsageTone = "normal" | "warning" | "critical";
export type AgentUsageVisual = "bar" | "ring" | "stat";

export interface AgentUsagePresentationGroup {
  key: string;
  label: string | null;
  scopeKind: AgentQuotaScope["kind"];
  metrics: AgentUsageMetric[];
}

export interface AgentUsagePresentation {
  groups: AgentUsagePresentationGroup[];
  hiddenModelCount: number;
  truncatedCount: number;
}

export interface AgentUsagePresentationOptions {
  expanded?: boolean;
  modelLimit?: number;
}

export function getAgentUsageTone(remaining: number): AgentUsageTone {
  if (remaining <= 10) return "critical";
  if (remaining <= 30) return "warning";
  return "normal";
}

export function getAgentUsageVisual(
  metric: AgentUsageMetric,
): AgentUsageVisual {
  if (metric.value.kind === "balance") return "stat";
  if (metric.value.kind !== "percentage" && metric.value.kind !== "amount") {
    return "bar";
  }
  if (metric.period.kind === "rolling") return "ring";
  if (metric.period.kind !== "calendar") return "bar";
  return metric.period.unit === "day" || metric.period.unit === "week"
    ? "ring"
    : "bar";
}

function periodWeight(metric: AgentUsageMetric): number {
  const period = metric.period;
  if (period.kind === "rolling") {
    return period.durationSeconds ?? 900_000;
  }
  if (period.kind === "calendar") {
    return {
      day: 1_000_000,
      week: 2_000_000,
      month: 3_000_000,
      "billing-cycle": 4_000_000,
    }[period.unit];
  }
  return period.kind === "provider-defined" ? 5_000_000 : 6_000_000;
}

function compareMetrics(left: AgentUsageMetric, right: AgentUsageMetric) {
  if (left.value.kind === "balance" && right.value.kind === "balance") {
    return (
      left.value.unit.localeCompare(right.value.unit) ||
      left.id.localeCompare(right.id)
    );
  }
  return (
    periodWeight(left) - periodWeight(right) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function compareModelMetrics(left: AgentUsageMetric, right: AgentUsageMetric) {
  const leftRemaining = getUsageMetricRemainingPercent(left);
  const rightRemaining = getUsageMetricRemainingPercent(right);
  if (leftRemaining !== null || rightRemaining !== null) {
    if (leftRemaining === null) return 1;
    if (rightRemaining === null) return -1;
    if (leftRemaining !== rightRemaining) return leftRemaining - rightRemaining;
  }
  return (
    left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
  );
}

function scopeKey(scope: AgentQuotaScope): string {
  if (scope.kind === "account") return "account";
  if (scope.kind === "feature") return "features";
  if (scope.kind === "model") return "models";
  return `model-group:${scope.id}`;
}

function scopeLabel(scope: AgentQuotaScope): string | null {
  return scope.kind === "model-group" ? scope.label : null;
}

export function buildAgentUsagePresentation(
  metrics: AgentUsageMetric[],
  options: AgentUsagePresentationOptions = {},
): AgentUsagePresentation {
  const bounded = metrics.slice(0, MAX_AGENT_USAGE_METRICS);
  const truncatedCount = Math.max(0, metrics.length - bounded.length);
  const modelMetrics = bounded
    .filter((metric) => metric.scope.kind === "model")
    .sort(compareModelMetrics);
  const visibleModels = options.expanded
    ? modelMetrics
    : modelMetrics.slice(0, options.modelLimit ?? COLLAPSED_MODEL_METRICS);
  const hiddenModelCount = modelMetrics.length - visibleModels.length;
  const visible = [
    ...bounded.filter((metric) => metric.scope.kind !== "model"),
    ...visibleModels,
  ];
  const groups = new Map<string, AgentUsagePresentationGroup>();

  for (const metric of visible) {
    const key = scopeKey(metric.scope);
    const existing = groups.get(key);
    if (existing) {
      existing.metrics.push(metric);
      continue;
    }
    groups.set(key, {
      key,
      label: scopeLabel(metric.scope),
      scopeKind: metric.scope.kind,
      metrics: [metric],
    });
  }

  const scopeOrder: Record<AgentQuotaScope["kind"], number> = {
    account: 0,
    "model-group": 1,
    feature: 2,
    model: 3,
  };
  const ordered = [...groups.values()].sort(
    (left, right) => scopeOrder[left.scopeKind] - scopeOrder[right.scopeKind],
  );
  for (const group of ordered) {
    if (group.scopeKind !== "model") group.metrics.sort(compareMetrics);
  }

  return { groups: ordered, hiddenModelCount, truncatedCount };
}
