import { useCallback, useEffect, useState } from "react";

import type {
  AgentQuotaPeriod,
  AgentQuotaScope,
  AgentQuotaValue,
  AgentUsageMetric,
  AgentUsageQuota,
} from "@prompthub/shared/types";
import { MAX_AGENT_USAGE_METRICS } from "./agent-usage-presentation";

export interface AgentUsageState {
  quota: AgentUsageQuota | null;
  isLoading: boolean;
  hasError: boolean;
  refresh: () => void;
}

const CACHE_KEY_PREFIX = "prompthub.agent-usage.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function isCachedScope(value: unknown): value is AgentQuotaScope {
  if (!isRecord(value)) return false;
  if (value.kind === "account") return true;
  return (
    ["model-group", "model", "feature"].includes(String(value.kind)) &&
    isBoundedString(value.id) &&
    isBoundedString(value.label)
  );
}

function isCachedPeriod(value: unknown): value is AgentQuotaPeriod {
  if (!isRecord(value)) return false;
  if (value.kind === "lifetime") return true;
  if (value.kind === "provider-defined") return isBoundedString(value.label);
  if (value.kind === "rolling") {
    return (
      value.durationSeconds === null ||
      (typeof value.durationSeconds === "number" &&
        Number.isFinite(value.durationSeconds) &&
        value.durationSeconds > 0)
    );
  }
  return (
    value.kind === "calendar" &&
    ["day", "week", "month", "billing-cycle"].includes(String(value.unit))
  );
}

function isRemainingPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function isCachedValue(value: unknown): value is AgentQuotaValue {
  if (!isRecord(value)) return false;
  if (value.kind === "unlimited" || value.kind === "unknown") return true;
  if (!isRemainingPercent(value.remainingPercent)) return false;
  if (value.kind === "percentage") return true;
  return (
    value.kind === "amount" &&
    typeof value.remainingAmount === "number" &&
    Number.isFinite(value.remainingAmount) &&
    typeof value.limitAmount === "number" &&
    Number.isFinite(value.limitAmount) &&
    value.remainingAmount >= 0 &&
    value.limitAmount > 0 &&
    value.remainingAmount <= value.limitAmount &&
    isBoundedString(value.unit)
  );
}

function isCachedMetric(value: unknown): value is AgentUsageMetric {
  return (
    isRecord(value) &&
    isBoundedString(value.id) &&
    isBoundedString(value.label) &&
    isCachedScope(value.scope) &&
    isCachedPeriod(value.period) &&
    isCachedValue(value.value) &&
    (value.resetsAt === null ||
      (typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt)))
  );
}

export function readCachedAgentUsage(
  agentId: string,
  rootPath: string,
): AgentUsageQuota | null {
  try {
    const raw = window.localStorage.getItem(
      `${CACHE_KEY_PREFIX}${agentId}.${encodeURIComponent(rootPath)}`,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 2 ||
      parsed.agentId !== agentId ||
      parsed.status !== "ok" ||
      !isBoundedString(parsed.adapter) ||
      parsed.source !== "provider" ||
      (parsed.plan !== null && !isBoundedString(parsed.plan)) ||
      typeof parsed.fetchedAt !== "number" ||
      !Number.isFinite(parsed.fetchedAt)
    ) {
      return null;
    }
    if (
      !Array.isArray(parsed.metrics) ||
      parsed.metrics.length > MAX_AGENT_USAGE_METRICS ||
      !parsed.metrics.every(isCachedMetric)
    ) {
      return null;
    }
    if (
      agentId === "antigravity" &&
      parsed.metrics.some((metric) => metric.id === "promptCredits")
    ) {
      return null;
    }
    return parsed as unknown as AgentUsageQuota;
  } catch {
    return null;
  }
}

export function writeCachedAgentUsage(
  rootPath: string,
  quota: AgentUsageQuota,
): void {
  try {
    if (quota.status === "ok") {
      window.localStorage.setItem(
        `${CACHE_KEY_PREFIX}${quota.agentId}.${encodeURIComponent(rootPath)}`,
        JSON.stringify(quota),
      );
    }
  } catch {
    // Best-effort cache; storage failures must not break usage display.
  }
}

export function useAgentUsage(
  agentId: string,
  rootPath: string,
): AgentUsageState {
  const [stored, setStored] = useState(() => ({
    agentId,
    rootPath,
    quota: readCachedAgentUsage(agentId, rootPath),
  }));
  const quota =
    stored.agentId === agentId && stored.rootPath === rootPath
      ? stored.quota
      : null;
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [requestSeq, setRequestSeq] = useState(0);

  useEffect(() => {
    let active = true;
    setStored((previous) =>
      previous.agentId === agentId && previous.rootPath === rootPath
        ? previous
        : { agentId, rootPath, quota: readCachedAgentUsage(agentId, rootPath) },
    );
    setHasError(false);
    setIsLoading(true);
    const request =
      requestSeq > 0
        ? window.api.agent.getUsage(agentId, { forceRefresh: true })
        : window.api.agent.getUsage(agentId);
    request
      .then((result) => {
        if (!active) return;
        setStored({ agentId, rootPath, quota: result });
        writeCachedAgentUsage(rootPath, result);
      })
      .catch(() => {
        if (active) setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId, rootPath, requestSeq]);

  const refresh = useCallback(() => setRequestSeq((value) => value + 1), []);

  return { quota, isLoading, hasError, refresh };
}
