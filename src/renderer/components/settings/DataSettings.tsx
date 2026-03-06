import { useState, useEffect } from "react";
import {
  FolderIcon,
  CloudIcon,
  UploadIcon,
  DownloadIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  TrashIcon,
  Loader2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  downloadBackup,
  downloadCompressedBackup,
  downloadSelectiveExport,
  restoreFromFile,
} from "../../services/database-backup";
import { clearDatabase } from "../../services/database";
import {
  testConnection,
  uploadToWebDAV,
  downloadFromWebDAV,
} from "../../services/webdav";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { Select } from "../ui/Select";
import { Checkbox } from "../ui";
import {
  SettingSection,
  SettingItem,
  ToggleSwitch,
  PasswordInput,
} from "./shared";

/**
 * DataSettings — Data management tab
 * Handles: data path, WebDAV sync, backup/restore, clear data
 * 数据管理标签页：数据路径、WebDAV 同步、备份/恢复、清除数据
 */
export function DataSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const settings = useSettingsStore();

  // WebDAV operation state
  // WebDAV 操作状态
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavUploading, setWebdavUploading] = useState(false);
  const [webdavDownloading, setWebdavDownloading] = useState(false);

  // Export/backup options
  // 数据导出/备份选项
  const [exportScope, setExportScope] = useState({
    prompts: true,
    folders: true,
    images: true,
    aiConfig: true,
    settings: true,
    versions: false,
    skills: true,
  });

  // Clear data confirm modal
  // 清除数据确认弹窗
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPwd, setClearPwd] = useState("");
  const [clearLoading, setClearLoading] = useState(false);

  // Security status for clear-data flow (independent from SecuritySettings)
  // 清除数据流程需要的安全状态（独立于 SecuritySettings）
  const [securityConfigured, setSecurityConfigured] = useState(false);

  useEffect(() => {
    window.api?.security?.status().then((status) => {
      setSecurityConfigured(status.configured);
    });
  }, []);

  const handleSelectiveExport = async () => {
    try {
      await downloadSelectiveExport(exportScope);
      showToast(t("toast.exportSuccess"), "success");
    } catch (error) {
      console.error("Selective export failed:", error);
      showToast(t("toast.exportFailed"), "error");
    }
  };

  const handleFullBackup = async (compressed: boolean) => {
    try {
      if (compressed) {
        await downloadCompressedBackup();
      } else {
        await downloadBackup();
      }
      showToast(t("toast.exportSuccess"), "success");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast(t("toast.exportFailed"), "error");
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.phub,.gz";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await restoreFromFile(file);
          showToast(t("toast.importSuccess"), "success");
          setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
          console.error("Import failed:", error);
          showToast(t("toast.importFailed"), "error");
        }
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    // If master password is configured, require verification first
    // 如果已设置主密码，需要先验证
    if (securityConfigured) {
      setShowClearConfirm(true);
      return;
    }
    // If master password is not configured, prompt to set it first
    // 未设置主密码时，提示需要先设置
    showToast(
      t("settings.clearNeedPassword") ||
        "Clearing data is a high-risk operation, please set a master password in security settings first",
      "error",
    );
  };

  const handleConfirmClear = async () => {
    if (!clearPwd) {
      showToast(
        t("settings.enterPassword") || "Please enter master password",
        "error",
      );
      return;
    }

    setClearLoading(true);
    try {
      // Verify password
      // 验证密码
      const result = await window.api.security.unlock(clearPwd);
      if (!result.success) {
        showToast(t("settings.wrongPassword") || "Wrong password", "error");
        setClearLoading(false);
        return;
      }

      // Password verified; proceed to clear
      // 密码正确，执行清除
      await clearDatabase();
      showToast(t("toast.clearSuccess"), "success");
      setShowClearConfirm(false);
      setClearPwd("");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Clear failed:", error);
      showToast(t("toast.clearFailed"), "error");
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <SettingSection title={t("settings.dataPath")}>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FolderIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t("settings.dataPath")}</p>
                <button
                  onClick={() => window.electron?.openPath?.(settings.dataPath)}
                  className="text-xs text-primary font-mono mt-0.5 hover:underline flex items-center gap-1 cursor-pointer"
                  title={t("settings.openFolder")}
                >
                  {settings.dataPath}
                  <ExternalLinkIcon className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={async () => {
                  const newPath = await window.electron?.selectFolder?.();
                  if (newPath) {
                    // Confirm migration
                    // 确认迁移
                    const confirmed = window.confirm(
                      t(
                        "settings.confirmDataMigration",
                        "Are you sure you want to migrate data to the new directory?\n\nRestart is required after migration.",
                      ),
                    );
                    if (!confirmed) return;

                    // Execute migration
                    // 执行迁移
                    const result =
                      await window.electron?.migrateData?.(newPath);
                    if (result?.success) {
                      settings.setDataPath(newPath);
                      showToast(
                        t("toast.dataPathChanged") +
                          " " +
                          t("settings.restartRequired", "Please restart app"),
                        "success",
                      );
                      // Prompt for restart
                      // 提示重启
                      setTimeout(() => {
                        if (
                          window.confirm(
                            t(
                              "settings.restartNow",
                              "Data migration completed. Restart app now?",
                            ),
                          )
                        ) {
                          window.location.reload();
                        }
                      }, 1000);
                    } else {
                      showToast(
                        t(
                          "toast.dataPathChangeFailed",
                          "Data migration failed",
                        ) +
                          ": " +
                          (result?.error || ""),
                        "error",
                      );
                    }
                  }
                }}
                className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
              >
                {t("settings.change")}
              </button>
            </div>
          </div>
        </SettingSection>

        <SettingSection title={t("settings.webdav")}>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <CloudIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("settings.webdavEnabled")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.webdavEnabledDesc")}
                </p>
              </div>
              <ToggleSwitch
                checked={settings.webdavEnabled}
                onChange={settings.setWebdavEnabled}
              />
            </div>
            {settings.webdavEnabled && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUrl")}
                  </label>
                  <input
                    type="text"
                    placeholder="https://dav.example.com/path"
                    value={settings.webdavUrl}
                    onChange={(e) => settings.setWebdavUrl(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUsername")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.webdavUsername")}
                    value={settings.webdavUsername}
                    onChange={(e) => settings.setWebdavUsername(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavPassword")}
                  </label>
                  <PasswordInput
                    placeholder={t("settings.webdavPassword")}
                    value={settings.webdavPassword}
                    onChange={settings.setWebdavPassword}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavTesting(true);
                      try {
                        const result = await testConnection({
                          url: settings.webdavUrl,
                          username: settings.webdavUsername,
                          password: settings.webdavPassword,
                        });
                        showToast(
                          result.success
                            ? t("toast.connectionSuccess")
                            : t("toast.connectionFailed"),
                          result.success ? "success" : "error",
                        );
                      } finally {
                        setWebdavTesting(false);
                      }
                    }}
                    disabled={webdavTesting}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCwIcon
                      className={`w-4 h-4 ${webdavTesting ? "animate-spin" : ""}`}
                    />
                    {t("settings.testConnection")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavUploading(true);
                      try {
                        const result = await uploadToWebDAV(
                          {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          {
                            includeImages: settings.webdavIncludeImages,
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        );
                        showToast(
                          result.success ? result.message : result.message,
                          result.success ? "success" : "error",
                        );
                      } finally {
                        setWebdavUploading(false);
                      }
                    }}
                    disabled={webdavUploading}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <UploadIcon className="w-4 h-4" />
                    {t("settings.upload")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavDownloading(true);
                      try {
                        const result = await downloadFromWebDAV(
                          {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          {
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        );
                        if (result.success) {
                          showToast(result.message, "success");
                          setTimeout(() => window.location.reload(), 1000);
                        } else {
                          showToast(result.message, "error");
                        }
                      } finally {
                        setWebdavDownloading(false);
                      }
                    }}
                    disabled={webdavDownloading}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    {t("settings.download")}
                  </button>
                </div>

                {/* 自动运行（定时同步） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavAutoRun", "自动运行")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavAutoRunDesc")}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <Select
                      value={String(settings.webdavAutoSyncInterval)}
                      onChange={(val) =>
                        settings.setWebdavAutoSyncInterval(Number(val))
                      }
                      options={[
                        { value: "0", label: t("common.off", "关闭") },
                        {
                          value: "5",
                          label: t("settings.every5min", "每 5 分钟"),
                        },
                        {
                          value: "15",
                          label: t("settings.every15min", "每 15 分钟"),
                        },
                        {
                          value: "30",
                          label: t("settings.every30min", "每 30 分钟"),
                        },
                        {
                          value: "60",
                          label: t("settings.every60min", "每 60 分钟"),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 启动后自动运行一次 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnStartup", "启动后自动运行一次")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnStartupDesc")}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      value={String(
                        settings.webdavSyncOnStartup
                          ? settings.webdavSyncOnStartupDelay
                          : -1,
                      )}
                      onChange={(val) => {
                        const num = Number(val);
                        if (num === -1) {
                          settings.setWebdavSyncOnStartup(false);
                        } else {
                          settings.setWebdavSyncOnStartup(true);
                          settings.setWebdavSyncOnStartupDelay(num);
                        }
                      }}
                      options={[
                        { value: "-1", label: t("common.off", "关闭") },
                        {
                          value: "0",
                          label: t(
                            "settings.startupImmediate",
                            "启动后立即运行",
                          ),
                        },
                        {
                          value: "5",
                          label: t(
                            "settings.startupDelay5s",
                            "启动后第 5 秒运行一次",
                          ),
                        },
                        {
                          value: "10",
                          label: t(
                            "settings.startupDelay10s",
                            "启动后第 10 秒运行一次",
                          ),
                        },
                        {
                          value: "30",
                          label: t(
                            "settings.startupDelay30s",
                            "启动后第 30 秒运行一次",
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 保存时同步（实验性质） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnSave", "保存时同步（实验性质）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnSaveDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavSyncOnSave}
                    onChange={settings.setWebdavSyncOnSave}
                  />
                </div>

                {/* 包含图片 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncludeImages", "包含图片")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncludeImagesDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavIncludeImages}
                    onChange={settings.setWebdavIncludeImages}
                  />
                </div>

                {/* 增量同步 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncrementalSync", "增量同步")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncrementalSyncDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavIncrementalSync}
                    onChange={settings.setWebdavIncrementalSync}
                  />
                </div>

                {/* 加密备份（实验性） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavEncryption", "加密备份（实验性）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 text-amber-500">
                      {t("settings.webdavEncryptionDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavEncryptionEnabled}
                    onChange={settings.setWebdavEncryptionEnabled}
                  />
                </div>

                {/* 加密密码输入框 */}
                {settings.webdavEncryptionEnabled && (
                  <div className="pt-2">
                    <PasswordInput
                      placeholder={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "输入加密密码（可选）",
                      )}
                      value={settings.webdavEncryptionPassword}
                      onChange={settings.setWebdavEncryptionPassword}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingSection>

        <SettingSection title={t("settings.backup")}>
          {/* 选择性导出（只导出） */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.selectiveExport", "选择性导出")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.selectiveExportDesc",
                    "按需导出指定数据（仅导出，不提供导入）",
                  )}
                </div>
              </div>
              <button
                onClick={handleSelectiveExport}
                className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("settings.export", "导出")}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(
                [
                  {
                    key: "prompts",
                    label: t("settings.exportPrompts", "Prompts"),
                  },
                  {
                    key: "folders",
                    label: t("settings.exportFolders", "文件夹"),
                  },
                  {
                    key: "images",
                    label: t("settings.exportImages", "图片"),
                  },
                  {
                    key: "aiConfig",
                    label: t("settings.exportAiConfig", "AI 配置"),
                  },
                  {
                    key: "settings",
                    label: t("settings.exportSettings", "系统设置"),
                  },
                  {
                    key: "versions",
                    label: t("settings.exportVersions", "版本历史"),
                  },
                  {
                    key: "skills",
                    label: t("settings.exportSkills", "Skills"),
                  },
                ] as const
              ).map((item) => {
                const checked = (exportScope as any)[item.key] as boolean;
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                    onClick={() =>
                      setExportScope((prev) => ({
                        ...prev,
                        [item.key]: !checked,
                      }))
                    }
                  >
                    <div className="pointer-events-none">
                      <Checkbox checked={checked} onChange={() => {}} />
                    </div>
                    <span className="text-sm">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 全量备份/恢复 */}
          <div className="p-4 space-y-3 border-t border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.fullBackup", "全量备份 / 恢复")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.fullBackupDesc",
                    "用于迁移/跨设备恢复：包含 prompts、图片、AI 配置、系统设置",
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFullBackup(true)}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  title={t("settings.backupCompressed", "压缩备份")}
                >
                  {t("settings.backupCompressed", "压缩备份")}
                </button>
                <button
                  onClick={handleImportBackup}
                  className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {t("settings.restore", "恢复")}
                </button>
              </div>
            </div>
          </div>

          <SettingItem
            label={t("settings.clear")}
            description={t("settings.clearDesc")}
          >
            <button
              onClick={handleClearData}
              className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              {t("settings.clear")}
            </button>
          </SettingItem>
        </SettingSection>

        <SettingSection title={t("settings.dbInfo")}>
          <div className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• IndexedDB</p>
            <p>• PromptHubDB</p>
          </div>
        </SettingSection>
      </div>

      {/* Clear data confirm modal / 清除数据确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[400px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-500">
                  {t("settings.dangerOperation") || "危险操作"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("settings.clearDesc")}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                {t("settings.enterMasterPassword") || "请输入主密码确认"}
              </label>
              <PasswordInput
                value={clearPwd}
                onChange={setClearPwd}
                placeholder={
                  t("settings.masterPasswordPlaceholder") || "输入主密码"
                }
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearPwd("");
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                disabled={clearLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={clearLoading || !clearPwd}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearLoading ? (
                  <Loader2Icon className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  t("settings.confirmClear") || "确认清除"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
