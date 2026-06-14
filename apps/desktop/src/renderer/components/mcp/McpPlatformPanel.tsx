import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CheckSquareIcon,
  DownloadIcon,
  Loader2Icon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import type {
  McpServerConfig,
  McpTargetKind,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";
import { PlatformIcon } from "../ui/PlatformIcon";
import { isServerOnPreset, textInputClass } from "./mcp-form-utils";

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
 * 自定义路径目标在面板底部，支持工作区/项目级配置文件。
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
  const [customPath, setCustomPath] = useState("");
  const [customTargetKind, setCustomTargetKind] =
    useState<McpTargetKind>("custom-json");

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
  const allSelected =
    undistributed.length > 0 &&
    undistributed.every((preset) => selectedIds.has(preset.id));

  const customPreset: McpTargetPreset | null = customPath.trim()
    ? {
        id: "custom",
        target: customTargetKind,
        scope: "custom",
        label: t("mcp.customTarget", "Custom target"),
        path: customPath.trim(),
      }
    : null;

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

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("mcp.platformIntegration", "Platform Integration")}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {t(
              "mcp.platformIntegrationHint",
              "Distribute this MCP to agent platforms",
            )}
          </div>
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

      <div className="space-y-2 p-4">
        {!server.enabled ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {t(
              "mcp.disabledServerHint",
              "This MCP is disabled. Enable it before distributing.",
            )}
          </div>
        ) : null}

        {undistributed.length > 0 && server.enabled ? (
          <div className="rounded-lg border border-border bg-card p-2.5">
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  allSelected
                    ? new Set()
                    : new Set(undistributed.map((preset) => preset.id)),
                )
              }
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary"
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
            <button
              type="button"
              disabled={selectedPresets.length === 0 || isBatchApplying}
              onClick={() => void handleBatchApply()}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isBatchApplying ? (
                <Loader2Icon
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <DownloadIcon className="h-4 w-4" aria-hidden="true" />
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

        {targetPresets.map((preset) => {
          const isDistributed = distributedIds.has(preset.id);
          const isSelected = selectedIds.has(preset.id);
          const isBusy = busyId === preset.id;
          return (
            <div
              key={preset.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                isDistributed
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-accent/50"
              }`}
            >
              <PlatformIcon
                platformId={preset.platformId ?? preset.id}
                size={26}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {preset.label}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {preset.path}
                </div>
              </div>
              {isBusy ? (
                <Loader2Icon
                  className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : isDistributed ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <CheckIcon
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSingle(preset, onRemove)}
                    title={t("mcp.removeFromTarget", "Remove from platform")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!server.enabled}
                  onClick={() => toggleSelection(preset.id)}
                  title={t("skill.clickToSelect", "Click to select")}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary disabled:opacity-40"
                >
                  {isSelected ? (
                    <CheckSquareIcon
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <SquareIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          );
        })}

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            {t("mcp.customTarget", "Custom target")}
          </div>
          <select
            className={textInputClass()}
            value={customTargetKind}
            onChange={(event) =>
              setCustomTargetKind(event.target.value as McpTargetKind)
            }
          >
            <option value="custom-json">mcpServers JSON</option>
            <option value="vscode">VS Code JSON</option>
            <option value="opencode">OpenCode JSON</option>
            <option value="custom-toml">Codex TOML</option>
          </select>
          <input
            className={`${textInputClass()} mt-2 font-mono text-xs`}
            value={customPath}
            onChange={(event) => setCustomPath(event.target.value)}
            placeholder={t("mcp.customPath", "Config file path")}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!customPreset || !server.enabled}
              onClick={() => customPreset && void onApply([customPreset])}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <DownloadIcon className="h-4 w-4" aria-hidden="true" />
              {t("mcp.apply", "Apply")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
