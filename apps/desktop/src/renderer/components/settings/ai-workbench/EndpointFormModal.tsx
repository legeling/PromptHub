import { useMemo, type Dispatch, type SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import { Select } from "../../ui/Select";
import { getCategoryIcon } from "../../ui/ModelIcons";
import { PasswordInput } from "../shared";
import { PROVIDER_OPTIONS } from "./constants";
import { getProviderInfo } from "./helpers";
import { Modal } from "../../ui/Modal";
import type { EndpointDraft } from "./types";
import {
  getApiEndpointPreview,
  getBaseUrl,
  normalizeApiUrlInput,
} from "../../../services/ai";

export function EndpointFormModal({
  endpointDraft,
  setEndpointDraft,
  onClose,
  onSave,
}: {
  endpointDraft: EndpointDraft;
  setEndpointDraft: Dispatch<SetStateAction<EndpointDraft | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const providerInfo = getProviderInfo(endpointDraft.provider);
  const showProtocolField = providerInfo?.allowsCustomProtocol === true;
  const isAddingProvider = endpointDraft.key === "";
  const providerTypeLabel = providerInfo?.name || endpointDraft.provider;
  const trimmedApiUrl = endpointDraft.apiUrl.trim();
  const normalizedInput = useMemo(
    () => normalizeApiUrlInput(endpointDraft.apiUrl),
    [endpointDraft.apiUrl],
  );
  const baseUrlPreview = useMemo(
    () => getBaseUrl(endpointDraft.apiUrl),
    [endpointDraft.apiUrl],
  );
  const requestPreview = useMemo(
    () =>
      getApiEndpointPreview(endpointDraft.apiUrl, endpointDraft.apiProtocol),
    [endpointDraft.apiProtocol, endpointDraft.apiUrl],
  );
  const providerExamples = useMemo(() => {
    if (endpointDraft.apiProtocol === "gemini") {
      return [
        "https://generativelanguage.googleapis.com",
        "https://generativelanguage.googleapis.com/v1beta",
      ];
    }
    if (endpointDraft.apiProtocol === "anthropic") {
      return ["https://api.anthropic.com", "https://api.anthropic.com/v1"];
    }
    return [
      providerInfo?.defaultUrl || "https://api.openai.com",
      "https://api.example.com/v1",
    ].filter(Boolean);
  }, [endpointDraft.apiProtocol, providerInfo?.defaultUrl]);
  const fullEndpointDetected = Boolean(
    trimmedApiUrl &&
    !trimmedApiUrl.endsWith("#") &&
    baseUrlPreview &&
    baseUrlPreview !== trimmedApiUrl.replace(/\/$/, ""),
  );
  const providerOptions = PROVIDER_OPTIONS.map((item) => ({
    value: item.id,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="shrink-0">
          {getCategoryIcon(item.iconCategory, 18)}
        </span>
        <span className="truncate">{item.name}</span>
      </span>
    ),
    labelText: item.name,
  }));

  return (
    <Modal
      isOpen={true}
      title={
        isAddingProvider
          ? t("settings.aiWorkbenchAddProvider")
          : t("settings.aiWorkbenchEditEndpoint")
      }
      subtitle={
        isAddingProvider
          ? t("settings.aiWorkbenchAddProviderSubtitle")
          : t("settings.aiWorkbenchEditEndpointSubtitle")
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.aiWorkbenchProviderDisplayName")}
          </label>
          <input
            type="text"
            value={endpointDraft.name}
            onChange={(event) =>
              setEndpointDraft((prev) =>
                prev ? { ...prev, name: event.target.value } : prev,
              )
            }
            aria-label={t("settings.aiWorkbenchProviderDisplayName")}
            placeholder={t(
              "settings.aiWorkbenchProviderDisplayNamePlaceholder",
            )}
            className="h-10 w-full rounded-lg bg-muted px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.aiWorkbenchProviderType")}
          </label>
          <Select
            value={endpointDraft.provider}
            ariaLabel={t("settings.aiWorkbenchProviderType")}
            onChange={(value) => {
              const provider = getProviderInfo(value);
              setEndpointDraft((prev) =>
                prev
                  ? (() => {
                      const previousTypeName =
                        getProviderInfo(prev.provider)?.name || prev.provider;
                      const shouldReplaceName =
                        isAddingProvider &&
                        (!prev.name.trim() ||
                          prev.name.trim() === previousTypeName);

                      return {
                        ...prev,
                        name: shouldReplaceName
                          ? provider?.name || value
                          : prev.name,
                        provider: value,
                        apiProtocol:
                          provider?.recommendedProtocol || prev.apiProtocol,
                        apiUrl: provider?.defaultUrl || prev.apiUrl,
                      };
                    })()
                  : prev,
              );
            }}
            options={providerOptions}
          />
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("settings.aiWorkbenchProviderTypeHint", {
              type: providerTypeLabel,
            })}
          </div>
        </div>
        {showProtocolField ? (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t("settings.protocol")}
            </label>
            <Select
              value={endpointDraft.apiProtocol}
              ariaLabel={t("settings.protocol")}
              onChange={(value) =>
                setEndpointDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        apiProtocol: value as EndpointDraft["apiProtocol"],
                      }
                    : prev,
                )
              }
              options={[
                {
                  value: "openai",
                  label: t("settings.protocolOpenAICompatible"),
                },
                {
                  value: "gemini",
                  label: t("settings.protocolGeminiCompatible"),
                },
                {
                  value: "anthropic",
                  label: t("settings.protocolAnthropicCompatible"),
                },
              ]}
            />
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.apiKey")}
          </label>
          <PasswordInput
            value={endpointDraft.apiKey}
            ariaLabel={t("settings.apiKey")}
            placeholder={t("settings.apiKeyPlaceholder")}
            onChange={(value) =>
              setEndpointDraft((prev) =>
                prev ? { ...prev, apiKey: value } : prev,
              )
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.apiUrl")}
          </label>
          <input
            type="text"
            value={endpointDraft.apiUrl}
            onChange={(event) =>
              setEndpointDraft((prev) =>
                prev ? { ...prev, apiUrl: event.target.value } : prev,
              )
            }
            onBlur={() =>
              setEndpointDraft((prev) => {
                if (!prev) {
                  return prev;
                }
                const nextApiUrl = normalizeApiUrlInput(prev.apiUrl);
                return nextApiUrl === prev.apiUrl
                  ? prev
                  : { ...prev, apiUrl: nextApiUrl };
              })
            }
            aria-label={t("settings.apiUrl")}
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
              <span className="font-mono">
                {providerExamples.join("  ·  ")}
              </span>
            </div>
            {baseUrlPreview ? (
              <div className="flex flex-col gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("settings.aiWorkbenchApiUrlBaseLabel")}:
                </span>
                <span className="break-all font-mono text-primary">
                  {baseUrlPreview}
                </span>
              </div>
            ) : null}
            {requestPreview ? (
              <div className="flex flex-col gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("settings.aiWorkbenchApiUrlRequestLabel")}:
                </span>
                <span className="break-all font-mono text-primary">
                  {requestPreview}
                </span>
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
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("settings.saveChanges")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
