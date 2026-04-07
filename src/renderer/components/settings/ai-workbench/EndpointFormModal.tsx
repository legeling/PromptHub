import type { Dispatch, SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import { Select } from "../../ui/Select";
import { PasswordInput } from "../shared";
import { PROVIDER_OPTIONS } from "./constants";
import { getProviderInfo } from "./helpers";
import { Modal } from "../../ui/Modal";
import type { EndpointDraft } from "./types";

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

  return (
    <Modal
      isOpen={true}
      title={t("settings.aiWorkbenchEditEndpoint")}
      subtitle={t("settings.aiWorkbenchEditEndpointSubtitle")}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.providerName")}
          </label>
          <Select
            value={endpointDraft.provider}
            onChange={(value) => {
              const provider = getProviderInfo(value);
              setEndpointDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      provider: value,
                      apiUrl: provider?.defaultUrl || prev.apiUrl,
                    }
                  : prev,
              );
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
            value={endpointDraft.apiKey}
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
            aria-label={t("settings.apiUrl")}
            className="h-10 w-full rounded-lg bg-muted px-3 text-sm"
          />
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
