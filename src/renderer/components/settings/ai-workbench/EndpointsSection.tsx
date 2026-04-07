import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getCategoryIcon } from "../../ui/ModelIcons";
import { isConfiguredModel } from "../../../services/ai-defaults";
import type { AIModelConfig } from "../../../stores/settings.store";
import {
  getEndpointCategory,
  getEndpointHost,
  getModelCategory,
  getProviderLabel,
} from "./helpers";
import type {
  EndpointGroup,
  EndpointStatus,
  ModelFormState,
} from "./types";

export function EndpointsSection({
  endpointGroups,
  endpointStatuses,
  testingEndpointKey,
  testingModelId,
  modelScenarioBadges,
  onTestEndpoint,
  onEditEndpoint,
  onAddModel,
  onSetDefaultModel,
  onTestModel,
  onEditModel,
  onDeleteModel,
}: {
  endpointGroups: EndpointGroup[];
  endpointStatuses: Record<string, EndpointStatus>;
  testingEndpointKey: string | null;
  testingModelId: string | null;
  modelScenarioBadges: Map<string, string[]>;
  onTestEndpoint: (group: EndpointGroup) => void;
  onEditEndpoint: (group: EndpointGroup) => void;
  onAddModel: (preset?: Partial<ModelFormState>) => void;
  onSetDefaultModel: (modelId: string) => void;
  onTestModel: (model: AIModelConfig) => void;
  onEditModel: (model: AIModelConfig) => void;
  onDeleteModel: (model: AIModelConfig) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        {t("settings.aiWorkbenchEndpoints")}
      </h3>
      {endpointGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("settings.aiWorkbenchNoModels")}
        </div>
      ) : (
        <div className="space-y-6">
          {endpointGroups.map((group) => {
            const endpointStatus =
              endpointStatuses[group.key] ??
              (group.models.some(isConfiguredModel)
                ? {
                    tone: "warning" as const,
                    label: t("settings.aiWorkbenchUnverified"),
                    detail: t("settings.aiWorkbenchModelCount", {
                      count: group.models.length,
                    }),
                  }
                : {
                    tone: "warning" as const,
                    label: t("settings.aiWorkbenchNotConfigured"),
                    detail: t("settings.aiWorkbenchMissingModelConfig"),
                  });

            return (
              <div
                key={group.key}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-lg border border-border/60 bg-background p-2 text-primary shadow-sm">
                      {getCategoryIcon(getEndpointCategory(group.provider, group.models), 18)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {getProviderLabel(group.provider)}
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            endpointStatus.tone === "ready"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : endpointStatus.tone === "error"
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {endpointStatus.tone === "ready" ? (
                            <CheckCircle2Icon className="h-3 w-3" />
                          ) : (
                            <AlertCircleIcon className="h-3 w-3" />
                          )}
                          {endpointStatus.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {getEndpointHost(
                          group.apiUrl,
                          t("settings.aiWorkbenchEndpointAddressMissing"),
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {endpointStatus.detail}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onTestEndpoint(group)}
                      disabled={testingEndpointKey === group.key}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs text-muted-foreground transition-all hover:border-border hover:bg-background disabled:opacity-50"
                    >
                      {testingEndpointKey === group.key ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheckIcon className="h-3.5 w-3.5" />
                      )}
                      {t("settings.testConnection")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditEndpoint(group)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs text-muted-foreground transition-all hover:border-border hover:bg-background"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onAddModel({
                          provider: group.provider,
                          apiKey: group.models[0]?.apiKey || "",
                          apiUrl: group.apiUrl,
                          type: group.models[0]?.type ?? "chat",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {t("settings.addModel")}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-border/40 bg-card">
                  {group.models.map((model) => {
                    const badges = [
                      {
                        label:
                          (model.type ?? "chat") === "image"
                            ? t("settings.imageModel")
                            : t("settings.chatModel"),
                        primary: false,
                      },
                      ...(model.isDefault
                        ? [{ label: t("settings.aiWorkbenchTypeDefault"), primary: true }]
                        : []),
                      ...(modelScenarioBadges.get(model.id) ?? []).map((badge) => ({
                        label: badge,
                        primary: true,
                      })),
                    ];

                    return (
                      <div
                        key={model.id}
                        className="group flex flex-col gap-3 px-4 py-2.5 transition-colors hover:bg-muted/10 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="rounded-lg border border-border/60 bg-background p-2 text-primary">
                            {getCategoryIcon(getModelCategory(model), 20)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {model.name || model.model}
                            </div>
                            {model.name ? (
                              <div className="text-xs text-muted-foreground">
                                {model.model}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {badges.map((badge) => (
                              <span
                                key={`${model.id}-${badge.label}`}
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                  badge.primary
                                    ? "bg-primary/10 text-primary"
                                    : "border border-border/60 text-muted-foreground"
                                }`}
                              >
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onTestModel(model)}
                            disabled={testingModelId === model.id}
                            aria-label={t("settings.aiWorkbenchTestAction")}
                            title={t("settings.aiWorkbenchTestAction")}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-muted/50 disabled:opacity-50"
                          >
                            {testingModelId === model.id ? (
                              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlayIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {!model.isDefault ? (
                            <button
                              type="button"
                              onClick={() => onSetDefaultModel(model.id)}
                              aria-label={t("settings.setDefault")}
                              title={t("settings.setDefault")}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-muted/50"
                            >
                              <StarIcon className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onEditModel(model)}
                            aria-label={t("common.edit")}
                            title={t("common.edit")}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-muted/50"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteModel(model)}
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-red-500 transition-all hover:border-red-500/20 hover:bg-red-500/5"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
