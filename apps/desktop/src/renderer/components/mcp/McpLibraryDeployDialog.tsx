import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CheckSquareIcon,
  DownloadIcon,
  Loader2Icon,
  SearchIcon,
  ServerIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import { isServerOnPreset } from "./mcp-form-utils";

interface McpLibraryDeployDialogProps {
  preset: McpTargetPreset;
  servers: McpServerConfig[];
  targetStatus: McpTargetStatusEntry[];
  onApply: (serverIds: string[]) => Promise<void>;
  onClose: () => void;
}

function matchesServer(server: McpServerConfig, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    server.name,
    server.displayName,
    server.description ?? "",
    server.transport,
    server.command ?? "",
    server.url ?? "",
    ...(server.args ?? []),
    ...(server.tags ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function McpLibraryDeployDialog({
  preset,
  servers,
  targetStatus,
  onApply,
  onClose,
}: McpLibraryDeployDialogProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(
    new Set(),
  );
  const [isApplying, setIsApplying] = useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredServers = useMemo(
    () => servers.filter((server) => matchesServer(server, normalizedQuery)),
    [normalizedQuery, servers],
  );
  const selectableServers = useMemo(
    () =>
      filteredServers.filter(
        (server) =>
          server.enabled &&
          !isServerOnPreset(targetStatus, preset.id, server.name),
      ),
    [filteredServers, preset.id, targetStatus],
  );
  const selectedServers = useMemo(
    () => servers.filter((server) => selectedServerIds.has(server.id)),
    [selectedServerIds, servers],
  );
  const targetKindLabel =
    preset.scope === "workspace"
      ? t("mcp.projectTarget", "Project")
      : t("mcp.agentTarget", "Agent");
  const allVisibleSelected =
    selectableServers.length > 0 &&
    selectableServers.every((server) => selectedServerIds.has(server.id));

  const toggleServer = (server: McpServerConfig) => {
    if (
      !server.enabled ||
      isServerOnPreset(targetStatus, preset.id, server.name)
    ) {
      return;
    }
    setSelectedServerIds((current) => {
      const next = new Set(current);
      if (next.has(server.id)) {
        next.delete(server.id);
      } else {
        next.add(server.id);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedServerIds((current) => {
        const next = new Set(current);
        for (const server of selectableServers) {
          next.delete(server.id);
        }
        return next;
      });
      return;
    }

    setSelectedServerIds(
      (current) =>
        new Set([...current, ...selectableServers.map((server) => server.id)]),
    );
  };

  const handleApply = async () => {
    if (isApplying || selectedServers.length === 0) {
      return;
    }
    setIsApplying(true);
    try {
      await onApply(selectedServers.map((server) => server.id));
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("mcp.addFromMyMcp", "Add from My MCP")}
        className="flex max-h-[85vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ServerIcon aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                {t("mcp.addFromMyMcp", "Add from My MCP")}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("common.close", "Close")}
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <section className="space-y-4 rounded-2xl border border-border app-wallpaper-surface p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {t("mcp.selectMcpServers", "Select MCP")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("mcp.addFromMyMcpHint", {
                    target: preset.label,
                    defaultValue: `Select saved MCP servers and add them to ${preset.label}.`,
                  })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {preset.label}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                    {preset.path}
                  </span>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 lg:max-w-sm">
                <div className="relative">
                  <SearchIcon
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    aria-label={t("mcp.searchMyMcp", "Search My MCP")}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("mcp.searchMyMcp", "Search My MCP")}
                    className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {selectableServers.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="inline-flex items-center justify-end gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    {allVisibleSelected ? (
                      <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <SquareIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                    {allVisibleSelected
                      ? t("mcp.deselectAll", "Deselect all")
                      : t("mcp.selectAll", "Select all")}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {filteredServers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {servers.length === 0
                ? t("mcp.emptyLibrary", "No MCP servers")
                : t("mcp.noMatchingMcp", "No matching MCP servers")}
            </div>
          ) : (
            <div className="max-h-[430px] overflow-y-auto pr-1">
              <div
                data-testid="mcp-library-deploy-grid"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                {filteredServers.map((server) => {
                  const isDistributed = isServerOnPreset(
                    targetStatus,
                    preset.id,
                    server.name,
                  );
                  const isSelectable = server.enabled && !isDistributed;
                  const isSelected = selectedServerIds.has(server.id);
                  return (
                    <button
                      key={server.id}
                      type="button"
                      aria-label={server.displayName || server.name}
                      aria-pressed={isSelectable ? isSelected : undefined}
                      disabled={!isSelectable || isApplying}
                      onClick={() => toggleServer(server)}
                      className={`flex min-h-[148px] flex-col items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : isSelectable
                            ? "border-border bg-accent/40 hover:bg-accent"
                            : "border-border bg-accent/20 opacity-70"
                      }`}
                    >
                      <div className="min-w-0 w-full flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate text-base font-semibold text-foreground">
                            {server.displayName || server.name}
                          </div>
                          {!server.enabled ? (
                            <span className="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t("common.disabled", "Disabled")}
                            </span>
                          ) : isDistributed ? (
                            <span className="inline-flex shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                              {t("mcp.alreadyOnAgent", "Already on this Agent")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {server.description ||
                            server.command ||
                            server.url ||
                            server.name}
                        </div>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {server.name}
                          </span>
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {server.transport}
                          </span>
                        </div>
                        <div
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            isSelected
                              ? "border-primary bg-primary text-white"
                              : isSelectable
                                ? "border-muted-foreground/30"
                                : "border-muted-foreground/20 bg-muted"
                          }`}
                        >
                          {isSelected ? (
                            <CheckIcon aria-hidden="true" className="h-3 w-3" />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">
            {t("mcp.selectedCount", {
              count: selectedServerIds.size,
              defaultValue: `${selectedServerIds.size} selected`,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={selectedServerIds.size === 0 || isApplying}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isApplying ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
              )}
              {t("mcp.addSelectedToTarget", {
                count: selectedServerIds.size,
                target: targetKindLabel,
                defaultValue: `Add ${selectedServerIds.size} MCP to ${targetKindLabel}`,
              })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
