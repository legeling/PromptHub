import { formatSkillPlatformError } from "../../services/skill-platform-error";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Skill,
  SkillInstallMode,
  SkillPlatformInstallStatusMap,
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
import { selectNativeDistributionTargets } from "./skill-distribution-selection";

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
  severity: "warning" | "error";
  platformId: string;
  /** Localized human-readable reason, if one can be derived. */
  reason: string;
}

export interface BatchInstallResult {
  statusRefreshFailed?: boolean;
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
  const skillId = skill?.id;
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

  const activeSkill = useRef(skillId);
  activeSkill.current = skillId;
  const statusRequest = useRef(0);

  const refreshInstallStatus = useCallback(async () => {
    const request = ++statusRequest.current;
    if (!skillId || !runtimeCapabilities.skillPlatformIntegration) {
      setInstallStatus({});
      setInstallDetails({});
      setSelectedPlatforms(new Set());
      return;
    }
    let details: SkillPlatformInstallStatusMap;
    try {
      details = await window.api.skill.getMdInstallStatusDetails(skillId);
    } catch (error) {
      // Superseded reads no longer own this panel's error state.
      if (request !== statusRequest.current || activeSkill.current !== skillId)
        return;
      throw error;
    }
    if (request !== statusRequest.current || activeSkill.current !== skillId)
      return;
    setPlatformError(null);
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
  }, [
    loadDeployedStatus,
    runtimeCapabilities.skillPlatformIntegration,
    skillId,
  ]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setPlatformError(null);
    void Promise.all([loadPlatforms(), refreshInstallStatus()])
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Failed to load skill platform status:", error);
        setPlatformError(formatSkillPlatformError(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
      ++statusRequest.current;
    };
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
    setSelectedPlatforms((previous) =>
      selectNativeDistributionTargets(
        availablePlatforms,
        installStatus,
        previous,
      ),
    );
  }, [availablePlatforms, installStatus]);

  const deselectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set());
  }, []);

  const refreshAfterPlatformChange = useCallback(async (): Promise<boolean> => {
    try {
      await refreshInstallStatus();
      return false;
    } catch (error) {
      console.error(
        "Platform operation completed, but status refresh failed:",
        error,
      );
      setPlatformError(formatSkillPlatformError(error));
      return true;
    }
  }, [refreshInstallStatus]);

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
      const result = await syncSkillsToPlatforms(
        [skill],
        platformIds,
        installMode,
        (progress) =>
          setInstallProgress({
            current: progress.current,
            total: progress.total,
          }),
      );
      const statusRefreshFailed = await refreshAfterPlatformChange();
      return { ...result, statusRefreshFailed };
    } finally {
      setIsBatchInstalling(false);
      setInstallProgress(null);
    }
  }, [
    installMode,
    refreshAfterPlatformChange,
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
      const redistributing = changes.length === 0;
      const installs = (redistributing ? availablePlatforms : changes)
        .filter((platform) =>
          redistributing
            ? installStatus[platform.id]
            : !installStatus[platform.id],
        )
        .map((platform) => platform.id);
      const removals = changes
        .filter((platform) => installStatus[platform.id])
        .map((platform) => platform.id);
      const totalCount = installs.length + removals.length;
      setIsBatchInstalling(true);
      try {
        const installed = await syncSkillsToPlatforms(
          [skill],
          installs,
          installMode,
          (progress) =>
            setInstallProgress({
              current: progress.current,
              total: totalCount,
            }),
        );
        const removed = await unsyncSkillsFromPlatforms(
          [skill],
          removals,
          (progress) =>
            setInstallProgress({
              current: installs.length + progress.current,
              total: totalCount,
            }),
        );
        const failures = [...installed.failures, ...removed.failures];
        const statusRefreshFailed = await refreshAfterPlatformChange();
        setSelectedPlatforms(
          // An unsuccessful refresh of an installed target must never become a pending uninstall.
          new Set(
            redistributing ? [] : failures.map((failure) => failure.platformId),
          ),
        );
        return {
          successCount: installed.successCount + removed.successCount,
          totalCount,
          failures,
          statusRefreshFailed,
          fallbacks: installed.fallbacks,
        };
      } catch (error) {
        setPlatformError(formatSkillPlatformError(error));
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
      refreshAfterPlatformChange,
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
