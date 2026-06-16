import type { CSSProperties, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquareIcon,
  DownloadIcon,
  ServerIcon,
  SquareIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import type {
  McpHealthCheckResult,
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";
import { PlatformIcon } from "../ui/PlatformIcon";
import { getDistributedPresets } from "./mcp-form-utils";

export type McpServerViewMode = "gallery" | "list";

interface McpServerListProps {
  servers: McpServerConfig[];
  selectedServerId: string | null;
  healthChecks?: McpHealthCheckResult[];
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  gridStyle?: CSSProperties;
  viewMode?: McpServerViewMode;
  selectionMode?: boolean;
  selectedServerIds?: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onToggleFavorite?: (server: McpServerConfig) => void | Promise<void>;
  onQuickDeploy?: (server: McpServerConfig) => void;
  onDelete?: (server: McpServerConfig) => void;
}

interface McpServerItemProps {
  server: McpServerConfig;
  selectedServerId: string | null;
  healthCheck?: McpHealthCheckResult;
  distributedPresets: McpTargetPreset[];
  targetPresets: McpTargetPreset[];
  isFirstRow?: boolean;
  selectionMode: boolean;
  selectedServerIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onToggleFavorite?: (server: McpServerConfig) => void | Promise<void>;
  onQuickDeploy?: (server: McpServerConfig) => void;
  onDelete?: (server: McpServerConfig) => void;
}

function getSourceBadgeLabel(
  server: McpServerConfig,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (server.source.type === "market") {
    return server.source.label || t("mcp.sourceMarket", "MCP Store");
  }
  if (server.source.type === "import") {
    return server.source.label || t("mcp.sourceImport", "Imported");
  }
  return server.source.label || t("mcp.sourceManual", "Manual");
}

function getInitial(server: McpServerConfig): string {
  return (server.displayName || server.name).trim().slice(0, 1).toUpperCase();
}

function getDisplayName(server: McpServerConfig): string {
  return server.displayName || server.name;
}

function getRuntimeSummary(server: McpServerConfig): string {
  if (server.transport !== "stdio") {
    return server.url || server.transport;
  }
  return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
}

function getHealthBadgeClass(status?: McpHealthCheckResult["status"]): string {
  if (status === "ok") {
    return "bg-emerald-500/10 text-emerald-600";
  }
  if (status === "warning") {
    return "bg-amber-500/10 text-amber-600";
  }
  if (status === "error") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

function buildLabels(
  server: McpServerConfig,
  selectionMode: boolean,
  isSelected: boolean,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const displayName = getDisplayName(server);
  const selectionVerb = isSelected
    ? t("common.clear", "Clear")
    : t("common.select", "Select");
  const selectionLabel = `${selectionVerb}: ${displayName}`;
  return {
    displayName,
    selectionLabel,
    primaryLabel: selectionMode
      ? selectionLabel
      : `${t("mcp.detail", "MCP Detail")}: ${displayName}`,
    favoriteLabel: server.isFavorite
      ? t("mcp.removeFavorite", "Remove Favorite")
      : t("mcp.addFavorite", "Add Favorite"),
  };
}

function ServerIconBlock({ server }: { server: McpServerConfig }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110 group-hover:shadow-lg">
      <span className="text-xl font-bold">{getInitial(server)}</span>
    </div>
  );
}

function DistributionIndicators({
  distributedPresets,
  className = "",
  testId,
}: {
  distributedPresets: McpTargetPreset[];
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid={testId}
      className={`flex min-h-8 items-center gap-1.5 ${className}`}
    >
      {distributedPresets.length > 0 ? (
        distributedPresets
          .slice(0, 6)
          .map((preset) => (
            <PlatformIcon
              key={preset.id}
              platformId={preset.platformId ?? preset.id}
              size={18}
              title={preset.label}
            />
          ))
      ) : (
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
          {t("mcp.notDistributed", "Not distributed")}
        </span>
      )}
      {distributedPresets.length > 6 ? (
        <span className="text-[10px] text-muted-foreground">
          +{distributedPresets.length - 6}
        </span>
      ) : null}
    </div>
  );
}

function ListDistributionIndicators({
  distributedPresets,
  targetPresets,
}: {
  distributedPresets: McpTargetPreset[];
  targetPresets: McpTargetPreset[];
}) {
  const distributedPresetIds = new Set(
    distributedPresets.map((preset) => preset.id),
  );

  if (targetPresets.length === 0) {
    return (
      <span className="min-w-8 text-right text-[10px] font-medium text-muted-foreground">
        0/0
      </span>
    );
  }

  return (
    <div className="flex w-28 shrink-0 items-center justify-end gap-1">
      {targetPresets.slice(0, 3).map((preset) => {
        const isDistributed = distributedPresetIds.has(preset.id);
        return (
          <div
            key={preset.id}
            className="flex items-center justify-center"
            title={preset.label}
          >
            <PlatformIcon
              platformId={preset.platformId ?? preset.id}
              size={16}
              className={isDistributed ? "opacity-100" : "opacity-40"}
            />
          </div>
        );
      })}
      <span className="ml-1 min-w-8 text-right text-[10px] font-medium text-primary">
        {distributedPresets.length}/{targetPresets.length}
      </span>
    </div>
  );
}

function MetadataBadges({
  server,
  healthCheck,
}: {
  server: McpServerConfig;
  healthCheck?: McpHealthCheckResult;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
        {getSourceBadgeLabel(server, t)}
      </span>
      <span
        className={`rounded-full px-2 py-1 text-[10px] font-medium ${
          server.enabled
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {server.enabled
          ? t("common.enabled", "Enabled")
          : t("common.disabled", "Disabled")}
      </span>
      <span
        className={`rounded-full px-2 py-1 text-[10px] font-medium ${getHealthBadgeClass(
          healthCheck?.status,
        )}`}
      >
        {healthCheck?.status
          ? t(`mcp.health.${healthCheck.status}`, healthCheck.status)
          : t("mcp.health.unchecked", "Unchecked")}
      </span>
    </div>
  );
}

function ServerActions({
  server,
  favoriteLabel,
  onToggleFavorite,
  onQuickDeploy,
  onDelete,
  variant = "row",
}: {
  server: McpServerConfig;
  favoriteLabel: string;
  onToggleFavorite?: (server: McpServerConfig) => void | Promise<void>;
  onQuickDeploy?: (server: McpServerConfig) => void;
  onDelete?: (server: McpServerConfig) => void;
  variant?: "card" | "row";
}) {
  const { t } = useTranslation();
  const hiddenCardAction =
    variant === "card" ? "opacity-0 group-hover:opacity-100" : "";
  const actionsClass =
    variant === "card"
      ? "flex w-full shrink-0 items-center justify-end gap-1"
      : "flex shrink-0 items-center gap-1";
  return (
    <div
      data-testid={variant === "card" ? "mcp-card-actions" : undefined}
      className={actionsClass}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onQuickDeploy?.(server);
        }}
        aria-label={t("mcp.quickDeploy", "Quick Sync")}
        className={`${hiddenCardAction} p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in`}
        title={t("mcp.quickDeploy", "Quick Sync")}
      >
        <DownloadIcon aria-hidden="true" className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void onToggleFavorite?.(server);
        }}
        aria-label={favoriteLabel}
        className={`p-2 rounded-lg transition-all active:scale-press-in ${
          server.isFavorite
            ? "text-yellow-500 hover:text-yellow-600"
            : `${hiddenCardAction} text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10`
        }`}
        title={favoriteLabel}
      >
        <StarIcon
          aria-hidden="true"
          className={`w-4 h-4 ${server.isFavorite ? "fill-current" : ""}`}
        />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(server);
        }}
        aria-label={t("common.delete", "Delete")}
        className={`${hiddenCardAction} p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-press-in`}
        title={t("common.delete", "Delete")}
      >
        <TrashIcon aria-hidden="true" className="w-4 h-4" />
      </button>
    </div>
  );
}

function McpServerCard({
  server,
  selectedServerId,
  healthCheck,
  distributedPresets,
  selectionMode,
  selectedServerIds,
  onSelect,
  onToggleSelection,
  onToggleFavorite,
  onQuickDeploy,
  onDelete,
}: McpServerItemProps) {
  const { t } = useTranslation();
  const isActive = selectedServerId === server.id;
  const isChecked = selectedServerIds.has(server.id);
  const { displayName, selectionLabel, primaryLabel, favoriteLabel } =
    buildLabels(server, selectionMode, isChecked, t);

  const handlePrimaryAction = () => {
    if (selectionMode) {
      onToggleSelection?.(server.id);
      return;
    }
    onSelect(server.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handlePrimaryAction();
  };

  return (
    <div
      data-testid={`mcp-server-card-${server.id}`}
      role="button"
      tabIndex={0}
      aria-label={primaryLabel}
      aria-pressed={selectionMode ? isChecked : isActive}
      onClick={handlePrimaryAction}
      onKeyDown={handleKeyDown}
      className={`group relative app-wallpaper-panel border rounded-2xl p-5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 ${
        selectionMode
          ? isChecked
            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/40"
          : isActive
            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
      }`}
    >
      {selectionMode ? (
        <button
          type="button"
          aria-pressed={isChecked}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection?.(server.id);
          }}
          aria-label={selectionLabel}
          className={`absolute right-4 top-4 z-10 p-2 rounded-lg border transition-colors ${
            isChecked
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background/80 text-muted-foreground hover:text-foreground"
          }`}
          title={selectionLabel}
        >
          {isChecked ? (
            <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
          ) : (
            <SquareIcon aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      ) : null}

      <div className="flex items-start justify-between gap-3 mb-4">
        <ServerIconBlock server={server} />
        {!selectionMode ? (
          <div
            data-testid="mcp-card-header-meta"
            className="flex min-w-0 flex-1 flex-col items-end gap-2"
          >
            <DistributionIndicators
              distributedPresets={distributedPresets}
              testId="mcp-distributed-targets"
              className="max-w-full flex-wrap justify-end"
            />
            <ServerActions
              server={server}
              favoriteLabel={favoriteLabel}
              onToggleFavorite={onToggleFavorite}
              onQuickDeploy={onQuickDeploy}
              onDelete={onDelete}
              variant="card"
            />
          </div>
        ) : null}
      </div>

      <h3
        className="font-bold text-foreground text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors"
        title={displayName}
      >
        {displayName}
      </h3>
      <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4 leading-relaxed italic opacity-80">
        {server.description ||
          t("mcp.defaultDescription", "MCP server configuration")}
      </p>
      <MetadataBadges server={server} healthCheck={healthCheck} />
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] font-medium text-muted-foreground">
          {server.transport}
        </span>
        {(server.tags ?? []).slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function McpServerRow({
  server,
  selectedServerId,
  healthCheck,
  distributedPresets,
  targetPresets,
  isFirstRow = false,
  selectionMode,
  selectedServerIds,
  onSelect,
  onToggleSelection,
  onToggleFavorite,
  onQuickDeploy,
  onDelete,
}: McpServerItemProps) {
  const { t } = useTranslation();
  const isActive = selectedServerId === server.id;
  const isChecked = selectedServerIds.has(server.id);
  const { displayName, selectionLabel, primaryLabel, favoriteLabel } =
    buildLabels(server, selectionMode, isChecked, t);
  const runtimeSummary = getRuntimeSummary(server);

  const handlePrimaryAction = () => {
    if (selectionMode) {
      onToggleSelection?.(server.id);
      return;
    }
    onSelect(server.id);
  };

  return (
    <div
      data-testid={`mcp-server-row-${server.id}`}
      className={`group flex min-h-[72px] items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
        isFirstRow ? "" : "border-t border-border"
      } ${
        isChecked && selectionMode
          ? "bg-primary/8"
          : isActive
            ? "bg-primary/5"
            : "hover:bg-accent/50"
      }`}
    >
      {selectionMode ? (
        <button
          type="button"
          aria-pressed={isChecked}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection?.(server.id);
          }}
          aria-label={selectionLabel}
          className={`shrink-0 p-1 rounded-md transition-colors ${
            isChecked
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          title={selectionLabel}
        >
          {isChecked ? (
            <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
          ) : (
            <SquareIcon aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={primaryLabel}
        aria-pressed={selectionMode ? isChecked : undefined}
        onClick={handlePrimaryAction}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {getInitial(server)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3
              className={`truncate font-semibold leading-5 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-foreground group-hover:text-primary"
              }`}
            >
              {displayName}
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {server.transport}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {server.description ||
              t("mcp.defaultDescription", "MCP server configuration")}
          </p>
          {runtimeSummary ? (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
              {runtimeSummary}
            </p>
          ) : null}
        </div>
        {!selectionMode ? (
          <ListDistributionIndicators
            distributedPresets={distributedPresets}
            targetPresets={targetPresets}
          />
        ) : null}
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${getHealthBadgeClass(
            healthCheck?.status,
          )}`}
        >
          {healthCheck?.status
            ? t(`mcp.health.${healthCheck.status}`, healthCheck.status)
            : t("mcp.health.unchecked", "Unchecked")}
        </span>
      </button>

      {!selectionMode ? (
        <ServerActions
          server={server}
          favoriteLabel={favoriteLabel}
          onToggleFavorite={onToggleFavorite}
          onQuickDeploy={onQuickDeploy}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}

/**
 * MCP server collection view matching My Skill gallery/list affordances.
 * MCP 服务集合视图，对齐 My Skill 的画廊/列表、快捷动作和批量选择交互。
 */
export function McpServerList({
  servers,
  selectedServerId,
  healthChecks = [],
  targetPresets,
  targetStatus,
  gridStyle,
  viewMode = "gallery",
  selectionMode = false,
  selectedServerIds = new Set<string>(),
  onSelect,
  onToggleSelection,
  onToggleFavorite,
  onQuickDeploy,
  onDelete,
}: McpServerListProps) {
  const { t } = useTranslation();

  if (servers.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-slow py-20">
        <div className="p-8 bg-accent/30 rounded-full mb-6 relative">
          <ServerIcon className="w-20 h-20 opacity-20" />
          <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {t("mcp.emptyLibrary", "No MCP servers")}
        </h3>
        <p className="text-sm opacity-70 max-w-sm text-center">
          {t(
            "mcp.emptyLibraryHint",
            "Create or import MCP servers, then distribute them to agent platforms.",
          )}
        </p>
      </div>
    );
  }

  const items = servers.map((server) => ({
    server,
    distributedPresets: getDistributedPresets(
      targetStatus,
      targetPresets,
      server.name,
    ),
    healthCheck: healthChecks.find((item) => item.serverId === server.id),
  }));

  if (viewMode === "list") {
    return (
      <div
        data-testid="mcp-server-list-view"
        className="h-full overflow-y-auto"
      >
        {items.map((item, index) => (
          <McpServerRow
            key={item.server.id}
            server={item.server}
            selectedServerId={selectedServerId}
            healthCheck={item.healthCheck}
            distributedPresets={item.distributedPresets}
            targetPresets={targetPresets}
            isFirstRow={index === 0}
            selectionMode={selectionMode}
            selectedServerIds={selectedServerIds}
            onSelect={onSelect}
            onToggleSelection={onToggleSelection}
            onToggleFavorite={onToggleFavorite}
            onQuickDeploy={onQuickDeploy}
            onDelete={onDelete}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-4"
      style={
        gridStyle ?? {
          gridTemplateColumns:
            "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
        }
      }
    >
      {items.map((item) => (
        <McpServerCard
          key={item.server.id}
          server={item.server}
          selectedServerId={selectedServerId}
          healthCheck={item.healthCheck}
          distributedPresets={item.distributedPresets}
          targetPresets={targetPresets}
          selectionMode={selectionMode}
          selectedServerIds={selectedServerIds}
          onSelect={onSelect}
          onToggleSelection={onToggleSelection}
          onToggleFavorite={onToggleFavorite}
          onQuickDeploy={onQuickDeploy}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
