import { CheckCircle2Icon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentProviderConnectionTestResult,
  AgentProviderModelTestResult,
  AgentProviderNativeConfigSummary,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { Button } from "../ui";
import { AgentProviderActivationSwitch } from "./AgentProviderActivationSwitch";
import { AgentProviderConnectionCheck } from "./AgentProviderConnectionCheck";
import { AgentCodexAccountManager } from "./AgentCodexAccountManager";
import { AgentUsageBanner } from "./AgentUsageBanner";
import {
  AgentProviderDetailHeader,
  AgentProviderDetailRow,
  AgentProviderDetailSection,
  AgentProviderDetailSurface,
  providerWorkbenchListItemClass,
} from "./AgentProviderWorkbenchLayout";

function classificationClass(
  classification: AgentProviderNativeConfigSummary["classification"],
): string {
  return classification === "official"
    ? "text-emerald-600 dark:text-emerald-400"
    : classification === "custom"
      ? "text-primary"
      : "text-muted-foreground";
}

export function AgentProviderNativeListItem({
  summary,
  selected,
  onSelect,
  serviceStatus,
  onActivate,
  busy = false,
}: {
  summary: AgentProviderNativeConfigSummary;
  selected: boolean;
  onSelect: () => void;
  serviceStatus?: "active" | "inactive" | "unavailable";
  onActivate?: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-1">
      <div
        data-testid={
          serviceStatus ? "provider-official-card" : "provider-native-card"
        }
        className={providerWorkbenchListItemClass(
          selected,
          "flex items-center overflow-hidden",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <CheckCircle2Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-col items-start gap-1">
              <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                {t(
                  serviceStatus
                    ? "agents.providerProfiles.officialService.title"
                    : "agents.providerProfiles.currentNative.title",
                )}
              </span>
              <span
                className={`shrink-0 text-xs font-medium ${serviceStatus && serviceStatus !== "active" ? "text-muted-foreground" : classificationClass(summary.classification)}`}
              >
                {t(
                  serviceStatus
                    ? `agents.providerProfiles.officialService.${serviceStatus}`
                    : `agents.providerProfiles.currentNative.classification.${summary.classification}`,
                )}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {summary.model ?? summary.name}
            </span>
          </span>
        </button>
        <div className="shrink-0 pr-3">
          <AgentProviderActivationSwitch
            checked={!serviceStatus || serviceStatus === "active"}
            disabled={busy || !onActivate || !summary.officialRestoreAvailable}
            loading={busy && Boolean(onActivate)}
            label={t(
              serviceStatus && serviceStatus !== "active"
                ? summary.officialRestoreAvailable
                  ? "agents.providerProfiles.currentNative.restoreOfficial"
                  : `agents.providerProfiles.officialService.${serviceStatus}`
                : "agents.providerProfiles.activation.currentLabel",
              {
                name: summary.name,
              },
            )}
            onActivate={onActivate ?? (() => undefined)}
          />
        </div>
      </div>
    </div>
  );
}

export function AgentProviderNativeDetail({
  platformId,
  summary,
  busyAction,
  connectionResult,
  modelTestResult,
  supportsConnectionTest,
  onRestoreOfficial,
  onTestConnection,
  onTestModel,
  onCancelModelTest,
  serviceStatus,
  agent,
}: {
  platformId: string;
  summary: AgentProviderNativeConfigSummary;
  busyAction: string | null;
  connectionResult: AgentProviderConnectionTestResult | null;
  modelTestResult: AgentProviderModelTestResult | null;
  supportsConnectionTest: boolean;
  onRestoreOfficial: () => void;
  onTestConnection: () => void;
  onTestModel: () => void;
  onCancelModelTest: () => void;
  serviceStatus?: "active" | "inactive" | "unavailable";
  agent?: ManagedAgentSummary;
}) {
  const { t } = useTranslation();
  const busy = busyAction !== null;
  return (
    <AgentProviderDetailSurface>
      <AgentProviderDetailSection>
        <AgentProviderDetailHeader>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {t(
                  serviceStatus
                    ? "agents.providerProfiles.officialService.title"
                    : "agents.providerProfiles.currentNative.title",
                )}
              </h2>
              <span
                className={`shrink-0 text-xs font-medium ${serviceStatus && serviceStatus !== "active" ? "text-muted-foreground" : classificationClass(summary.classification)}`}
              >
                {t(
                  serviceStatus
                    ? `agents.providerProfiles.officialService.${serviceStatus}`
                    : `agents.providerProfiles.currentNative.classification.${summary.classification}`,
                )}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {summary.name}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {summary.officialRestoreAvailable ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onRestoreOfficial}
                disabled={busy}
              >
                {busyAction === "restore-official" ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                )}
                {t("agents.providerProfiles.currentNative.restoreOfficial")}
              </Button>
            ) : null}
          </div>
        </AgentProviderDetailHeader>

        <div className="border-t border-border/70 px-4 py-1">
          <dl>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.currentNative.provider")}
            >
              {summary.providerKind}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.currentNative.protocol")}
            >
              {summary.protocol}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.currentNative.endpoint")}
            >
              {summary.endpoint ??
                t("agents.providerProfiles.currentNative.noEndpoint")}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.currentNative.model")}
            >
              {summary.model ??
                t("agents.providerProfiles.currentNative.noModel")}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.currentNative.credential")}
            >
              {t(
                `agents.providerProfiles.currentNative.credentialStatus.${summary.credential}`,
              )}
            </AgentProviderDetailRow>
          </dl>
        </div>
      </AgentProviderDetailSection>
      {serviceStatus && serviceStatus !== "active" ? (
        <p className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          {t(
            serviceStatus === "unavailable"
              ? "agents.providerProfiles.officialService.unavailableHint"
              : "agents.providerProfiles.officialService.inactiveHint",
          )}
        </p>
      ) : null}
      {serviceStatus === "active" &&
      agent &&
      (agent.capabilities.usage.status === "supported" ||
        agent.capabilities.usage.status === "partial") ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <AgentUsageBanner agent={agent} />
        </div>
      ) : null}
      {supportsConnectionTest ? (
        <div className="mt-4">
          <AgentProviderConnectionCheck
            busy={busy}
            testing={busyAction === "test-current-connection"}
            modelTesting={busyAction === "test-current-model"}
            connectionResult={connectionResult}
            modelTestResult={modelTestResult}
            onTestConnection={onTestConnection}
            onTestModel={onTestModel}
            onCancelModelTest={onCancelModelTest}
          />
        </div>
      ) : null}
      {platformId === "codex" && summary.classification === "official" ? (
        <AgentCodexAccountManager />
      ) : null}
    </AgentProviderDetailSurface>
  );
}
