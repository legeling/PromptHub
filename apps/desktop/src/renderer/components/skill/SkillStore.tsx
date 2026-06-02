import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2Icon,
  Link2Icon,
  SearchIcon,
  Settings2Icon,
  LayoutGridIcon,
  CodeIcon,
  SparklesIcon,
  BarChartIcon,
  ShieldIcon,
  RocketIcon,
  PaletteIcon,
  WandIcon,
  BriefcaseIcon,
  FileSpreadsheetIcon,
  BoxesIcon,
  GlobeIcon,
  FolderIcon,
  DatabaseIcon,
  RefreshCwIcon,
  StoreIcon,
} from "lucide-react";
import { SkillStoreDetail } from "./SkillStoreDetail";
import { SkillStoreCard } from "./SkillStoreCard";
import { SkillStoreCustomSources } from "./SkillStoreCustomSources";
import { SkillStoreSourceEditModal } from "./SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "./SkillStoreSourceForm";
import { parseFrontmatter } from "../../services/github-skill-store";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import type {
  RegistrySkill,
  SkillCategory,
  SkillStoreSource,
} from "@prompthub/shared/types";
import { SKILL_CATEGORIES } from "@prompthub/shared/constants/skill-registry";
import {
  formatSkillSafetyScanError,
  getSafetyScanAIConfig,
} from "./detail-utils";
import { findInstalledRegistrySkill } from "../../services/skill-store-update";
import { filterRegistrySkills } from "../../services/skill-store-search";
import { useSkillStoreRemoteSync } from "./store-remote-sync";
import { normalizeGitStoreSourceInput } from "../../services/skill-store-source";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <LayoutGridIcon className="w-3.5 h-3.5" />,
  office: <FileSpreadsheetIcon className="w-3.5 h-3.5" />,
  dev: <CodeIcon className="w-3.5 h-3.5" />,
  ai: <SparklesIcon className="w-3.5 h-3.5" />,
  data: <BarChartIcon className="w-3.5 h-3.5" />,
  management: <BriefcaseIcon className="w-3.5 h-3.5" />,
  deploy: <RocketIcon className="w-3.5 h-3.5" />,
  design: <PaletteIcon className="w-3.5 h-3.5" />,
  security: <ShieldIcon className="w-3.5 h-3.5" />,
  meta: <WandIcon className="w-3.5 h-3.5" />,
};

const CUSTOM_SOURCE_TYPE_OPTIONS: Array<{
  value: Extract<
    SkillStoreSource["type"],
    "marketplace-json" | "git-repo" | "local-dir"
  >;
  icon: React.ReactNode;
}> = [
  {
    value: "marketplace-json",
    icon: <DatabaseIcon className="w-4 h-4" />,
  },
  {
    value: "git-repo",
    icon: <GlobeIcon className="w-4 h-4" />,
  },
  {
    value: "local-dir",
    icon: <FolderIcon className="w-4 h-4" />,
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatStoreSourceHint(source: SkillStoreSource): string {
  const parts = [source.url];
  if (source.branch) {
    parts.push(`branch: ${source.branch}`);
  }
  if (source.directory) {
    parts.push(`dir: ${source.directory}`);
  }
  return parts.join(" | ");
}

function getRegistrySkillSelectionId(skill: RegistrySkill): string {
  return skill.source_id || skill.slug;
}

function getRegistrySkillPendingKey(skill: RegistrySkill): string {
  return skill.source_id || skill.source_url || skill.slug;
}

export function SkillStore() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  const storeCategory = useSkillStore((state) => state.storeCategory) ?? "all";
  const setStoreCategory = useSkillStore((state) => state.setStoreCategory);
  const storeSearchQuery =
    useSkillStore((state) => state.storeSearchQuery) ?? "";
  const installRegistrySkill = useSkillStore(
    (state) => state.installRegistrySkill,
  );
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const skills = useSkillStore((state) => state.skills);
  const selectRegistrySkill = useSkillStore(
    (state) => state.selectRegistrySkill,
  );
  const selectedRegistrySlug = useSkillStore(
    (state) => state.selectedRegistrySlug,
  );
  const registrySkills = useSkillStore((state) => state.registrySkills) ?? [];
  const selectedStoreSourceId =
    useSkillStore((state) => state.selectedStoreSourceId) ?? "official";
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources =
    useSkillStore((state) => state.customStoreSources) ?? [];
  const addCustomStoreSource = useSkillStore(
    (state) => state.addCustomStoreSource,
  );
  const removeCustomStoreSource = useSkillStore(
    (state) => state.removeCustomStoreSource,
  );
  const toggleCustomStoreSource = useSkillStore(
    (state) => state.toggleCustomStoreSource,
  );
  const { loadingSourceId, loadStoreSource, remoteStoreEntries } =
    useSkillStoreRemoteSync({
      eagerRemoteSources: "selected",
      selectedStoreSourceId,
    });

  const [installingSourceIds, setInstallingSourceIds] = useState<
    Record<string, true>
  >({});
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
  const [sourceType, setSourceType] =
    useState<
      Extract<
        SkillStoreSource["type"],
        "marketplace-json" | "git-repo" | "local-dir"
      >
    >("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  const { showToast } = useToast();
  const autoScanBeforeInstall = useSettingsStore(
    (state) => state.autoScanStoreSkillsBeforeInstall,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);
  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedStoreSourceId,
      ) || null,
    [customStoreSources, selectedStoreSourceId],
  );

  const selectedRemoteEntry = remoteStoreEntries[selectedStoreSourceId];
  const isSelectedSourceRemote =
    selectedStoreSourceId === "claude-code" ||
    selectedStoreSourceId === "openai-codex" ||
    selectedStoreSourceId === "community" ||
    Boolean(selectedCustomSource);

  useEffect(() => {
    if (!isSelectedSourceRemote) return;
    void loadStoreSource(selectedStoreSourceId);
  }, [isSelectedSourceRemote, loadStoreSource, selectedStoreSourceId]);

  const sourceRegistrySkills = useMemo(() => {
    const baseSkills: RegistrySkill[] =
      selectedStoreSourceId === "official"
        ? []
        : selectedRemoteEntry?.skills || [];

    // Centralized filter — see `skill-store-search.ts`. The previous
    // inline implementation only matched name / description / tags with
    // a naive `.toLowerCase().includes(...)` and could not find skills
    // by slug, install_name, or author, nor when the user typed
    // "hello world" for a slug called "hello-world" (issue #88).
    return filterRegistrySkills(baseSkills, {
      category: storeCategory,
      searchQuery: storeSearchQuery,
    });
  }, [
    registrySkills,
    selectedRemoteEntry?.skills,
    selectedStoreSourceId,
    storeCategory,
    storeSearchQuery,
  ]);

  const selectedDetailSkill = useMemo(() => {
    if (!selectedRegistrySlug) return null;
    return (
      sourceRegistrySkills.find(
        (skill) => getRegistrySkillSelectionId(skill) === selectedRegistrySlug,
      ) || null
    );
  }, [selectedRegistrySlug, sourceRegistrySkills]);

  const isSkillInstalled = useCallback(
    (regSkill: RegistrySkill): boolean => {
      return Boolean(findInstalledRegistrySkill(skills, regSkill));
    },
    [skills],
  );

  const hasPotentialUpdate = useCallback(
    (regSkill: RegistrySkill): boolean => {
      const installedSkill = findInstalledRegistrySkill(skills, regSkill);
      if (!installedSkill) return false;
      if (installedSkill.installed_content_hash) {
        return installedSkill.installed_version !== regSkill.version;
      }
      const installedVersion =
        installedSkill.installed_version ?? installedSkill.version;
      return Boolean(installedVersion && installedVersion !== regSkill.version);
    },
    [skills],
  );

  const updateCustomStoreSource = useCallback(
    (payload: {
      id: string;
      name: string;
      type: Extract<
        SkillStoreSource["type"],
        "marketplace-json" | "git-repo" | "local-dir"
      >;
      url: string;
      branch?: string;
      directory?: string;
    }) => {
      const trimmedName = payload.name.trim();
      const normalizedGitSource =
        payload.type === "git-repo"
          ? normalizeGitStoreSourceInput(
              payload.url.trim(),
              payload.branch,
              payload.directory,
            )
          : null;
      const trimmedUrl = normalizedGitSource?.url ?? payload.url.trim();
      if (!trimmedName || !trimmedUrl) {
        return;
      }

      useSkillStore.setState((state) => ({
        customStoreSources: state.customStoreSources.map((source) =>
          source.id === payload.id
            ? {
                ...source,
                name: trimmedName,
                type: payload.type,
                url: trimmedUrl,
                branch: normalizedGitSource?.branch,
                directory: normalizedGitSource?.directory,
              }
            : source,
        ),
      }));
      setEditingCustomSourceId(null);
    },
    [],
  );

  const handleDeleteCustomSource = useCallback(
    (sourceId: string) => {
      removeCustomStoreSource(sourceId);
      selectStoreSource("official");
      setEditingCustomSourceId(null);
    },
    [removeCustomStoreSource, selectStoreSource],
  );

  const handleToggleCustomSource = useCallback(
    (sourceId: string) => {
      toggleCustomStoreSource(sourceId);
    },
    [toggleCustomStoreSource],
  );

  const handleRefreshCustomSource = useCallback(
    (sourceId: string) => {
      void loadStoreSource(sourceId, true);
    },
    [loadStoreSource],
  );

  const installed = useMemo(
    () => sourceRegistrySkills.filter(isSkillInstalled),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const recommended = useMemo(
    () => sourceRegistrySkills.filter((skill) => !isSkillInstalled(skill)),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const setInstallPending = useCallback(
    (skill: RegistrySkill, pending: boolean) => {
      const pendingKey = getRegistrySkillPendingKey(skill);
      setInstallingSourceIds((current) => {
        if (pending) {
          return current[pendingKey]
            ? current
            : { ...current, [pendingKey]: true };
        }

        if (!current[pendingKey]) {
          return current;
        }
        const next = { ...current };
        delete next[pendingKey];
        return next;
      });
    },
    [],
  );

  const handleQuickInstall = async (
    skill: RegistrySkill,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const pendingKey = getRegistrySkillPendingKey(skill);
    if (installingSourceIds[pendingKey] || isSkillInstalled(skill)) {
      return;
    }
    setInstallPending(skill, true);
    try {
      if (autoScanBeforeInstall) {
        const report = await window.api.skill.scanSafety({
          name: skill.name,
          content: skill.content,
          sourceUrl: skill.source_url,
          contentUrl: skill.content_url,
          securityAudits: skill.security_audits,
          aiConfig: getSafetyScanAIConfig(aiModels),
        });
        const shouldBlockInstall =
          report.level === "blocked" || report.level === "high-risk";
        if (shouldBlockInstall) {
          showToast(
            t(
              "skill.safetyScanBlockedInstall",
              "This skill was flagged as high risk. Review the safety report before adding it.",
            ),
            "error",
          );
          return;
        }
      }
      const result = await installRegistrySkill({
        ...skill,
        source_label: selectedCustomSource?.name || skill.source_label,
      });
      if (result) {
        showToast(`${t("skill.addedToLibrary")}: ${skill.name}`, "success");
      }
    } catch (error: unknown) {
      showToast(formatSkillSafetyScanError(error, t), "error");
    } finally {
      setInstallPending(skill, false);
    }
  };

  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(t("skill.storeSourceRequired"), "error");
      return;
    }

    try {
      if (sourceType === "git-repo") {
        addCustomStoreSource(sourceName, sourceUrl, sourceType, {
          branch: sourceBranch,
          directory: sourceDirectory,
        });
      } else {
        addCustomStoreSource(sourceName, sourceUrl, sourceType);
      }
      const createdId = useSkillStore.getState().selectedStoreSourceId;
      setSourceName("");
      setSourceUrl("");
      setSourceBranch("");
      setSourceDirectory("");
      setSourceType("marketplace-json");
      showToast(t("skill.storeSourceAdded"), "success");
      if (createdId) {
        void loadStoreSource(createdId, true);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error &&
        error.message === "STORE_SOURCE_HTTPS_REQUIRED"
          ? t("skill.storeSourceHttpsRequired", "Store URL must use HTTPS")
          : t("skill.storeSourceInvalidUrl", "Invalid store URL format");
      showToast(message, "error");
    }
  };

  const categories: { key: SkillCategory | "all"; label: string }[] = [
    { key: "all", label: t("common.showAll", "All") },
    ...Object.entries(SKILL_CATEGORIES).map(([key, value]) => ({
      key: key as SkillCategory,
      label: isZh ? value.label : value.labelEn,
    })),
  ];

  const sourceMeta = useMemo(() => {
    if (selectedStoreSourceId === "community") {
      return {
        title: t("skill.communityStore", "Community Store"),
        hint: t(
          "skill.communityStoreHint",
          "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "claude-code") {
      return {
        title: t("skill.claudeCodeStore", "Claude Code Store"),
        hint: t(
          "skill.claudeCodeStoreHint",
          "Built-in Claude Code source with first-class support for the official skills repo and common marketplace.json indexes.",
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "openai-codex") {
      return {
        title: t("skill.openaiCodexStore", "OpenAI Codex Store"),
        hint: t(
          "skill.openaiCodexStoreHint",
          "Built-in OpenAI Codex source with first-class support for the curated openai/skills catalog.",
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "new-custom") {
      return {
        title: t("skill.addStoreSource", "Add Store"),
        hint: t(
          "skill.customStoresHint",
          "Add your own store endpoints here. A later step can connect remote manifests or registries.",
        ),
        count: customStoreSources.length,
        showCatalog: false,
        canRefresh: false,
      };
    }

    if (selectedCustomSource) {
      return {
        title: selectedCustomSource.name,
        hint: formatStoreSourceHint(selectedCustomSource),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    return {
      title: t("skill.officialStore", "Official Store"),
      hint: t(
        "skill.officialStoreComingSoonHint",
        "The official store is not open yet. You can import skills from Claude Code, OpenAI Codex, or a custom store for now.",
      ),
      count: 0,
      showCatalog: false,
      canRefresh: false,
    };
  }, [
    customStoreSources.length,
    selectedCustomSource,
    selectedStoreSourceId,
    sourceRegistrySkills.length,
    t,
  ]);

  const currentRemoteError = selectedRemoteEntry?.error || null;
  const shouldShowInitialLoading =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    (!selectedRemoteEntry || selectedRemoteEntry.skills.length === 0);
  const isRefreshingCachedSource =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    Boolean(selectedRemoteEntry?.skills.length);

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 app-wallpaper-panel-strong z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{sourceMeta.title}</h2>
            <span className="shrink-0 rounded-full bg-accent/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-white/5">
              {sourceMeta.count} {t("skill.skillsCount", "skills")}
            </span>
            {isRefreshingCachedSource && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Loader2Icon className="h-3 w-3 animate-spin" />
                {t("common.refreshing", "Refreshing")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourceMeta.hint}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {sourceMeta.canRefresh && (
            <button
              onClick={() => void loadStoreSource(selectedStoreSourceId, true)}
              disabled={loadingSourceId === selectedStoreSourceId}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCwIcon
                className={`w-4 h-4 ${loadingSourceId === selectedStoreSourceId ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {selectedCustomSource ? (
            <button
              type="button"
              onClick={() => setEditingCustomSourceId(selectedCustomSource.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Settings2Icon className="w-4 h-4" />
              {t("common.edit", "Edit")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border app-wallpaper-section space-y-3">
        {sourceMeta.showCatalog && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setStoreCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  storeCategory === cat.key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {CATEGORY_ICONS[cat.key]}
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {selectedStoreSourceId === "new-custom" && (
          <SkillStoreSourceForm
            branch={sourceBranch}
            directory={sourceDirectory}
            handleAddSource={handleAddSource}
            setBranch={setSourceBranch}
            setDirectory={setSourceDirectory}
            setSourceName={setSourceName}
            setSourceType={setSourceType}
            setSourceUrl={setSourceUrl}
            sourceName={sourceName}
            sourceType={sourceType}
            sourceUrl={sourceUrl}
            t={t}
            typeOptions={CUSTOM_SOURCE_TYPE_OPTIONS}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {shouldShowInitialLoading && (
          <div className="rounded-2xl border border-border app-wallpaper-panel p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            {selectedStoreSourceId === "claude-code"
              ? t(
                  "skill.loadingRemoteStore",
                  "Loading Claude Code skills from the remote source...",
                )
              : selectedStoreSourceId === "openai-codex"
                ? t(
                    "skill.loadingOpenAiStore",
                    "Loading OpenAI Codex skills from the remote source...",
                  )
                : selectedStoreSourceId === "community"
                  ? t(
                      "skill.loadingCommunityStore",
                      "Loading skills.sh community skill list...",
                    )
                  : t(
                      "skill.loadingCustomStore",
                      "Loading custom store content...",
                    )}
          </div>
        )}

        {currentRemoteError && !shouldShowInitialLoading && (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-4 py-3.5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  {t(
                    "skill.remoteStoreLoadFailed",
                    "Failed to load remote store",
                  )}
                </p>
                <p className="text-sm leading-6 text-destructive/90 break-words">
                  {currentRemoteError}
                </p>
              </div>
              <button
                onClick={() =>
                  void loadStoreSource(selectedStoreSourceId, true)
                }
                disabled={loadingSourceId === selectedStoreSourceId}
                className="shrink-0 self-start rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
              >
                {t("skill.remoteStoreRetry", "Retry")}
              </button>
            </div>
          </div>
        )}

        {sourceMeta.showCatalog && (
          <>
            {installed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t("skill.importedSection", "Imported")}
                  </h3>
                  <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-bold">
                    {installed.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {installed.map((skill, index) => (
                    <SkillStoreCard
                      key={getRegistrySkillSelectionId(skill)}
                      skill={skill}
                      isInstalled={true}
                      hasUpdate={hasPotentialUpdate(skill)}
                      index={index}
                      storeLabel={sourceMeta.title}
                      installingSourceIds={installingSourceIds}
                      onClick={() =>
                        selectRegistrySkill(getRegistrySkillSelectionId(skill))
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {recommended.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t("skill.availableSection", "Available")}
                  </h3>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    {recommended.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {recommended.map((skill, index) => (
                    <SkillStoreCard
                      key={getRegistrySkillSelectionId(skill)}
                      skill={skill}
                      isInstalled={false}
                      index={index}
                      storeLabel={sourceMeta.title}
                      installingSourceIds={installingSourceIds}
                      onQuickInstall={handleQuickInstall}
                      onClick={() =>
                        selectRegistrySkill(getRegistrySkillSelectionId(skill))
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {installed.length === 0 &&
              recommended.length === 0 &&
              !shouldShowInitialLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <SearchIcon className="w-12 h-12 opacity-20 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {t("skill.noResults", "No skills found")}
                  </h3>
                  <p className="text-sm opacity-70">
                    {t(
                      "skill.tryDifferentSearch",
                      "Try a different search or category",
                    )}
                  </p>
                </div>
              )}
          </>
        )}

        {selectedStoreSourceId === "claude-code" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.claudeCodeStore", "Claude Code Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                "skill.claudeCodeStoreDetail",
                "This built-in source is meant for the Claude Code ecosystem. It is designed to work first with the official skills repository and marketplace.json indexes, and can later become a browsable remote store.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatDirectoryRepo",
                    "`SKILL.md` directory-style repository",
                  )}
                  <br />
                  {t(
                    "skill.formatIndexStore",
                    "`marketplace.json` index-style store",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/anthropics/skills
                  <br />
                  https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "openai-codex" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.openaiCodexStore", "OpenAI Codex Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                "skill.openaiCodexStoreDetail",
                "This built-in source is meant for the OpenAI Codex ecosystem. It focuses on the curated openai/skills catalog and keeps the install flow compatible with directory-style SKILL.md repositories.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatDirectoryRepo",
                    "`SKILL.md` directory-style repository",
                  )}
                  <br />
                  {t(
                    "skill.formatCuratedSubdir",
                    "Curated subdirectory inside a larger Git repository",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/openai/skills/tree/main/skills/.curated
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "community" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3 text-foreground">
              <BoxesIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.communityStore", "Community Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              {t(
                "skill.communityStoreHint",
                "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatCommunityLeaderboard",
                    "skills.sh community leaderboard",
                  )}
                  <br />
                  {t(
                    "skill.formatSkillDetailPage",
                    "skills.sh skill detail page",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://skills.sh/
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "official" && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
            <StoreIcon className="mb-4 h-12 w-12 opacity-25" />
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              {t("skill.officialStoreComingSoon", "Official store coming soon")}
            </h3>
            <p className="max-w-md text-sm leading-6 opacity-80">
              {t(
                "skill.officialStoreComingSoonHint",
                "The official store is not open yet. You can import skills from Claude Code, OpenAI Codex, or a custom store for now.",
              )}
            </p>
          </div>
        )}

        {(selectedStoreSourceId === "new-custom" || selectedCustomSource) && (
          <section className="space-y-4">
            <SkillStoreCustomSources
              customStoreSources={customStoreSources}
              loadStoreSource={loadStoreSource}
              loadingSourceId={loadingSourceId}
              remoteStoreEntries={remoteStoreEntries}
              removeCustomStoreSource={removeCustomStoreSource}
              selectStoreSource={selectStoreSource}
              selectedCustomSource={selectedCustomSource}
              selectedStoreSourceId={selectedStoreSourceId}
              t={t}
              toggleCustomStoreSource={toggleCustomStoreSource}
            />

            {selectedCustomSource &&
            !shouldShowInitialLoading &&
            !currentRemoteError &&
            sourceRegistrySkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
                <Link2Icon className="mb-4 h-12 w-12 opacity-25" />
                <h3 className="mb-1 text-lg font-semibold text-foreground">
                  {t(
                    "skill.customStoreEmpty",
                    "No skills in this custom store yet",
                  )}
                </h3>
                <p className="max-w-md text-sm leading-6 opacity-80">
                  {t(
                    "skill.customStoreEmptyHint",
                    "This source is connected, but no skills were loaded yet. Try refreshing from the top right, or open Edit to adjust the source configuration.",
                  )}
                </p>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <SkillStoreSourceEditModal
        isOpen={editingCustomSourceId !== null}
        onClose={() => setEditingCustomSourceId(null)}
        onDelete={handleDeleteCustomSource}
        onSave={updateCustomStoreSource}
        onToggleEnabled={handleToggleCustomSource}
        onRefresh={handleRefreshCustomSource}
        refreshingSourceId={loadingSourceId}
        source={
          customStoreSources.find(
            (source) => source.id === editingCustomSourceId,
          ) ?? null
        }
      />

      {selectedDetailSkill && (
        <SkillStoreDetail
          skill={selectedDetailSkill}
          isInstalled={isSkillInstalled(selectedDetailSkill)}
          storeLabel={sourceMeta.title}
          isInstalling={Boolean(
            installingSourceIds[
              getRegistrySkillPendingKey(selectedDetailSkill)
            ],
          )}
          onInstallPendingChange={setInstallPending}
          onClose={() => selectRegistrySkill(null)}
        />
      )}
    </div>
  );
}
