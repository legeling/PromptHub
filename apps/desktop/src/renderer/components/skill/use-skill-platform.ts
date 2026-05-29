import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Skill,
  SkillInstallMode,
  SkillPlatformInstallResult,
} from "@prompthub/shared/types";
import {
  DEFAULT_SKILL_PLATFORM_ORDER,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { getRuntimeCapabilities } from "../../runtime";
import { filterDetectedPlatforms } from "../../services/platform-visibility";

export type { SkillInstallMode } from "@prompthub/shared/types";

export interface BatchInstallFallback {
  platformId: string;
  requestedMode: SkillInstallMode;
  effectiveMode: SkillInstallMode;
  reason: string;
}

export interface BatchInstallFailure {
  platformId: string;
  /** Localized human-readable reason, if one can be derived. */
  reason: string;
}

export interface BatchInstallResult {
  successCount: number;
  totalCount: number;
  /**
   * Per-platform failures. Previously these were console.error'd and then
   * silently discarded, so users who hit install errors (most commonly on
   * Windows without Developer Mode, triggering EPERM on `fs.symlink`) saw
   * a mismatched success toast and had no way to know what went wrong.
   * See #93.
   */
  failures: BatchInstallFailure[];
  fallbacks: BatchInstallFallback[];
}

function isCopyFallback(
  result: SkillPlatformInstallResult | void,
): result is SkillPlatformInstallResult & {
  requestedMode: "symlink";
  effectiveMode: "copy";
  fallbackReason: string;
} {
  return (
    typeof result === "object" &&
    result !== null &&
    result.requestedMode === "symlink" &&
    result.effectiveMode === "copy" &&
    typeof result.fallbackReason === "string" &&
    result.fallbackReason.length > 0
  );
}

export function sortSkillPlatformsByPreference(
  platforms: SkillPlatform[],
  preferredOrder: string[],
): SkillPlatform[] {
  const effectiveOrder = Array.from(
    new Set([...preferredOrder, ...DEFAULT_SKILL_PLATFORM_ORDER]),
  );

  if (effectiveOrder.length === 0) {
    return platforms;
  }

  const preferredIndex = new Map(
    effectiveOrder.map((platformId, index) => [platformId, index]),
  );

  return [...platforms].sort((left, right) => {
    const leftIndex = preferredIndex.get(left.id);
    const rightIndex = preferredIndex.get(right.id);

    if (leftIndex != null && rightIndex != null) {
      return leftIndex - rightIndex;
    }
    if (leftIndex != null) {
      return -1;
    }
    if (rightIndex != null) {
      return 1;
    }
    return 0;
  });
}

export function useSkillPlatform(
  skill: Skill | null | undefined,
  installMode: SkillInstallMode,
) {
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const skillPlatformOrder = useSettingsStore(
    (state) => state.skillPlatformOrder,
  ) ?? [];
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  ) ?? [];
  const runtimeCapabilities = getRuntimeCapabilities();
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>(
    [],
  );
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(),
  );
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const loadPlatforms = useCallback(async () => {
    if (!runtimeCapabilities.skillPlatformIntegration) {
      setSupportedPlatforms([]);
      setDetectedPlatforms([]);
      return;
    }

    const [platforms, detected] = await Promise.all([
      window.api.skill.getSupportedPlatforms(),
      window.api.skill.detectPlatforms(),
    ]);
    setSupportedPlatforms(platforms);
    setDetectedPlatforms(detected);
  }, [runtimeCapabilities.skillPlatformIntegration]);

  const refreshInstallStatus = useCallback(async () => {
    if (!skill || !runtimeCapabilities.skillPlatformIntegration) {
      setInstallStatus({});
      setSelectedPlatforms(new Set());
      return;
    }
    const status = await window.api.skill.getMdInstallStatus(skill.id);
    setInstallStatus(status);
    setSelectedPlatforms(new Set());
    await loadDeployedStatus();
  }, [loadDeployedStatus, runtimeCapabilities.skillPlatformIntegration, skill]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  useEffect(() => {
    if (!skill) return;
    void refreshInstallStatus();
  }, [refreshInstallStatus, skill]);

  const availablePlatforms = useMemo(
    () =>
      sortSkillPlatformsByPreference(
        filterDetectedPlatforms(
          supportedPlatforms,
          detectedPlatforms,
          disabledPlatformIds,
        ),
        skillPlatformOrder,
      ),
    [detectedPlatforms, disabledPlatformIds, skillPlatformOrder, supportedPlatforms],
  );

  const uninstalledPlatforms = useMemo(
    () => availablePlatforms.filter((platform) => !installStatus[platform.id]),
    [availablePlatforms, installStatus],
  );

  const togglePlatformSelection = useCallback((platformId: string) => {
    setSelectedPlatforms((previous) => {
      const next = new Set(previous);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  }, []);

  const selectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set(uninstalledPlatforms.map((platform) => platform.id)));
  }, [uninstalledPlatforms]);

  const deselectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set());
  }, []);

  const batchInstall = useCallback(async (): Promise<BatchInstallResult> => {
    if (
      !runtimeCapabilities.skillPlatformIntegration ||
      !skill ||
      selectedPlatforms.size === 0
    ) {
      return { successCount: 0, totalCount: 0, failures: [], fallbacks: [] };
    }

    setIsBatchInstalling(true);
    const platformIds = Array.from(selectedPlatforms);
    setInstallProgress({ current: 0, total: platformIds.length });

    try {
      const skillMdContent = await window.api.skill.export(skill.id, "skillmd");
      let successCount = 0;
      const failures: BatchInstallFailure[] = [];
      const fallbacks: BatchInstallFallback[] = [];

      for (let index = 0; index < platformIds.length; index++) {
        const platformId = platformIds[index];
        setInstallProgress({ current: index + 1, total: platformIds.length });

        try {
          if (installMode === "symlink") {
            const result = await window.api.skill.installMdSymlink(
              skill.id,
              skillMdContent,
              platformId,
            );
            if (isCopyFallback(result)) {
              fallbacks.push({
                platformId,
                requestedMode: result.requestedMode,
                effectiveMode: result.effectiveMode,
                reason: result.fallbackReason,
              });
            }
          } else {
            await window.api.skill.installMd(skill.id, skillMdContent, platformId);
          }
          successCount++;
        } catch (error) {
          // Surface per-platform failures to the caller so the UI can show
          // the user exactly which platforms failed and why (#93). Still
          // log for diagnostics.
          const reason = error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to install "${skill.name}" to ${platformId}:`,
            error,
          );
          failures.push({ platformId, reason });
        }
      }

      await refreshInstallStatus();
      return {
        successCount,
        totalCount: platformIds.length,
        failures,
        fallbacks,
      };
    } finally {
      setIsBatchInstalling(false);
      setInstallProgress(null);
    }
  }, [
    installMode,
    refreshInstallStatus,
    runtimeCapabilities.skillPlatformIntegration,
    selectedPlatforms,
    skill,
  ]);

  const uninstallFromPlatform = useCallback(
    async (platformId: string) => {
      if (!runtimeCapabilities.skillPlatformIntegration || !skill) return;
      await window.api.skill.uninstallMd(skill.id, platformId);
      await refreshInstallStatus();
    },
    [refreshInstallStatus, runtimeCapabilities.skillPlatformIntegration, skill],
  );

  return {
    availablePlatforms,
    installProgress,
    installStatus,
    isBatchInstalling,
    refreshInstallStatus,
    selectedPlatforms,
    togglePlatformSelection,
    selectAllPlatforms,
    deselectAllPlatforms,
    batchInstall,
    uninstallFromPlatform,
    uninstalledPlatforms,
  };
}
