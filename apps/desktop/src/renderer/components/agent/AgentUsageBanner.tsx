import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  GaugeIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  AgentUsageQuota,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import {
  buildAgentUsagePresentation,
  type AgentUsagePresentationGroup,
} from "./agent-usage-presentation";
import {
  AgentUsageMeter,
  AgentUsagePlanBadge,
  resolveAgentUsageGroupLabel,
} from "./AgentUsageMeter";
import { useAgentUsage } from "./use-agent-usage";

function UsageCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 min-w-0 flex-[1_1_12rem] flex-col justify-center rounded-xl border border-border bg-muted/20 px-4 py-3">
      {children}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div
      data-testid="usage-skeleton"
      aria-hidden="true"
      className="flex flex-wrap gap-3"
    >
      {[0, 1].map((index) => (
        <UsageCard key={index}>
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-28 max-w-full rounded bg-muted" />
            <div className="h-1.5 w-full rounded-full bg-muted" />
            <div className="h-2.5 w-36 max-w-full rounded bg-muted" />
          </div>
        </UsageCard>
      ))}
    </div>
  );
}

function UsageGroup({ group }: { group: AgentUsagePresentationGroup }) {
  const { t } = useTranslation();
  const label = resolveAgentUsageGroupLabel(group, t);
  return (
    <div
      data-usage-group={group.key}
      className={`min-w-0 space-y-3 ${group.scopeKind === "account" ? "basis-full" : "flex-[1_1_25rem]"}`}
    >
      {label ? (
        <h3 className="truncate text-xs font-semibold text-foreground">
          {label}
        </h3>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-stretch gap-3">
        {group.metrics.map((metric, index) => (
          <UsageCard key={`${metric.id}:${index}`}>
            <AgentUsageMeter metric={metric} />
          </UsageCard>
        ))}
      </div>
    </div>
  );
}

function QuotaContent({
  quota,
  isLoading,
  isStale,
  onRefresh,
}: {
  quota: AgentUsageQuota | null;
  isLoading: boolean;
  isStale: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [quota?.agentId]);
  const presentation = useMemo(
    () => buildAgentUsagePresentation(quota?.metrics ?? [], { expanded }),
    [expanded, quota?.metrics],
  );
  const hiddenCount =
    presentation.hiddenModelCount + presentation.truncatedCount;

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {quota?.plan ? (
            <AgentUsagePlanBadge plan={quota.plan} agentId={quota.agentId} />
          ) : null}
          {!quota && isLoading ? (
            <span className="text-xs text-muted-foreground">
              {t("agents.usageTab.loading")}
            </span>
          ) : isStale ? (
            <span className="text-xs text-muted-foreground">
              {t("agents.usageTab.cachedStale")}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={t("agents.refresh")}
          title={t("agents.refresh")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCwIcon
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {!quota && isLoading ? <UsageSkeleton /> : null}
      {quota && quota.metrics.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("agents.usageTab.providerNoQuota")}
        </p>
      ) : null}
      {presentation.groups.length > 0 ? (
        <div
          data-testid="usage-groups"
          className={`flex min-w-0 flex-wrap items-start gap-5 ${
            expanded ? "max-h-80 overflow-y-auto pr-1" : ""
          }`}
        >
          {presentation.groups.map((group) => (
            <UsageGroup key={group.key} group={group} />
          ))}
        </div>
      ) : null}
      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded
            ? t("agents.usageTab.showFewerMetrics")
            : t("agents.usageTab.showAllMetrics", { count: hiddenCount })}
        </button>
      ) : null}
    </div>
  );
}

function GuidedState({
  title,
  description,
  primaryAction,
  onRetry,
}: {
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void };
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <AlertTriangleIcon
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-amber-500"
      />
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {description}
      </p>
      {primaryAction ? (
        <button
          type="button"
          onClick={primaryAction.onClick}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <ExternalLinkIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {primaryAction.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
      >
        <RefreshCwIcon aria-hidden="true" className="h-3.5 w-3.5" />
        {t("agents.usageTab.retry")}
      </button>
    </div>
  );
}

function CustomProviderState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <GaugeIcon
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
      <p className="text-xs font-semibold text-foreground">
        {t("agents.usageTab.customProviderTitle")}
      </p>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {t("agents.usageTab.customProviderDesc")}
      </p>
    </div>
  );
}

function AgentUsageBannerContent({ agent }: { agent: ManagedAgentSummary }) {
  const { t } = useTranslation();
  const { quota, isLoading, hasError, refresh } = useAgentUsage(
    agent.id,
    agent.paths.root,
  );
  const hasCachedSuccess = quota?.status === "ok";
  const status = hasError && !hasCachedSuccess ? "unavailable" : quota?.status;
  const isCustomProviderActive =
    !hasError &&
    quota?.status === "unavailable" &&
    quota.errorCode === "custom-provider-active";
  const isAntigravityNotRunning =
    !hasError &&
    quota?.status === "unavailable" &&
    quota.errorCode === "antigravity-not-running";
  const unavailableDescription =
    quota?.errorCode === "network-error"
      ? t("agents.usageTab.networkErrorDesc")
      : quota?.errorCode === "timeout"
        ? t("agents.usageTab.timeoutDesc")
        : quota?.errorCode === "http-error"
          ? t("agents.usageTab.httpErrorDesc")
          : t("agents.usageTab.unavailableDesc");

  return (
    <section
      aria-label={t("agents.usage")}
      className="border-b border-border bg-card px-5 py-4"
    >
      {hasCachedSuccess || (!quota && isLoading) ? (
        <QuotaContent
          quota={hasCachedSuccess ? quota : null}
          isLoading={isLoading}
          isStale={hasError}
          onRefresh={refresh}
        />
      ) : null}

      {!isLoading && status === "no-credentials" ? (
        <GuidedState
          title={t("agents.usageTab.noCredentialsTitle", { agent: agent.name })}
          description={t("agents.usageTab.noCredentialsDesc", {
            agent: agent.name,
          })}
          onRetry={refresh}
        />
      ) : null}
      {!isLoading && status === "expired" ? (
        <GuidedState
          title={t("agents.usageTab.expiredTitle")}
          description={t("agents.usageTab.expiredDesc", { agent: agent.name })}
          onRetry={refresh}
        />
      ) : null}
      {!isLoading && isCustomProviderActive ? <CustomProviderState /> : null}
      {!isLoading && isAntigravityNotRunning ? (
        <GuidedState
          title={t("agents.usageTab.antigravityNotRunningTitle")}
          description={t("agents.usageTab.antigravityNotRunningDesc")}
          primaryAction={
            agent.launchable
              ? {
                  label: t("agents.openAgent", { agent: agent.name }),
                  onClick: () => void window.api.agent.launch(agent.id),
                }
              : undefined
          }
          onRetry={refresh}
        />
      ) : null}
      {!isLoading &&
      status === "unavailable" &&
      !isCustomProviderActive &&
      !isAntigravityNotRunning &&
      !hasCachedSuccess ? (
        <GuidedState
          title={t("agents.usageTab.unavailableTitle")}
          description={unavailableDescription}
          onRetry={refresh}
        />
      ) : null}
    </section>
  );
}

export function AgentUsageBanner({ agent }: { agent: ManagedAgentSummary }) {
  const usageStatus = agent.capabilities.usage.status;
  if (usageStatus !== "supported" && usageStatus !== "partial") return null;
  return <AgentUsageBannerContent agent={agent} />;
}
