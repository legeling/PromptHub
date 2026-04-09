import { useTranslation } from "react-i18next";
import {
  XIcon,
  DownloadIcon,
  Loader2Icon,
  FolderIcon,
  RefreshCwIcon,
  PlusIcon,
  Trash2Icon,
  FileTextIcon,
  CheckCircle2Icon,
  SearchIcon,
  TagsIcon,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { ScannedSkill } from "../../../shared/types";

interface SkillScanPreviewProps {
  scannedSkills: ScannedSkill[];
  /**
   * Set of localPath values for skills already in the PromptHub library.
   * Using localPath (folder path) instead of name avoids false "Installed"
   * flags when a different tool happens to have a skill with the same name.
   * 已存在于 PromptHub 库中的 skill 文件夹路径集合（精准比对，避免同名误判）
   */
  installedPaths: Set<string>;
  onImport: (
    skills: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
  ) => Promise<number>;
  /** Re-scan with optional extra paths */
  onRescan: (customPaths: string[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Scan Preview Modal - User selects which local skills to import
 * 扫描预览弹窗 - 用户选择要导入的本地技能
 *
 * Fixes:
 *  - #57: isInstalled is now determined by localPath match, not name match,
 *         so skills from other tools with the same name are no longer blocked.
 *         Already-installed skills show a badge but can still be re-imported
 *         (treated as "update").
 *  - #59: Custom path input lets users specify extra directories to scan.
 */
export function SkillScanPreview({
  scannedSkills,
  installedPaths,
  onImport,
  onRescan,
  onClose,
}: SkillScanPreviewProps) {
  const { t } = useTranslation();

  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOptionalTags, setShowOptionalTags] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string[]>>({});
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  // Custom path state
  // 自定义路径状态
  const [customPaths, setCustomPaths] = useState<string[]>([]);
  const [newPathInput, setNewPathInput] = useState("");
  const [isRescanning, setIsRescanning] = useState(false);
  const [showPathPanel, setShowPathPanel] = useState(false);

  // Annotate each scanned skill with isInstalled (path-based, not name-based)
  // 基于路径判断是否已安装，而非仅凭名称
  const allSkills = useMemo(() => {
    return scannedSkills.map((skill) => ({
      ...skill,
      isInstalled: installedPaths.has(skill.localPath),
    }));
  }, [scannedSkills, installedPaths]);

  // Skills not yet imported — used for import logic and selection counts
  // 尚未导入的 skill，仅用于导入逻辑与选择计数
  const filteredSkills = useMemo(
    () => allSkills.filter((s) => !s.isInstalled),
    [allSkills],
  );

  const visibleSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allSkills;
    return allSkills.filter((skill) => {
      const haystacks = [
        skill.name,
        skill.description,
        skill.author,
        skill.localPath,
        ...skill.tags,
        ...skill.platforms,
      ];
      return haystacks.some((value) => value?.toLowerCase().includes(query));
    });
  }, [allSkills, searchQuery]);

  const visibleSelectableSkills = useMemo(
    () => visibleSkills.filter((skill) => !skill.isInstalled),
    [visibleSkills],
  );

  const handleToggleSkill = (localPath: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(localPath)) {
        next.delete(localPath);
      } else {
        next.add(localPath);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (visibleSelectableSkills.length === 0) return;

    const allVisibleSelected = visibleSelectableSkills.every((skill) =>
      selectedSkills.has(skill.localPath),
    );

    if (allVisibleSelected) {
      setSelectedSkills((prev) => {
        const next = new Set(prev);
        visibleSelectableSkills.forEach((skill) =>
          next.delete(skill.localPath),
        );
        return next;
      });
    } else {
      setSelectedSkills((prev) => {
        const next = new Set(prev);
        visibleSelectableSkills.forEach((skill) => next.add(skill.localPath));
        return next;
      });
    }
  };

  const handleImport = async () => {
    const skillsToImport = filteredSkills.filter((s) =>
      selectedSkills.has(s.localPath),
    );
    if (skillsToImport.length === 0) return;

    setIsImporting(true);
    try {
      const userTagsByPath = Object.fromEntries(
        skillsToImport.map((skill) => [
          skill.localPath,
          tagDrafts[skill.localPath] || [],
        ]),
      );
      await onImport(skillsToImport, userTagsByPath);
      onClose();
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setIsImporting(false);
    }
  };

  // Add a custom path to the list
  const handleAddPath = () => {
    const trimmed = newPathInput.trim();
    if (!trimmed || customPaths.includes(trimmed)) return;
    setCustomPaths((prev) => [...prev, trimmed]);
    setNewPathInput("");
  };

  const handleRemovePath = (p: string) => {
    setCustomPaths((prev) => prev.filter((x) => x !== p));
  };

  const handleAddTag = (localPath: string) => {
    const raw = tagInputs[localPath] || "";
    const nextTag = raw.trim().toLowerCase();
    if (!nextTag) return;

    setTagDrafts((prev) => {
      const existing = prev[localPath] || [];
      if (existing.includes(nextTag)) return prev;
      return { ...prev, [localPath]: [...existing, nextTag] };
    });
    setTagInputs((prev) => ({ ...prev, [localPath]: "" }));
  };

  const handleRemoveTag = (localPath: string, tag: string) => {
    setTagDrafts((prev) => ({
      ...prev,
      [localPath]: (prev[localPath] || []).filter((item) => item !== tag),
    }));
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await onRescan(customPaths);
      // Reset selection after rescan
      setSelectedSkills(new Set());
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <FolderIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {t("skill.scanPreview", "Scan Preview")}
            </h2>
            <span className="text-xs text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
              {allSkills.length} {t("skill.skills", "skills")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Toggle custom paths panel */}
            <button
              onClick={() => setShowPathPanel((v) => !v)}
              className={`p-2 rounded-lg transition-colors text-sm flex items-center gap-1.5 ${
                showPathPanel
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-accent text-muted-foreground hover:text-foreground"
              }`}
              title={t("skill.customPaths", "Custom scan paths")}
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-xs hidden sm:inline">
                {t("skill.addPath", "Add path")}
              </span>
            </button>
            {/* Re-scan button */}
            <button
              onClick={handleRescan}
              disabled={isRescanning}
              className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={t("skill.rescan", "Re-scan")}
            >
              <RefreshCwIcon
                className={`w-4 h-4 ${isRescanning ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Custom paths panel */}
        {showPathPanel && (
          <div className="px-6 py-3 border-b border-border bg-accent/20 shrink-0 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                "skill.customPathsHint",
                "Add extra directories to scan (e.g. ~/mytools/skills). Click Re-scan to apply.",
              )}
            </p>
            {/* Existing custom paths */}
            {customPaths.length > 0 && (
              <div className="space-y-1">
                {customPaths.map((p) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 text-xs bg-card border border-border rounded px-2 py-1"
                  >
                    <FolderIcon className="w-3 h-3 text-primary shrink-0" />
                    <span className="flex-1 truncate font-mono">{p}</span>
                    <button
                      onClick={() => handleRemovePath(p)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2Icon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Input row */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPathInput}
                onChange={(e) => setNewPathInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                placeholder={t("skill.pathPlaceholder", "~/path/to/skills")}
                className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
              />
              <button
                onClick={handleAddPath}
                disabled={!newPathInput.trim()}
                className="px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("common.add", "Add")}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {allSkills.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="relative block flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t(
                      "skill.searchImportPlaceholder",
                      "Search by name, description, tags, platform, or path",
                    )}
                    className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowOptionalTags((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    showOptionalTags
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TagsIcon className="h-4 w-4" />
                  {showOptionalTags
                    ? t("skill.hideOptionalTags", "Hide optional tags")
                    : t("skill.showOptionalTags", "Add tags when needed")}
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("skill.scanPreviewStats", {
                  visible: visibleSkills.length,
                  total: allSkills.length,
                  selected: selectedSkills.size,
                  defaultValue: `Showing ${visibleSkills.length}/${allSkills.length}, ${selectedSkills.size} selected`,
                })}
              </div>
            </div>
          )}

          {allSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderIcon className="w-12 h-12 opacity-20 mb-4" />
              <h3 className="text-sm font-medium">
                {t("skill.noSkillsFound", "No local skills found")}
              </h3>
              <p className="text-xs opacity-70 mt-1">
                {t(
                  "skill.checkPlatformDirs",
                  "Check if Claude Code, Cursor, etc. are installed",
                )}
              </p>
              <p className="text-xs opacity-60 mt-1">
                {t(
                  "skill.orAddCustomPath",
                  "Or add a custom path above and re-scan",
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Select All Bar */}
              {visibleSelectableSkills.length > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-accent/30 rounded-lg mb-2">
                  <span className="text-xs text-muted-foreground">
                    {
                      visibleSelectableSkills.filter((skill) =>
                        selectedSkills.has(skill.localPath),
                      ).length
                    }{" "}
                    / {visibleSelectableSkills.length}{" "}
                    {t("skill.selected", "selected")}
                  </span>
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {visibleSelectableSkills.every((skill) =>
                      selectedSkills.has(skill.localPath),
                    )
                      ? t("skill.deselectAll", "Deselect All")
                      : t("skill.selectAll", "Select All")}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {visibleSkills.map((skill) => {
                  const isSelected = selectedSkills.has(skill.localPath);
                  const shortPath = (() => {
                    const parts = skill.localPath
                      .replace(/\\/g, "/")
                      .split("/")
                      .filter(Boolean);
                    return parts.length >= 2
                      ? `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
                      : skill.localPath;
                  })();

                  return (
                    <button
                      key={skill.localPath}
                      type="button"
                      className={`text-left rounded-2xl border p-4 transition-all shadow-sm ${
                        skill.isInstalled
                          ? "bg-muted/30 border-border opacity-70 cursor-default"
                          : isSelected
                            ? "bg-primary/5 border-primary/40 shadow-primary/10"
                            : "bg-card border-border hover:border-primary/30 hover:shadow-md"
                      }`}
                      onClick={() =>
                        !skill.isInstalled && handleToggleSkill(skill.localPath)
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${
                            skill.isInstalled
                              ? "bg-accent text-muted-foreground"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          <FileTextIcon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm truncate">
                                  {skill.name}
                                </h4>
                                {skill.version && (
                                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                    v{skill.version}
                                  </span>
                                )}
                                {skill.isInstalled && (
                                  <span className="text-[10px] bg-accent text-muted-foreground px-2 py-0.5 rounded-full">
                                    {t(
                                      "skill.importedBadge",
                                      "Already Imported",
                                    )}
                                  </span>
                                )}
                              </div>
                              {skill.author && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {skill.author}
                                </p>
                              )}
                            </div>

                            <div className="shrink-0 pt-0.5">
                              {skill.isInstalled ? (
                                <CheckCircle2Icon className="w-5 h-5 text-muted-foreground" />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() =>
                                    handleToggleSkill(skill.localPath)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
                                />
                              )}
                            </div>
                          </div>

                          {skill.description && (
                            <p className="mt-3 text-xs leading-5 text-muted-foreground line-clamp-3">
                              {skill.description}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {skill.platforms.map((platform) => (
                              <span
                                key={platform}
                                className="text-[10px] bg-primary/8 text-primary/80 px-2 py-0.5 rounded-full"
                              >
                                {platform}
                              </span>
                            ))}
                          </div>

                          {!skill.isInstalled &&
                            isSelected &&
                            showOptionalTags && (
                              <div className="mt-4 rounded-xl border border-border bg-accent/20 p-3 space-y-2">
                                <div className="text-[11px] font-medium text-foreground">
                                  {t(
                                    "skill.importTagsOptional",
                                    "Import tags (optional)",
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(tagDrafts[skill.localPath] || []).map(
                                    (tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-white"
                                      >
                                        {tag}
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleRemoveTag(
                                              skill.localPath,
                                              tag,
                                            );
                                          }}
                                          className="hover:text-white/70"
                                        >
                                          <XIcon className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ),
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={tagInputs[skill.localPath] || ""}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      setTagInputs((prev) => ({
                                        ...prev,
                                        [skill.localPath]: event.target.value,
                                      }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleAddTag(skill.localPath);
                                      }
                                    }}
                                    placeholder={t(
                                      "skill.enterTagHint",
                                      "Type a tag and press Enter",
                                    )}
                                    className="flex-1 h-9 rounded-xl border-0 bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleAddTag(skill.localPath);
                                    }}
                                    disabled={
                                      !tagInputs[skill.localPath]?.trim()
                                    }
                                    className="rounded-xl bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50"
                                  >
                                    {t("skill.addTag", "Add tag")}
                                  </button>
                                </div>
                              </div>
                            )}

                          <div
                            className="mt-4 flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono truncate"
                            title={skill.localPath}
                          >
                            <FolderIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{shortPath}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {allSkills.length > 0 && (
          <div className="h-16 px-6 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-background/50">
            <button
              onClick={handleImport}
              disabled={selectedSkills.size === 0 || isImporting}
              className="px-6 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  {t("skill.importing", "Importing...")}
                </>
              ) : (
                <>
                  <DownloadIcon className="w-4 h-4" />
                  {t("skill.importSelected", "Import")} ({selectedSkills.size})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
