import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  Loader2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentProviderSourceCandidate,
  ClaudeCredentialEnvKey,
  ImportAgentProviderSourceRequest,
} from "@prompthub/shared";
import { getClaudeImportCredentialEnvKey } from "@prompthub/shared/utils/claude-config";
import { Button, Modal, Select, getCategoryIcon } from "../ui";
import { AgentProviderFormSelect } from "./AgentProviderFormSelect";
import {
  getModelCategory,
  getProviderIconCategory,
} from "../settings/ai-workbench/helpers";

interface AgentProviderSourceDialogProps {
  isOpen: boolean;
  platformId: string;
  candidates: AgentProviderSourceCandidate[];
  loading: boolean;
  importing: boolean;
  onLoad: (platformId: string) => Promise<AgentProviderSourceCandidate[]>;
  onImport: (
    request: ImportAgentProviderSourceRequest,
  ) => Promise<unknown | null>;
  onClose: () => void;
}

function defaultSelection(candidates: AgentProviderSourceCandidate[]) {
  const provider = candidates.find((candidate) => candidate.compatible);
  const model =
    provider?.models.find((candidate) => candidate.isDefault) ??
    provider?.models[0];
  return {
    sourceId: provider?.sourceId ?? "",
    modelId: model?.id ?? "",
    protocol: provider?.protocol ?? provider?.protocols[0] ?? "",
  };
}

function protocolLabel(
  protocol: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  return t(`agents.providerProfiles.sourceImport.protocols.${protocol}`, {
    defaultValue: protocol,
  });
}

export function AgentProviderSourceDialog({
  isOpen,
  platformId,
  candidates,
  loading,
  importing,
  onLoad,
  onImport,
  onClose,
}: AgentProviderSourceDialogProps) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = useState("");
  const [modelId, setModelId] = useState("");
  const [protocol, setProtocol] = useState("");
  const [credentialEnvKey, setCredentialEnvKey] =
    useState<ClaudeCredentialEnvKey>(getClaudeImportCredentialEnvKey(null));

  useEffect(() => {
    if (isOpen) void onLoad(platformId);
  }, [isOpen, onLoad, platformId]);

  useEffect(() => {
    const selection = defaultSelection(candidates);
    setSourceId(selection.sourceId);
    setModelId(selection.modelId);
    setProtocol(selection.protocol);
    setCredentialEnvKey(
      getClaudeImportCredentialEnvKey(
        candidates.find(
          (candidate) => candidate.sourceId === selection.sourceId,
        )?.endpoint ?? null,
      ),
    );
  }, [candidates, isOpen]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.sourceId === sourceId),
    [candidates, sourceId],
  );

  function select(candidate: AgentProviderSourceCandidate): void {
    const model =
      candidate.models.find((item) => item.isDefault) ?? candidate.models[0];
    setSourceId(candidate.sourceId);
    setCredentialEnvKey(getClaudeImportCredentialEnvKey(candidate.endpoint));
    setModelId(model?.id ?? "");
    setProtocol(candidate.protocol ?? candidate.protocols[0] ?? "");
  }

  async function submit(): Promise<void> {
    if (!sourceId || !modelId || !protocol) return;
    const result = await onImport({
      platformId,
      sourceId,
      modelId,
      protocol,
      ...(platformId === "claude" ? { credentialEnvKey } : {}),
    });
    if (result) onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("agents.providerProfiles.sourceImport.title")}
      size="lg"
      closeOnBackdrop={!importing}
      closeOnEscape={!importing}
    >
      <p className="text-sm text-muted-foreground">
        {t("agents.providerProfiles.sourceImport.hint")}
      </p>
      <div className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            {t("agents.providerProfiles.sourceImport.loading")}
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("agents.providerProfiles.sourceImport.empty")}
          </p>
        ) : (
          candidates.map((candidate) => (
            <button
              key={candidate.sourceId}
              type="button"
              onClick={() => select(candidate)}
              disabled={!candidate.compatible || importing}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                candidate.sourceId === sourceId
                  ? "border-primary bg-primary/[0.06]"
                  : "border-border bg-card hover:bg-accent/50"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="flex items-start gap-3">
                <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/60">
                  {getCategoryIcon(
                    getProviderIconCategory(candidate.providerKind),
                    28,
                  )}
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-card ${
                      candidate.compatible
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {candidate.compatible ? (
                      <CheckCircle2Icon className="h-3 w-3" />
                    ) : (
                      <AlertCircleIcon className="h-3 w-3" />
                    )}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm text-foreground">
                      {candidate.name}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {candidate.providerKind}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {candidate.endpoint}
                  </span>
                  {!candidate.compatible && candidate.incompatibility ? (
                    <span className="mt-1 block text-xs font-medium text-amber-600 dark:text-amber-400">
                      {t(
                        `agents.providerProfiles.sourceImport.incompatibility.${candidate.incompatibility}`,
                      )}
                    </span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <KeyRoundIcon className="h-3 w-3" />
                      {t(
                        candidate.credentialReady
                          ? "agents.providerProfiles.sourceImport.credentialReady"
                          : "agents.providerProfiles.sourceImport.credentialMissing",
                      )}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      {selected ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {t("agents.providerProfiles.sourceImport.model")}
            </span>
            <Select
              value={modelId}
              onChange={setModelId}
              disabled={importing}
              ariaLabel={t("agents.providerProfiles.sourceImport.model")}
              options={selected.models.map((model) => ({
                value: model.id,
                labelText: `${model.name} (${model.model})`,
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    {getCategoryIcon(
                      getModelCategory({
                        model: model.model,
                      }),
                      22,
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {model.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {model.model}
                      </span>
                    </span>
                  </span>
                ),
              }))}
              triggerClassName="flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {t("agents.providerProfiles.sourceImport.protocol")}
            </span>
            <Select
              value={protocol}
              onChange={setProtocol}
              disabled={importing || selected.protocols.length <= 1}
              ariaLabel={t("agents.providerProfiles.sourceImport.protocol")}
              options={selected.protocols.map((item) => ({
                value: item,
                label: protocolLabel(item, t),
                labelText: protocolLabel(item, t),
              }))}
              triggerClassName="flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-default disabled:opacity-70"
            />
          </label>
        </div>
      ) : null}
      {selected && platformId === "claude" ? (
        <div className="mt-4 space-y-2">
          <AgentProviderFormSelect
            label={t("agents.providerProfiles.form.credentialKind")}
            value={credentialEnvKey}
            disabled={loading || importing}
            onChange={(value) => {
              if (
                value === "ANTHROPIC_API_KEY" ||
                value === "ANTHROPIC_AUTH_TOKEN"
              )
                setCredentialEnvKey(value);
            }}
            options={[
              {
                value: "ANTHROPIC_API_KEY",
                label: t("agents.providerProfiles.form.anthropicApiKey"),
              },
              {
                value: "ANTHROPIC_AUTH_TOKEN",
                label: t("agents.providerProfiles.form.anthropicAuthToken"),
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {t("agents.providerProfiles.sourceImport.claudeAuthHint")}
          </p>
        </div>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={importing}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={!sourceId || !modelId || !protocol || loading || importing}
        >
          {importing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
          {t("agents.providerProfiles.sourceImport.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
