import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2Icon,
  ClipboardCopyIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentProviderConnectionTestResult,
  AgentProviderModelTestResult,
  AgentProviderProfilePublic,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { copyTextToClipboard } from "../../utils/clipboard";
import { isWebRuntime } from "../../runtime";
import { useAgentProviderStore } from "../../stores/agent-provider.store";
import { Button, ConfirmDialog, Input, Modal } from "../ui";
import { AgentProviderActivationDialog } from "./AgentProviderProfileDialogs";
import { AgentProviderActivationSwitch } from "./AgentProviderActivationSwitch";
import { AgentProviderConnectionCheck } from "./AgentProviderConnectionCheck";
import { AgentProviderMigrationNotice } from "./AgentProviderMigrationNotice";
import {
  AgentProviderNativeDetail,
  AgentProviderNativeListItem,
} from "./AgentProviderNativeConfig";
import { AgentProviderProfileFormDialog } from "./AgentProviderProfileFormDialog";
import { AgentProviderSourceDialog } from "./AgentProviderSourceDialog";
import {
  AgentProviderContextMenu,
  AgentProviderToolbarActions,
  type AgentProviderContextMenuPosition,
} from "./AgentProviderWorkbenchActions";
import {
  AgentProviderDetailHeader,
  AgentProviderDetailRow,
  AgentProviderDetailSection,
  AgentProviderDetailSurface,
  AgentProviderWorkbenchLayout,
  providerWorkbenchListItemClass,
} from "./AgentProviderWorkbenchLayout";

const PROFILE_ROW_HEIGHT = 64;

function secretStateClass(state: AgentProviderProfilePublic["secretState"]) {
  return state === "available"
    ? "text-emerald-600 dark:text-emerald-400"
    : state === "missing"
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";
}

function primaryModel(profile: AgentProviderProfilePublic): string | null {
  return (
    profile.modelMappings.find((mapping) => mapping.routeKey === "primary")
      ?.modelId ?? null
  );
}

function ProfileListItem({
  profile,
  isCurrent,
  selected,
  busy,
  activating,
  onSelect,
  onActivate,
  virtualIndex,
  virtualStart,
  virtualSize,
  virtualSetSize,
}: {
  profile: AgentProviderProfilePublic;
  isCurrent: boolean;
  selected: boolean;
  busy: boolean;
  activating: boolean;
  onSelect: () => void;
  onActivate: () => void;
  virtualIndex: number;
  virtualStart: number;
  virtualSize: number;
  virtualSetSize: number;
}) {
  const { t } = useTranslation();
  return (
    <li
      data-index={virtualIndex}
      aria-posinset={virtualIndex + 1}
      aria-setsize={virtualSetSize}
      className="absolute left-0 top-0 w-full p-1"
      style={{
        height: `${virtualSize}px`,
        transform: `translateY(${virtualStart}px)`,
      }}
    >
      <div
        className={providerWorkbenchListItemClass(
          selected,
          "flex h-full items-center overflow-hidden",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected}
          className="min-w-0 flex-1 px-3 py-2 text-left"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {profile.name}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {primaryModel(profile) ??
              t("agents.providerProfiles.noPrimaryModel")}
          </span>
        </button>
        <div className="pr-3">
          <AgentProviderActivationSwitch
            checked={isCurrent}
            disabled={busy}
            loading={activating && !isCurrent}
            label={t(
              isCurrent
                ? "agents.providerProfiles.activation.currentLabel"
                : "agents.providerProfiles.activation.switchLabel",
              { name: profile.name },
            )}
            onActivate={onActivate}
          />
        </div>
      </div>
    </li>
  );
}

function ProfileDetail({
  profile,
  isCurrent,
  busy,
  testing,
  modelTesting,
  copied,
  connectionResult,
  modelTestResult,
  supportsConnectionTest,
  onEdit,
  onTestConnection,
  onTestModel,
  onCancelModelTest,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  profile: AgentProviderProfilePublic;
  isCurrent: boolean;
  busy: boolean;
  testing: boolean;
  modelTesting: boolean;
  copied: boolean;
  connectionResult: AgentProviderConnectionTestResult | null;
  modelTestResult: AgentProviderModelTestResult | null;
  supportsConnectionTest: boolean;
  onEdit: () => void;
  onTestConnection: () => void;
  onTestModel: () => void;
  onCancelModelTest: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AgentProviderDetailSurface>
      <AgentProviderDetailSection>
        <AgentProviderDetailHeader>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {profile.name}
              </h2>
              {isCurrent ? (
                <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t("agents.providerProfiles.current")}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile.providerKind} · {profile.protocol}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onEdit}
              disabled={busy}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t("common.edit")}
            </Button>
          </div>
        </AgentProviderDetailHeader>
      </AgentProviderDetailSection>

      <div className="mt-4 space-y-4">
        <AgentProviderDetailSection className="p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("agents.providerProfiles.details")}
          </h3>
          <dl className="mt-2">
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.providerKind")}
            >
              {profile.providerKind}
            </AgentProviderDetailRow>
            {typeof profile.config.providerId === "string" ||
            typeof profile.config.legacyProviderId === "string" ? (
              <AgentProviderDetailRow
                label={t("agents.providerProfiles.providerId")}
              >
                {String(
                  profile.config.providerId ?? profile.config.legacyProviderId,
                )}
              </AgentProviderDetailRow>
            ) : null}
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.protocol")}
            >
              {profile.protocol}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.endpoint")}
            >
              {profile.endpoint || t("agents.providerProfiles.platformNative")}
            </AgentProviderDetailRow>
            <AgentProviderDetailRow
              label={t("agents.providerProfiles.credential")}
            >
              {profile.platformId === "antigravity-cli" ? (
                <span className="text-muted-foreground">
                  {t(
                    "agents.providerProfiles.currentNative.credentialStatus.platform-managed",
                  )}
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 ${secretStateClass(profile.secretState)}`}
                >
                  {profile.secretState === "missing" ? (
                    <ShieldAlertIcon className="h-4 w-4" />
                  ) : (
                    <KeyRoundIcon className="h-4 w-4" />
                  )}
                  {t(
                    `agents.providerProfiles.secretState.${profile.secretState}`,
                  )}
                </span>
              )}
            </AgentProviderDetailRow>
          </dl>
        </AgentProviderDetailSection>

        {supportsConnectionTest ? (
          <AgentProviderConnectionCheck
            busy={busy}
            testing={testing}
            modelTesting={modelTesting}
            connectionResult={connectionResult}
            modelTestResult={modelTestResult}
            onTestConnection={onTestConnection}
            onTestModel={onTestModel}
            onCancelModelTest={onCancelModelTest}
          />
        ) : null}

        <AgentProviderDetailSection className="p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("agents.providerProfiles.modelMappings")}
          </h3>
          {profile.modelMappings.length > 0 ? (
            <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
              {profile.modelMappings.map((mapping) => (
                <li
                  key={mapping.id}
                  className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
                >
                  <span className="text-xs font-semibold text-muted-foreground">
                    {mapping.routeKey}
                  </span>
                  <code className="break-all text-sm text-foreground">
                    {mapping.modelId}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("agents.providerProfiles.noMappings")}
            </p>
          )}
        </AgentProviderDetailSection>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Button
            size="sm"
            variant="secondary"
            onClick={onRename}
            disabled={busy}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {t("agents.providerProfiles.rename")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDuplicate}
            disabled={busy}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            {t("agents.providerProfiles.duplicate")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onExport}
            disabled={busy}
          >
            {copied ? (
              <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <ClipboardCopyIcon className="h-3.5 w-3.5" />
            )}
            {copied
              ? t("agents.providerProfiles.exportCopied")
              : t("agents.providerProfiles.export")}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
            <Trash2Icon className="h-3.5 w-3.5" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </AgentProviderDetailSurface>
  );
}

export function AgentProviderProfileWorkbench({
  agent,
}: {
  agent: ManagedAgentSummary;
}) {
  const { t } = useTranslation();
  const webRuntime = isWebRuntime();
  const store = useAgentProviderStore();
  const [editing, setEditing] = useState<AgentProviderProfilePublic | null>();
  const [renameTarget, setRenameTarget] =
    useState<AgentProviderProfilePublic | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] =
    useState<AgentProviderProfilePublic | null>(null);
  const [modelTestConfirmOpen, setModelTestConfirmOpen] = useState(false);
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<AgentProviderContextMenuPosition | null>(null);
  const [activationTargetId, setActivationTargetId] = useState<string | null>(
    null,
  );
  const profileScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setEditing(undefined);
    setRenameTarget(null);
    setRenameValue("");
    setActivationTargetId(null);
    if (["supported", "partial"].includes(agent.capabilities.provider.status)) {
      void store.load(agent.id);
    }
  }, [agent.id, agent.capabilities.provider.status, store.load]);

  const selectedProfile = useMemo(
    () =>
      store.profiles.find(
        (profile) => profile.id === store.selectedProfileId,
      ) ?? null,
    [store.profiles, store.selectedProfileId],
  );
  const busy = store.busyAction !== null;
  const officialService = store.currentState?.officialService;
  const officialSelected =
    store.selectedProfileId === "builtin:official" && Boolean(officialService);
  const detailSummary = officialSelected
    ? officialService?.summary
    : store.currentState?.nativeConfig;
  const isFormOpen = editing !== undefined;
  const verifiedCurrentProfileId =
    store.currentState?.status === "verified"
      ? store.currentState.currentProfileId
      : null;
  const profileVirtualizer = useVirtualizer({
    count: store.profiles.length,
    getScrollElement: () => profileScrollRef.current,
    estimateSize: () => PROFILE_ROW_HEIGHT,
    overscan: 6,
    getItemKey: (index) => store.profiles[index].id,
  });
  const virtualProfiles = profileVirtualizer.getVirtualItems();

  useEffect(() => {
    setModelTestConfirmOpen(false);
  }, [agent.id, store.selectedProfileId]);

  async function exportSelected(): Promise<void> {
    if (!selectedProfile) return;
    const exported = await store.exportProfile(selectedProfile.id);
    if (!exported) return;
    try {
      await copyTextToClipboard(JSON.stringify(exported, null, 2));
      setCopiedProfileId(selectedProfile.id);
    } catch {
      useAgentProviderStore.setState({
        errorCode: "AGENT_PROVIDER_OPERATION_FAILED",
      });
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    const deleted = await store.deleteProfile(deleteTarget.id);
    if (deleted) setDeleteTarget(null);
  }

  async function confirmRename(): Promise<void> {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    if (name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    const renamed = await store.updateProfile({
      id: renameTarget.id,
      expectedUpdatedAt: renameTarget.updatedAt,
      profile: { name },
      secretAction: "preserve",
    });
    if (!renamed) return;
    setRenameTarget(null);
    setRenameValue("");
  }

  async function previewProfileActivation(profileId: string): Promise<void> {
    setActivationTargetId(profileId);
    await store.previewActivation(agent.id, profileId);
    setActivationTargetId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!webRuntime && agent.id === "codex" ? (
        <AgentProviderMigrationNotice onMigrated={() => store.load(agent.id)} />
      ) : null}
      <AgentProviderWorkbenchLayout
        toolbar={
          <AgentProviderToolbarActions
            busy={busy}
            onAdd={() => setEditing(null)}
            onImport={
              webRuntime || agent.id === "antigravity-cli"
                ? undefined
                : () => setSourceDialogOpen(true)
            }
          />
        }
        sidebar={
          <nav
            ref={profileScrollRef}
            aria-label={t("agents.providerProfiles.listLabel")}
            className="h-full min-h-0 overflow-x-hidden overflow-y-auto p-1"
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenuPosition({
                x: event.clientX,
                y: event.clientY,
              });
            }}
          >
            {officialService ? (
              <AgentProviderNativeListItem
                summary={officialService.summary}
                serviceStatus={officialService.status}
                busy={busy}
                onActivate={
                  officialService.summary.officialRestoreAvailable
                    ? () => void store.restoreOfficial(agent.id)
                    : undefined
                }
                selected={officialSelected}
                onSelect={() => {
                  setEditing(undefined);
                  store.select("builtin:official");
                }}
              />
            ) : null}
            {store.currentState?.nativeConfig &&
            officialService?.status !== "active" ? (
              <AgentProviderNativeListItem
                summary={store.currentState.nativeConfig}
                selected={selectedProfile === null && !officialSelected}
                onSelect={() => {
                  setEditing(undefined);
                  store.select(null);
                }}
              />
            ) : null}
            {store.profiles.length > 0 ? (
              <ul
                className="relative w-full"
                style={{ height: `${profileVirtualizer.getTotalSize()}px` }}
              >
                {virtualProfiles.map((virtualRow) => {
                  const profile = store.profiles[virtualRow.index];
                  return (
                    <ProfileListItem
                      key={profile.id}
                      profile={profile}
                      isCurrent={profile.id === verifiedCurrentProfileId}
                      selected={profile.id === store.selectedProfileId}
                      busy={busy || webRuntime}
                      activating={activationTargetId === profile.id}
                      onSelect={() => {
                        setEditing(undefined);
                        store.select(profile.id);
                      }}
                      onActivate={() =>
                        void previewProfileActivation(profile.id)
                      }
                      virtualIndex={virtualRow.index}
                      virtualStart={virtualRow.start}
                      virtualSize={virtualRow.size}
                      virtualSetSize={store.profiles.length}
                    />
                  );
                })}
              </ul>
            ) : store.busyAction === "load" ? (
              <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                {t("agents.providerProfiles.loading")}
              </div>
            ) : store.currentState?.nativeConfig || officialService ? null : (
              <p className="px-4 py-4 text-xs leading-5 text-muted-foreground">
                {t(
                  webRuntime
                    ? "agents.providerProfiles.webEmpty"
                    : "agents.providerProfiles.empty",
                )}
              </p>
            )}
          </nav>
        }
      >
        {store.errorCode ? (
          <div
            role="alert"
            className="border-b border-destructive/30 bg-destructive/[0.06] px-5 py-2.5 text-xs text-destructive"
          >
            {t("agents.providerProfiles.errors.operation")}
          </div>
        ) : null}
        {store.currentState?.status === "stale" ||
        store.currentState?.status === "unavailable" ? (
          <div
            role="status"
            className="border-b border-amber-500/30 bg-amber-500/[0.08] px-5 py-2.5 text-xs text-amber-700 dark:text-amber-300"
          >
            {t(
              `agents.providerProfiles.currentState.${store.currentState.status}`,
            )}
          </div>
        ) : null}
        {isFormOpen ? (
          <AgentProviderProfileFormDialog
            isOpen
            platformId={agent.id}
            profile={editing ?? null}
            busy={
              store.busyAction === "create" || store.busyAction === "update"
            }
            onClose={() => setEditing(undefined)}
            onCreate={store.createProfile}
            onUpdate={store.updateProfile}
          />
        ) : selectedProfile ? (
          <ProfileDetail
            profile={selectedProfile}
            isCurrent={selectedProfile.id === verifiedCurrentProfileId}
            busy={busy}
            testing={store.busyAction === "test-connection"}
            modelTesting={store.busyAction === "test-model"}
            copied={copiedProfileId === selectedProfile.id}
            connectionResult={
              store.connectionResult?.profileId === selectedProfile.id
                ? store.connectionResult
                : null
            }
            modelTestResult={
              store.modelTestResult?.profileId === selectedProfile.id
                ? store.modelTestResult
                : null
            }
            supportsConnectionTest={
              !webRuntime && agent.capabilities.provider.status === "supported"
            }
            onEdit={() => setEditing(selectedProfile)}
            onTestConnection={() =>
              void store.testConnection(agent.id, selectedProfile.id)
            }
            onTestModel={() => setModelTestConfirmOpen(true)}
            onCancelModelTest={() => void store.cancelModelTest()}
            onRename={() => {
              setRenameTarget(selectedProfile);
              setRenameValue(selectedProfile.name);
            }}
            onDuplicate={() =>
              void store.duplicateProfile(
                selectedProfile.id,
                t("agents.providerProfiles.duplicateName", {
                  name: selectedProfile.name,
                }),
              )
            }
            onExport={() => void exportSelected()}
            onDelete={() => setDeleteTarget(selectedProfile)}
          />
        ) : detailSummary ? (
          <AgentProviderNativeDetail
            platformId={agent.id}
            summary={detailSummary}
            serviceStatus={
              officialSelected ? officialService?.status : undefined
            }
            agent={agent}
            busyAction={store.busyAction}
            connectionResult={
              store.connectionResult?.profileId === `native:${agent.id}`
                ? store.connectionResult
                : null
            }
            modelTestResult={
              store.modelTestResult?.profileId === `native:${agent.id}`
                ? store.modelTestResult
                : null
            }
            supportsConnectionTest={
              !webRuntime &&
              agent.capabilities.provider.status === "supported" &&
              (!officialSelected || officialService?.status === "active")
            }
            onRestoreOfficial={() => void store.restoreOfficial(agent.id)}
            onTestConnection={() => void store.testCurrentConnection(agent.id)}
            onTestModel={() => setModelTestConfirmOpen(true)}
            onCancelModelTest={() => void store.cancelModelTest()}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div className="max-w-sm">
              <KeyRoundIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <h2 className="mt-3 text-sm font-semibold text-foreground">
                {t("agents.providerProfiles.emptyTitle")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  webRuntime
                    ? "agents.providerProfiles.webEmptyHint"
                    : "agents.providerProfiles.emptyHint",
                )}
              </p>
            </div>
          </div>
        )}
      </AgentProviderWorkbenchLayout>

      <AgentProviderContextMenu
        busy={busy}
        position={contextMenuPosition}
        onAdd={() => setEditing(null)}
        onImport={
          webRuntime || agent.id === "antigravity-cli"
            ? undefined
            : () => setSourceDialogOpen(true)
        }
        onClose={() => setContextMenuPosition(null)}
      />

      <AgentProviderSourceDialog
        isOpen={sourceDialogOpen}
        platformId={agent.id}
        candidates={store.sourceCandidates}
        loading={store.busyAction === "load-sources"}
        importing={store.busyAction === "import-source"}
        onLoad={store.loadSources}
        onImport={store.importSource}
        onClose={() => setSourceDialogOpen(false)}
      />
      <AgentProviderActivationDialog
        plan={store.activationPlan}
        result={store.activationResult}
        busy={store.busyAction === "activate"}
        errorCode={store.errorCode}
        onClose={store.clearTransient}
        onActivate={(resolutions) =>
          store.activatePreview(agent.id, resolutions)
        }
      />
      <Modal
        isOpen={renameTarget !== null}
        onClose={() => {
          if (store.busyAction === "update") return;
          setRenameTarget(null);
          setRenameValue("");
        }}
        title={t("agents.providerProfiles.renameTitle")}
        size="sm"
        closeOnBackdrop={store.busyAction !== "update"}
        closeOnEscape={store.busyAction !== "update"}
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmRename();
          }}
        >
          <Input
            label={t("agents.providerProfiles.form.name")}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRenameTarget(null);
                setRenameValue("");
              }}
              disabled={store.busyAction === "update"}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!renameValue.trim() || store.busyAction === "update"}
            >
              {store.busyAction === "update" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : null}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={modelTestConfirmOpen}
        onClose={() => setModelTestConfirmOpen(false)}
        onConfirm={() => {
          setModelTestConfirmOpen(false);
          if (selectedProfile) {
            void store.testModel(agent.id, selectedProfile.id);
            return;
          }
          if (store.currentState?.nativeConfig) {
            void store.testCurrentModel(agent.id);
          }
        }}
        title={t("agents.providerProfiles.modelTest.confirmTitle")}
        message={t("agents.providerProfiles.modelTest.confirmMessage")}
        confirmText={t("agents.providerProfiles.modelTest.confirm")}
        cancelText={t("common.cancel")}
      />
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title={t("agents.providerProfiles.deleteTitle")}
        message={t("agents.providerProfiles.deleteMessage", {
          name: deleteTarget?.name ?? "",
        })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="destructive"
        isLoading={store.busyAction === "delete"}
      />
    </div>
  );
}
