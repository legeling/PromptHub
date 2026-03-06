import { useState } from "react";
import { PlusIcon, TrashIcon, InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SKILL_PLATFORMS } from "../../../shared/constants/platforms";
import { PlatformIcon } from "../ui/PlatformIcon";
import { SettingSection } from "./shared";

interface SkillSettingsProps {
  onNavigate: (section: string) => void;
}

export function SkillSettings({ onNavigate }: SkillSettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  // Skill scan path input state / Skill 扫描路径输入状态
  const [newScanPath, setNewScanPath] = useState("");

  return (
    <div className="space-y-6">
      {/* Skill 安装方式 */}
      <SettingSection
        title={t("settings.skillInstallMethod", "Skill 安装方式")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.skillInstallMethodDesc",
              "选择从 PromptHub 库向 AI 工具平台安装 Skill 的方式。",
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => settings.setSkillInstallMethod("symlink")}
              className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                settings.skillInstallMethod === "symlink"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-sm font-semibold">
                {t("settings.skillInstallSymlink", "软链接")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "settings.skillInstallSymlinkDesc",
                  "在平台目录创建软链接指向 PromptHub 的 Skills 目录，同步更新更高效",
                )}
              </p>
            </button>
            <button
              onClick={() => settings.setSkillInstallMethod("copy")}
              className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                settings.skillInstallMethod === "copy"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-sm font-semibold">
                {t("settings.skillInstallCopy", "复制文件")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "settings.skillInstallCopyDesc",
                  "直接将 SKILL.md 复制到平台目录，与平台目录独立",
                )}
              </p>
            </button>
          </div>
        </div>
      </SettingSection>

      {/* 自定义扫描路径 */}
      <SettingSection
        title={t("settings.customSkillScanPaths", "自定义扫描路径")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.customSkillScanPathsDesc",
              "添加您的 Skill 文件所在目录，扫描时将自动包含这些路径。",
            )}
          </p>
          {/* 输入框 + 添加按钮 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newScanPath}
              onChange={(e) => setNewScanPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newScanPath.trim()) {
                  settings.addCustomSkillScanPath(newScanPath.trim());
                  setNewScanPath("");
                }
              }}
              placeholder={t(
                "settings.customSkillScanPathPlaceholder",
                "输入路径，如 ~/myskills",
              )}
              className="flex-1 h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
            />
            <button
              onClick={() => {
                if (newScanPath.trim()) {
                  settings.addCustomSkillScanPath(newScanPath.trim());
                  setNewScanPath("");
                }
              }}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              {t("common.add", "添加")}
            </button>
          </div>
          {/* 已添加的路径列表 */}
          {settings.customSkillScanPaths.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              {settings.customSkillScanPaths.map((path, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2.5 border-b border-border/70 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <span className="text-sm font-mono text-foreground truncate flex-1 mr-3">
                    {path}
                  </span>
                  <button
                    onClick={() => settings.removeCustomSkillScanPath(path)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    title={t("common.delete", "删除")}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {settings.customSkillScanPaths.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              {t("settings.noCustomPaths", "暂未添加自定义路径")}
            </p>
          )}
        </div>
      </SettingSection>

      {/* 内置扫描路径（只读） */}
      <SettingSection
        title={t("settings.builtinSkillScanPaths", "内置扫描路径（只读）")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.builtinSkillScanPathsDesc",
              "以下是 PromptHub 自动扫描的 AI 工具 Skill 目录。",
            )}
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {SKILL_PLATFORMS.map((platform) => (
              <div
                key={platform.id}
                className="flex items-center justify-between px-3 py-2.5 border-b border-border/70 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <PlatformIcon
                    platformId={platform.id}
                    size={16}
                    className="flex-shrink-0"
                  />
                  <span className="text-sm font-medium text-foreground flex-shrink-0 mr-2">
                    {platform.name}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {platform.skillsDir.darwin}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SettingSection>

      {/* Skill 备份提示 */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl bg-muted/50 border border-border/50">
        <InfoIcon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {t(
            "settings.skillBackupHint",
            "Skill 的备份与恢复请前往「数据」面板 → 全量备份 / 恢复",
          )}{" "}
          <button
            onClick={() => onNavigate("data")}
            className="text-primary hover:underline font-medium"
          >
            {t("settings.skillBackupHintLink", "前往数据面板")}
          </button>
        </p>
      </div>
    </div>
  );
}
