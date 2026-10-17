import type { AgentUsageMetric, AgentUsageQuota } from "../types/agent";

const KIMI_MEMBERSHIP_PLAN_NAMES: Readonly<Record<string, string>> = {
  LEVEL_FREE: "Free",
  LEVEL_BASIC: "Adagio",
  LEVEL_STANDARD: "Moderato",
  LEVEL_INTERMEDIATE: "Allegretto",
  LEVEL_ADVANCED: "Allegro",
  LEVEL_PREMIUM: "Vivace",
};

const GROK_MEMBERSHIP_PLAN_NAMES: Readonly<Record<string, string>> = {
  XFREE: "X Free",
  XBASIC: "X Basic",
  XPREMIUM: "X Premium",
  XPREMIUMPLUS: "X Premium+",
  SUPERGROK: "SuperGrok",
  SUPERGROKLITE: "SuperGrok Lite",
  SUPERGROKPLUS: "SuperGrok Plus",
  SUPERGROKHEAVY: "SuperGrok Heavy",
};

// Names match the provider's public tier labels; prices are not inferred from quota sizes.
const CODEX_PLAN_NAMES: Readonly<Record<string, string>> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  prolite: "Pro $100",
  pro: "Pro $200",
  promax: "Pro $500",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Edu",
};

export function formatAgentUsagePlan(plan: string, agentId?: string): string {
  const trimmed = plan.trim();
  if (agentId === "codex") {
    const codexPlan = CODEX_PLAN_NAMES[trimmed.toLowerCase()];
    if (codexPlan) return codexPlan;
  }
  const kimiPlan = KIMI_MEMBERSHIP_PLAN_NAMES[trimmed.toUpperCase()];
  if (kimiPlan) return kimiPlan;
  const grokPlan =
    GROK_MEMBERSHIP_PLAN_NAMES[
      trimmed.replace(/[^A-Za-z0-9]+/g, "").toUpperCase()
    ];
  if (grokPlan) return grokPlan;
  const normalized = trimmed.replace(/^level[_\s-]+/i, "");
  if (!normalized) return "";
  if (!/[_-]/.test(normalized)) {
    return normalized === normalized.toUpperCase()
      ? `${normalized[0].toUpperCase()}${normalized.slice(1).toLowerCase()}`
      : normalized;
  }
  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function getUsageMetricRemainingPercent(
  metric: AgentUsageMetric,
): number | null {
  if (metric.value.kind !== "percentage" && metric.value.kind !== "amount") {
    return null;
  }
  const value = metric.value.remainingPercent;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getPrimaryUsageMetric(
  quota: AgentUsageQuota,
): AgentUsageMetric | null {
  let primary: AgentUsageMetric | null = null;
  let lowestRemaining = Number.POSITIVE_INFINITY;
  for (const metric of quota.metrics) {
    const remaining = getUsageMetricRemainingPercent(metric);
    if (remaining === null || remaining >= lowestRemaining) continue;
    primary = metric;
    lowestRemaining = remaining;
  }
  return primary ?? quota.metrics[0] ?? null;
}
