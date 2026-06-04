import { useMemo, useState } from "react";

import {
  BrainIcon,
  EyeIcon,
  ImageIcon,
  TestTubeIcon,
  ZapIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import {
  fetchAvailableModels,
  normalizeApiUrlInput,
  testAIConnection,
  testImageGeneration,
  type FetchModelsResult,
  type ModelInfo,
} from "../../services/ai";
import {
  getModelsByType,
  isConfiguredModel,
  resolveRouteModel,
} from "../../services/ai-defaults";
import {
  useSettingsStore,
  type AIModelConfig,
  type AIModelRoute,
} from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { AdvancedSection } from "./ai-workbench/AdvancedSection";
import { EMPTY_FORM, MODEL_ROUTE_DEFINITIONS } from "./ai-workbench/constants";
import { EndpointFormModal } from "./ai-workbench/EndpointFormModal";
import { EndpointsSection } from "./ai-workbench/EndpointsSection";
import {
  buildChatParams,
  buildEndpointKey,
  buildEndpointGroupKey,
  buildImageParams,
  cloneDefaultCapabilities,
  cloneDefaultChatParams,
  cloneDefaultImageParams,
  createFormFromModel,
  getModelDisplayName,
  getEndpointDisplayName,
  getProviderInfo,
  inferModelAttributes,
} from "./ai-workbench/helpers";
import { ModelFetchModal } from "./ai-workbench/ModelFetchModal";
import { ModelFormModal } from "./ai-workbench/ModelFormModal";
import { ScenarioDefaultsSection } from "./ai-workbench/ScenarioDefaultsSection";
import { StatusCard } from "./ai-workbench/shared";
import type {
  EndpointDraft,
  EndpointGroup,
  EndpointStatus,
  ModelFormState,
  StatusCardData,
} from "./ai-workbench/types";

function buildVerifiedEndpointStatus(
  group: EndpointGroup,
  t: TFunction,
): EndpointStatus | null {
  const verifiedModels = group.models.filter(
    (model) =>
      typeof model.lastVerifiedAt === "string" &&
      model.lastVerifiedAt.trim().length > 0,
  );

  if (verifiedModels.length === 0) {
    return null;
  }

  const latestVerifiedAt = verifiedModels.reduce(
    (latest, model) => {
      const current = Date.parse(model.lastVerifiedAt || "");
      if (!Number.isFinite(current)) {
        return latest;
      }
      return latest === null || current > latest ? current : latest;
    },
    null as number | null,
  );

  const verifiedModel = verifiedModels[0];
  const detailPrefix = verifiedModel?.model?.trim()
    ? `${verifiedModel.model} · `
    : "";
  const detailSuffix =
    latestVerifiedAt !== null
      ? new Date(latestVerifiedAt).toLocaleString()
      : t("settings.aiWorkbenchModelCount", {
          count: group.models.length,
        });

  return {
    tone: "ready",
    label: t("settings.aiWorkbenchConnected"),
    detail: `${detailPrefix}${detailSuffix}`,
  };
}

function getFetchModelsFeedback(
  result: FetchModelsResult,
  t: TFunction,
  apiUrl?: string,
): { message: string; type: "error" | "warning" | "info" } {
  if (result.success && result.models.length === 0) {
    return {
      message: t("settings.aiWorkbenchFetchModelsEmpty"),
      type: "warning",
    };
  }

  switch (result.reason) {
    case "auth":
      return {
        message: t("settings.aiWorkbenchFetchModelsAuthError"),
        type: "error",
      };
    case "unsupported":
    case "parse":
      return {
        message: t("settings.aiWorkbenchFetchModelsUnsupported"),
        type: "info",
      };
    case "network":
      return {
        message: getConnectionErrorMessage(
          result.error || t("settings.aiWorkbenchFetchModelsNetworkError"),
          t,
          result.endpoint || apiUrl,
        ),
        type: "warning",
      };
    default:
      return {
        message: result.error || t("settings.aiWorkbenchFetchModelsFailed"),
        type: "error",
      };
  }
}

function findProviderForModel(
  providers: EndpointGroup[],
  model: AIModelConfig,
): EndpointGroup | undefined {
  if (model.providerId?.trim()) {
    return providers.find((provider) => provider.providerConfigId === model.providerId);
  }

  return providers.find(
    (provider) =>
      provider.provider === model.provider &&
      provider.apiProtocol === model.apiProtocol &&
      provider.apiUrl === model.apiUrl &&
      provider.apiKey === model.apiKey,
  );
}

function getConnectionErrorMessage(
  message: string,
  t: TFunction,
  apiUrl?: string,
): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror")
  ) {
    try {
      const currentOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const targetOrigin = apiUrl ? new URL(apiUrl).origin : "";
      if (
        currentOrigin &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin) &&
        targetOrigin
      ) {
        return t("settings.aiWorkbenchCorsBlockedDev", {
          origin: currentOrigin,
          target: targetOrigin,
        });
      }
      if (targetOrigin) {
        return t("settings.aiWorkbenchCorsBlocked", {
          target: targetOrigin,
        });
      }
    } catch {
      // fall through to generic network copy
    }
    return t("settings.aiWorkbenchConnectionNetworkError");
  }
  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid api key")
  ) {
    return t("settings.aiWorkbenchConnectionAuthError");
  }
  return message;
}

function formatModelTestSuccessToast(
  modelName: string,
  latency: number,
  t: TFunction,
  extra?: string,
): string {
  return `${modelName} ${t("settings.aiWorkbenchModelTestSuccess", "测试成功")} (${latency}ms)${extra ?? ""}`;
}

function formatModelTestFailureToast(
  modelName: string,
  message: string,
  t: TFunction,
  apiUrl?: string,
): string {
  return `${modelName} ${t("settings.aiWorkbenchModelTestFailed", "测试失败")}: ${getConnectionErrorMessage(message, t, apiUrl)}`;
}

export function AISettingsPrototype() {
  const settings = useSettingsStore();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [modelForm, setModelForm] = useState<ModelFormState>(EMPTY_FORM);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [showModelFetch, setShowModelFetch] = useState(false);
  const [showEndpointForm, setShowEndpointForm] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState<EndpointDraft | null>(
    null,
  );
  const [testingDefault, setTestingDefault] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testingEndpointKey, setTestingEndpointKey] = useState<string | null>(
    null,
  );
  const [savingModel, setSavingModel] = useState(false);
  const [modelEndpointLocked, setModelEndpointLocked] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [endpointStatuses, setEndpointStatuses] = useState<
    Record<string, EndpointStatus>
  >({});

  const aiModels = settings.aiModels;
  const chatModels = useMemo(
    () => getModelsByType(aiModels, "chat"),
    [aiModels],
  );
  const imageModels = useMemo(
    () => getModelsByType(aiModels, "image"),
    [aiModels],
  );

  const resolvedRouteModels = useMemo(
    () => ({
      mainText: resolveRouteModel(
        aiModels,
        settings.modelRouteDefaults,
        "mainText",
      ),
      fastText: resolveRouteModel(
        aiModels,
        settings.modelRouteDefaults,
        "fastText",
      ),
      visionText: resolveRouteModel(
        aiModels,
        settings.modelRouteDefaults,
        "visionText",
      ),
      imageGeneration: resolveRouteModel(
        aiModels,
        settings.modelRouteDefaults,
        "imageGeneration",
      ),
    }),
    [aiModels, settings.modelRouteDefaults],
  );

  const endpointGroups = useMemo(() => {
    const grouped = (settings.aiProviders ?? []).reduce<
      Record<string, EndpointGroup>
    >((acc, providerConfig) => {
      const key = buildEndpointKey(providerConfig);
      acc[key] = {
        key,
        providerConfigId: providerConfig.id,
        name: providerConfig.name,
        provider: providerConfig.provider,
        apiProtocol: providerConfig.apiProtocol,
        apiKey: providerConfig.apiKey,
        apiUrl: providerConfig.apiUrl,
        models: [],
      };
      return acc;
    }, {});

    for (const model of aiModels) {
      const providerGroup = findProviderForModel(Object.values(grouped), model);
      const key = providerGroup?.key ?? buildEndpointGroupKey(model);
      if (!grouped[key]) {
        grouped[key] = {
          key,
          providerConfigId: model.providerId,
          provider: model.provider,
          apiProtocol: model.apiProtocol,
          apiKey: model.apiKey,
          apiUrl: model.apiUrl,
          models: [],
        };
      }
      grouped[key].models.push(model);
    }

    return Object.values(grouped).sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }, [aiModels, settings.aiProviders]);

  const hasLegacyOnlyConfig = useMemo(
    () =>
      aiModels.length === 0 &&
      Boolean(
        settings.aiProvider.trim() &&
        settings.aiApiKey.trim() &&
        settings.aiApiUrl.trim() &&
        settings.aiModel.trim(),
      ),
    [
      aiModels.length,
      settings.aiApiKey,
      settings.aiApiUrl,
      settings.aiModel,
      settings.aiProvider,
    ],
  );

  const modelScenarioBadges = useMemo(() => {
    const entries = Object.entries(resolvedRouteModels) as Array<
      [AIModelRoute, AIModelConfig | null]
    >;
    const mapping = new Map<string, string[]>();

    for (const [route, model] of entries) {
      if (!model) {
        continue;
      }

      const badgeKey = MODEL_ROUTE_DEFINITIONS.find(
        (item) => item.key === route,
      )?.badgeKey;
      const badge = badgeKey ? t(badgeKey) : null;
      if (!badge) {
        continue;
      }

      const existing = mapping.get(model.id) ?? [];
      existing.push(badge);
      mapping.set(model.id, existing);
    }

    return mapping;
  }, [resolvedRouteModels, t]);

  const statusCards = useMemo<StatusCardData[]>(
    () => [
      {
        title: t("settings.aiWorkbenchMainTextModel"),
        value: getModelDisplayName(
          resolvedRouteModels.mainText,
          t("settings.aiWorkbenchNotConfigured"),
        ),
        detail: t("settings.aiWorkbenchRouteMainTextDesc"),
        tone: resolvedRouteModels.mainText ? "ready" : "warning",
        icon: BrainIcon,
      },
      {
        title: t("settings.imageModels"),
        value: getModelDisplayName(
          resolvedRouteModels.imageGeneration,
          t("settings.aiWorkbenchNotConfigured"),
        ),
        detail: t("settings.aiWorkbenchRouteImageGenerationDesc"),
        tone: resolvedRouteModels.imageGeneration ? "ready" : "warning",
        icon: ImageIcon,
      },
      {
        title: t("settings.aiWorkbenchFastModels"),
        value: getModelDisplayName(
          resolvedRouteModels.fastText,
          t("settings.aiWorkbenchNotConfigured"),
        ),
        detail: t("settings.aiWorkbenchRouteFastTextDesc"),
        tone: resolvedRouteModels.fastText ? "ready" : "warning",
        icon: ZapIcon,
      },
      {
        title: t("settings.aiWorkbenchVisionModels"),
        value: getModelDisplayName(
          resolvedRouteModels.visionText,
          t("settings.aiWorkbenchNotConfigured"),
        ),
        detail: t("settings.aiWorkbenchRouteVisionTextDesc"),
        tone: resolvedRouteModels.visionText ? "ready" : "warning",
        icon: EyeIcon,
      },
    ],
    [resolvedRouteModels, t],
  );

  const fetchModelsForForm = async (form: ModelFormState) => {
    if (!form.apiKey.trim() || !form.apiUrl.trim()) {
      showToast(t("settings.fillApiFirst"), "error");
      return false;
    }

    setFetchingModels(true);
    const result = await fetchAvailableModels(
      form.apiUrl,
      form.apiKey,
      form.apiProtocol,
    );
    setFetchingModels(false);

    if (!result.success || result.models.length === 0) {
      const feedback = getFetchModelsFeedback(result, t, form.apiUrl);
      showToast(feedback.message, feedback.type);
      return false;
    }

    setAvailableModels(result.models);
    showToast(
      t("settings.modelsLoaded", { count: result.models.length }),
      "success",
    );
    return true;
  };

  const createModelFormState = (preset?: Partial<ModelFormState>) => {
    const provider = preset?.provider || EMPTY_FORM.provider;
    const providerInfo = getProviderInfo(provider);
    const apiProtocol =
      preset?.apiProtocol ??
      providerInfo?.recommendedProtocol ??
      EMPTY_FORM.apiProtocol;
    const nextForm = {
      ...EMPTY_FORM,
      ...preset,
      provider,
      apiProtocol,
      apiUrl: preset?.apiUrl ?? providerInfo?.defaultUrl ?? EMPTY_FORM.apiUrl,
      capabilities: preset?.capabilities
        ? { ...cloneDefaultCapabilities(), ...preset.capabilities }
        : cloneDefaultCapabilities(),
      chatParams: preset?.chatParams
        ? { ...cloneDefaultChatParams(), ...preset.chatParams }
        : cloneDefaultChatParams(),
      imageParams: preset?.imageParams
        ? { ...cloneDefaultImageParams(), ...preset.imageParams }
        : cloneDefaultImageParams(),
    };

    return nextForm;
  };

  const openAddModel = (
    preset?: Partial<ModelFormState>,
    options?: { lockEndpoint?: boolean },
  ) => {
    const nextForm = createModelFormState(preset);

    setEditingModelId(null);
    setAvailableModels([]);
    setModelEndpointLocked(options?.lockEndpoint === true);
    setModelForm(nextForm);
    setShowModelForm(true);
  };

  const openFetchModels = async (preset?: Partial<ModelFormState>) => {
    const nextForm = createModelFormState(preset);

    setEditingModelId(null);
    setAvailableModels([]);
    setModelEndpointLocked(true);
    setModelForm(nextForm);
    setShowModelFetch(true);

    const loaded = await fetchModelsForForm(nextForm);
    if (!loaded) {
      setShowModelFetch(false);
    }
  };

  const openEditModel = (model: AIModelConfig) => {
    setEditingModelId(model.id);
    setAvailableModels([]);
    setModelEndpointLocked(true);
    setModelForm(createFormFromModel(model));
    setShowModelForm(true);
  };

  const closeModelForm = () => {
    setEditingModelId(null);
    setAvailableModels([]);
    setModelEndpointLocked(false);
    setShowModelForm(false);
    setModelForm({
      ...EMPTY_FORM,
      chatParams: cloneDefaultChatParams(),
      imageParams: cloneDefaultImageParams(),
      capabilities: cloneDefaultCapabilities(),
    });
  };

  const closeModelFetch = () => {
    setShowModelFetch(false);
    setAvailableModels([]);
    setModelForm({
      ...EMPTY_FORM,
      chatParams: cloneDefaultChatParams(),
      imageParams: cloneDefaultImageParams(),
      capabilities: cloneDefaultCapabilities(),
    });
  };

  const handleTestDraft = async () => {
    if (
      !modelForm.apiKey.trim() ||
      !modelForm.apiUrl.trim() ||
      !modelForm.model.trim()
    ) {
      showToast(t("settings.fillComplete"), "error");
      return;
    }

    setTestingModelId(editingModelId || "__draft__");
    const modelName = modelForm.name.trim() || modelForm.model.trim() || "AI";
    try {
      if (modelForm.type === "image") {
        const result = await testImageGeneration(
          {
            provider: modelForm.provider,
            apiProtocol: modelForm.apiProtocol,
            apiKey: modelForm.apiKey,
            apiUrl: modelForm.apiUrl,
            model: modelForm.model,
          },
          "A minimal product illustration on a clean background",
        );
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          formatModelTestSuccessToast(modelName, result.latency, t),
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: modelForm.provider,
          apiProtocol: modelForm.apiProtocol,
          apiKey: modelForm.apiKey,
          apiUrl: modelForm.apiUrl,
          model: modelForm.model,
        });
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          formatModelTestSuccessToast(modelName, result.latency, t),
          "success",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(
        formatModelTestFailureToast(modelName, message, t, modelForm.apiUrl),
        "error",
      );
    } finally {
      setTestingModelId(null);
    }
  };

  const handleSaveModel = () => {
    if (
      !modelForm.provider.trim() ||
      !modelForm.apiKey.trim() ||
      !modelForm.apiUrl.trim() ||
      !modelForm.model.trim()
    ) {
      showToast(t("settings.fillComplete"), "error");
      return;
    }

    const supportsChat = modelForm.capabilities.chat === true;
    const supportsImageGeneration =
      modelForm.capabilities.imageGeneration === true;
    const nextChatParams = supportsChat ? buildChatParams(modelForm) : undefined;
    const nextImageParams = supportsImageGeneration
      ? buildImageParams(modelForm)
      : undefined;

    if (supportsChat && !nextChatParams) {
      showToast(t("settings.aiWorkbenchInvalidCustomParams"), "error");
      return;
    }

    setSavingModel(true);
    const payload = {
      name: modelForm.name.trim(),
      providerId: modelForm.providerId?.trim() || undefined,
      provider: modelForm.provider.trim(),
      apiProtocol: modelForm.apiProtocol,
      apiKey: modelForm.apiKey.trim(),
      apiUrl: normalizeApiUrlInput(modelForm.apiUrl),
      model: modelForm.model.trim(),
      type: modelForm.type,
      capabilities: {
        ...cloneDefaultCapabilities(),
        ...modelForm.capabilities,
      },
      chatParams: nextChatParams,
      imageParams: nextImageParams,
    };

    if (editingModelId) {
      settings.updateAiModel(editingModelId, payload);
      showToast(t("settings.modelUpdated"), "success");
    } else {
      settings.addAiModel(payload);
      showToast(t("settings.modelAdded"), "success");
    }

    setSavingModel(false);
    closeModelForm();
  };

  const handleBatchAddModels = (selectedIds: string[]) => {
    if (
      !modelForm.provider.trim() ||
      !modelForm.apiKey.trim() ||
      !modelForm.apiUrl.trim()
    ) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    const inferredModels = selectedIds.map((modelId) => ({
      modelId,
      attributes: inferModelAttributes(modelId),
    }));
    const hasChatModel = inferredModels.some(
      (item) => item.attributes.type === "chat",
    );
    const nextChatParams = hasChatModel
      ? buildChatParams(modelForm)
      : undefined;
    const nextImageParams = buildImageParams(modelForm);

    if (hasChatModel && !nextChatParams) {
      showToast(t("settings.aiWorkbenchInvalidCustomParams"), "error");
      return;
    }

    setSavingModel(true);
    for (const { modelId, attributes } of inferredModels) {
      settings.addAiModel({
        name: "",
        providerId: modelForm.providerId?.trim() || undefined,
        provider: modelForm.provider.trim(),
        apiProtocol: modelForm.apiProtocol,
        apiKey: modelForm.apiKey.trim(),
        apiUrl: normalizeApiUrlInput(modelForm.apiUrl),
        model: modelId,
        type: attributes.type,
        capabilities: {
          ...cloneDefaultCapabilities(),
          ...attributes.capabilities,
        },
        chatParams:
          attributes.capabilities.chat === true ? nextChatParams : undefined,
        imageParams:
          attributes.capabilities.imageGeneration === true
            ? nextImageParams
            : undefined,
      });
    }
    setSavingModel(false);
    showToast(t("settings.modelAdded") + ` (${selectedIds.length})`, "success");
    closeModelForm();
    closeModelFetch();
  };

  const handleDeleteModel = (model: AIModelConfig) => {
    if (!confirm(t("settings.confirmDelete"))) {
      return;
    }

    const group = endpointGroups.find((item) =>
      item.models.some((groupModel) => groupModel.id === model.id),
    );
    if (group && !group.providerConfigId && group.models.length === 1) {
      settings.addAiProvider({
        name: group.name || getEndpointDisplayName(group),
        provider: group.provider,
        apiProtocol: group.apiProtocol,
        apiKey: group.apiKey,
        apiUrl: group.apiUrl,
        lastVerifiedAt: undefined,
      });
    }

    settings.deleteAiModel(model.id);
    showToast(t("settings.aiWorkbenchModelDeleted"), "success");
  };

  const handleTestModel = async (model: AIModelConfig) => {
    if (!isConfiguredModel(model)) {
      showToast(t("settings.aiWorkbenchIncompleteModel"), "error");
      return;
    }

    setTestingModelId(model.id);
    const modelName = getModelDisplayName(model, "AI");
    try {
      if ((model.type ?? "chat") === "image") {
        const result = await testImageGeneration(
          {
            provider: model.provider,
            apiProtocol: model.apiProtocol,
            apiKey: model.apiKey,
            apiUrl: model.apiUrl,
            model: model.model,
          },
          "A minimal product illustration on a clean background",
        );
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          formatModelTestSuccessToast(modelName, result.latency, t),
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: model.provider,
          apiProtocol: model.apiProtocol,
          apiKey: model.apiKey,
          apiUrl: model.apiUrl,
          model: model.model,
        });
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          formatModelTestSuccessToast(modelName, result.latency, t),
          "success",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(
        formatModelTestFailureToast(modelName, message, t, model.apiUrl),
        "error",
      );
    } finally {
      setTestingModelId(null);
    }
  };

  const handleTestEndpoint = async (group: EndpointGroup) => {
    const targetModel = group.models.find(isConfiguredModel);
    if (!targetModel) {
      showToast(t("settings.aiWorkbenchEndpointNotTestable"), "error");
      return;
    }

    setTestingEndpointKey(group.key);
    const verifiedAt = new Date().toISOString();
    try {
      if ((targetModel.type ?? "chat") === "image") {
        const result = await testImageGeneration(
          {
            provider: targetModel.provider,
            apiProtocol: targetModel.apiProtocol,
            apiKey: targetModel.apiKey,
            apiUrl: targetModel.apiUrl,
            model: targetModel.model,
          },
          "A minimal product illustration on a clean background",
        );
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        setEndpointStatuses((prev) => ({
          ...prev,
          [group.key]: {
            tone: "ready",
            label: t("settings.aiWorkbenchConnected"),
            detail: `${targetModel.model} · ${result.latency}ms`,
          },
        }));
        for (const model of group.models) {
          settings.updateAiModel(model.id, { lastVerifiedAt: verifiedAt });
        }
        showToast(
          t("settings.aiWorkbenchEndpointConnected", {
            latency: result.latency,
          }),
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: targetModel.provider,
          apiProtocol: targetModel.apiProtocol,
          apiKey: targetModel.apiKey,
          apiUrl: targetModel.apiUrl,
          model: targetModel.model,
        });
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        setEndpointStatuses((prev) => ({
          ...prev,
          [group.key]: {
            tone: "ready",
            label: t("settings.aiWorkbenchConnected"),
            detail: `${targetModel.model} · ${result.latency}ms`,
          },
        }));
        for (const model of group.models) {
          settings.updateAiModel(model.id, { lastVerifiedAt: verifiedAt });
        }
        showToast(
          t("settings.aiWorkbenchEndpointConnected", {
            latency: result.latency,
          }),
          "success",
        );
      }
    } catch (error) {
      const message = getConnectionErrorMessage(
        error instanceof Error ? error.message : String(error),
        t,
        targetModel.apiUrl,
      );
      setEndpointStatuses((prev) => ({
        ...prev,
        [group.key]: {
          tone: "error",
          label: t("toast.connectionFailed"),
          detail: message,
        },
      }));
      showToast(message, "error");
    } finally {
      setTestingEndpointKey(null);
    }
  };

  const openEditEndpoint = (group: EndpointGroup) => {
    const firstModel = group.models[0];
    setEndpointDraft({
      key: group.key,
      providerConfigId: group.providerConfigId,
      name: group.name || getEndpointDisplayName(group),
      provider: group.provider,
      apiProtocol: group.apiProtocol,
      apiKey: group.apiKey || firstModel?.apiKey || "",
      apiUrl: group.apiUrl,
    });
    setShowEndpointForm(true);
  };

  const openAddEndpoint = () => {
    const providerInfo = getProviderInfo(EMPTY_FORM.provider);
    setEndpointDraft({
      key: "",
      providerConfigId: undefined,
      name: providerInfo?.name || EMPTY_FORM.provider,
      provider: EMPTY_FORM.provider,
      apiProtocol: providerInfo?.recommendedProtocol || EMPTY_FORM.apiProtocol,
      apiKey: "",
      apiUrl: providerInfo?.defaultUrl || EMPTY_FORM.apiUrl,
    });
    setShowEndpointForm(true);
  };

  const closeEndpointForm = () => {
    setShowEndpointForm(false);
    setEndpointDraft(null);
  };

  const updateEndpointConfig = (
    targetGroup: EndpointGroup,
    providerConfig: {
      name: string;
      provider: string;
      apiProtocol: EndpointGroup["apiProtocol"];
      apiKey: string;
      apiUrl: string;
      lastVerifiedAt?: string;
    },
  ) => {
    if (targetGroup.providerConfigId) {
      settings.updateAiProvider(targetGroup.providerConfigId, providerConfig);
    }

    for (const model of targetGroup.models) {
      settings.updateAiModel(model.id, {
        providerId: targetGroup.providerConfigId,
        ...providerConfig,
      });
    }

    setEndpointStatuses((prev) => {
      const next = { ...prev };
      delete next[targetGroup.key];
      return next;
    });
  };

  const handleSaveEndpoint = () => {
    if (!endpointDraft) {
      return;
    }

    const providerConfig = {
      name:
        endpointDraft.name.trim() ||
        getEndpointDisplayName({ provider: endpointDraft.provider }),
      provider: endpointDraft.provider.trim(),
      apiProtocol: endpointDraft.apiProtocol,
      apiKey: endpointDraft.apiKey.trim(),
      apiUrl: normalizeApiUrlInput(endpointDraft.apiUrl),
      lastVerifiedAt: undefined,
    };

    const targetGroup = endpointGroups.find(
      (group) => group.key === endpointDraft.key,
    );
    if (!targetGroup) {
      settings.addAiProvider(providerConfig);
      closeEndpointForm();
      showToast(t("settings.aiWorkbenchProviderAdded"), "success");
      return;
    }

    updateEndpointConfig(targetGroup, providerConfig);
    closeEndpointForm();
    showToast(t("settings.aiWorkbenchEndpointUpdated"), "success");
  };

  const handleUpdateEndpointCredentials = (
    group: EndpointGroup,
    credentials: { apiKey: string; apiUrl: string },
  ) => {
    updateEndpointConfig(group, {
      name: group.name || getEndpointDisplayName(group),
      provider: group.provider,
      apiProtocol: group.apiProtocol,
      apiKey: credentials.apiKey.trim(),
      apiUrl: normalizeApiUrlInput(credentials.apiUrl),
      lastVerifiedAt: undefined,
    });
    showToast(t("settings.aiWorkbenchEndpointUpdated"), "success");
  };

  const handleTestDefaultModel = async () => {
    const model =
      resolvedRouteModels.mainText ||
      resolvedRouteModels.imageGeneration ||
      resolvedRouteModels.fastText;

    if (!model || !isConfiguredModel(model)) {
      showToast(t("settings.aiWorkbenchNoDefaultModel"), "error");
      return;
    }

    setTestingDefault(true);
    await handleTestModel(model);
    setTestingDefault(false);
  };

  const importLegacyConfig = () => {
    settings.addAiModel({
      name: settings.aiModel,
      provider: settings.aiProvider,
      apiProtocol: settings.aiApiProtocol,
      apiKey: settings.aiApiKey,
      apiUrl: settings.aiApiUrl,
      model: settings.aiModel,
      type: "chat",
      capabilities: cloneDefaultCapabilities(),
    });
    showToast(t("settings.aiWorkbenchLegacyImported"), "success");
  };

  const resolvedEndpointStatuses = Object.fromEntries(
    endpointGroups
      .map((group) => {
        const runtimeStatus = endpointStatuses[group.key];
        if (runtimeStatus) {
          return [group.key, runtimeStatus] as const;
        }

        const persistedStatus = buildVerifiedEndpointStatus(group, t);
        return persistedStatus ? ([group.key, persistedStatus] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, EndpointStatus] => entry !== null,
      ),
  );

  const routingContent = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void handleTestDefaultModel()}
          disabled={testingDefault}
          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium leading-none shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {testingDefault ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <TestTubeIcon className="h-4 w-4 text-muted-foreground" />
          )}
          {t("settings.aiWorkbenchTestDefault")}
        </button>
        <button
          type="button"
          onClick={() => {
            const group = endpointGroups[0];
            if (!group) {
              openAddEndpoint();
              return;
            }
            openAddModel(
              {
                provider: group.provider,
                apiProtocol: group.apiProtocol,
                apiKey: group.apiKey,
                apiUrl: group.apiUrl,
                type: group.models[0]?.type ?? "chat",
              },
              { lockEndpoint: true },
            );
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-medium leading-none text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {t("settings.addModel")}
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          {t("settings.aiWorkbenchStatusOverview")}
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statusCards.map((card) => (
            <StatusCard key={card.title} {...card} />
          ))}
        </div>
      </div>

      <ScenarioDefaultsSection
        chatModels={chatModels}
        imageModels={imageModels}
        modelRouteDefaults={settings.modelRouteDefaults}
        onRouteChange={(route, value) =>
          settings.setModelRouteDefault(route, value)
        }
      />
    </div>
  );

  const advancedContent = (
    <AdvancedSection
      translationMode={settings.translationMode}
      onTranslationModeChange={(value) => settings.setTranslationMode(value)}
      onConfigure={() => {
        const group = endpointGroups[0];
        if (!group) {
          openAddEndpoint();
          return;
        }
        openAddModel(
          {
            provider: group.provider,
            apiProtocol: group.apiProtocol,
            apiKey: group.apiKey,
            apiUrl: group.apiUrl,
            type: group.models[0]?.type ?? "chat",
          },
          { lockEndpoint: true },
        );
      }}
    />
  );

  return (
    <div className="h-full min-h-0 min-w-0">
      {hasLegacyOnlyConfig ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.aiWorkbenchLegacyBannerTitle")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("settings.aiWorkbenchLegacyBannerDesc")}
              </div>
            </div>
            <button
              type="button"
              onClick={importLegacyConfig}
              className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-xs font-medium leading-none text-primary-foreground"
            >
              {t("settings.aiWorkbenchImportLegacy")}
            </button>
          </div>
        </div>
      ) : null}

      <EndpointsSection
        routingContent={routingContent}
        advancedContent={advancedContent}
        testingDefault={testingDefault}
        onTestDefault={() => void handleTestDefaultModel()}
        endpointGroups={endpointGroups}
        endpointStatuses={resolvedEndpointStatuses}
        testingEndpointKey={testingEndpointKey}
        testingModelId={testingModelId}
        modelScenarioBadges={modelScenarioBadges}
        onTestEndpoint={(group) => void handleTestEndpoint(group)}
        onEditEndpoint={openEditEndpoint}
        onUpdateEndpointCredentials={handleUpdateEndpointCredentials}
        onAddProvider={openAddEndpoint}
        onAddModel={openAddModel}
        onFetchModels={(preset) => void openFetchModels(preset)}
        onSetDefaultModel={(modelId) => settings.setDefaultAiModel(modelId)}
        onTestModel={(model) => void handleTestModel(model)}
        onEditModel={openEditModel}
        onDeleteModel={handleDeleteModel}
      />

      {showModelForm ? (
        <ModelFormModal
          editingModelId={editingModelId}
          modelForm={modelForm}
          setModelForm={setModelForm}
          testingModelId={testingModelId}
          savingModel={savingModel}
          lockEndpointFields={modelEndpointLocked}
          onClose={closeModelForm}
          onTestDraft={() => void handleTestDraft()}
          onSave={handleSaveModel}
        />
      ) : null}

      {showModelFetch ? (
        <ModelFetchModal
          setModelForm={setModelForm}
          availableModels={availableModels}
          fetchingModels={fetchingModels}
          savingModel={savingModel}
          onClose={closeModelFetch}
          onBatchAdd={handleBatchAddModels}
        />
      ) : null}

      {showEndpointForm && endpointDraft ? (
        <EndpointFormModal
          endpointDraft={endpointDraft}
          setEndpointDraft={setEndpointDraft}
          onClose={closeEndpointForm}
          onSave={handleSaveEndpoint}
        />
      ) : null}
    </div>
  );
}
