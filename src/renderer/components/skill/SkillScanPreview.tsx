import { useTranslation } from "react-i18next";
import {
  XIcon,
  DownloadIcon,
  Loader2Icon,
  FolderIcon,
  RefreshCwIcon,
  PlusIcon,
  Trash2Icon,
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
  onImport: (skills: ScannedSkill[]) => Promise<number>;
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

  // Non-installed skills the user can toggle
  const selectableSkills = filteredSkills;

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
    if (selectedSkills.size === selectableSkills.length) {
      setSelectedSkills(new Set());
    } else {
      setSelectedSkills(new Set(selectableSkills.map((s) => s.localPath)));
    }
  };

  const handleImport = async () => {
    const skillsToImport = filteredSkills.filter((s) =>
      selectedSkills.has(s.localPath),
    );
    if (skillsToImport.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(skillsToImport);
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
              {selectableSkills.length > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-accent/30 rounded-lg mb-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedSkills.size} / {selectableSkills.length}{" "}
                    {t("skill.selected", "selected")}
                  </span>
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {selectedSkills.size === selectableSkills.length
                      ? t("skill.deselectAll", "Deselect All")
                      : t("skill.selectAll", "Select All")}
                  </button>
                </div>
              )}

              {/* Skill List */}
              {allSkills.map((skill) => (
                <div
                  key={skill.localPath}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    skill.isInstalled
                      ? "bg-card border-border opacity-50 cursor-default"
                      : selectedSkills.has(skill.localPath)
                        ? "bg-primary/5 border-primary/30 cursor-pointer"
                        : "bg-card border-border hover:border-primary/30 cursor-pointer"
                  }`}
                  onClick={() =>
                    !skill.isInstalled && handleToggleSkill(skill.localPath)
                  }
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={
                      skill.isInstalled || selectedSkills.has(skill.localPath)
                    }
                    onChange={() =>
                      !skill.isInstalled && handleToggleSkill(skill.localPath)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={skill.isInstalled}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 disabled:cursor-default"
                  />

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderIcon className="w-4 h-4 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: name + optional imported badge */}
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm truncate">
                        {skill.name}
                      </h4>
                      {skill.isInstalled && (
                        <span className="text-[10px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                          {t("skill.importedBadge", "Already Imported")}
                        </span>
                      )}
                    </div>

                    {/* Row 2: description */}
                    {skill.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {skill.description}
                      </p>
                    )}

                    {/* Row 3: version · author · tags */}
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                      {skill.version && (
                        <span className="text-[10px] text-muted-foreground">
                          v{skill.version}
                        </span>
                      )}
                      {skill.author && (
                        <span className="text-[10px] text-muted-foreground">
                          by {skill.author}
                        </span>
                      )}
                      {skill.tags &&
                        skill.tags.length > 0 &&
                        skill.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-primary/8 text-primary/70 px-1.5 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>

                    {/* Row 4: Found in + short path */}
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                      {skill.platforms.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">
                          {t("skill.foundIn", "Found in:")}
                        </span>
                      )}
                      {skill.platforms.map((p) => (
                        <span
                          key={p}
                          className="text-[10px] bg-accent/60 text-muted-foreground px-1.5 py-0.5 rounded"
                        >
                          {p}
                        </span>
                      ))}
                      <span
                        className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 font-mono truncate ml-auto"
                        title={skill.localPath}
                      >
                        <FolderIcon className="w-2.5 h-2.5 shrink-0" />
                        {(() => {
                          const parts = skill.localPath
                            .replace(/\\/g, "/")
                            .split("/")
                            .filter(Boolean);
                          return parts.length >= 2
                            ? `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}`
                            : skill.localPath;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
