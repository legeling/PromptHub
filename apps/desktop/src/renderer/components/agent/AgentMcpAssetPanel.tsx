import { requestConfirmation } from "../ui/confirmation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileJsonIcon,
  Loader2Icon,
  ServerIcon,
  TrashIcon,
} from "lucide-react";

import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { ManagedAgentSummary } from "@prompthub/shared/types";
import { AgentMcpEntryDetail } from "../mcp/AgentMcpEntryDetail";
import { McpLibraryDeployDialog } from "../mcp/McpLibraryDeployDialog";
import {
  buildAgentMcpImportDraft,
  findAgentMcpServer,
} from "../mcp/mcp-manager-utils";
import { useMcpStore } from "../../stores/mcp.store";
import { useUIStore } from "../../stores/ui.store";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { matchesManagedAgentTarget } from "./agent-target-matching";
import {
  AgentAssetActionButton,
  AgentAssetCard,
  AgentAssetCardContent,
  AgentAssetManagementSurface,
  AgentAssetPrimaryAction,
} from "./AgentAssetManagementSurface";
import { useBoundedPage } from "./BoundedListPager";

type AgentMcpFilter = "all" | "managed" | "external" | "enabled" | "disabled";

interface AgentMcpCard {
  key: string;
  preset: McpTargetPreset;
  status: McpTargetStatusEntry;
  serverName: string;
  server: McpServerConfig;
  managedServer?: McpServerConfig;
}

const FILTER_ORDER: AgentMcpFilter[] = [
  "all",
  "managed",
  "external",
  "enabled",
  "disabled",
];

function isAgentPreset(
  preset: McpTargetPreset,
  agent: ManagedAgentSummary,
): boolean {
  return matchesManagedAgentTarget([preset.platformId, preset.target], agent);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStatusForPreset(
  targetStatus: McpTargetStatusEntry[],
  presetId: string,
): McpTargetStatusEntry | undefined {
  return targetStatus.find((entry) => entry.presetId === presetId);
}

function buildFallbackAgentServer(
  preset: McpTargetPreset,
  name: string,
): McpServerConfig {
  return {
    id: `agent-${preset.id}-${name}`,
    name,
    displayName: name,
    transport: "stdio",
    enabled: true,
    source: { type: "import", id: preset.id, label: preset.label },
    createdAt: 0,
    updatedAt: 0,
  };
}

function getAgentServer(
  preset: McpTargetPreset,
  status: McpTargetStatusEntry,
  name: string,
  managedServer?: McpServerConfig,
): McpServerConfig {
  return (
    status.servers?.find((server) => server.name === name) ??
    managedServer ??
    buildFallbackAgentServer(preset, name)
  );
}

function formatInvocation(server: McpServerConfig): string {
  if (server.transport === "stdio") {
    return (
      [server.command, ...(server.args ?? [])].filter(Boolean).join(" ") ||
      server.name
    );
  }
  return server.url || server.name;
}

function AgentMcpCardView({
  card,
  isBusy,
  onImport,
  onOpenConfig,
  onOpenDetail,
  onOpenManaged,
  onRemove,
}: {
  card: AgentMcpCard;
  isBusy: boolean;
  onImport: () => void;
  onOpenConfig: () => void;
  onOpenDetail: () => void;
  onOpenManaged?: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { server, managedServer, preset } = card;
  const isManaged = Boolean(managedServer);
  return (
    <AgentAssetCard
      testId="mcp-agent-server-card"
      actionsTestId="mcp-agent-server-actions"
      onOpen={onOpenDetail}
      openLabel={t("mcp.openAgentEntryDetails", {
        name: server.displayName || server.name,
        defaultValue: "Open MCP details {{name}}",
      })}
      actions={
        <>
          <AgentAssetActionButton
            onClick={onOpenConfig}
            aria-label={t("mcp.openAgentConfig", "Open agent config")}
            title={t("mcp.openAgentConfig", "Open agent config")}
          >
            <FileJsonIcon aria-hidden="true" className="h-4 w-4" />
          </AgentAssetActionButton>
          {isManaged && onOpenManaged ? (
            <AgentAssetActionButton
              onClick={onOpenManaged}
              aria-label={t("mcp.openInMyMcp", "Open in My MCP")}
              title={t("mcp.openInMyMcp", "Open in My MCP")}
            >
              <BookOpenIcon aria-hidden="true" className="h-4 w-4" />
            </AgentAssetActionButton>
          ) : (
            <AgentAssetActionButton
              variant="primary"
              onClick={onImport}
              disabled={isBusy}
              aria-label={t("mcp.importToMyMcp", "Import to My MCP")}
              title={t("mcp.importToMyMcp", "Import to My MCP")}
            >
              {isBusy ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
              )}
            </AgentAssetActionButton>
          )}
          <AgentAssetActionButton
            variant="destructive"
            onClick={onRemove}
            disabled={isBusy}
            aria-label={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
            title={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
          >
            {isBusy ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : (
              <TrashIcon aria-hidden="true" className="h-4 w-4" />
            )}
          </AgentAssetActionButton>
        </>
      }
    >
      <AgentAssetCardContent
        icon={
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ServerIcon aria-hidden="true" className="h-5 w-5" />
          </span>
        }
        iconTestId="agent-mcp-asset-icon"
        title={server.displayName || server.name}
        status={
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
              isManaged
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {isManaged ? (
              <CheckCircle2Icon aria-hidden="true" className="h-3 w-3" />
            ) : null}
            {isManaged
              ? t("mcp.managedByPromptHub", "Managed in PromptHub")
              : t("mcp.notInLibrary", "Not in PromptHub library")}
          </span>
        }
        description={
          server.description ||
          t("mcp.defaultDescription", "MCP server configuration")
        }
        source={formatInvocation(server)}
        metadata={
          <>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {server.transport}
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
              {preset.label}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {server.name}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                server.enabled
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {server.enabled
                ? t("common.enabled", "Enabled")
                : t("common.disabled", "Disabled")}
            </span>
          </>
        }
      />
    </AgentAssetCard>
  );
}

export function AgentMcpAssetPanel({
  agent,
  onDetailOpenChange,
}: {
  agent: ManagedAgentSummary;
  onDetailOpenChange?: (isOpen: boolean) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const library = useMcpStore((state) => state.library);
  const targetPresets = useMcpStore((state) => state.targetPresets);
  const targetStatus = useMcpStore((state) => state.targetStatus);
  const isLoading = useMcpStore((state) => state.isLoading);
  const error = useMcpStore((state) => state.error);
  const isLoadingTargetInventory = useMcpStore(
    (state) => state.isLoadingTargetInventory,
  );
  const targetInventoryError = useMcpStore(
    (state) => state.targetInventoryError,
  );
  const load = useMcpStore((state) => state.load);
  const loadTargetInventory = useMcpStore((state) => state.loadTargetInventory);
  const refreshTargetStatus = useMcpStore((state) => state.refreshTargetStatus);
  const createServer = useMcpStore((state) => state.createServer);
  const applyTarget = useMcpStore((state) => state.applyTarget);
  const removeTargetNames = useMcpStore((state) => state.removeTargetNames);
  const selectServer = useMcpStore((state) => state.selectServer);
  const setSelectedTab = useMcpStore((state) => state.setSelectedTab);
  const setAppModule = useUIStore((state) => state.setAppModule);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentMcpFilter>("all");
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const [busyServerKey, setBusyServerKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<AgentMcpCard | null>(
    null,
  );
  const [isRemoving, setIsRemoving] = useState(false);

  const scopedPresets = useMemo(
    () => targetPresets.filter((preset) => isAgentPreset(preset, agent)),
    [agent, targetPresets],
  );
  const scopedPresetIds = useMemo(
    () => new Set(scopedPresets.map((preset) => preset.id)),
    [scopedPresets],
  );
  const scopedStatus = useMemo(
    () => targetStatus.filter((status) => scopedPresetIds.has(status.presetId)),
    [scopedPresetIds, targetStatus],
  );
  const serverByName = useMemo(
    () =>
      new Map((library?.servers ?? []).map((server) => [server.name, server])),
    [library?.servers],
  );
  const cards = useMemo<AgentMcpCard[]>(
    () =>
      scopedPresets.flatMap((preset) => {
        const status = getStatusForPreset(scopedStatus, preset.id);
        if (!status) return [];
        return status.serverNames.map((serverName) => {
          const managedServer = serverByName.get(serverName);
          return {
            key: `${preset.id}:${serverName}`,
            preset,
            status,
            serverName,
            managedServer,
            server: getAgentServer(preset, status, serverName, managedServer),
          };
        });
      }),
    [scopedPresets, scopedStatus, serverByName],
  );
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cards.filter((card) => {
      const managed = Boolean(card.managedServer);
      if (filter === "managed" && !managed) return false;
      if (filter === "external" && managed) return false;
      if (filter === "enabled" && !card.server.enabled) return false;
      if (filter === "disabled" && card.server.enabled) return false;
      if (!normalized) return true;
      return [
        card.server.name,
        card.server.displayName,
        card.server.description ?? "",
        card.server.transport,
        card.preset.label,
        card.preset.path,
        formatInvocation(card.server),
      ]
        .join("\n")
        .toLowerCase()
        .includes(normalized);
    });
  }, [cards, filter, query]);
  const page = useBoundedPage(visibleCards, 60, visibleCards);
  const selectedCard = useMemo(
    () => cards.find((card) => card.key === selectedCardKey) ?? null,
    [cards, selectedCardKey],
  );

  useEffect(() => {
    if (!library && !isLoading && !error && !targetInventoryError) {
      void load();
    }
  }, [error, isLoading, library, load, targetInventoryError]);

  useEffect(() => {
    if (selectedCardKey && !selectedCard) setSelectedCardKey(null);
  }, [selectedCard, selectedCardKey]);

  useEffect(() => {
    onDetailOpenChange?.(Boolean(selectedCard));
  }, [onDetailOpenChange, selectedCard]);

  useEffect(() => () => onDetailOpenChange?.(false), [onDetailOpenChange]);

  if (!agent.paths.mcp) {
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        {t("agents.notAvailable", "Not available")}
      </div>
    );
  }

  const openAgentConfig = async (preset: McpTargetPreset): Promise<void> => {
    try {
      const result = await window.electron?.openPath?.(preset.path);
      if (result && !result.success)
        throw new Error(result.error || "Failed to open MCP config");
      showToast(t("mcp.agentConfigOpened", "Agent config opened"), "success");
    } catch (actionError) {
      showToast(getErrorMessage(actionError), "error");
    }
  };

  const refresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await Promise.all([load(), loadTargetInventory({ force: true })]);
    } catch (actionError) {
      showToast(getErrorMessage(actionError), "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const deployFromLibrary = async (serverIds: string[]): Promise<void> => {
    const preset = scopedPresets[0];
    if (!preset) {
      throw new Error(
        t("mcp.noAgentTargets", "No enabled MCP target is available."),
      );
    }
    const target = {
      target: preset.target,
      scope: preset.scope,
      path: preset.path,
      serverIds,
    } as const;
    try {
      await applyTarget(target);
    } catch (actionError) {
      const message = getErrorMessage(actionError);
      const isConflict =
        message.includes("TARGET_CONFLICT") ||
        message.includes("同名 MCP 服务");
      if (
        !isConflict ||
        !(await requestConfirmation({
          message: t("mcp.confirmTargetOverwrite", {
            message,
            defaultValue: `${message}\n\nOverwrite the existing target MCP entry?`,
          }),
        }))
      ) {
        throw actionError;
      }
      await applyTarget({ ...target, force: true });
    }
    await refreshTargetStatus();
    showToast(t("mcp.applied", "MCP applied"), "success");
  };

  const openManaged = (server: McpServerConfig): void => {
    setAppModule("mcp");
    setSelectedTab("library");
    selectServer(server.id);
  };

  const importExternal = async (card: AgentMcpCard): Promise<void> => {
    const sourceServer = findAgentMcpServer(
      scopedStatus,
      card.preset.id,
      card.serverName,
    );
    if (!sourceServer) {
      throw new Error(
        t(
          "mcp.agentEntryUnavailable",
          "Agent MCP entry details are unavailable. Refresh Agent MCP and try again.",
        ),
      );
    }
    const server = await createServer(
      buildAgentMcpImportDraft(sourceServer, card.preset),
    );
    setAppModule("mcp");
    setSelectedTab("library");
    selectServer(server.id);
    showToast(t("mcp.imported", "MCP imported"), "success");
  };

  const runServerAction = (
    card: AgentMcpCard,
    action: () => Promise<void> | void,
  ): void => {
    setBusyServerKey(card.key);
    void Promise.resolve(action())
      .catch((actionError) => showToast(getErrorMessage(actionError), "error"))
      .finally(() => setBusyServerKey(null));
  };

  const confirmRemove = (): void => {
    if (!pendingRemoval || isRemoving) return;
    setIsRemoving(true);
    void removeTargetNames({
      target: pendingRemoval.preset.target,
      scope: pendingRemoval.preset.scope,
      path: pendingRemoval.preset.path,
      serverNames: [pendingRemoval.serverName],
    })
      .then(async () => {
        await refreshTargetStatus();
        setSelectedCardKey(null);
        setPendingRemoval(null);
        showToast(t("mcp.removed", "MCP removed"), "success");
      })
      .catch((actionError) => showToast(getErrorMessage(actionError), "error"))
      .finally(() => setIsRemoving(false));
  };

  const filterLabels: Record<AgentMcpFilter, string> = {
    all: t("mcp.agentMcpFilterAll", {
      count: cards.length,
      defaultValue: "{{count}} MCP",
    }),
    managed: t("mcp.agentMcpFilterManaged", {
      count: cards.filter((card) => card.managedServer).length,
      defaultValue: "{{count}} managed",
    }),
    external: t("mcp.agentMcpFilterExternal", {
      count: cards.filter((card) => !card.managedServer).length,
      defaultValue: "{{count}} external",
    }),
    enabled: t("mcp.agentMcpFilterEnabled", {
      count: cards.filter((card) => card.server.enabled).length,
      defaultValue: "{{count}} enabled",
    }),
    disabled: t("mcp.agentMcpFilterDisabled", {
      count: cards.filter((card) => !card.server.enabled).length,
      defaultValue: "{{count}} disabled",
    }),
  };
  const loadError = error ?? targetInventoryError;
  const loadingInventory = isLoading || isLoadingTargetInventory;

  if (selectedCard) {
    const isBusy = busyServerKey === selectedCard.key;
    return (
      <>
        <AgentMcpEntryDetail
          isImporting={isBusy}
          isManaged={Boolean(selectedCard.managedServer)}
          isUninstalling={
            isRemoving && pendingRemoval?.key === selectedCard.key
          }
          platformId={selectedCard.preset.platformId ?? agent.id}
          platformName={selectedCard.preset.label}
          sectionTitle={t("mcp.agentMcp", "Agent MCP")}
          server={selectedCard.server}
          sourcePath={selectedCard.preset.path}
          onBack={() => setSelectedCardKey(null)}
          onImport={
            selectedCard.managedServer
              ? undefined
              : () =>
                  runServerAction(selectedCard, () =>
                    importExternal(selectedCard),
                  )
          }
          onOpenAgentConfig={() => openAgentConfig(selectedCard.preset)}
          onOpenManagedMcp={
            selectedCard.managedServer
              ? () => openManaged(selectedCard.managedServer as McpServerConfig)
              : undefined
          }
          onUninstall={() => setPendingRemoval(selectedCard)}
        />
        <ConfirmDialog
          isOpen={Boolean(pendingRemoval)}
          onClose={() => setPendingRemoval(null)}
          onConfirm={confirmRemove}
          title={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
          message={t("mcp.uninstallFromAgentConfirm", {
            target: pendingRemoval?.preset.label ?? "",
            name: pendingRemoval?.serverName ?? "",
            defaultValue:
              "Remove {{name}} from {{target}}? The managed MCP library will not be changed.",
          })}
          confirmText={t("common.uninstall", "Uninstall")}
          cancelText={t("common.cancel", "Cancel")}
          variant="destructive"
          isLoading={isRemoving}
        />
      </>
    );
  }

  return (
    <>
      <AgentAssetManagementSurface
        domain="mcp"
        query={query}
        onQueryChange={setQuery}
        searchLabel={t("agents.searchAssets", "Search assets")}
        filters={FILTER_ORDER.map((filterKey) => ({
          key: filterKey,
          label: filterLabels[filterKey],
          testId: `mcp-agent-filter-${filterKey}`,
        }))}
        activeFilter={filter}
        onFilterChange={(filterKey) => setFilter(filterKey as AgentMcpFilter)}
        refreshLabel={t("agents.refreshCurrentAsset", "Refresh current view")}
        onRefresh={() => void refresh()}
        isRefreshing={loadingInventory || isRefreshing}
        alert={
          loadError && page.total > 0 ? (
            <div
              role="alert"
              className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {t("mcp.assetLoadFailed", "MCP targets could not be loaded.")}
            </div>
          ) : null
        }
        primaryAction={
          <AgentAssetPrimaryAction
            onClick={() => {
              if (scopedPresets[0]) {
                setIsAddDialogOpen(true);
                return;
              }
              showToast(
                t("mcp.noAgentTargets", "No enabled MCP target is available."),
                "error",
              );
            }}
            label={t("mcp.addMcp", "Add MCP")}
          />
        }
        listTestId="mcp-agent-server-list"
        gridTestId="mcp-agent-grid"
        isLoading={loadingInventory}
        loadingLabel={t("mcp.loading", "Loading MCP...")}
        failureState={
          loadError
            ? {
                message: t(
                  "mcp.assetLoadFailed",
                  "MCP targets could not be loaded.",
                ),
                retryLabel: t("common.retry", "Retry"),
                onRetry: () => void load(),
              }
            : undefined
        }
        isEmpty={visibleCards.length === 0}
        emptyState={
          <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
            <ServerIcon
              aria-hidden="true"
              className="mb-3 h-10 w-10 text-muted-foreground/40"
            />
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {query.trim()
                ? t("mcp.noFilteredAgentMcp", "No matching MCP servers")
                : t("mcp.noServersOnTarget", "No MCP servers configured")}
            </p>
          </div>
        }
        page={page}
      >
        {page.items.map((card) => (
          <AgentMcpCardView
            key={card.key}
            card={card}
            isBusy={busyServerKey === card.key}
            onOpenDetail={() => setSelectedCardKey(card.key)}
            onOpenConfig={() => void openAgentConfig(card.preset)}
            onOpenManaged={
              card.managedServer
                ? () => openManaged(card.managedServer as McpServerConfig)
                : undefined
            }
            onImport={() => runServerAction(card, () => importExternal(card))}
            onRemove={() => setPendingRemoval(card)}
          />
        ))}
      </AgentAssetManagementSurface>
      <ConfirmDialog
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={confirmRemove}
        title={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
        message={t("mcp.uninstallFromAgentConfirm", {
          target: pendingRemoval?.preset.label ?? "",
          name: pendingRemoval?.serverName ?? "",
          defaultValue:
            "Remove {{name}} from {{target}}? The managed MCP library will not be changed.",
        })}
        confirmText={t("common.uninstall", "Uninstall")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isRemoving}
      />
      {isAddDialogOpen && scopedPresets[0] ? (
        <McpLibraryDeployDialog
          preset={scopedPresets[0]}
          servers={library?.servers ?? []}
          targetStatus={scopedStatus}
          onClose={() => setIsAddDialogOpen(false)}
          onApply={deployFromLibrary}
        />
      ) : null}
    </>
  );
}
