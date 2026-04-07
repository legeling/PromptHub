import { useMemo, type Dispatch, type SetStateAction } from "react";

import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  getApiEndpointPreview,
  getBaseUrl,
  getImageApiEndpointPreview,
  normalizeApiUrlInput,
} from "../../../../services/ai";
import { Select } from "../../../ui/Select";
import { PasswordInput } from "../../shared";
import { PROVIDER_OPTIONS } from "../constants";
import { getProviderInfo } from "../helpers";
import type { ModelFormState, ModelType } from "../types";

export function BaseFields({
  modelForm,
  setModelForm,
  fetchingModels,
  onFetchModels,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
  fetchingModels: boolean;
  onFetchModels: () => void;
}) {
  const { t } = useTranslation();
  const trimmedApiUrl = modelForm.apiUrl.trim();
  const normalizedInput = useMemo(
    () => normalizeApiUrlInput(modelForm.apiUrl),
    [modelForm.apiUrl],
  );
  const baseUrlPreview = useMemo(
    () => getBaseUrl(modelForm.apiUrl),
    [modelForm.apiUrl],
  );
  const requestPreview = useMemo(
    () =>
      modelForm.type === "image"
        ? getImageApiEndpointPreview(modelForm.apiUrl)
        : getApiEndpointPreview(modelForm.apiUrl),
    [modelForm.apiUrl, modelForm.type],
  );
  const fullEndpointDetected = Boolean(
    trimmedApiUrl &&
      !trimmedApiUrl.endsWith("#") &&
      baseUrlPreview &&
      baseUrlPreview !== trimmedApiUrl.replace(/\/$/, ""),
  );
  const providerExamples = useMemo(() => {
    if (modelForm.provider === "google") {
      return [
        "https://generativelanguage.googleapis.com",
        "https://generativelanguage.googleapis.com/v1beta",
      ];
    }

    const provider = getProviderInfo(modelForm.provider);
    return [
      provider?.defaultUrl || "https://api.openai.com",
      "https://api.example.com/v1",
    ].filter(Boolean);
  }, [modelForm.provider]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.modelType")}
          </label>
          <Select
            value={modelForm.type}
            onChange={(value) =>
              setModelForm((prev) => ({
                ...prev,
                type: value as ModelType,
              }))
            }
            options={[
              { value: "chat", label: t("settings.chatModel") },
              { value: "image", label: t("settings.imageModel") },
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.customNameOptional")}
          </label>
          <input
            type="text"
            value={modelForm.name}
            onChange={(event) =>
              setModelForm((prev) => ({ ...prev, name: event.target.value }))
            }
            aria-label={t("settings.customNameOptional")}
            placeholder={t("settings.customNamePlaceholder")}
            className="h-10 w-full rounded-lg bg-muted px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.providerName")}
          </label>
          <Select
            value={modelForm.provider}
            onChange={(value) => {
              const provider = getProviderInfo(value);
              setModelForm((prev) => ({
                ...prev,
                provider: value,
                apiUrl: provider?.defaultUrl || prev.apiUrl,
              }));
            }}
            options={PROVIDER_OPTIONS.map((item) => ({
              value: item.id,
              label: item.name,
              group: item.group,
            }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.apiKey")}
          </label>
          <PasswordInput
            value={modelForm.apiKey}
            placeholder={t("settings.apiKeyPlaceholder")}
            onChange={(value) =>
              setModelForm((prev) => ({ ...prev, apiKey: value }))
            }
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.apiUrl")}
        </label>
        <input
          type="text"
          value={modelForm.apiUrl}
          onChange={(event) =>
            setModelForm((prev) => ({ ...prev, apiUrl: event.target.value }))
          }
          onBlur={() =>
            setModelForm((prev) => {
              const nextApiUrl = normalizeApiUrlInput(prev.apiUrl);
              return nextApiUrl === prev.apiUrl ? prev : { ...prev, apiUrl: nextApiUrl };
            })
          }
          aria-label={t("settings.apiUrl")}
          placeholder={t("settings.apiUrlPlaceholder")}
          className="h-10 w-full rounded-lg bg-muted px-3 text-sm"
        />
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
          <div className="text-muted-foreground">
            {t("settings.aiWorkbenchApiUrlGuide")}
          </div>
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("settings.aiWorkbenchApiUrlExamplesLabel")}:
            </span>{" "}
            <span className="font-mono">{providerExamples.join("  ·  ")}</span>
          </div>
          {baseUrlPreview ? (
            <div className="flex flex-col gap-1 text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("settings.aiWorkbenchApiUrlBaseLabel")}:
              </span>
              <span className="break-all font-mono text-primary">{baseUrlPreview}</span>
            </div>
          ) : null}
          {requestPreview ? (
            <div className="flex flex-col gap-1 text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("settings.aiWorkbenchApiUrlRequestLabel")}:
              </span>
              <span className="break-all font-mono text-primary">{requestPreview}</span>
            </div>
          ) : null}
          {trimmedApiUrl.endsWith("#") ? (
            <div className="inline-flex w-fit rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
              {t("settings.autoFillDisabled")}
            </div>
          ) : null}
          {fullEndpointDetected || normalizedInput !== trimmedApiUrl ? (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">
              {t("settings.aiWorkbenchApiUrlDetectedFullEndpoint")}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("settings.modelName")}</span>
          <button
            type="button"
            onClick={onFetchModels}
            disabled={fetchingModels}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {fetchingModels ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            {t("settings.fetchModels")}
          </button>
        </div>
        <input
          type="text"
          value={modelForm.model}
          onChange={(event) =>
            setModelForm((prev) => ({ ...prev, model: event.target.value }))
          }
          aria-label={t("settings.modelName")}
          placeholder={t("settings.modelNamePlaceholder")}
          className="h-10 w-full rounded-lg bg-muted px-3 text-sm"
        />
      </div>
    </>
  );
}
