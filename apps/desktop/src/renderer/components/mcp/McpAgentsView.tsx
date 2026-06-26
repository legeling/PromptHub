import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileJsonIcon,
  FolderOpenIcon,
  Loader2Icon,
  TrashIcon,
  RefreshCwIcon,
  ServerIcon,
} from "lucide-react";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";
import { PlatformIcon } from "../ui/PlatformIcon";
import { AgentMcpDetailActions } from "./AgentMcpDetailActions";
import { AgentMcpPreviewSidebar } from "./AgentMcpPreviewSidebar";

const MCP_AGENT_SECTION_HEADER_CLASS =
  "h-[132px] border-b border-border app-wallpaper-panel-strong";

type McpTargetIconVariant = "platform" | "project";

interface McpAgentsViewProps {
  servers: McpServerConfig[];
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  addButtonLabel?: string;
  noTargetsLabel?: string;
  openConfigLabel?: string;
  removeEntryLabel?: string;
  selectTargetLabel?: string;
  sidebarHint?: string;
  targetIconVariant?: McpTargetIconVariant;
  title?: string;
  onAddMcp: (preset: McpTargetPreset) => void;
  onImportExternal: (
    preset: McpTargetPreset,
    serverName: string,
  ) => Promise<void>;
  onOpenManaged: (server: McpServerConfig) => void;
  onOpenAgentConfig: (preset: McpTargetPreset) => Promise<void> | void;
  onRemoveAgentEntry: (
    preset: McpTargetPreset,
    serverName: string,
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const MCP_AGENT_CARD_ICON_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors disabled:opacity-60";

function getStatusForPreset(
  targetStatus: McpTargetStatusEntry[],
  presetId: string,
): McpTargetStatusEntry | undefined {
  return targetStatus.find((entry) => entry.presetId === presetId);
}

function formatRecord(record?: Record<string, string>): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function McpTargetIcon({
  preset,
  variant,
}: {
  preset: McpTargetPreset;
  variant: McpTargetIconVariant;
}) {
  if (variant === "project") {
    return (
      <FolderOpenIcon aria-hidden="true" className="h-5 w-5 text-primary" />
    );
  }

  return (
    <PlatformIcon
      aria-hidden="true"
      platformId={preset.platformId ?? preset.id}
      size={20}
    />
  );
}

function buildAgentServerConfig(server: McpServerConfig): string {
  const entry =
    server.transport === "stdio"
      ? {
          command: server.command,
          args: server.args,
          cwd: server.cwd,
          env: server.env,
        }
      : {
          type: server.transport,
          url: server.url,
          headers: server.headers,
        };

  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: Object.fromEntries(
          Object.entries(entry).filter(
            ([, value]) =>
              value !== undefined &&
              (!Array.isArray(value) || value.length > 0) &&
              (typeof value !== "object" ||
                value === null ||
                Object.keys(value).length > 0),
          ),
        ),
      },
    },
    null,
    2,
  );
}

function buildFallbackAgentServer(
  preset: McpTargetPreset | null,
  name: string,
): McpServerConfig {
  return {
    id: `agent-${preset?.id ?? "target"}-${name}`,
    name,
    displayName: name,
    transport: "stdio",
    enabled: true,
    source: {
      type: "import",
      id: preset?.id,
      label: preset?.label,
    },
    createdAt: 0,
    updatedAt: 0,
  };
}

function getAgentServerForName({
  managedServer,
  name,
  preset,
  status,
}: {
  managedServer?: McpServerConfig;
  name: string;
  preset: McpTargetPreset | null;
  status?: McpTargetStatusEntry;
}): McpServerConfig {
  return (
    (status?.servers ?? []).find((server) => server.name === name) ??
    managedServer ??
    buildFallbackAgentServer(preset, name)
  );
}

function formatAgentMcpInvocation(server: McpServerConfig): string {
  if (server.transport === "stdio") {
    const command = [server.command, ...(server.args ?? [])]
      .filter(Boolean)
      .join(" ");
    return command || server.name;
  }
  return server.url || server.name;
}

function AgentMcpDetailItem({
  label,
  multiline = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  value?: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="min-w-0 rounded-2xl border border-border app-wallpaper-surface p-4">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xs text-foreground ${
          multiline
            ? "max-h-32 overflow-auto whitespace-pre-wrap break-words leading-5"
            : "truncate"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Agent MCP management view. The layout intentionally follows
 * SkillAgentsView: left platform list, right selected platform detail.
 * Agent MCP 管理视图。布局刻意对齐 SkillAgentsView：左侧平台列表，
 * 右侧为所选平台详情。
 */
export function McpAgentsView({
  servers,
  targetPresets,
  targetStatus,
  addButtonLabel,
  noTargetsLabel,
  openConfigLabel,
  removeEntryLabel,
  selectTargetLabel,
  sidebarHint,
  targetIconVariant = "platform",
  title,
  onAddMcp,
  onImportExternal,
  onOpenManaged,
  onOpenAgentConfig,
  onRemoveAgentEntry,
  onRefresh,
}: McpAgentsViewProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("mcp.agentMcp", "Agent MCP");
  const resolvedSidebarHint =
    sidebarHint ??
    t(
      "mcp.agentMcpSidebarHint",
      "Browse each agent config and distribute enabled MCP servers.",
    );
  const resolvedNoTargetsLabel =
    noTargetsLabel ?? t("mcp.noAgentTargets", "No agent targets");
  const resolvedSelectTargetLabel =
    selectTargetLabel ?? t("mcp.selectAgentTarget", "Select an agent target");
  const resolvedOpenConfigLabel =
    openConfigLabel ?? t("mcp.openAgentConfig", "Open agent config");
  const resolvedRemoveEntryLabel =
    removeEntryLabel ?? t("mcp.uninstallFromAgent", "Uninstall from Agent");
  const resolvedAddButtonLabel = addButtonLabel ?? t("mcp.addMcp", "Add MCP");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    targetPresets[0]?.id ?? null,
  );
  const [busyServerKey, setBusyServerKey] = useState<string | null>(null);
  const [selectedServerName, setSelectedServerName] = useState<string | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const enabledCount = servers.filter((server) => server.enabled).length;

  const serverByName = useMemo(
    () => new Map(servers.map((server) => [server.name, server])),
    [servers],
  );

  const selectedPreset = useMemo(
    () =>
      targetPresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [selectedPresetId, targetPresets],
  );

  const selectedStatus = selectedPreset
    ? getStatusForPreset(targetStatus, selectedPreset.id)
    : undefined;
  const selectedServerNames = selectedStatus?.serverNames ?? [];
  const selectedAgentServer = selectedServerName
    ? getAgentServerForName({
        managedServer: serverByName.get(selectedServerName),
        name: selectedServerName,
        preset: selectedPreset,
        status: selectedStatus,
      })
    : null;
  const selectedManagedServer = selectedServerName
    ? serverByName.get(selectedServerName)
    : undefined;
  const managedServerCount = selectedServerNames.filter((name) =>
    serverByName.has(name),
  ).length;
  const unmanagedServerCount = selectedServerNames.length - managedServerCount;
  const distributedTargetCount = targetPresets.filter(
    (preset) =>
      (getStatusForPreset(targetStatus, preset.id)?.serverNames.length ?? 0) >
      0,
  ).length;
  useEffect(() => {
    setSelectedPresetId((current) => {
      if (current && targetPresets.some((preset) => preset.id === current)) {
        return current;
      }
      return targetPresets[0]?.id ?? null;
    });
  }, [targetPresets]);

  useEffect(() => {
    setSelectedServerName((current) =>
      current && selectedServerNames.includes(current) ? current : null,
    );
  }, [selectedServerNames]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleServerAction = async (
    actionKey: string,
    action: () => void | Promise<void>,
  ) => {
    setBusyServerKey(actionKey);
    try {
      await action();
    } finally {
      setBusyServerKey(null);
    }
  };

  if (selectedPreset && selectedServerName && selectedAgentServer) {
    const serverActionKey = `${selectedPreset.id}:${selectedServerName}`;
    const isServerBusy = busyServerKey === serverActionKey;
    const configContent = buildAgentServerConfig(selectedAgentServer);
    const handleImportSelectedAgentServer = selectedManagedServer
      ? undefined
      : () =>
          handleServerAction(serverActionKey, () =>
            onImportExternal(selectedPreset, selectedServerName),
          );
    const handleOpenSelectedManagedServer = selectedManagedServer
      ? () => onOpenManaged(selectedManagedServer)
      : undefined;
    const handleOpenSelectedAgentConfig = () =>
      onOpenAgentConfig(selectedPreset);
    const handleRemoveSelectedAgentServer = () =>
      handleServerAction(serverActionKey, () =>
        onRemoveAgentEntry(selectedPreset, selectedServerName),
      );
    return (
      <div
        data-testid="mcp-agent-entry-detail"
        className="flex h-full min-h-0 flex-col app-wallpaper-section animate-in fade-in slide-in-from-right-4 duration-smooth"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border app-wallpaper-panel-strong px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setSelectedServerName(null)}
              className="-ml-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("common.back", "Back")}
              title={t("common.back", "Back")}
            >
              <ArrowLeftIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
              {selectedServerName.trim().charAt(0).toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-bold text-foreground">
                  {selectedAgentServer.displayName || selectedServerName}
                </h2>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    selectedManagedServer
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {selectedManagedServer
                    ? t("mcp.managedByPromptHub", "Managed in PromptHub")
                    : t("mcp.notInLibrary", "Not in PromptHub library")}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {selectedPreset.label} · {selectedPreset.path}
              </p>
            </div>
          </div>
          <div
            data-testid="mcp-agent-detail-actions"
            className="flex shrink-0 items-center gap-2"
          >
            <AgentMcpDetailActions
              isImporting={isServerBusy}
              isManaged={Boolean(selectedManagedServer)}
              isUninstalling={isServerBusy}
              openConfigLabel={resolvedOpenConfigLabel}
              removeEntryLabel={resolvedRemoveEntryLabel}
              onImport={handleImportSelectedAgentServer}
              onOpenAgentConfig={handleOpenSelectedAgentConfig}
              onOpenManagedMcp={handleOpenSelectedManagedServer}
              onUninstall={handleRemoveSelectedAgentServer}
              t={t}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-border app-wallpaper-panel-strong p-5">
                <div className="mb-4 text-sm font-semibold text-foreground">
                  {t("mcp.sourceAndDetails", "Source and details")}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <AgentMcpDetailItem
                    label={t("mcp.name", "Name")}
                    value={selectedAgentServer.name}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.transport", "Transport")}
                    value={selectedAgentServer.transport}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.command", "Command")}
                    value={selectedAgentServer.command}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.url", "URL")}
                    value={selectedAgentServer.url}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.cwd", "Working Directory")}
                    value={selectedAgentServer.cwd}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.args", "Args")}
                    multiline
                    value={selectedAgentServer.args?.join("\n")}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.env", "Environment")}
                    multiline
                    value={formatRecord(selectedAgentServer.env)}
                  />
                  <AgentMcpDetailItem
                    label={t("mcp.headers", "Headers")}
                    multiline
                    value={formatRecord(selectedAgentServer.headers)}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-border app-wallpaper-panel-strong p-5">
                <div className="mb-4 text-sm font-semibold text-foreground">
                  {t("mcp.copyConfig", "Copy config")}
                </div>
                <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-card p-4 text-xs leading-5 text-foreground">
                  {configContent}
                </pre>
              </section>
            </div>

            <aside className="space-y-4">
              <AgentMcpPreviewSidebar
                isImporting={isServerBusy}
                isManaged={Boolean(selectedManagedServer)}
                onImport={handleImportSelectedAgentServer}
                openConfigLabel={resolvedOpenConfigLabel}
                onOpenAgentConfig={handleOpenSelectedAgentConfig}
                onOpenManagedMcp={handleOpenSelectedManagedServer}
                platformId={selectedPreset.platformId ?? selectedPreset.id}
                platformName={selectedPreset.label}
                iconVariant={targetIconVariant}
                sectionTitle={resolvedTitle}
                sourcePath={selectedPreset.path}
                t={t}
              />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="flex min-h-0 w-80 shrink-0 flex-col border-r border-border app-wallpaper-panel-strong">
        <div
          data-testid="mcp-agent-sidebar-header"
          className={`${MCP_AGENT_SECTION_HEADER_CLASS} shrink-0`}
        >
          <div className="flex h-full items-start justify-between gap-4 px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  {resolvedTitle}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {resolvedSidebarHint}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
                title={t("common.refresh", "Refresh")}
                aria-label={t("common.refresh", "Refresh")}
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {targetPresets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              <FolderOpenIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <div className="font-medium text-foreground">
                {resolvedNoTargetsLabel}
              </div>
            </div>
          ) : (
            targetPresets.map((preset) => {
              const status = getStatusForPreset(targetStatus, preset.id);
              const serverCount = status?.serverNames.length ?? 0;
              const isActive = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background/60 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      data-testid="mcp-agent-platform-icon-shell"
                      data-icon-variant={targetIconVariant}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                    >
                      <McpTargetIcon
                        preset={preset}
                        variant={targetIconVariant}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {preset.label}
                      </div>
                      <div className="mt-1 line-clamp-2 font-mono text-xs leading-5 text-muted-foreground">
                        {preset.path}
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {status?.exists
                        ? t("mcp.serversOnTarget", {
                            count: serverCount,
                            defaultValue: `${serverCount} MCP`,
                          })
                        : t("mcp.targetFileMissing", "Not created")}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div
        key={selectedPresetId ?? "no-mcp-agent"}
        data-testid="mcp-agent-detail-shell"
        data-agent-id={selectedPresetId ?? ""}
        className="flex min-w-0 flex-1 flex-col app-wallpaper-section animate-in fade-in slide-in-from-right-3 duration-smooth"
      >
        <div
          data-testid="mcp-agent-detail-header"
          className={`${MCP_AGENT_SECTION_HEADER_CLASS} shrink-0`}
        >
          <div className="flex h-full flex-col gap-4 px-4 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-foreground">
                  {selectedPreset?.label ?? resolvedTitle}
                </h3>
                <p className="mt-1 line-clamp-2 font-mono text-xs text-muted-foreground">
                  {selectedPreset?.path ?? resolvedSelectTargetLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing || !selectedPresetId}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
                title={t("common.refresh", "Refresh")}
                aria-label={t("common.refresh", "Refresh")}
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary shadow-sm">
                {t("mcp.serversOnTarget", {
                  count: selectedServerNames.length,
                  defaultValue: `${selectedServerNames.length} MCP`,
                })}
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                {t("mcp.managedServersCount", {
                  count: managedServerCount,
                  defaultValue: `${managedServerCount} managed`,
                })}
              </span>
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300">
                {t("mcp.unmanagedServersCount", {
                  count: unmanagedServerCount,
                  defaultValue: `${unmanagedServerCount} external`,
                })}
              </span>
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
                {t("mcp.enabledServersCount", {
                  count: enabledCount,
                  defaultValue: `${enabledCount} enabled`,
                })}
              </span>
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
                {t("mcp.distributedTargets", {
                  count: distributedTargetCount,
                  defaultValue: `${distributedTargetCount} target(s) distributed`,
                })}
              </span>
            </div>
          </div>
        </div>

        <div
          data-testid="mcp-agent-server-list"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5"
        >
          {!selectedPreset ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              <FolderOpenIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <div className="font-medium text-foreground">
                {resolvedSelectTargetLabel}
              </div>
            </div>
          ) : selectedServerNames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              <FolderOpenIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <div className="font-medium text-foreground">
                {t("mcp.noServersOnTarget", "No MCP servers configured")}
              </div>
            </div>
          ) : (
            selectedServerNames.map((name) => {
              const managedServer = serverByName.get(name);
              const agentServer = getAgentServerForName({
                managedServer,
                name,
                preset: selectedPreset,
                status: selectedStatus,
              });
              const serverActionKey = `${selectedPreset.id}:${name}`;
              const isServerBusy = busyServerKey === serverActionKey;
              const invocation = formatAgentMcpInvocation(agentServer);
              return (
                <article
                  key={name}
                  data-testid="mcp-agent-server-card"
                  onClick={() => setSelectedServerName(name)}
                  className="group cursor-pointer rounded-2xl border border-border app-wallpaper-surface transition-colors hover:border-primary/30 hover:bg-accent/30"
                >
                  <div className="grid min-h-[124px] grid-cols-[minmax(0,1fr)_12rem] items-stretch gap-4 px-4 py-4 max-[760px]:grid-cols-1 max-[760px]:items-start">
                    <button
                      type="button"
                      onClick={() => setSelectedServerName(name)}
                      disabled={!managedServer && isServerBusy}
                      className="min-w-0 self-stretch text-left disabled:opacity-60"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                          {name.trim().charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-foreground">
                              {agentServer.displayName || name}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                managedServer
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {managedServer
                                ? t(
                                    "mcp.managedByPromptHub",
                                    "Managed in PromptHub",
                                  )
                                : t(
                                    "mcp.notInLibrary",
                                    "Not in PromptHub library",
                                  )}
                            </span>
                          </div>
                          <div className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                            {agentServer.description ||
                              t(
                                "mcp.defaultDescription",
                                "MCP server configuration",
                              )}
                          </div>
                          <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                            {invocation}
                          </div>
                          <div
                            data-testid="mcp-agent-server-metadata"
                            className="mt-3 flex flex-wrap gap-1.5"
                          >
                            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                              {agentServer.transport}
                            </span>
                            {agentServer.displayName !== agentServer.name ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {agentServer.name}
                              </span>
                            ) : null}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                agentServer.enabled
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {agentServer.enabled
                                ? t("common.enabled", "Enabled")
                                : t("common.disabled", "Disabled")}
                            </span>
                            {agentServer.tags?.length
                              ? agentServer.tags.slice(0, 4).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                                  >
                                    {tag}
                                  </span>
                                ))
                              : null}
                          </div>
                        </div>
                      </div>
                    </button>

                    <div
                      data-testid="mcp-agent-server-actions"
                      onClick={(event) => event.stopPropagation()}
                      className="flex w-full shrink-0 items-end justify-end gap-2 self-end justify-self-end max-[760px]:justify-start"
                    >
                      <button
                        type="button"
                        onClick={() => void onOpenAgentConfig(selectedPreset)}
                        aria-label={resolvedOpenConfigLabel}
                        title={resolvedOpenConfigLabel}
                        className={`${MCP_AGENT_CARD_ICON_BUTTON_CLASS} border-border app-wallpaper-surface hover:bg-accent hover:text-foreground`}
                      >
                        <FileJsonIcon aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {managedServer ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void handleServerAction(serverActionKey, () =>
                                onOpenManaged(managedServer),
                              )
                            }
                            aria-label={t("mcp.openInMyMcp", "Open in My MCP")}
                            title={t("mcp.openInMyMcp", "Open in My MCP")}
                            className={`${MCP_AGENT_CARD_ICON_BUTTON_CLASS} border-border app-wallpaper-surface hover:bg-accent hover:text-foreground`}
                          >
                            <ServerIcon
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void handleServerAction(serverActionKey, () =>
                              onImportExternal(selectedPreset, name),
                            )
                          }
                          disabled={isServerBusy}
                          aria-label={t(
                            "mcp.importToMyMcp",
                            "Import to My MCP",
                          )}
                          title={t("mcp.importToMyMcp", "Import to My MCP")}
                          className={`${MCP_AGENT_CARD_ICON_BUTTON_CLASS} border-primary bg-primary text-white hover:bg-primary/90`}
                        >
                          {isServerBusy ? (
                            <Loader2Icon
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <DownloadIcon
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void handleServerAction(serverActionKey, () =>
                            onRemoveAgentEntry(selectedPreset, name),
                          )
                        }
                        disabled={isServerBusy}
                        aria-label={resolvedRemoveEntryLabel}
                        title={resolvedRemoveEntryLabel}
                        className={`${MCP_AGENT_CARD_ICON_BUTTON_CLASS} border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10`}
                      >
                        {isServerBusy ? (
                          <Loader2Icon
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin"
                          />
                        ) : (
                          <TrashIcon aria-hidden="true" className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => selectedPreset && onAddMcp(selectedPreset)}
            disabled={!selectedPreset}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <DownloadIcon className="h-4 w-4" aria-hidden="true" />
            {resolvedAddButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
