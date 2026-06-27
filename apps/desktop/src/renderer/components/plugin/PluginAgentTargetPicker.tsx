import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  CheckSquareIcon,
  CopyPlusIcon,
  LinkIcon,
  SendIcon,
  SquareIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginLibraryEntry,
  PluginTargetCompatibility,
  PluginTargetStatus,
} from "@prompthub/shared/types/plugin";
import { Modal } from "../ui/Modal";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";

interface PluginAgentTargetPickerProps {
  initialTargetIds?: string[];
  isOpen: boolean;
  onClose: () => void;
  onDistribute: (
    plugin: PluginLibraryEntry,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  plugin: PluginLibraryEntry | null;
  plugins?: PluginLibraryEntry[];
  targetMatrix: PluginTargetCompatibility[];
}

const EMPTY_TARGET_IDS: string[] = [];

function getTargetPlatformIconId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
  };
  return iconIds[targetId] ?? targetId;
}

function getStatusLabel(
  status: PluginTargetStatus,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (status === "runtime-only" || status === "composite") {
    return t("plugin.targetStatus.unsupportedPlugin", "Unsupported");
  }
  const labels: Record<PluginTargetStatus, string> = {
    native: t("plugin.targetStatus.native", "Native"),
    adapter: t("plugin.targetStatus.adapter", "Adapter"),
    "runtime-only": t("plugin.targetStatus.runtimeOnly", "Runtime only"),
    composite: t("plugin.targetStatus.composite", "Composite"),
    pending: t("plugin.targetStatus.pending", "Pending"),
  };
  return labels[status];
}

function getTargetDescription(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const localizedDescription = t(`plugin.targetDescriptions.${target.id}`, {
    defaultValue: "",
    name: target.displayName,
  }).trim();
  if (localizedDescription) {
    return localizedDescription;
  }
  if (!target.enabled) {
    return t("plugin.targetDescriptions.unsupportedBundle", {
      defaultValue:
        "{{name}} does not expose a complete PromptHub Plugin bundle surface.",
      name: target.displayName,
    });
  }
  return (
    target.adapterOutput ||
    target.installSurface ||
    target.description ||
    t(
      "plugin.targetAdapterReady",
      "Ready for adapter-backed Plugin distribution.",
    )
  );
}

function PluginPickerSummary({ plugins }: { plugins: PluginLibraryEntry[] }) {
  const { t } = useTranslation();
  const plugin = plugins[0];

  if (!plugin) {
    return null;
  }

  if (plugins.length > 1) {
    const visiblePlugins = plugins.slice(0, 4);
    const remainingCount = plugins.length - visiblePlugins.length;

    return (
      <div className="rounded-2xl border border-border app-wallpaper-panel p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {t("plugin.batchDistributeSummaryTitle", {
                count: plugins.length,
                defaultValue: "{{count}} selected Plugins",
              })}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(
                "plugin.batchDistributeSummaryDesc",
                "Choose Agent targets once and PromptHub will distribute each selected Plugin package.",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visiblePlugins.map((entry) => (
                <span
                  key={entry.id}
                  className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                >
                  {entry.displayName}
                </span>
              ))}
              {remainingCount > 0 ? (
                <span className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  +{remainingCount}
                </span>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {t("plugin.batchManage", "Batch manage plugins")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border app-wallpaper-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {plugin.displayName}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {plugin.description ||
              t("plugin.noDescription", "No description provided")}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {t("plugin.installed", "Installed")}
        </span>
      </div>
    </div>
  );
}

function PluginInstallModeToggle({
  installMode,
  onChange,
}: {
  installMode: "copy" | "symlink";
  onChange: (mode: "copy" | "symlink") => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-accent/50 p-1">
      <button
        type="button"
        aria-pressed={installMode === "copy"}
        onClick={() => onChange("copy")}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          installMode === "copy"
            ? "bg-primary text-white shadow-sm"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        }`}
      >
        <CopyPlusIcon aria-hidden="true" className="h-4 w-4" />
        {t("skill.copyMode", "Copy")}
      </button>
      <button
        type="button"
        aria-pressed={installMode === "symlink"}
        onClick={() => onChange("symlink")}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          installMode === "symlink"
            ? "bg-primary text-white shadow-sm"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        }`}
      >
        <LinkIcon aria-hidden="true" className="h-4 w-4" />
        {t("skill.symlink", "Symlink")}
      </button>
    </div>
  );
}

function TargetSelectionToolbar({
  selectedAll,
  selectedCount,
  onToggleAll,
}: {
  selectedAll: boolean;
  selectedCount: number;
  onToggleAll: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToggleAll}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {selectedAll ? (
          <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
        ) : (
          <SquareIcon aria-hidden="true" className="h-4 w-4" />
        )}
        {selectedAll
          ? t("common.clear", "Clear")
          : t("common.selectAll", "Select All")}
      </button>
      <span className="text-xs text-muted-foreground">
        {t("skill.selectedCount", {
          count: selectedCount,
          defaultValue: `${selectedCount} selected`,
        })}
      </span>
    </div>
  );
}

function PluginTargetRow({
  selected,
  target,
  onToggle,
}: {
  selected: boolean;
  target: PluginTargetCompatibility;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const description = selected
    ? t("plugin.selectedForDistribution", "Selected for Plugin distribution")
    : getTargetDescription(target, t);
  const rowStateClass = !target.enabled
    ? "cursor-not-allowed border-border bg-accent/20 opacity-55"
    : selected
      ? "border-primary bg-primary/10"
      : "border-border bg-accent/30 hover:bg-accent/50";
  const statusClass = target.enabled
    ? "border-primary/20 bg-background/70 text-primary"
    : "border-border bg-background/50 text-muted-foreground";

  return (
    <button
      type="button"
      disabled={!target.enabled}
      aria-label={target.enabled ? target.displayName : undefined}
      aria-pressed={target.enabled ? selected : undefined}
      onClick={onToggle}
      className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${rowStateClass}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center"
        >
          <PlatformIcon
            platformId={getTargetPlatformIconId(target.id)}
            size={28}
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-sm font-medium text-foreground">
              {target.displayName}
            </h4>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
            >
              {getStatusLabel(target.status, t)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/30"
        }`}
      >
        {selected ? <CheckIcon className="h-3 w-3 text-white" /> : null}
      </div>
    </button>
  );
}

function PluginPickerFooter({
  isDistributing,
  selectedCount,
  onConfirm,
}: {
  isDistributing: boolean;
  selectedCount: number;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        onClick={onConfirm}
        disabled={selectedCount === 0 || isDistributing}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SendIcon aria-hidden="true" className="h-4 w-4" />
        {isDistributing
          ? t("plugin.distributing", "Distributing...")
          : t("plugin.distributeToSelectedAgents", {
              count: selectedCount,
              defaultValue: "Distribute to selected Agents",
            })}
      </button>
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          "plugin.distributionTargetHint",
          "PromptHub writes this Plugin package into each selected Agent's configured Plugin directory.",
        )}
      </p>
    </>
  );
}

export function PluginAgentTargetPicker({
  initialTargetIds,
  isOpen,
  onClose,
  onDistribute,
  plugin,
  plugins,
  targetMatrix,
}: PluginAgentTargetPickerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [installMode, setInstallMode] = useState<"copy" | "symlink">("copy");
  const [isDistributing, setIsDistributing] = useState(false);
  const isDistributingRef = useRef(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    () => new Set(initialTargetIds ?? EMPTY_TARGET_IDS),
  );
  const enabledTargets = useMemo(
    () => targetMatrix.filter((target) => target.enabled),
    [targetMatrix],
  );
  const selectedPlugins = useMemo(() => {
    if (plugins && plugins.length > 0) {
      return plugins;
    }
    return plugin ? [plugin] : [];
  }, [plugin, plugins]);
  const primaryPlugin = selectedPlugins[0] ?? null;
  const isBatchDistribution = selectedPlugins.length > 1;
  const selectedAll =
    enabledTargets.length > 0 &&
    selectedTargetIds.size === enabledTargets.length;

  useEffect(() => {
    if (!isOpen) return;
    const validTargetIds = new Set(
      targetMatrix
        .filter((target) => target.enabled)
        .map((target) => target.id),
    );
    setSelectedTargetIds(
      new Set(
        (initialTargetIds ?? EMPTY_TARGET_IDS).filter((id) =>
          validTargetIds.has(id),
        ),
      ),
    );
  }, [initialTargetIds, isOpen, targetMatrix]);

  const toggleTarget = (target: PluginTargetCompatibility) => {
    if (!target.enabled) return;
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      next.has(target.id) ? next.delete(target.id) : next.add(target.id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (
      selectedPlugins.length === 0 ||
      selectedTargetIds.size === 0 ||
      isDistributingRef.current
    ) {
      return;
    }
    isDistributingRef.current = true;
    setIsDistributing(true);
    const targetIds = Array.from(selectedTargetIds);
    let succeeded = 0;
    let failed = 0;
    let firstError: unknown = null;

    try {
      for (const selectedPlugin of selectedPlugins) {
        try {
          await onDistribute(selectedPlugin, targetIds, installMode);
          succeeded += 1;
        } catch (error) {
          console.error("Plugin distribution failed:", error);
          failed += 1;
          firstError ??= error;
        }
      }

      if (failed === 0) {
        showToast(
          isBatchDistribution
            ? t("plugin.batchDistributionResult", {
                defaultValue:
                  "Batch distribution finished: {{succeeded}} succeeded, {{failed}} failed",
                failed,
                succeeded,
              })
            : t("plugin.distributionSuccess", {
                count: selectedTargetIds.size,
                defaultValue:
                  "Distributed Plugin to {{count}} Agent target(s).",
              }),
          "success",
        );
        onClose();
        return;
      }

      showToast(
        isBatchDistribution
          ? t("plugin.batchDistributionResult", {
              defaultValue:
                "Batch distribution finished: {{succeeded}} succeeded, {{failed}} failed",
              failed,
              succeeded,
            })
          : firstError instanceof Error
            ? firstError.message
            : String(firstError),
        "error",
      );
    } finally {
      isDistributingRef.current = false;
      setIsDistributing(false);
    }
  };

  if (!primaryPlugin) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      showCloseButton
      title={t("plugin.selectAgentTargets", "Select Agent targets")}
      subtitle={
        isBatchDistribution
          ? t("plugin.batchDistributeSubtitle", {
              count: selectedPlugins.length,
              defaultValue: "{{count}} Plugins selected",
            })
          : primaryPlugin.displayName
      }
    >
      <div className="space-y-5">
        <PluginPickerSummary plugins={selectedPlugins} />
        <PluginInstallModeToggle
          installMode={installMode}
          onChange={setInstallMode}
        />
        <TargetSelectionToolbar
          selectedAll={selectedAll}
          selectedCount={selectedTargetIds.size}
          onToggleAll={() =>
            setSelectedTargetIds(
              selectedAll
                ? new Set()
                : new Set(enabledTargets.map((target) => target.id)),
            )
          }
        />
        <div className="space-y-2">
          {targetMatrix.map((target) => (
            <PluginTargetRow
              key={target.id}
              selected={selectedTargetIds.has(target.id)}
              target={target}
              onToggle={() => toggleTarget(target)}
            />
          ))}
        </div>
        <PluginPickerFooter
          isDistributing={isDistributing}
          selectedCount={selectedTargetIds.size}
          onConfirm={() => void handleConfirm()}
        />
      </div>
    </Modal>
  );
}
