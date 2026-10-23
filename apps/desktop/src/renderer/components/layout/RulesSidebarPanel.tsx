import { WorkspaceRefreshButton } from "./WorkspaceRefreshButton";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getOrderedGlobalRuleFiles } from "../../services/rule-platform-order";
import { isWebRuntime } from "../../runtime";
import { useSettingsStore } from "../../stores/settings.store";
import { useRulesStore } from "../../stores/rules.store";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface RulesSidebarPanelProps {
  currentPage: "home" | "settings";
  onNavigate: (page: "home" | "settings") => void;
}

export function RulesSidebarPanel({
  currentPage,
  onNavigate,
}: RulesSidebarPanelProps) {
  const { t } = useTranslation();
  const addRuleProject = useRulesStore((state) => state.addProjectRule);
  const removeRuleProject = useRulesStore((state) => state.removeProjectRule);
  const cleanupMissingProjectRules = useRulesStore(
    (state) => state.cleanupMissingProjectRules,
  );
  const ruleFiles = useRulesStore((state) => state.files);
  const rulesSearchQuery = useRulesStore((state) => state.searchQuery);
  const selectedRuleId = useRulesStore((state) => state.selectedRuleId);
  const selectRule = useRulesStore((state) => state.selectRule);
  const loadRuleFiles = useRulesStore((state) => state.loadFiles);
  const skillPlatformOrder = useSettingsStore(
    (state) => state.skillPlatformOrder,
  );
  const [collapsedRuleSections, setCollapsedRuleSections] = useState<
    Record<"global" | "project", boolean>
  >({
    global: false,
    project: false,
  });
  const { showToast } = useToast();
  const canAddRuleProject = !isWebRuntime();
  const [selectedMissingRuleIds, setSelectedMissingRuleIds] = useState<
    Set<string>
  >(new Set());
  const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);
  const [isCleaningMissingRules, setIsCleaningMissingRules] = useState(false);

  useEffect(() => {
    if (ruleFiles.length > 0) {
      return;
    }
    void loadRuleFiles();
  }, [loadRuleFiles, ruleFiles.length]);


  const ruleSidebarSections = useMemo(() => {
    const normalizedQuery = rulesSearchQuery.trim().toLowerCase();
    const matchesRuleSearch = (file: (typeof ruleFiles)[number]) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        file.platformName,
        file.platformDescription,
        file.name,
        file.description,
        file.path,
        file.projectRootPath || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    };

    // Order follows Agent management's skillPlatformOrder (shared source of truth).
    const globalItems = getOrderedGlobalRuleFiles(ruleFiles, skillPlatformOrder)
      .filter((file) => matchesRuleSearch(file))
      .map((file) => ({
        id: file.id,
        type: "global" as const,
        platformId: file.platformId,
        file,
        path: file.path,
        active: selectedRuleId === file.id,
        canRemove: false,
        projectId: null,
        name: file.platformName,
        isMissing: false,
      }));

    const projectItems = ruleFiles
      .filter(
        (file) => file.id.startsWith("project:") && matchesRuleSearch(file),
      )
      .map((file) => ({
        id: file.id,
        type: "project" as const,
        platformId: file.platformId,
        file,
        path: file.path,
        active: selectedRuleId === file.id,
        canRemove: true,
        projectId: file.id.slice("project:".length),
        name: file.platformName,
        isMissing: file.syncStatus === "target-missing",
      }));

    return [
      {
        id: "global" as const,
        items: globalItems,
      },
      {
        id: "project" as const,
        items: projectItems,
      },
    ];
  }, [ruleFiles, rulesSearchQuery, selectedRuleId, skillPlatformOrder]);

  useEffect(() => {
    const currentMissingIds = new Set<string>(
      ruleFiles
        .filter(
          (file) =>
            file.id.startsWith("project:") &&
            file.syncStatus === "target-missing",
        )
        .map((file) => file.id),
    );
    setSelectedMissingRuleIds(
      (selected) =>
        new Set([...selected].filter((id) => currentMissingIds.has(id))),
    );
  }, [ruleFiles]);

  const handleAddRuleProject = useCallback(async () => {
    const selectedPath = await window.electron?.selectFolder?.();
    if (!selectedPath) {
      return;
    }

    const segments = selectedPath.split(/[\\/]/).filter(Boolean);
    const fallbackName = segments.at(-1) || selectedPath;

    try {
      await addRuleProject({
        name: fallbackName,
        rootPath: selectedPath,
      });
    } catch (error) {
      console.warn("Failed to add rule project:", error);
    }
  }, [addRuleProject]);

  const handleRemoveRuleProject = useCallback(
    async (projectId: string) => {
      await removeRuleProject(projectId);
    },
    [removeRuleProject],
  );

  const toggleRuleSection = useCallback((sectionId: "global" | "project") => {
    setCollapsedRuleSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const toggleMissingRuleSelection = useCallback((ruleId: string) => {
    setSelectedMissingRuleIds((selected) => {
      const next = new Set(selected);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  }, []);

  const handleCleanupMissingRules = useCallback(async () => {
    setIsCleaningMissingRules(true);
    try {
      const result = await cleanupMissingProjectRules([
        ...selectedMissingRuleIds,
      ]);
      setSelectedMissingRuleIds(new Set());
      setIsCleanupConfirmOpen(false);
      if (result.failed.length > 0 || result.skipped.length > 0) {
        showToast(
          t(
            "rules.missingCleanupPartial",
            "Cleanup finished with skipped or failed records.",
          ),
          "error",
        );
      } else {
        showToast(
          t("rules.missingCleanupDone", "Missing rules cleaned up"),
          "success",
        );
      }
    } catch {
      showToast(
        t("rules.missingCleanupFailed", "Failed to clean up missing rules"),
        "error",
      );
    } finally {
      setIsCleaningMissingRules(false);
    }
  }, [cleanupMissingProjectRules, selectedMissingRuleIds, showToast, t]);

  return (
    <>
      <div className="flex-shrink-0 flex flex-col px-3 py-4">
        <div className="px-2 pb-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("rules.title", "Rules")}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {t("rules.platformSidebarTitle", "Platforms")}
            </h3>
            <WorkspaceRefreshButton domain="rules" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-5">
          {ruleSidebarSections.map((section) => (
            <div key={section.id}>
              <div className="mb-2 px-2">
                <button
                  type="button"
                  aria-expanded={!collapsedRuleSections[section.id]}
                  onClick={() => toggleRuleSection(section.id)}
                  className="flex w-full items-center gap-1 text-left text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {collapsedRuleSections[section.id] ? (
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  ) : (
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  )}
                  <span>
                    {section.id === "global"
                      ? t("rules.globalSection", "Global Rules")
                      : t("rules.projectSection", "Project Rules")}
                  </span>
                </button>
              </div>

              {!collapsedRuleSections[section.id] ? (
                <div className="space-y-2">
                  {section.id === "project" &&
                  selectedMissingRuleIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setIsCleanupConfirmOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                    >
                      <Trash2Icon aria-hidden="true" className="h-3.5 w-3.5" />
                      {t(
                        "rules.missingCleanupAction",
                        "Clean up missing rules",
                      )}
                    </button>
                  ) : null}
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className={`relative w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                        item.active
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-background/60 hover:bg-muted"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void selectRule(item.file.id);
                          if (currentPage !== "home") onNavigate("home");
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            {item.type === "project" ? (
                              <FolderPlusIcon
                                aria-hidden="true"
                                className="h-5 w-5"
                              />
                            ) : (
                              <PlatformIcon
                                aria-hidden="true"
                                platformId={item.platformId}
                                size={20}
                                className="h-5 w-5"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-foreground">
                                {item.name}
                              </div>
                              {item.isMissing ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                                  <AlertTriangleIcon
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                  />
                                  {t("rules.targetMissing", "Target missing")}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {item.type === "project"
                                ? item.path
                                : item.file.name}
                            </div>
                          </div>
                        </div>
                      </button>

                      {item.isMissing ? (
                        <div className="mt-3 flex justify-end">
                          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={selectedMissingRuleIds.has(item.id)}
                              onChange={() =>
                                toggleMissingRuleSelection(item.id)
                              }
                              aria-label={t(
                                "rules.selectMissingForCleanup",
                                "Select {{name}} for cleanup",
                                { name: item.name },
                              )}
                              className="h-4 w-4 accent-primary"
                            />
                            {t("common.select", "Select")}
                          </label>
                        </div>
                      ) : item.canRemove && item.projectId ? (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void handleRemoveRuleProject(item.projectId!)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Trash2Icon
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {t("common.remove", "Remove")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {section.id === "project" && canAddRuleProject ? (
                    <button
                      type="button"
                      onClick={() => void handleAddRuleProject()}
                      className="w-full rounded-2xl border border-dashed border-border px-3 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <FolderPlusIcon
                            aria-hidden="true"
                            className="h-5 w-5"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">
                            {t(
                              "rules.addProjectRuleDirectory",
                              "Add Project Directory",
                            )}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {t(
                              "rules.addProjectRuleDirectoryHint",
                              "Pick a folder and PromptHub will manage its canonical AGENTS.md rule file here.",
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : null}
                </div>
              ) : section.id === "project" && canAddRuleProject ? (
                <button
                  type="button"
                  onClick={() => void handleAddRuleProject()}
                  className="w-full rounded-2xl border border-dashed border-border px-3 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <PlusIcon aria-hidden="true" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                      {t(
                        "rules.addProjectRuleDirectory",
                        "Add Project Directory",
                      )}
                    </div>
                  </div>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        isOpen={isCleanupConfirmOpen}
        onClose={() => setIsCleanupConfirmOpen(false)}
        onConfirm={() => void handleCleanupMissingRules()}
        title={t("rules.missingCleanupTitle", "Clean up missing rules")}
        message={t(
          "rules.missingCleanupMessage",
          "Remove {{count}} managed rule and its history? External project folders are never deleted.",
          { count: selectedMissingRuleIds.size },
        )}
        confirmText={t("rules.missingCleanupConfirm", "Clean up")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isCleaningMissingRules}
      />
    </>
  );
}
