import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquareIcon,
  Loader2Icon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import { PlatformIcon } from "../ui/PlatformIcon";
import { isServerOnPreset } from "./mcp-form-utils";

interface McpBatchDeployDialogProps {
  servers: McpServerConfig[];
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  onClose: () => void;
  onApply: (presets: McpTargetPreset[], serverIds: string[]) => Promise<void>;
}

export function McpBatchDeployDialog({
  servers,
  targetPresets,
  targetStatus,
  onClose,
  onApply,
}: McpBatchDeployDialogProps) {
  const { t } = useTranslation();
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set(),
  );
  const [isApplying, setIsApplying] = useState(false);
  const isApplyingRef = useRef(false);

  const enabledServers = useMemo(
    () => servers.filter((server) => server.enabled),
    [servers],
  );
  const selectedPresets = useMemo(
    () => targetPresets.filter((preset) => selectedTargetIds.has(preset.id)),
    [selectedTargetIds, targetPresets],
  );
  const totalTargets = enabledServers.length * selectedPresets.length;

  useEffect(() => {
    setSelectedTargetIds((current) => {
      if (current.size > 0) {
        return current;
      }
      return new Set(targetPresets.map((preset) => preset.id));
    });
  }, [targetPresets]);

  const toggleTarget = (presetId: string) => {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedTargetIds.size === targetPresets.length) {
      setSelectedTargetIds(new Set());
      return;
    }
    setSelectedTargetIds(new Set(targetPresets.map((preset) => preset.id)));
  };

  const handleApply = async () => {
    if (
      isApplyingRef.current ||
      enabledServers.length === 0 ||
      selectedPresets.length === 0
    ) {
      return;
    }
    isApplyingRef.current = true;
    setIsApplying(true);
    try {
      await onApply(
        selectedPresets,
        enabledServers.map((server) => server.id),
      );
      onClose();
    } finally {
      isApplyingRef.current = false;
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("mcp.batchDeploy", "Batch Deploy")}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border app-wallpaper-panel-strong shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <SendIcon aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                {t("mcp.batchDeploy", "Batch Deploy")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("mcp.batchDeployHint", {
                count: enabledServers.length,
                defaultValue: `Sync ${enabledServers.length} selected MCP server(s) to selected agent targets.`,
              })}
            </p>
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

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="space-y-4">
            {servers.length !== enabledServers.length ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                {t("mcp.batchDeployDisabledSkipped", {
                  count: servers.length - enabledServers.length,
                  defaultValue:
                    "{{count}} disabled MCP server(s) will be skipped.",
                })}
              </div>
            ) : null}

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {t("mcp.targetPlatforms", "Target Platforms")}
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    {t("mcp.selectedTargets", {
                      count: selectedTargetIds.size,
                      defaultValue: `${selectedTargetIds.size} selected`,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {selectedTargetIds.size === targetPresets.length
                      ? t("mcp.deselectAll", "Deselect all")
                      : t("mcp.selectAll", "Select all")}
                  </button>
                </div>
              </div>

              {targetPresets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("mcp.noAgentTargets", "No agent targets")}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {targetPresets.map((preset) => {
                    const isSelected = selectedTargetIds.has(preset.id);
                    const distributedCount = enabledServers.filter((server) =>
                      isServerOnPreset(targetStatus, preset.id, server.name),
                    ).length;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTarget(preset.id)}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                          isSelected
                            ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
                            : "border-border app-wallpaper-surface hover:border-primary/25"
                        }`}
                      >
                        <div
                          aria-hidden="true"
                          className="rounded-xl bg-accent p-2"
                        >
                          <PlatformIcon
                            platformId={preset.platformId ?? preset.id}
                            size={20}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {preset.label}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {distributedCount}/{enabledServers.length}{" "}
                            {t("mcp.distributed", "Distributed")}
                          </div>
                        </div>
                        {isSelected ? (
                          <CheckSquareIcon
                            aria-hidden="true"
                            className="h-4 w-4 text-primary"
                          />
                        ) : (
                          <SquareIcon
                            aria-hidden="true"
                            className="h-4 w-4 text-muted-foreground"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {t("mcp.selectedMcp", "Selected MCP")}
                </h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {enabledServers.length}
                </span>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {enabledServers.map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border app-wallpaper-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {server.displayName || server.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {server.transport}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      {server.name}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h3 className="text-sm font-semibold">
                {t("mcp.syncSummary", "Sync Summary")}
              </h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("mcp.selectedMcp", "Selected MCP")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {enabledServers.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("mcp.targetPlatforms", "Target Platforms")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {selectedPresets.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("mcp.totalTargets", "Total Targets")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {totalTargets}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={
              isApplying ||
              enabledServers.length === 0 ||
              selectedPresets.length === 0
            }
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
                {t("mcp.syncing", "Syncing")}
              </>
            ) : (
              <>
                <SendIcon aria-hidden="true" className="h-4 w-4" />
                {t("mcp.batchDeploy", "Batch Deploy")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
