import { getSkillPlatformErrorFeedback } from "../../services/skill-platform-error";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  TrashIcon,
} from "lucide-react";

import type {
  AgentScannedSkill,
  ManagedAgentSummary,
  Skill,
  SkillInstallMode,
} from "@prompthub/shared/types";
import {
  getSkillScanStatus,
  type SkillScanStatus,
} from "../../services/skill-scan-status";
import { useSkillStore } from "../../stores/skill.store";
import { useUIStore } from "../../stores/ui.store";
import { SkillIcon } from "../skill/SkillIcon";
import { useEnsureSkillLibraryLoaded } from "../skill/use-ensure-skill-library-loaded";
import { useToast } from "../ui/Toast";
import {
  AgentAssetActionButton,
  AgentAssetCard,
  AgentAssetCardContent,
  AgentAssetManagementSurface,
  AgentAssetPrimaryAction,
} from "./AgentAssetManagementSurface";
import { useBoundedPage } from "./BoundedListPager";

export type AgentSkillAssetFilter =
  | "all"
  | "managed"
  | "unmanaged"
  | "copy"
  | "symlink";

export interface AgentSkillAssetRow {
  skill: AgentScannedSkill;
  status: SkillScanStatus;
}

export interface AgentSkillAssetStats {
  total: number;
  managed: number;
  unmanaged: number;
  copy: number;
  symlink: number;
}

export interface AgentSkillAssetsController {
  rows: AgentSkillAssetRow[];
  visibleRows: AgentSkillAssetRow[];
  stats: AgentSkillAssetStats;
  skillsDir: string;
  librarySkills: Skill[];
  isScanning: boolean;
  hasScanResult: boolean;
  scanError: string | null;
  query: string;
  setQuery: (value: string) => void;
  filter: AgentSkillAssetFilter;
  setFilter: (value: AgentSkillAssetFilter) => void;
  importingSkillPath: string | null;
  importSkill: (skill: AgentScannedSkill) => Promise<void>;
  openManagedSkill: (skill: Skill) => void;
  pendingUninstall: AgentScannedSkill | null;
  setPendingUninstall: (skill: AgentScannedSkill | null) => void;
  isUninstalling: boolean;
  confirmUninstall: () => Promise<void>;
  isInstallModalOpen: boolean;
  setInstallModalOpen: (open: boolean) => void;
  isInstallingLibrary: boolean;
  installLibrarySkills: (payload: {
    skillIds: string[];
    importMode: "copy" | "symlink";
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

const FILTER_ORDER: AgentSkillAssetFilter[] = [
  "all",
  "managed",
  "unmanaged",
  "copy",
  "symlink",
];

export function useAgentSkillAssets(
  agent: ManagedAgentSummary,
): AgentSkillAssetsController {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const librarySkills = useSkillStore((state) => state.skills);
  const scanState = useSkillStore((state) => state.agentScanState[agent.id]);
  const scanAgentPlatformSkills = useSkillStore(
    (state) => state.scanAgentPlatformSkills,
  );
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const setAppModule = useUIStore((state) => state.setAppModule);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentSkillAssetFilter>("all");
  const [importingSkillPath, setImportingSkillPath] = useState<string | null>(
    null,
  );
  const [pendingUninstall, setPendingUninstall] =
    useState<AgentScannedSkill | null>(null);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isInstallModalOpen, setInstallModalOpen] = useState(false);
  const [isInstallingLibrary, setIsInstallingLibrary] = useState(false);

  const scanResult = scanState?.result ?? null;
  const skillsDir = scanResult?.skillsDir ?? "";
  const isScanning = Boolean(scanState?.isScanning);
  const scanError = scanState?.error ?? null;
  useEnsureSkillLibraryLoaded();

  useEffect(() => {
    if (!agent.paths.skills || scanResult || isScanning || scanError) {
      return;
    }
    void scanAgentPlatformSkills(agent.id).catch(() => undefined);
  }, [
    agent.id,
    agent.paths.skills,
    isScanning,
    scanAgentPlatformSkills,
    scanError,
    scanResult,
  ]);

  const rows = useMemo<AgentSkillAssetRow[]>(
    () =>
      (scanResult?.scannedSkills ?? []).map((skill) => ({
        skill,
        status: getSkillScanStatus(skill, librarySkills),
      })),
    [librarySkills, scanResult?.scannedSkills],
  );

  const stats = useMemo<AgentSkillAssetStats>(
    () =>
      rows.reduce<AgentSkillAssetStats>(
        (acc, { skill, status }) => {
          acc.total += 1;
          if (status.managedSkill) {
            acc.managed += 1;
          } else {
            acc.unmanaged += 1;
          }
          if (!status.isExternalInstall && skill.installMode === "symlink") {
            acc.symlink += 1;
          }
          if (!status.isExternalInstall && skill.installMode !== "symlink") {
            acc.copy += 1;
          }
          return acc;
        },
        { total: 0, managed: 0, unmanaged: 0, copy: 0, symlink: 0 },
      ),
    [rows],
  );

  const visibleRows = useMemo<AgentSkillAssetRow[]>(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter(({ skill, status }) => {
      if (filter === "managed" && !status.managedSkill) {
        return false;
      }
      if (filter === "unmanaged" && status.managedSkill) {
        return false;
      }
      if (
        filter === "copy" &&
        (status.isExternalInstall || skill.installMode === "symlink")
      ) {
        return false;
      }
      if (
        filter === "symlink" &&
        (status.isExternalInstall || skill.installMode !== "symlink")
      ) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack = [
        skill.name,
        skill.description,
        skill.author,
        skill.localPath,
        ...skill.tags,
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [filter, query, rows]);

  const rescan = useCallback(async (): Promise<void> => {
    try {
      await scanAgentPlatformSkills(agent.id);
    } catch (error) {
      console.error("Failed to rescan agent skills:", error);
      showToast(
        t("skill.agentScanFailed", "Failed to scan agent skills"),
        "error",
      );
    }
  }, [agent.id, scanAgentPlatformSkills, showToast, t]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await scanAgentPlatformSkills(agent.id);
      showToast(
        t("skill.agentScanComplete", {
          count: result.scannedSkills.length,
          defaultValue: `Scanned ${result.scannedSkills.length} skills`,
        }),
        "success",
      );
    } catch (error) {
      console.error("Failed to scan agent skills:", error);
      showToast(
        t("skill.agentScanFailed", "Failed to scan agent skills"),
        "error",
      );
    }
  }, [agent.id, scanAgentPlatformSkills, showToast, t]);

  const importSkill = useCallback(
    async (scannedSkill: AgentScannedSkill): Promise<void> => {
      setImportingSkillPath(scannedSkill.localPath);
      try {
        let repoSkillMd: { content?: string } | null = null;
        if (!scannedSkill.instructions.trim()) {
          try {
            repoSkillMd =
              (await window.api.skill.readLocalFileByPath?.(
                scannedSkill.localPath,
                "SKILL.md",
              )) ?? null;
          } catch {
            repoSkillMd = null;
          }
        }
        const hydratedScannedSkill =
          repoSkillMd?.content && repoSkillMd.content.trim().length > 0
            ? { ...scannedSkill, instructions: repoSkillMd.content }
            : scannedSkill;
        const result = await importScannedSkills(
          [hydratedScannedSkill],
          undefined,
          "copy",
        );
        if (result.importedCount === 0) {
          throw new Error(
            result.failed[0]?.reason ||
              result.skipped[0]?.reason ||
              t("skill.importFailed", "Failed to import skills"),
          );
        }

        await loadDeployedStatus({ force: true });
        await rescan();
        showToast(
          t("skill.projectImportSuccess", {
            mode: t("skill.copyMode", "Copy"),
            defaultValue: "Imported to My Skills ({{mode}})",
          }),
          "success",
        );
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : t("skill.importFailed", "Failed to import skills"),
          "error",
        );
      } finally {
        setImportingSkillPath(null);
      }
    },
    [importScannedSkills, loadDeployedStatus, rescan, showToast, t],
  );

  const openManagedSkill = useCallback(
    (skill: Skill): void => {
      setAppModule("skill");
      setStoreView("my-skills");
      selectSkill(skill.id);
    },
    [selectSkill, setAppModule, setStoreView],
  );

  const confirmUninstall = useCallback(async (): Promise<void> => {
    if (!pendingUninstall) {
      return;
    }
    if (pendingUninstall.isPlatformBuiltin) {
      showToast(
        t(
          "skill.platformBuiltinCannotUninstall",
          "Built-in skills cannot be removed from this agent.",
        ),
        "warning",
      );
      setPendingUninstall(null);
      return;
    }
    setIsUninstalling(true);
    try {
      await window.api.skill.uninstallPlatformSkill(
        agent.id,
        pendingUninstall.platformSkillPath,
      );
      setPendingUninstall(null);
      await rescan();
      await loadDeployedStatus({ force: true });
      showToast(
        t("skill.agentUninstallSuccess", "Skill removed from agent"),
        "success",
      );
    } catch (error) {
      console.error("Failed to remove agent skill:", error);
      showToast(
        t("skill.agentUninstallFailed", "Failed to remove skill from agent"),
        "error",
      );
    } finally {
      setIsUninstalling(false);
    }
  }, [agent.id, loadDeployedStatus, pendingUninstall, rescan, showToast, t]);

  const installLibrarySkill = useCallback(
    async (skill: Skill, mode: SkillInstallMode): Promise<void> => {
      const skillMdContent = await window.api.skill.export(skill.id, "skillmd");
      if (mode === "symlink") {
        await window.api.skill.installMdSymlink(
          skill.id,
          skillMdContent,
          agent.id,
        );
      } else {
        await window.api.skill.installMd(skill.id, skillMdContent, agent.id);
      }
    },
    [agent.id],
  );

  const installLibrarySkills = useCallback(
    async (payload: {
      skillIds: string[];
      importMode: "copy" | "symlink";
    }): Promise<void> => {
      setIsInstallingLibrary(true);
      let installedCount = 0;
      try {
        for (const skillId of payload.skillIds) {
          const skill = librarySkills.find((entry) => entry.id === skillId);
          if (!skill) {
            continue;
          }
          await installLibrarySkill(skill, payload.importMode);
          installedCount += 1;
        }
        await rescan();
        await loadDeployedStatus({ force: true });
        showToast(
          t("skill.agentInstallSuccessCount", {
            count: installedCount,
            defaultValue: `Installed ${installedCount} skill(s) to agent`,
          }),
          "success",
        );
        setInstallModalOpen(false);
      } catch (error) {
        console.error("Failed to install skill to agent:", error);
        showToast(
          getSkillPlatformErrorFeedback(error).reason,
          getSkillPlatformErrorFeedback(error).severity,
        );
      } finally {
        setIsInstallingLibrary(false);
      }
    },
    [
      installLibrarySkill,
      librarySkills,
      loadDeployedStatus,
      rescan,
      showToast,
      t,
    ],
  );

  return {
    rows,
    visibleRows,
    stats,
    skillsDir,
    librarySkills,
    isScanning,
    hasScanResult: Boolean(scanResult),
    scanError,
    query,
    setQuery,
    filter,
    setFilter,
    importingSkillPath,
    importSkill,
    openManagedSkill,
    pendingUninstall,
    setPendingUninstall,
    isUninstalling,
    confirmUninstall,
    isInstallModalOpen,
    setInstallModalOpen,
    isInstallingLibrary,
    installLibrarySkills,
    refresh,
  };
}

function AgentSkillAssetCard({
  row,
  importingSkillPath,
  onOpenDetail,
  onImport,
  onOpenManagedSkill,
  onRequestUninstall,
}: {
  row: AgentSkillAssetRow;
  importingSkillPath: string | null;
  onOpenDetail: (skill: AgentScannedSkill) => void;
  onImport: (skill: AgentScannedSkill) => void;
  onOpenManagedSkill: (skill: Skill) => void;
  onRequestUninstall: (skill: AgentScannedSkill) => void;
}) {
  const { t } = useTranslation();
  const { skill, status } = row;
  const managedSkill = status.managedSkill;
  const isImporting = importingSkillPath === skill.localPath;

  return (
    <AgentAssetCard
      testId="agent-skill-asset-card"
      actionsTestId="agent-skill-asset-actions"
      onOpen={() => onOpenDetail(skill)}
      openLabel={skill.name}
      actions={
        <>
          <AgentAssetActionButton
            onClick={() => void window.electron?.openPath?.(skill.localPath)}
            aria-label={t("skill.openSkillFolder", "Open Folder")}
            title={t("skill.openSkillFolder", "Open Folder")}
          >
            <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
          </AgentAssetActionButton>
          {managedSkill ? (
            <AgentAssetActionButton
              onClick={() => onOpenManagedSkill(managedSkill)}
              aria-label={t("skill.openInMySkills", "Open in My Skills")}
              title={t("skill.openInMySkills", "Open in My Skills")}
            >
              <BookOpenIcon aria-hidden="true" className="h-4 w-4" />
            </AgentAssetActionButton>
          ) : (
            <AgentAssetActionButton
              variant="primary"
              onClick={() => onImport(skill)}
              disabled={isImporting}
              aria-label={t("skill.addToLibrary", "Import to My Skills")}
              title={t("skill.addToLibrary", "Import to My Skills")}
            >
              {isImporting ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
              )}
            </AgentAssetActionButton>
          )}
          {skill.isPlatformBuiltin || skill.isReadOnlyDiscovery ? null : (
            <AgentAssetActionButton
              variant="destructive"
              onClick={() => onRequestUninstall(skill)}
              aria-label={t("skill.uninstallFromAgent", "Uninstall from agent")}
              title={`${t("skill.uninstallFromAgent", "Uninstall from agent")}: ${skill.name}`}
            >
              <TrashIcon aria-hidden="true" className="h-4 w-4" />
            </AgentAssetActionButton>
          )}
        </>
      }
    >
      <AgentAssetCardContent
        icon={
          <SkillIcon
            name={skill.name}
            size="md"
            decorative
            className="border border-border/60"
          />
        }
        iconTestId="agent-skill-asset-icon"
        title={skill.name}
        status={
          managedSkill ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
              <CheckCircle2Icon aria-hidden="true" className="h-3 w-3" />
              {t("skill.inMySkills", "In My Skills")}
            </span>
          ) : null
        }
        description={
          skill.description ||
          t("skill.noDescription", "No description provided")
        }
        source={skill.localPath}
        metadata={
          <>
            {status.isExternalInstall ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {t("skill.externalInstall", "External install")}
              </span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {skill.installMode === "symlink"
                  ? t("skill.installModeSymlink", "Symlink install")
                  : t("skill.installModeCopy", "Copy install")}
              </span>
            )}
            {skill.isPlatformBuiltin ? (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                {t("skill.platformBuiltin", "Built-in")}
              </span>
            ) : null}
            {skill.isReadOnlyDiscovery ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                {t("skill.compatibilityDiscovery", "Compatible source")}
              </span>
            ) : null}
            {(skill.tags ?? []).slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              >
                {tag}
              </span>
            ))}
          </>
        }
      />
    </AgentAssetCard>
  );
}

export function AgentSkillAssetPanel({
  assets,
  onOpenDetail,
}: {
  assets: AgentSkillAssetsController;
  onOpenDetail: (skill: AgentScannedSkill) => void;
}) {
  const { t } = useTranslation();
  const skillPage = useBoundedPage(assets.visibleRows, 60, assets.visibleRows);

  const filterLabels: Record<AgentSkillAssetFilter, string> = {
    all: t("skill.agentStatsTotal", {
      count: assets.stats.total,
      defaultValue: `${assets.stats.total} skills`,
    }),
    managed: t("skill.agentStatsManaged", {
      count: assets.stats.managed,
      defaultValue: `${assets.stats.managed} managed`,
    }),
    unmanaged: t("skill.agentStatsUnmanaged", {
      count: assets.stats.unmanaged,
      defaultValue: `${assets.stats.unmanaged} unmanaged`,
    }),
    copy: t("skill.agentStatsCopy", {
      count: assets.stats.copy,
      defaultValue: `${assets.stats.copy} copy`,
    }),
    symlink: t("skill.agentStatsSymlink", {
      count: assets.stats.symlink,
      defaultValue: `${assets.stats.symlink} symlink`,
    }),
  };

  return (
    <AgentAssetManagementSurface
      domain="skills"
      query={assets.query}
      onQueryChange={assets.setQuery}
      searchLabel={t("agents.searchAssets", "Search assets")}
      filters={FILTER_ORDER.map((filterKey) => ({
        key: filterKey,
        label: filterLabels[filterKey],
        testId: `agent-skill-asset-filter-${filterKey}`,
      }))}
      activeFilter={assets.filter}
      onFilterChange={(filterKey) =>
        assets.setFilter(filterKey as AgentSkillAssetFilter)
      }
      refreshLabel={t("agents.refreshCurrentAsset", "Refresh current view")}
      onRefresh={() => void assets.refresh()}
      isRefreshing={assets.isScanning}
      alert={
        assets.scanError && assets.hasScanResult ? (
          <div
            role="alert"
            className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {t("skill.agentScanFailed", "Failed to scan agent skills")}
          </div>
        ) : null
      }
      primaryAction={
        <AgentAssetPrimaryAction
          onClick={() => assets.setInstallModalOpen(true)}
          disabled={assets.librarySkills.length === 0}
          label={t("skill.addSkillToAgent", "Add Skill")}
        />
      }
      gridTestId="agent-skill-grid"
      isLoading={
        assets.isScanning || (!assets.hasScanResult && !assets.scanError)
      }
      loadingLabel={t("skill.scanning", "Scanning...")}
      failureState={
        assets.scanError
          ? {
              message: t(
                "skill.agentScanFailed",
                "Failed to scan agent skills",
              ),
              retryLabel: t("common.retry", "Retry"),
              onRetry: () => void assets.refresh(),
            }
          : undefined
      }
      isEmpty={assets.visibleRows.length === 0}
      emptyState={
        <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            {t(
              "agents.noSkillsDetected",
              "No skills were detected for this Agent.",
            )}
          </p>
        </div>
      }
      page={skillPage}
    >
      {skillPage.items.map((row) => (
        <AgentSkillAssetCard
          key={row.skill.localPath}
          row={row}
          importingSkillPath={assets.importingSkillPath}
          onOpenDetail={onOpenDetail}
          onImport={(skill) => void assets.importSkill(skill)}
          onOpenManagedSkill={assets.openManagedSkill}
          onRequestUninstall={assets.setPendingUninstall}
        />
      ))}
    </AgentAssetManagementSurface>
  );
}
