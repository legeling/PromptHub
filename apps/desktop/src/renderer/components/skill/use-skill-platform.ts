import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Skill,
  SkillInstallMode,
  SkillPlatformInstallStatusMap,
  SkillPlatformInstallResult,
} from "@prompthub/shared/types";
import {
  DEFAULT_SKILL_PLATFORM_ORDER,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { getRuntimeCapabilities } from "../../runtime";
import { filterDeployablePlatforms } from "../../services/platform-visibility";
import { appendSharedSkillDistributionTarget } from "../../services/shared-skill-distribution-target";

import {
  syncSkillsToPlatforms,
  unsyncSkillsFromPlatforms,
} from "../../services/skill-platform-sync";

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

export function resolveSkillPlatformOrder(
  availablePlatformIds: string[],
  preferredOrder: string[],
): string[] {
  const defaultOrder: readonly string[] = DEFAULT_SKILL_PLATFORM_ORDER;
  const availableIds = new Set(availablePlatformIds);
  const orderedIds = Array.from(new Set(preferredOrder)).filter((platformId) =>
    availableIds.has(platformId),
  );
  const preferredIdSet = new Set(orderedIds);
  const orderedIdSet = new Set(orderedIds);

  for (const platformId of defaultOrder) {
    if (!availableIds.has(platformId) || orderedIdSet.has(platformId)) continue;

    const defaultIndex = defaultOrder.indexOf(platformId);
    const predecessor = defaultOrder
      .slice(0, defaultIndex)
      .reverse()
      .find((candidate) => preferredIdSet.has(candidate));
    const predecessorIndex = predecessor ? orderedIds.indexOf(predecessor) : -1;
    const successor = orderedIds
      .slice(predecessorIndex + 1)
      .find((candidate) => preferredIdSet.has(candidate));
    const successorDefaultIndex = successor
      ? defaultOrder.indexOf(successor)
      : -1;
    let insertionIndex =
      predecessorIndex >= 0 &&
      (successorDefaultIndex < 0 || successorDefaultIndex > defaultIndex)
        ? predecessorIndex + 1
        : orderedIds.length;

    while (
      insertionIndex < orderedIds.length &&
      !preferredIdSet.has(orderedIds[insertionIndex]) &&
      defaultOrder.indexOf(orderedIds[insertionIndex]) < defaultIndex
    ) {
      insertionIndex += 1;
    }

    orderedIds.splice(insertionIndex, 0, platformId);
    orderedIdSet.add(platformId);
  }

  for (const platformId of availablePlatformIds) {
    if (orderedIdSet.has(platformId)) continue;
    orderedIds.push(platformId);
    orderedIdSet.add(platformId);
  }

  return orderedIds;
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
  const effectiveOrder = resolveSkillPlatformOrder(
    platforms.map((platform) => platform.id),
    preferredOrder,
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
  const skillPlatformOrder =
    useSettingsStore((state) => state.skillPlatformOrder) ?? [];
  const disabledPlatformIds =
    useSettingsStore((state) => state.disabledPlatformIds) ?? [];
  const runtimeCapabilities = getRuntimeCapabilities();
  const [isLoading, setIsLoading] = useState(true);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>(
    [],
  );
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState<Record<string, boolean>>(
    {},
  );
  const [installDetails, setInstallDetails] =
    useState<SkillPlatformInstallStatusMap>({});
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
    setSupportedPlatforms(appendSharedSkillDistributionTarget(platforms));
    setDetectedPlatforms(detected);
  }, [runtimeCapabilities.skillPlatformIntegration]);

  const refreshInstallStatus = useCallback(async () => {
    if (!skill || !runtimeCapabilities.skillPlatformIntegration) {
      setInstallStatus({});
      setInstallDetails({});
      setSelectedPlatforms(new Set());
      return;
    }
    const details = await window.api.skill.getMdInstallStatusDetails(skill.id);
    const status = Object.fromEntries(
      Object.entries(details).map(([platformId, installStatus]) => [
        platformId,
        installStatus.installed,
      ]),
    );
    setInstallDetails(details);
    setInstallStatus(status);
    setSelectedPlatforms(new Set());
    await loadDeployedStatus({ force: true });
  }, [loadDeployedStatus, runtimeCapabilities.skillPlatformIntegration, skill]);

  useEffect(() => {
    setIsLoading(true);
    setPlatformError(null);
    void Promise.all([loadPlatforms(), refreshInstallStatus()])
      .catch((error: unknown) => {
        setPlatformError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setIsLoading(false));
  }, [loadPlatforms, refreshInstallStatus]);

  const availablePlatforms = useMemo(
    () =>
      sortSkillPlatformsByPreference(
        filterDeployablePlatforms(
          supportedPlatforms,
          detectedPlatforms,
          disabledPlatformIds,
        ),
        skillPlatformOrder,
      ),
    [
      detectedPlatforms,
      disabledPlatformIds,
      skillPlatformOrder,
      supportedPlatforms,
    ],
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
    setSelectedPlatforms(
      new Set(uninstalledPlatforms.map((platform) => platform.id)),
    );
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
            await window.api.skill.installMd(
              skill.id,
              skillMdContent,
              platformId,
            );
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

  const applyPlatformChanges =
    useCallback(async (): Promise<BatchInstallResult> => {
      if (
        !skill ||
        isLoading ||
        platformError ||
        !runtimeCapabilities.skillPlatformIntegration
      ) {
        throw new Error("Skill platform status is not ready");
      }
      const changes = availablePlatforms.filter((platform) =>
        selectedPlatforms.has(platform.id),
      );
      const installs = changes
        .filter((platform) => !installStatus[platform.id])
        .map((platform) => platform.id);
      const removals = changes
        .filter((platform) => installStatus[platform.id])
        .map((platform) => platform.id);
      setIsBatchInstalling(true);
      try {
        const installed = await syncSkillsToPlatforms(
          [skill],
          installs,
          installMode,
          (progress) =>
            setInstallProgress({
              current: progress.current,
              total: changes.length,
            }),
        );
        const removed = await unsyncSkillsFromPlatforms(
          [skill],
          removals,
          (progress) =>
            setInstallProgress({
              current: installs.length + progress.current,
              total: changes.length,
            }),
        );
        const failures = [...installed.failures, ...removed.failures];
        await refreshInstallStatus();
        setSelectedPlatforms(
          new Set(failures.map((failure) => failure.platformId)),
        );
        return {
          successCount: installed.successCount + removed.successCount,
          totalCount: changes.length,
          failures,
          fallbacks: installed.fallbacks,
        };
      } catch (error) {
        setPlatformError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        setIsBatchInstalling(false);
        setInstallProgress(null);
      }
    }, [
      availablePlatforms,
      installMode,
      installStatus,
      isLoading,
      platformError,
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
    isLoading,
    platformError,
    applyPlatformChanges,
    availablePlatforms,
    installProgress,
    installDetails,
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
