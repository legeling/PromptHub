import { useMemo, useState } from "react";

import {
  BrainIcon,
  ImageIcon,
  LanguagesIcon,
  WandSparklesIcon,
} from "lucide-react";
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
  resolveScenarioModel,
} from "../../services/ai-defaults";
import {
  useSettingsStore,
  type AIModelConfig,
  type AIUsageScenario,
} from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { AdvancedSection } from "./ai-workbench/AdvancedSection";
import { EMPTY_FORM, SCENARIO_DEFINITIONS } from "./ai-workbench/constants";
import { EndpointFormModal } from "./ai-workbench/EndpointFormModal";
import { EndpointsSection } from "./ai-workbench/EndpointsSection";
import { HeaderSection } from "./ai-workbench/HeaderSection";
import {
  buildChatParams,
  buildEndpointGroupKey,
  buildImageParams,
  cloneDefaultChatParams,
  cloneDefaultImageParams,
  createFormFromModel,
  getModelDisplayName,
  getProviderInfo,
} from "./ai-workbench/helpers";
import { ModelFormModal } from "./ai-workbench/ModelFormModal";
import { ScenarioDefaultsSection } from "./ai-workbench/ScenarioDefaultsSection";
import type {
  EndpointDraft,
  EndpointGroup,
  EndpointStatus,
  ModelFormState,
  StatusCardData,
} from "./ai-workbench/types";

function getFetchModelsFeedback(
  result: FetchModelsResult,
  t: (key: string) => string,
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

function getConnectionErrorMessage(
  message: string,
  t: (key: string) => string,
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

export function AISettingsPrototype() {
  const settings = useSettingsStore();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [modelForm, setModelForm] = useState<ModelFormState>(EMPTY_FORM);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
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

  const resolvedScenarioModels = useMemo(
    () => ({
      quickAdd: resolveScenarioModel(
        aiModels,
        settings.scenarioModelDefaults,
        "quickAdd",
        "chat",
      ),
      promptTest: resolveScenarioModel(
        aiModels,
        settings.scenarioModelDefaults,
        "promptTest",
        "chat",
      ),
      imageTest: resolveScenarioModel(
        aiModels,
        settings.scenarioModelDefaults,
        "imageTest",
        "image",
      ),
      translation: resolveScenarioModel(
        aiModels,
        settings.scenarioModelDefaults,
        "translation",
        "chat",
      ),
    }),
    [aiModels, settings.scenarioModelDefaults],
  );

  const endpointGroups = useMemo(() => {
    const grouped = aiModels.reduce<Record<string, EndpointGroup>>(
      (acc, model) => {
        const key = buildEndpointGroupKey(model);
        if (!acc[key]) {
          acc[key] = {
            key,
            provider: model.provider,
            apiUrl: model.apiUrl,
            models: [],
          };
        }
        acc[key].models.push(model);
        return acc;
      },
      {},
    );

    return Object.values(grouped).sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }, [aiModels]);

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

  const statusCards = useMemo<StatusCardData[]>(
    () => [
      {
        title: t("settings.chatModels"),
        value: String(chatModels.length),
        detail: `${t("settings.aiWorkbenchDefaultLabel")}: ${getModelDisplayName(
          resolvedScenarioModels.promptTest,
          t("settings.aiWorkbenchNotConfigured"),
        )}`,
        tone: chatModels.length > 0 ? "ready" : "warning",
        icon: BrainIcon,
      },
      {
        title: t("settings.imageModels"),
        value: String(imageModels.length),
        detail: `${t("settings.aiWorkbenchDefaultLabel")}: ${getModelDisplayName(
          resolvedScenarioModels.imageTest,
          t("settings.aiWorkbenchNotConfigured"),
        )}`,
        tone: imageModels.length > 0 ? "ready" : "warning",
        icon: ImageIcon,
      },
      {
        title: t("settings.aiWorkbenchTranslationCapability"),
        value: resolvedScenarioModels.translation
          ? t("settings.aiWorkbenchEnabled")
          : t("settings.aiWorkbenchNotConfigured"),
        detail: `${t("settings.aiWorkbenchUsingLabel")}: ${getModelDisplayName(
          resolvedScenarioModels.translation,
          t("settings.aiWorkbenchNotConfigured"),
        )}`,
        tone: resolvedScenarioModels.translation ? "ready" : "warning",
        icon: LanguagesIcon,
      },
      {
        title: t("settings.aiWorkbenchScenarioQuickAdd"),
        value: resolvedScenarioModels.quickAdd
          ? t("settings.aiWorkbenchEnabled")
          : t("settings.aiWorkbenchPending"),
        detail: `${t("settings.aiWorkbenchUsingLabel")}: ${getModelDisplayName(
          resolvedScenarioModels.quickAdd,
          t("settings.aiWorkbenchNotConfigured"),
        )}`,
        tone: resolvedScenarioModels.quickAdd ? "ready" : "warning",
        icon: WandSparklesIcon,
      },
    ],
    [chatModels.length, imageModels.length, resolvedScenarioModels, t],
  );

  const modelScenarioBadges = useMemo(() => {
    const entries = Object.entries(resolvedScenarioModels) as Array<
      [AIUsageScenario, AIModelConfig | null]
    >;
    const mapping = new Map<string, string[]>();

    for (const [scenario, model] of entries) {
      if (!model) {
        continue;
      }

      const badgeKey = SCENARIO_DEFINITIONS.find(
        (item) => item.key === scenario,
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
  }, [resolvedScenarioModels, t]);

  const openAddModel = (preset?: Partial<ModelFormState>) => {
    const provider = preset?.provider || EMPTY_FORM.provider;
    const providerInfo = getProviderInfo(provider);

    setEditingModelId(null);
    setAvailableModels([]);
    setModelForm({
      ...EMPTY_FORM,
      ...preset,
      provider,
      apiUrl: preset?.apiUrl ?? providerInfo?.defaultUrl ?? EMPTY_FORM.apiUrl,
      chatParams: preset?.chatParams
        ? { ...cloneDefaultChatParams(), ...preset.chatParams }
        : cloneDefaultChatParams(),
      imageParams: preset?.imageParams
        ? { ...cloneDefaultImageParams(), ...preset.imageParams }
        : cloneDefaultImageParams(),
    });
    setShowModelForm(true);
  };

  const openEditModel = (model: AIModelConfig) => {
    setEditingModelId(model.id);
    setAvailableModels([]);
    setModelForm(createFormFromModel(model));
    setShowModelForm(true);
  };

  const closeModelForm = () => {
    setEditingModelId(null);
    setAvailableModels([]);
    setShowModelForm(false);
    setModelForm({
      ...EMPTY_FORM,
      chatParams: cloneDefaultChatParams(),
      imageParams: cloneDefaultImageParams(),
    });
  };

  const handleFetchModels = async () => {
    if (!modelForm.apiKey.trim() || !modelForm.apiUrl.trim()) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    setFetchingModels(true);
    const result = await fetchAvailableModels(
      modelForm.apiUrl,
      modelForm.apiKey,
    );
    setFetchingModels(false);

    if (!result.success || result.models.length === 0) {
      const feedback = getFetchModelsFeedback(result, t, modelForm.apiUrl);
      showToast(feedback.message, feedback.type);
      return;
    }

    setAvailableModels(result.models);
    showToast(
      t("settings.modelsLoaded", { count: result.models.length }),
      "success",
    );
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
    try {
      if (modelForm.type === "image") {
        const result = await testImageGeneration(
          {
            provider: modelForm.provider,
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
          `${t("toast.connectionSuccess")} (${result.latency}ms)`,
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: modelForm.provider,
          apiKey: modelForm.apiKey,
          apiUrl: modelForm.apiUrl,
          model: modelForm.model,
        });
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          `${t("toast.connectionSuccess")} (${result.latency}ms)`,
          "success",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(
        getConnectionErrorMessage(message, t, modelForm.apiUrl),
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

    const nextChatParams =
      modelForm.type === "chat" ? buildChatParams(modelForm) : undefined;
    const nextImageParams =
      modelForm.type === "image" ? buildImageParams(modelForm) : undefined;

    if (modelForm.type === "chat" && !nextChatParams) {
      showToast(t("settings.aiWorkbenchInvalidCustomParams"), "error");
      return;
    }

    setSavingModel(true);
    const payload = {
      name: modelForm.name.trim(),
      provider: modelForm.provider.trim(),
      apiKey: modelForm.apiKey.trim(),
      apiUrl: normalizeApiUrlInput(modelForm.apiUrl),
      model: modelForm.model.trim(),
      type: modelForm.type,
      chatParams: modelForm.type === "chat" ? nextChatParams : undefined,
      imageParams: modelForm.type === "image" ? nextImageParams : undefined,
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

    const nextChatParams =
      modelForm.type === "chat" ? buildChatParams(modelForm) : undefined;
    const nextImageParams =
      modelForm.type === "image" ? buildImageParams(modelForm) : undefined;

    if (modelForm.type === "chat" && !nextChatParams) {
      showToast(t("settings.aiWorkbenchInvalidCustomParams"), "error");
      return;
    }

    setSavingModel(true);
    for (const modelId of selectedIds) {
      settings.addAiModel({
        name: "",
        provider: modelForm.provider.trim(),
        apiKey: modelForm.apiKey.trim(),
        apiUrl: normalizeApiUrlInput(modelForm.apiUrl),
        model: modelId,
        type: modelForm.type,
        chatParams: modelForm.type === "chat" ? nextChatParams : undefined,
        imageParams: modelForm.type === "image" ? nextImageParams : undefined,
      });
    }
    setSavingModel(false);
    showToast(t("settings.modelAdded") + ` (${selectedIds.length})`, "success");
    closeModelForm();
  };

  const handleDeleteModel = (model: AIModelConfig) => {
    if (!confirm(t("settings.confirmDelete"))) {
      return;
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
    try {
      if ((model.type ?? "chat") === "image") {
        const result = await testImageGeneration(
          {
            provider: model.provider,
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
          `${t("toast.connectionSuccess")} (${result.latency}ms)`,
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: model.provider,
          apiKey: model.apiKey,
          apiUrl: model.apiUrl,
          model: model.model,
        });
        if (!result.success) {
          throw new Error(result.error || t("toast.connectionFailed"));
        }
        showToast(
          `${t("toast.connectionSuccess")} (${result.latency}ms)`,
          "success",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(getConnectionErrorMessage(message, t, model.apiUrl), "error");
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
    try {
      if ((targetModel.type ?? "chat") === "image") {
        const result = await testImageGeneration(
          {
            provider: targetModel.provider,
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
        showToast(
          t("settings.aiWorkbenchEndpointConnected", {
            latency: result.latency,
          }),
          "success",
        );
      } else {
        const result = await testAIConnection({
          provider: targetModel.provider,
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
      provider: firstModel.provider,
      apiKey: firstModel.apiKey,
      apiUrl: firstModel.apiUrl,
    });
    setShowEndpointForm(true);
  };

  const closeEndpointForm = () => {
    setShowEndpointForm(false);
    setEndpointDraft(null);
  };

  const handleSaveEndpoint = () => {
    if (!endpointDraft) {
      return;
    }

    const targetGroup = endpointGroups.find(
      (group) => group.key === endpointDraft.key,
    );
    if (!targetGroup) {
      return;
    }

    for (const model of targetGroup.models) {
      settings.updateAiModel(model.id, {
        provider: endpointDraft.provider.trim(),
        apiKey: endpointDraft.apiKey.trim(),
        apiUrl: normalizeApiUrlInput(endpointDraft.apiUrl),
      });
    }

    setEndpointStatuses((prev) => {
      const next = { ...prev };
      delete next[endpointDraft.key];
      return next;
    });
    closeEndpointForm();
    showToast(t("settings.aiWorkbenchEndpointUpdated"), "success");
  };

  const handleTestDefaultModel = async () => {
    const model =
      resolvedScenarioModels.promptTest ||
      resolvedScenarioModels.imageTest ||
      resolvedScenarioModels.translation;

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
      apiKey: settings.aiApiKey,
      apiUrl: settings.aiApiUrl,
      model: settings.aiModel,
      type: "chat",
    });
    showToast(t("settings.aiWorkbenchLegacyImported"), "success");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-10">
      <HeaderSection
        testingDefault={testingDefault}
        hasLegacyOnlyConfig={hasLegacyOnlyConfig}
        statusCards={statusCards}
        onTestDefault={() => void handleTestDefaultModel()}
        onAddModel={() => openAddModel()}
        onImportLegacy={importLegacyConfig}
      />

      <ScenarioDefaultsSection
        chatModels={chatModels}
        imageModels={imageModels}
        scenarioModelDefaults={settings.scenarioModelDefaults}
        onScenarioChange={(scenario, value) =>
          settings.setScenarioModelDefault(scenario, value)
        }
      />

      <EndpointsSection
        endpointGroups={endpointGroups}
        endpointStatuses={endpointStatuses}
        testingEndpointKey={testingEndpointKey}
        testingModelId={testingModelId}
        modelScenarioBadges={modelScenarioBadges}
        onTestEndpoint={(group) => void handleTestEndpoint(group)}
        onEditEndpoint={openEditEndpoint}
        onAddModel={openAddModel}
        onSetDefaultModel={(modelId) => settings.setDefaultAiModel(modelId)}
        onTestModel={(model) => void handleTestModel(model)}
        onEditModel={openEditModel}
        onDeleteModel={handleDeleteModel}
      />

      <AdvancedSection
        translationMode={settings.translationMode}
        onTranslationModeChange={(value) => settings.setTranslationMode(value)}
        onConfigure={() => openAddModel()}
      />

      {showModelForm ? (
        <ModelFormModal
          editingModelId={editingModelId}
          modelForm={modelForm}
          setModelForm={setModelForm}
          availableModels={availableModels}
          fetchingModels={fetchingModels}
          testingModelId={testingModelId}
          savingModel={savingModel}
          onClose={closeModelForm}
          onFetchModels={() => void handleFetchModels()}
          onTestDraft={() => void handleTestDraft()}
          onSave={handleSaveModel}
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
