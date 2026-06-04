import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AlertCircleIcon,
  BrainIcon,
  CheckIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  KeyRoundIcon,
  LinkIcon,
  ListPlusIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RouteIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  TestTubeIcon,
  Trash2Icon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  hasModelCapability,
  isConfiguredModel,
} from "../../../services/ai-defaults";
import type { AIModelConfig } from "../../../stores/settings.store";
import { getCategoryIcon } from "../../ui/ModelIcons";
import {
  getEndpointDisplayName,
  getEndpointCategory,
  getEndpointHost,
  getModelCategory,
} from "./helpers";
import type { EndpointGroup, EndpointStatus, ModelFormState } from "./types";

function getStatusToneClass(tone: EndpointStatus["tone"]): string {
  if (tone === "ready") {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (tone === "error") {
    return "bg-red-500/10 text-red-600 dark:text-red-400";
  }
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "******";
  }
  if (trimmed.length <= 8) {
    return "******";
  }
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

type ModelBadge = {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
};

function ModelIconBadge({ badge }: { badge: ModelBadge }) {
  const Icon = badge.icon;
  return (
    <span
      aria-label={badge.label}
      title={badge.label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
        badge.primary
          ? "bg-primary/10 text-primary"
          : "border border-border text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function ModelRouteBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center rounded-md bg-primary/10 px-2 text-[11px] font-medium text-primary">
      {label}
    </span>
  );
}

export function EndpointsSection({
  routingContent,
  advancedContent,
  endpointGroups,
  endpointStatuses,
  testingDefault,
  testingEndpointKey,
  testingModelId,
  modelScenarioBadges,
  onTestDefault,
  onTestEndpoint,
  onEditEndpoint,
  onUpdateEndpointCredentials,
  onAddProvider,
  onAddModel,
  onFetchModels,
  onSetDefaultModel,
  onTestModel,
  onEditModel,
  onDeleteModel,
}: {
  routingContent: ReactNode;
  advancedContent: ReactNode;
  endpointGroups: EndpointGroup[];
  endpointStatuses: Record<string, EndpointStatus>;
  testingDefault: boolean;
  testingEndpointKey: string | null;
  testingModelId: string | null;
  modelScenarioBadges: Map<string, string[]>;
  onTestDefault: () => void;
  onTestEndpoint: (group: EndpointGroup) => void;
  onEditEndpoint: (group: EndpointGroup) => void;
  onUpdateEndpointCredentials: (
    group: EndpointGroup,
    credentials: { apiKey: string; apiUrl: string },
  ) => void;
  onAddProvider: () => void;
  onAddModel: (
    preset?: Partial<ModelFormState>,
    options?: { lockEndpoint?: boolean; fetchModels?: boolean },
  ) => void;
  onFetchModels: (preset: Partial<ModelFormState>) => void;
  onSetDefaultModel: (modelId: string) => void;
  onTestModel: (model: AIModelConfig) => void;
  onEditModel: (model: AIModelConfig) => void;
  onDeleteModel: (model: AIModelConfig) => void;
}) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [activePanel, setActivePanel] = useState<
    "provider" | "routing" | "advanced"
  >("provider");
  const [selectedEndpointKey, setSelectedEndpointKey] = useState<string | null>(
    endpointGroups[0]?.key ?? null,
  );

  useEffect(() => {
    if (endpointGroups.length === 0) {
      setSelectedEndpointKey(null);
      return;
    }
    if (
      !selectedEndpointKey ||
      !endpointGroups.some((group) => group.key === selectedEndpointKey)
    ) {
      setSelectedEndpointKey(endpointGroups[0].key);
    }
  }, [endpointGroups, selectedEndpointKey]);

  const selectedGroup = useMemo(
    () =>
      endpointGroups.find((group) => group.key === selectedEndpointKey) ??
      endpointGroups[0] ??
      null,
    [endpointGroups, selectedEndpointKey],
  );
  const selectedApiKey = selectedGroup?.apiKey || selectedGroup?.models[0]?.apiKey || "";
  const selectedApiUrl = selectedGroup?.apiUrl || "";
  const [credentialDraft, setCredentialDraft] = useState({
    groupKey: selectedGroup?.key ?? "",
    apiKey: selectedApiKey,
    apiUrl: selectedApiUrl,
  });
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setCredentialDraft({
      groupKey: selectedGroup?.key ?? "",
      apiKey: selectedApiKey,
      apiUrl: selectedApiUrl,
    });
  }, [selectedApiKey, selectedApiUrl, selectedGroup?.key]);

  const credentialsDirty =
    credentialDraft.groupKey === selectedGroup?.key &&
    (credentialDraft.apiKey !== selectedApiKey ||
      credentialDraft.apiUrl !== selectedApiUrl);
  const canSaveCredentials =
    credentialsDirty && credentialDraft.apiUrl.trim().length > 0;

  const saveCredentials = () => {
    if (!selectedGroup || !canSaveCredentials) {
      return;
    }
    onUpdateEndpointCredentials(selectedGroup, {
      apiKey: credentialDraft.apiKey,
      apiUrl: credentialDraft.apiUrl,
    });
  };

  const resetCredentials = () => {
    setCredentialDraft({
      groupKey: selectedGroup?.key ?? "",
      apiKey: selectedApiKey,
      apiUrl: selectedApiUrl,
    });
  };

  const filteredEndpointGroups = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) {
      return endpointGroups;
    }
    return endpointGroups.filter((group) => {
      const providerLabel = getEndpointDisplayName(group).toLowerCase();
      const endpointHost = getEndpointHost(group.apiUrl, "").toLowerCase();
      const hasMatchingModel = group.models.some((model) =>
        `${model.name ?? ""} ${model.model}`
          .toLowerCase()
          .includes(normalizedSearch),
      );
      return (
        providerLabel.includes(normalizedSearch) ||
        endpointHost.includes(normalizedSearch) ||
        hasMatchingModel
      );
    });
  }, [endpointGroups, searchText]);

  const getProtocolLabel = (
    protocol: ModelFormState["apiProtocol"],
  ): string => {
    switch (protocol) {
      case "gemini":
        return t("settings.protocolGeminiCompatible");
      case "anthropic":
        return t("settings.protocolAnthropicCompatible");
      case "openai":
      default:
        return t("settings.protocolOpenAICompatible");
    }
  };

  const getEndpointStatus = (group: EndpointGroup): EndpointStatus => {
    const runtimeStatus = endpointStatuses[group.key];
    if (runtimeStatus) {
      return runtimeStatus;
    }
    if (
      group.models.some(
        (model) =>
          typeof model.lastVerifiedAt === "string" &&
          model.lastVerifiedAt.trim().length > 0,
      )
    ) {
      return {
        tone: "ready",
        label: t("settings.aiWorkbenchConnected"),
        detail: t("settings.aiWorkbenchModelCount", {
          count: group.models.length,
        }),
      };
    }
    if (group.models.some(isConfiguredModel)) {
      return {
        tone: "warning",
        label: t("settings.aiWorkbenchUnverified"),
        detail: t("settings.aiWorkbenchModelCount", {
          count: group.models.length,
        }),
      };
    }
    return {
      tone: "warning",
      label: t("settings.aiWorkbenchNotConfigured"),
      detail: t("settings.aiWorkbenchMissingModelConfig"),
    };
  };

  if (endpointGroups.length === 0 || !selectedGroup) {
    return (
      <section className="h-full min-h-0 overflow-hidden">
        <div className="grid h-full min-h-0 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="app-wallpaper-panel flex min-h-0 flex-col border-r border-border">
            <div className="border-b border-border p-3">
              <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="shrink-0">
                  {t("settings.aiWorkbenchSubmenuModelConfig")}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActivePanel("routing")}
                  className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                    activePanel === "routing"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-background"
                  }`}
                >
                  <RouteIcon className="h-4 w-4" />
                  {t("settings.aiWorkbenchModelRouting")}
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel("advanced")}
                  className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                    activePanel === "advanced"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-background"
                  }`}
                >
                  <Settings2Icon className="h-4 w-4" />
                  {t("settings.advancedParams")}
                </button>
              </div>
              <div className="my-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="shrink-0">{t("settings.providerName")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder={t("settings.searchProvidersAndModels")}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t("settings.aiWorkbenchNoModels")}
            </div>
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={onAddProvider}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted"
              >
                <PlusIcon className="h-4 w-4" />
                {t("settings.addProvider")}
              </button>
            </div>
          </aside>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="w-full">
              <h1 className="mb-4 text-lg font-semibold">{t("settings.ai")}</h1>
              {activePanel === "routing" ? (
                routingContent
              ) : activePanel === "advanced" ? (
                advancedContent
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-center text-sm text-muted-foreground">
                  {t("settings.aiWorkbenchNoModels")}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const endpointStatus = getEndpointStatus(selectedGroup);
  const providerMetaLabel = getProtocolLabel(selectedGroup.apiProtocol);
  const endpointHost = getEndpointHost(
    selectedGroup.apiUrl,
    t("settings.aiWorkbenchEndpointAddressMissing"),
  );
  const firstModel = selectedGroup.models[0];

  return (
    <section className="h-full min-h-0 overflow-hidden">
      <div className="grid h-full min-h-0 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="app-wallpaper-panel flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-3">
            <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="shrink-0">
                {t("settings.aiWorkbenchSubmenuModelConfig")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActivePanel("routing")}
                className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  activePanel === "routing"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-background"
                }`}
              >
                <RouteIcon className="h-4 w-4" />
                {t("settings.aiWorkbenchModelRouting")}
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("advanced")}
                className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  activePanel === "advanced"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-background"
                }`}
              >
                <Settings2Icon className="h-4 w-4" />
                {t("settings.advancedParams")}
              </button>
            </div>
            <div className="my-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="shrink-0">{t("settings.providerName")}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="relative mt-3">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("settings.searchProvidersAndModels")}
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {filteredEndpointGroups.map((group) => {
                const status = getEndpointStatus(group);
                const selected =
                  activePanel === "provider" && group.key === selectedGroup.key;
                const category = getEndpointCategory(
                  group.provider,
                  group.models,
                );
                const groupDetail = getEndpointHost(
                  group.apiUrl,
                  getProtocolLabel(group.apiProtocol),
                );

                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setSelectedEndpointKey(group.key);
                      setActivePanel("provider");
                    }}
                    className={`flex h-12 w-full items-center gap-2 rounded-md border px-2 text-left transition-colors ${
                      selected
                        ? "border-border bg-background shadow-sm"
                        : "border-transparent hover:bg-background/70"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                      {getCategoryIcon(category, 17)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {getEndpointDisplayName(group)}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {groupDetail}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          status.tone === "ready"
                            ? "bg-emerald-500"
                            : status.tone === "error"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        }`}
                      />
                      <span className="min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium text-muted-foreground">
                        {group.models.length}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={onAddProvider}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted"
            >
              <PlusIcon className="h-4 w-4" />
              {t("settings.addProvider")}
            </button>
          </div>
        </aside>

        {activePanel === "routing" || activePanel === "advanced" ? (
          <div className="min-w-0 overflow-y-auto px-6 py-5">
            <div className="w-full">
              <h1 className="mb-4 text-lg font-semibold">{t("settings.ai")}</h1>
              {activePanel === "routing" ? routingContent : advancedContent}
            </div>
          </div>
        ) : (
          <div className="min-w-0 overflow-y-auto px-6 py-5">
            <div className="w-full">
              <h1 className="mb-4 text-lg font-semibold">{t("settings.ai")}</h1>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                      {getCategoryIcon(
                        getEndpointCategory(
                          selectedGroup.provider,
                          selectedGroup.models,
                        ),
                        20,
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-base font-semibold">
                          {getEndpointDisplayName(selectedGroup)}
                        </h4>
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {providerMetaLabel}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${getStatusToneClass(endpointStatus.tone)}`}
                        >
                          {endpointStatus.tone === "ready" ? (
                            <CheckCircle2Icon className="h-3 w-3" />
                          ) : (
                            <AlertCircleIcon className="h-3 w-3" />
                          )}
                          {endpointStatus.label}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {endpointStatus.detail}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onTestDefault}
                      disabled={testingDefault}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {testingDefault ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <TestTubeIcon className="h-3.5 w-3.5" />
                      )}
                      {t("settings.aiWorkbenchTestDefault")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTestEndpoint(selectedGroup)}
                      disabled={testingEndpointKey === selectedGroup.key}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {testingEndpointKey === selectedGroup.key ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <TestTubeIcon className="h-3.5 w-3.5" />
                      )}
                      {t("settings.testConnection")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditEndpoint(selectedGroup)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t("settings.aiWorkbenchEndpointCredentials", "Endpoint credentials")}
                      </div>
                      {credentialsDirty ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={saveCredentials}
                            disabled={!canSaveCredentials}
                            aria-label={t("common.save")}
                            title={t("common.save")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={resetCredentials}
                            aria-label={t("common.cancel")}
                            title={t("common.cancel")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-xs text-muted-foreground">
                            {t("settings.apiUrl")}
                          </span>
                          <input
                            type="text"
                            value={credentialDraft.apiUrl}
                            onChange={(event) =>
                              setCredentialDraft((draft) => ({
                                ...draft,
                                apiUrl: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                saveCredentials();
                              }
                              if (event.key === "Escape") {
                                resetCredentials();
                              }
                            }}
                            aria-label={t(
                              "settings.aiWorkbenchEndpointApiUrl",
                              "Endpoint API URL",
                            )}
                            title={endpointHost}
                            className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-primary/15"
                          />
                        </label>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <KeyRoundIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-xs text-muted-foreground">
                            {t("settings.apiKey")}
                          </span>
                          <span className="relative block">
                            <input
                              type={showApiKey ? "text" : "password"}
                              value={credentialDraft.apiKey}
                              onChange={(event) =>
                                setCredentialDraft((draft) => ({
                                  ...draft,
                                  apiKey: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveCredentials();
                                }
                                if (event.key === "Escape") {
                                  resetCredentials();
                                }
                              }}
                              aria-label={t(
                                "settings.aiWorkbenchEndpointApiKey",
                                "Endpoint API Key",
                              )}
                              placeholder={maskApiKey(selectedApiKey)}
                              className="h-9 w-full rounded-md border border-border bg-background px-3 pr-9 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/15"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowApiKey((visible) => !visible)
                              }
                              aria-label={
                                showApiKey
                                  ? t("common.hide", "Hide")
                                  : t("common.show", "Show")
                              }
                              title={
                                showApiKey
                                  ? t("common.hide", "Hide")
                                  : t("common.show", "Show")
                              }
                              className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {showApiKey ? (
                                <EyeOffIcon className="h-4 w-4" />
                              ) : (
                                <EyeIcon className="h-4 w-4" />
                              )}
                            </button>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-sm font-semibold">
                    {t("settings.model")}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onFetchModels({
                          providerId: selectedGroup.providerConfigId,
                          provider: selectedGroup.provider,
                          apiProtocol: selectedGroup.apiProtocol,
                          apiKey:
                            selectedGroup.apiKey || firstModel?.apiKey || "",
                          apiUrl: selectedGroup.apiUrl,
                          type: firstModel?.type ?? "chat",
                        })
                      }
                      aria-label={t("settings.fetchModels")}
                      title={t("settings.fetchModels")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                    >
                      <ListPlusIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onAddModel(
                          {
                            providerId: selectedGroup.providerConfigId,
                            provider: selectedGroup.provider,
                            apiProtocol: selectedGroup.apiProtocol,
                            apiKey:
                              selectedGroup.apiKey || firstModel?.apiKey || "",
                            apiUrl: selectedGroup.apiUrl,
                            type: firstModel?.type ?? "chat",
                          },
                          { lockEndpoint: true },
                        )
                      }
                      aria-label={t("settings.addModel")}
                      title={t("settings.addModel")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {selectedGroup.models.map((model) => {
                    const capabilityBadges: ModelBadge[] = [
                      {
                        label:
                          (model.type ?? "chat") === "image"
                            ? t("settings.imageModel")
                            : t("settings.chatModel"),
                        icon:
                          (model.type ?? "chat") === "image"
                            ? ImageIcon
                            : TypeIcon,
                        primary: false,
                      },
                      ...(model.isDefault
                        ? [
                            {
                              label: t("settings.aiWorkbenchTypeDefault"),
                              icon: StarIcon,
                              primary: true,
                            },
                          ]
                        : []),
                      ...(hasModelCapability(model, "vision")
                        ? [
                            {
                              label: t("settings.aiWorkbenchVisionCapability"),
                              icon: EyeIcon,
                              primary: false,
                            },
                          ]
                        : []),
                      ...(hasModelCapability(model, "reasoning")
                        ? [
                            {
                              label: t(
                                "settings.aiWorkbenchReasoningCapability",
                              ),
                              icon: BrainIcon,
                              primary: false,
                            },
                          ]
                        : []),
                    ];
                    const routeBadges = modelScenarioBadges.get(model.id) ?? [];

                    return (
                      <div
                        key={model.id}
                        className="group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/20 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                            {getCategoryIcon(getModelCategory(model), 20)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {model.name || model.model}
                            </div>
                            {model.name ? (
                              <div className="truncate text-xs text-muted-foreground">
                                {model.model}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex min-w-0 flex-wrap gap-1.5">
                            {capabilityBadges.map((badge) => (
                              <ModelIconBadge
                                key={`${model.id}-${badge.label}`}
                                badge={badge}
                              />
                            ))}
                            {routeBadges.map((badge) => (
                              <ModelRouteBadge
                                key={`${model.id}-${badge}`}
                                label={badge}
                              />
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
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
                          >
                            {testingModelId === model.id ? (
                              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <TestTubeIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {!model.isDefault ? (
                            <button
                              type="button"
                              onClick={() => onSetDefaultModel(model.id)}
                              aria-label={t("settings.setDefault")}
                              title={t("settings.setDefault")}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                            >
                              <StarIcon className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onEditModel(model)}
                            aria-label={t("common.edit")}
                            title={t("common.edit")}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteModel(model)}
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-500 hover:bg-red-500/5"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
