import { useState } from "react";
import { InfoIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SKILL_PLATFORMS } from "../../../shared/constants/platforms";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { PlatformIcon } from "../ui/PlatformIcon";
import { SettingSection } from "./shared";
import { useToast } from "../ui/Toast";

interface SkillSettingsProps {
  onNavigate: (section: string) => void;
}

function getCurrentPlatformKey(): "darwin" | "win32" | "linux" {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("win")) return "win32";
  if (platform.includes("mac")) return "darwin";
  return "linux";
}

export function SkillSettings({ onNavigate }: SkillSettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const scanInstalledSkillSafety = useSkillStore(
    (state) => state.scanInstalledSkillSafety,
  );
  const { showToast } = useToast();
  const [newScanPath, setNewScanPath] = useState("");
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const currentPlatformKey = getCurrentPlatformKey();

  return (
    <div className="space-y-6">
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

      <SettingSection
        title={t("settings.skillSafetyChecks", "Skill 安全评估")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.skillSafetyChecksDesc",
              "控制已安装 Skill 的自动复查，以及从商店添加前是否自动做一次静态风险评估。",
            )}
          </p>
          <button
            onClick={() =>
              settings.setAutoScanInstalledSkills(
                !settings.autoScanInstalledSkills,
              )
            }
            className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
              settings.autoScanInstalledSkills
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <div className="text-sm font-semibold">
              {t("settings.autoScanInstalledSkills", "自动复查已安装 Skills")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "settings.autoScanInstalledSkillsDesc",
                "打开 Skill 详情页时自动运行一次安全评估，方便持续发现高风险内容变更。",
              )}
            </p>
          </button>
          <button
            onClick={() =>
              settings.setAutoScanStoreSkillsBeforeInstall(
                !settings.autoScanStoreSkillsBeforeInstall,
              )
            }
            className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
              settings.autoScanStoreSkillsBeforeInstall
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            }`}
          >
            <div className="text-sm font-semibold">
              {t("settings.autoScanStoreSkillsBeforeInstall", "商店添加前自动评估")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "settings.autoScanStoreSkillsBeforeInstallDesc",
                "默认关闭。开启后，从商店添加 Skill 前会先做一次静态风险检查，并拦住明显危险的条目。",
              )}
            </p>
          </button>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.batchScanInstalledSkills", "立即复查已安装 Skills")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "settings.batchScanInstalledSkillsDesc",
                    "手动对当前库里的所有 Skill 运行一次静态安全评估，快速发现高风险内容。",
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  const run = async () => {
                    setIsBatchScanning(true);
                    try {
                      const summary = await scanInstalledSkillSafety();
                      showToast(
                        t("settings.batchScanInstalledSkillsResult", {
                          total: summary.total,
                          blocked: summary.blocked,
                          highRisk: summary.highRisk,
                          warn: summary.warn,
                          defaultValue:
                            `Checked ${summary.total} skills · blocked ${summary.blocked} · high risk ${summary.highRisk} · warn ${summary.warn}`,
                        }),
                        summary.blocked > 0 || summary.highRisk > 0
                          ? "error"
                          : summary.warn > 0
                            ? "warning"
                            : "success",
                      );
                    } catch (error) {
                      showToast(String(error), "error");
                    } finally {
                      setIsBatchScanning(false);
                    }
                  };
                  void run();
                }}
                disabled={isBatchScanning}
                className="shrink-0 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isBatchScanning
                  ? t("skill.safetyScanning", "检查中...")
                  : t("skill.runSafetyAssessment", "立即检查")}
              </button>
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.platformSkillPaths", "平台目标目录")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.platformSkillPathsDesc",
              "为每个 AI 工具覆写默认 Skill 目录。这里会同时影响扫描、分发、卸载和安装状态检测。",
            )}
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {SKILL_PLATFORMS.map((platform) => {
              const overridePath =
                settings.customSkillPlatformPaths[platform.id] || "";

              return (
                <div
                  key={platform.id}
                  className="px-3 py-3 border-b border-border/70 last:border-0 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <PlatformIcon platformId={platform.id} size={16} />
                    <span className="text-sm font-medium text-foreground">
                      {platform.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.defaultPathLabel", "默认路径")}:
                    <span className="ml-1 font-mono">
                      {platform.skillsDir[currentPlatformKey]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={overridePath}
                      onChange={(e) =>
                        settings.setCustomSkillPlatformPath(
                          platform.id,
                          e.target.value,
                        )
                      }
                      placeholder={t(
                        "settings.platformSkillPathPlaceholder",
                        "留空则使用默认路径，例如 ~/.trae-cn/skills",
                      )}
                      className="flex-1 h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                    />
                    <button
                      onClick={() =>
                        settings.resetCustomSkillPlatformPath(platform.id)
                      }
                      disabled={!overridePath}
                      className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground transition-colors"
                    >
                      {t("settings.resetPlatformSkillPath", "恢复默认")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.extraSkillScanPaths", "额外扫描目录")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.extraSkillScanPathsDesc",
              "添加额外的 Skill 目录用于导入和发现。这里不会覆盖平台默认目录。",
            )}
          </p>
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
          {settings.customSkillScanPaths.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              {settings.customSkillScanPaths.map((path, idx) => (
                <div
                  key={`${path}-${idx}`}
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
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">
              {t("settings.noCustomPaths", "暂未添加自定义路径")}
            </p>
          )}
        </div>
      </SettingSection>

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
