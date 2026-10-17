import { isSharedMcpTargetPreset } from "@prompthub/shared/utils/mcp-shared-targets";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquareIcon,
  DownloadIcon,
  Loader2Icon,
  SquareIcon,
  Settings2Icon,
} from "lucide-react";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";
import { McpTargetCard } from "./McpTargetCard";
import { isServerOnPreset } from "./mcp-form-utils";

interface McpPlatformPanelProps {
  server: McpServerConfig;
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  onApply: (presets: McpTargetPreset[]) => Promise<void>;
  onRemove: (preset: McpTargetPreset) => Promise<void>;
}

/**
 * Skills-style platform integration panel for a single MCP server.
 * Mirrors SkillPlatformPanel: platform cards with brand icons, multi-select
 * for undistributed platforms, bulk apply, and per-platform remove.
 * 单个 MCP 服务的平台集成面板（Skills 风格）：品牌图标平台卡片、
 * 未分发平台多选、批量应用、单平台移除。
 */
export function McpPlatformPanel({
  server,
  targetPresets,
  targetStatus,
  onApply,
  onRemove,
}: McpPlatformPanelProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);

  const distributedIds = useMemo(
    () =>
      new Set(
        targetPresets
          .filter((preset) =>
            isServerOnPreset(targetStatus, preset.id, server.name),
          )
          .map((preset) => preset.id),
      ),
    [server.name, targetPresets, targetStatus],
  );
  const undistributed = targetPresets.filter(
    (preset) => !distributedIds.has(preset.id),
  );
  const selectedPresets = targetPresets.filter((preset) =>
    selectedIds.has(preset.id),
  );
  const agentPresets = targetPresets.filter(
    (preset) => !isSharedMcpTargetPreset(preset),
  );
  const sharedPresets = targetPresets.filter(isSharedMcpTargetPreset);
  const selectableAgents = undistributed.filter(
    (preset) => !isSharedMcpTargetPreset(preset),
  );
  const allSelected =
    selectableAgents.length > 0 &&
    selectableAgents.every((preset) => selectedIds.has(preset.id));

  const toggleSelection = (presetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const handleBatchApply = async () => {
    if (selectedPresets.length === 0) {
      return;
    }
    setIsBatchApplying(true);
    try {
      await onApply(selectedPresets);
      setSelectedIds(new Set());
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleSingle = async (
    preset: McpTargetPreset,
    action: (preset: McpTargetPreset) => Promise<void>,
  ) => {
    setBusyId(preset.id);
    try {
      await action(preset);
    } finally {
      setBusyId(null);
    }
  };

  const renderTarget = (preset: McpTargetPreset) => (
    <McpTargetCard
      key={preset.id}
      preset={preset}
      enabled={server.enabled}
      isDistributed={distributedIds.has(preset.id)}
      isSelected={selectedIds.has(preset.id)}
      isBusy={busyId === preset.id || isBatchApplying}
      onToggle={() => toggleSelection(preset.id)}
      onRemove={() => void handleSingle(preset, onRemove)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-6">
        <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <span>{t("mcp.platformIntegration", "Platform Integration")}</span>
          <span className="text-[10px]">MCP</span>
        </h3>

        <section className="app-wallpaper-panel space-y-4 rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {t("mcp.globalDistribution", "Global Distribution")}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "mcp.platformIntegrationHint",
                  "Distribute this MCP to agent platforms",
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                distributedIds.size > 0
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {distributedIds.size > 0
                ? t("mcp.distributedTargets", {
                    count: distributedIds.size,
                    defaultValue: `${distributedIds.size} target(s) distributed`,
                  })
                : t("mcp.notDistributed", "Not distributed")}
            </span>
          </div>

          <div className="space-y-2">
            {!server.enabled ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t(
                  "mcp.disabledServerHint",
                  "This MCP is disabled. Enable it before distributing.",
                )}
              </div>
            ) : null}

            {undistributed.length > 0 && server.enabled ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-accent/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        for (const preset of selectableAgents) {
                          if (allSelected) next.delete(preset.id);
                          else next.add(preset.id);
                        }
                        return next;
                      })
                    }
                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {allSelected ? (
                      <CheckSquareIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <SquareIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {allSelected
                      ? t("mcp.deselectAll", "Deselect all")
                      : t("mcp.selectAll", "Select all")}
                  </button>
                  {selectedPresets.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t("mcp.selectedCount", {
                        count: selectedPresets.length,
                        defaultValue: `${selectedPresets.length} selected`,
                      })}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={selectedPresets.length === 0 || isBatchApplying}
                  onClick={() => void handleBatchApply()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBatchApplying ? (
                    <Loader2Icon
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <DownloadIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {selectedPresets.length > 0
                    ? t("mcp.applySelected", {
                        count: selectedPresets.length,
                        defaultValue: `Apply to ${selectedPresets.length} platform(s)`,
                      })
                    : t("mcp.applySelectedEmpty", "Apply to selected")}
                </button>
              </div>
            ) : null}

            {agentPresets.map(renderTarget)}
            {sharedPresets.length > 0 ? (
              <section
                aria-label={t("skill.distribution.advancedTargets")}
                className="space-y-3 border-t border-border pt-4"
              >
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Settings2Icon className="h-4 w-4" aria-hidden="true" />
                  {t("skill.distribution.advancedTargets")}
                  <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:text-amber-300">
                    {t("skill.distribution.experimental")}
                  </span>
                </h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("mcp.sharedConfigHint")}
                </p>
                {sharedPresets.map(renderTarget)}
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
