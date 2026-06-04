import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  DownloadIcon,
  CheckIcon,
  GlobeIcon,
  TagIcon,
  Loader2Icon,
  TrashIcon,
  LanguagesIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { SkillIcon } from "./SkillIcon";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type {
  RegistrySkill,
  Skill,
  SkillSafetyReport,
} from "@prompthub/shared/types";
import { SKILL_CATEGORIES } from "@prompthub/shared/constants/skill-registry";
import {
  formatSkillInstallError,
  formatSkillSafetyScanError,
  formatSkillTranslationError,
  getErrorMessage,
  groupSkillSafetyFindings,
  getSafetyScanAIConfig,
  renderImmersiveSegments,
  resolveSkillDescription,
  stripFrontmatter,
} from "./detail-utils";
import {
  computeSkillContentFingerprint,
  findInstalledRegistrySkill,
} from "../../services/skill-store-update";
import { isLikelyLocalSource } from "../../services/skill-store-source";
import {
  isSkillTranslationStale,
  readSkillTranslationSidecar,
  writeSkillTranslationSidecar,
  type SkillTranslationSidecar,
} from "../../services/skill-translation-sidecar";
import {
  getSkillSafetyFindingTitle,
  getSkillSafetyLevelLabel,
  getSkillSafetyMethodDescription,
  getSkillSafetySummary,
} from "./safety-i18n";
import { SkillMarkdown } from "./SkillMarkdown";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import {
  buildSkillVariantBadges,
  inferSkillVariantSourceDebugLabel,
} from "../../services/skill-variant-badges";

function humanizeCategory(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasUnreliableStoreCategory(
  skill: RegistrySkill,
  storeLabel?: string,
): boolean {
  const sourceText = [
    storeLabel,
    skill.source_label,
    skill.source_url,
    skill.store_url,
    skill.content_url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return sourceText.includes("skills.sh") || sourceText.includes("clawhub");
}

interface SkillStoreDetailProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  storeLabel?: string;
  isInstalling?: boolean;
  onInstallPendingChange?: (skill: RegistrySkill, pending: boolean) => void;
  onClose: () => void;
}

/**
 * Skill Store Detail Modal
 * 技能商店详情弹窗
 */
export function SkillStoreDetail({
  skill,
  isInstalled,
  storeLabel,
  isInstalling: externalIsInstalling = false,
  onInstallPendingChange,
  onClose,
}: SkillStoreDetailProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const installRegistrySkill = useSkillStore(
    (state) => state.installRegistrySkill,
  );
  const updateRegistrySkill = useSkillStore(
    (state) => state.updateRegistrySkill,
  );
  const getRegistrySkillUpdateStatus = useSkillStore(
    (state) => state.getRegistrySkillUpdateStatus,
  );
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const uninstallRegistrySkill = useSkillStore(
    (state) => state.uninstallRegistrySkill,
  );
  const skills = useSkillStore((state) => state.skills);
  const saveSafetyReport = useSkillStore((state) => state.saveSafetyReport);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslationState = useSkillStore(
    (state) => state.getTranslationState,
  );
  const clearTranslation = useSkillStore((state) => state.clearTranslation);
  const translationMode = useSettingsStore((state) => state.translationMode);
  const autoScanBeforeInstall = useSettingsStore(
    (state) => state.autoScanStoreSkillsBeforeInstall,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);
  const [localIsInstalling, setLocalIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [justUninstalled, setJustUninstalled] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [safetyReport, setSafetyReport] = useState<SkillSafetyReport | null>(
    null,
  );
  const [pendingHighRiskInstallReport, setPendingHighRiskInstallReport] =
    useState<SkillSafetyReport | null>(null);
  const groupedSafetyFindings = safetyReport
    ? groupSkillSafetyFindings(safetyReport.findings ?? [])
    : [];
  const [showTranslation, setShowTranslation] = useState(false);
  const [showRetranslatePrompt, setShowRetranslatePrompt] = useState(false);
  const [deploySkill, setDeploySkill] = useState<Skill | null>(null);
  const stalePromptFingerprintRef = useRef<string | null>(null);
  const [translationSidecar, setTranslationSidecar] =
    useState<SkillTranslationSidecar | null>(null);
  const skillSourceKey = skill.source_id || skill.slug || skill.source_url;

  const targetLang = useMemo(() => {
    const lang = (i18n.language || "").toLowerCase();
    return lang.startsWith("zh")
      ? "中文"
      : lang.startsWith("ja")
        ? "日本語"
        : lang.startsWith("ko")
          ? "한국어"
          : "English";
  }, [i18n.language]);
  const isZh = i18n.language?.startsWith("zh");
  const categoryLabel = useMemo(() => {
    if (!skill.category || hasUnreliableStoreCategory(skill, storeLabel)) {
      return null;
    }
    const category =
      SKILL_CATEGORIES[skill.category as keyof typeof SKILL_CATEGORIES];
    if (category) {
      return isZh ? category.label : category.labelEn;
    }
    return humanizeCategory(String(skill.category));
  }, [isZh, skill, skill.category, storeLabel]);

  const installedSkill = findInstalledRegistrySkill(skills, skill);
  const installedSkillMdContent =
    installedSkill?.instructions || installedSkill?.content || "";
  const registrySkillMdContent =
    typeof skill.content === "string" ? skill.content : "";
  const preferSourceContent = Boolean(
    skill.content_url && isLikelyLocalSource(skill.content_url),
  );
  const originalSkillMdContent =
    (preferSourceContent
      ? registrySkillMdContent.trim()
      : installedSkillMdContent.trim()) ||
    (preferSourceContent
      ? installedSkillMdContent.trim()
      : registrySkillMdContent.trim()) ||
    skill.description;
  const translationCacheKey = `storedoc_v2_${skill.slug}_${targetLang}_${translationMode}`;
  const translationFingerprint = useMemo(
    () => computeSkillContentFingerprint(originalSkillMdContent),
    [originalSkillMdContent],
  );
  const translationState = getTranslationState(
    translationCacheKey,
    translationFingerprint,
  );
  const hasStaleTranslation = translationSidecar
    ? isSkillTranslationStale(translationSidecar, originalSkillMdContent)
    : translationState.isStale;
  const cachedTranslation = hasStaleTranslation
    ? null
    : (translationSidecar?.content ?? translationState.value);
  const effectiveSkillMdContent =
    showTranslation && cachedTranslation
      ? cachedTranslation
      : originalSkillMdContent;
  const effectiveRenderedContent = useMemo(
    () => stripFrontmatter(effectiveSkillMdContent),
    [effectiveSkillMdContent],
  );
  const translatedRenderedContent = useMemo(
    () => (cachedTranslation ? stripFrontmatter(cachedTranslation) : null),
    [cachedTranslation],
  );
  const resolvedDescription = useMemo(
    () => resolveSkillDescription(effectiveSkillMdContent) || skill.description,
    [effectiveSkillMdContent, skill.description],
  );
  const installed = isInstalled || justInstalled;
  const isInstalling = externalIsInstalling || localIsInstalling;
  const canShowUpdateActions =
    installed && Boolean(skill.content_url || skill.content);
  const canApplyStoreUpdate = updateStatus === "update-available";
  const canOverwriteLocalChanges =
    updateStatus === "conflict" || updateStatus === "local-modified";
  const installableSkill = useMemo(
    () => ({
      ...skill,
      source_label: storeLabel || skill.source_label,
    }),
    [skill, storeLabel],
  );
  const variantBadges = useMemo(() => {
    const badges = buildSkillVariantBadges(skill, t, {
      hasUpdate: updateStatus === "update-available",
      isInstalled: installed,
    });
    if (!storeLabel) {
      return badges;
    }

    const branchBadges = badges.filter(
      (badge) =>
        badge.tone === "branch" ||
        badge.tone === "dev" ||
        badge.tone === "stable",
    );

    return [
      {
        key: "store-source",
        label: storeLabel,
        title: skill.source_label || skill.source_url,
        tone: badges[0]?.tone || "git",
      },
      ...branchBadges,
      ...badges.filter(
        (badge) => badge.tone === "installed" || badge.tone === "update",
      ),
    ];
  }, [installed, skill, storeLabel, t, updateStatus]);

  const setInstallPending = useCallback(
    (pending: boolean) => {
      setLocalIsInstalling(pending);
      onInstallPendingChange?.(skill, pending);
    },
    [onInstallPendingChange, skill],
  );
  const sourceDebugLabel = useMemo(
    () => inferSkillVariantSourceDebugLabel(skill),
    [skill],
  );

  const scanSafety = useCallback(async () => {
    setIsScanningSafety(true);
    try {
      const report = await window.api.skill.scanSafety({
        name: skill.name,
        content: installedSkillMdContent || skill.content,
        sourceUrl: skill.source_url,
        contentUrl: skill.content_url,
        localRepoPath: installedSkill?.local_repo_path,
        securityAudits: skill.security_audits,
        aiConfig: getSafetyScanAIConfig(aiModels),
      });
      setSafetyReport(report);
      // If already installed, persist to DB
      if (installedSkill) {
        try {
          await saveSafetyReport(installedSkill.id, report);
        } catch (err) {
          console.warn("Failed to persist store safety report:", err);
        }
      }
      return report;
    } catch (error: unknown) {
      showToast(formatSkillSafetyScanError(error, t), "error");
      return null;
    } finally {
      setIsScanningSafety(false);
    }
  }, [
    aiModels,
    installedSkill,
    installedSkillMdContent,
    saveSafetyReport,
    showToast,
    skill.content,
    skill.content_url,
    skill.name,
    skill.security_audits,
    skill.source_url,
    t,
  ]);

  const handleTranslate = async () => {
    if (cachedTranslation) {
      setShowTranslation(!showTranslation);
      return;
    }
    setIsTranslating(true);
    try {
      const translated = await translateContent(
        originalSkillMdContent,
        translationCacheKey,
        targetLang,
        {
          sourceFingerprint: translationFingerprint,
        },
      );

      if (!translated) {
        throw new Error("TRANSLATION_EMPTY");
      }

      if (installedSkill && originalSkillMdContent.trim()) {
        const sidecar = await writeSkillTranslationSidecar({
          skillId: installedSkill.id,
          sourceContent: originalSkillMdContent,
          translatedContent: translated,
          targetLanguage: targetLang,
          translationMode,
        });
        setTranslationSidecar(sidecar);
      }

      setShowTranslation(true);
      showToast(t("skill.translateSuccess", "Translation complete"), "success");
    } catch (error: unknown) {
      showToast(formatSkillTranslationError(error, t), "error");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRefreshTranslation = async () => {
    setIsTranslating(true);
    try {
      clearTranslation(translationCacheKey);
      const translated = await translateContent(
        originalSkillMdContent,
        translationCacheKey,
        targetLang,
        {
          forceRefresh: true,
          sourceFingerprint: translationFingerprint,
        },
      );

      if (!translated) {
        throw new Error("TRANSLATION_EMPTY");
      }

      if (installedSkill && originalSkillMdContent.trim()) {
        const sidecar = await writeSkillTranslationSidecar({
          skillId: installedSkill.id,
          sourceContent: originalSkillMdContent,
          translatedContent: translated,
          targetLanguage: targetLang,
          translationMode,
        });
        setTranslationSidecar(sidecar);
      }

      setShowTranslation(true);
      setShowRetranslatePrompt(false);
      showToast(
        t("skill.translateRefreshed", "Translation refreshed"),
        "success",
      );
    } catch (error: unknown) {
      showToast(formatSkillTranslationError(error, t), "error");
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    stalePromptFingerprintRef.current = null;
    setShowRetranslatePrompt(false);
    setTranslationSidecar(null);
  }, [skill.slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadTranslationSidecar() {
      if (!installedSkill) {
        setTranslationSidecar(null);
        return;
      }

      try {
        const sidecar = await readSkillTranslationSidecar(
          installedSkill.id,
          targetLang,
          translationMode,
        );
        if (!cancelled) {
          setTranslationSidecar(sidecar);
        }
      } catch {
        if (!cancelled) {
          setTranslationSidecar(null);
        }
      }
    }

    void loadTranslationSidecar();

    return () => {
      cancelled = true;
    };
  }, [installedSkill?.id, targetLang, translationMode]);

  useEffect(() => {
    setShowTranslation(Boolean(cachedTranslation));
  }, [cachedTranslation]);

  useEffect(() => {
    if (!hasStaleTranslation) {
      stalePromptFingerprintRef.current = null;
      return;
    }

    setShowTranslation(false);
    if (stalePromptFingerprintRef.current === translationFingerprint) {
      return;
    }

    stalePromptFingerprintRef.current = translationFingerprint;
    setShowRetranslatePrompt(true);
  }, [hasStaleTranslation, translationFingerprint]);

  const handleInstall = async () => {
    if (isInstalling || installed) {
      return;
    }
    setInstallPending(true);
    try {
      const performInstall = async () => {
        const result = await installRegistrySkill(installableSkill);
        if (result) {
          setJustInstalled(true);
          showToast(
            t("skill.addedToLibrary", "Added") + `: ${skill.name}`,
            "success",
          );
          setDeploySkill(result);
          setTimeout(() => setJustInstalled(false), 2000);
        }
      };

      if (autoScanBeforeInstall) {
        const report = await scanSafety();
        const shouldBlockInstall = report?.level === "blocked";
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
        if (report?.level === "high-risk") {
          setPendingHighRiskInstallReport(report);
          return;
        }
      }

      await performInstall();
    } catch (e) {
      showToast(formatSkillInstallError(e, t), "error");
    } finally {
      setInstallPending(false);
    }
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    try {
      const success = await uninstallRegistrySkill(skillSourceKey);
      if (success) {
        setJustUninstalled(true);
        showToast(
          t("skill.uninstallSuccess", "Uninstall successful") +
            `: ${skill.name}`,
          "success",
        );
        setTimeout(() => {
          setJustUninstalled(false);
          onClose();
        }, 1000);
      }
    } catch (e) {
      showToast(t("skill.updateFailed", "Failed") + `: ${e}`, "error");
    } finally {
      setIsUninstalling(false);
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const check = await getRegistrySkillUpdateStatus(skill);
      setUpdateStatus(check.status);
      const message =
        check.status === "update-available"
          ? t("skill.updateAvailable", "Update available")
          : check.status === "conflict"
            ? t(
                "skill.updateConflict",
                "Local changes conflict with the store update",
              )
            : check.status === "local-modified"
              ? t("skill.localModified", "Local changes detected")
              : check.status === "up-to-date"
                ? t("skill.upToDate", "Already up to date")
                : t("skill.notInstalled", "Not installed");
      showToast(
        message,
        check.status === "update-available" ? "success" : "info",
      );
    } catch (error) {
      showToast(
        `${t("skill.updateCheckFailed", "Update check failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleUpdate = async (overwriteLocalChanges = false) => {
    setIsUpdating(true);
    try {
      const result = await updateRegistrySkill(skillSourceKey, {
        overwriteLocalChanges,
      });
      if (!result) {
        showToast(t("skill.updateFailed", "Failed"), "error");
        return;
      }
      setUpdateStatus(result.status);
      if (result.status === "updated") {
        showToast(
          `${t("skill.updateSuccess", "Updated")}: ${skill.name}`,
          "success",
        );
        return;
      }
      if (result.status === "conflict" || result.status === "local-modified") {
        showToast(
          t(
            "skill.updateConflict",
            "Local changes conflict with the store update",
          ),
          "warning",
        );
        return;
      }
      if (result.status === "up-to-date") {
        showToast(t("skill.upToDate", "Already up to date"), "info");
      }
    } catch (error) {
      showToast(
        `${t("skill.updateFailed", "Failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenInstalledSkill = () => {
    if (!installedSkill) {
      return;
    }
    setStoreView("my-skills");
    selectSkill(installedSkill.id);
    onClose();
  };

  const footerButtonBase =
    "h-10 inline-flex items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 active:scale-press-in";
  const footerButtonNeutral = `${footerButtonBase} border-border bg-background/70 text-foreground hover:bg-muted/70`;
  const footerButtonPrimary = `${footerButtonBase} border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/15 hover:bg-primary/90`;
  const footerButtonDanger = `${footerButtonBase} border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10`;
  const footerStatusImported =
    "h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] app-wallpaper-panel-strong border border-border rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-base">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-border shrink-0">
          <SkillIcon
            iconUrl={skill.icon_url}
            iconEmoji={skill.icon_emoji}
            backgroundColor={skill.icon_background}
            name={skill.name}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">
              {skill.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {resolvedDescription}
            </p>
            <SkillVariantBadgeList
              badges={variantBadges}
              className="mt-2 flex flex-wrap gap-1.5"
            />
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <GlobeIcon className="w-3 h-3" />
                {skill.author}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
          {/* Translate button */}
          <div className="flex items-center justify-end mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showTranslation && cachedTranslation
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                {isTranslating ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LanguagesIcon className="w-3.5 h-3.5" />
                )}
                {isTranslating
                  ? t("skill.translating", "Translating...")
                  : showTranslation && cachedTranslation
                    ? t("skill.showOriginal", "Show Original")
                    : cachedTranslation
                      ? t("skill.showTranslation", "Show Translation")
                      : t("skill.translate", "AI Translate")}
              </button>
              {cachedTranslation && (
                <button
                  onClick={handleRefreshTranslation}
                  disabled={isTranslating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title={t("skill.refreshTranslation", "Refresh Translation")}
                >
                  <RefreshCwIcon
                    className={`w-3.5 h-3.5 ${isTranslating ? "animate-spin" : ""}`}
                  />
                  {t("skill.refreshTranslation", "Refresh Translation")}
                </button>
              )}
            </div>
          </div>

          {/* SKILL.md content rendered as markdown */}
          {(() => {
            if (showTranslation && translatedRenderedContent) {
              // Immersive mode: interleaved original + translation
              if (translationMode === "immersive") {
                const segments = renderImmersiveSegments(
                  translatedRenderedContent,
                );
                return (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                    <div className="markdown-body">
                      {segments.map((seg, i) =>
                        seg.type === "translation" ? (
                          <div
                            key={i}
                            className="border-l-2 border-primary/40 pl-3 my-1 text-primary/70 text-[12px] italic"
                          >
                            <SkillMarkdown
                              content={seg.text}
                              sourceUrl={skill.source_url}
                              contentUrl={skill.content_url}
                            />
                          </div>
                        ) : (
                          <SkillMarkdown
                            key={i}
                            content={seg.text}
                            sourceUrl={skill.source_url}
                            contentUrl={skill.content_url}
                          />
                        ),
                      )}
                    </div>
                  </div>
                );
              }
              // Full mode: show translated text only
              return (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                  <div className="markdown-body">
                    <SkillMarkdown
                      content={translatedRenderedContent}
                      sourceUrl={skill.source_url}
                      contentUrl={skill.content_url}
                    />
                  </div>
                </div>
              );
            }

            return (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                <div className="markdown-body">
                  <SkillMarkdown
                    content={effectiveRenderedContent}
                    sourceUrl={skill.source_url}
                    contentUrl={skill.content_url}
                  />
                </div>
              </div>
            );
          })()}

          {/* Prerequisites */}
          {skill.prerequisites && skill.prerequisites.length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">
                {t("skill.prerequisites", "Prerequisites")}
              </h4>
              <ul className="space-y-1">
                {skill.prerequisites.map((prereq, i) => (
                  <li
                    key={i}
                    className="text-xs text-foreground/80 flex items-start gap-2"
                  >
                    <span className="text-amber-500 mt-0.5">•</span>
                    {prereq}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta info */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {skill.weekly_installs && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.weeklyInstalls", "Weekly Installs")}
                </span>
                <div className="mt-1 text-xs text-foreground">
                  {skill.weekly_installs}
                </div>
              </div>
            )}

            {skill.github_stars && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.githubStars", "GitHub Stars")}
                </span>
                <div className="mt-1 text-xs text-foreground">
                  {skill.github_stars}
                </div>
              </div>
            )}

            {/* Source */}
            {skill.source_url && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.source", "Source")}
                </span>
                {sourceDebugLabel ? (
                  <div className="mt-1 text-[11px] text-foreground truncate">
                    {sourceDebugLabel}
                  </div>
                ) : null}
                <a
                  href={skill.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-primary hover:underline mt-1 truncate"
                >
                  {skill.source_url.replace("https://github.com/", "")}
                </a>
              </div>
            )}

            {skill.store_url && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.storePage", "Store Page")}
                </span>
                <a
                  href={skill.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-primary hover:underline mt-1 truncate"
                >
                  {skill.store_url.replace("https://", "")}
                </a>
              </div>
            )}

            {/* Compatibility */}
            {skill.compatibility && skill.compatibility.length > 0 && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.compatibility", "Compatible with")}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {skill.compatibility.map((platform) => (
                    <span
                      key={platform}
                      className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize"
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="col-span-2 p-3 bg-accent/30 rounded-xl border border-border">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {safetyReport?.level === "safe" ? (
                    <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : safetyReport ? (
                    <ShieldAlertIcon className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <ShieldAlertIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {t("skill.safetyAssessment", "Safety")}
                  </span>
                  {safetyReport && (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        safetyReport.level === "safe"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : safetyReport.level === "blocked"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {getSkillSafetyLevelLabel(t, safetyReport.level)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => void scanSafety()}
                  disabled={isScanningSafety}
                  className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  {isScanningSafety
                    ? t("skill.safetyScanning", "Scanning...")
                    : t("skill.runSafetyAssessment", "Run Scan")}
                </button>
              </div>
              {safetyReport && (
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  {getSkillSafetySummary(t, safetyReport)}
                </p>
              )}
              {safetyReport && (
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  {getSkillSafetyMethodDescription(t, safetyReport)}
                </p>
              )}
              {groupedSafetyFindings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {groupedSafetyFindings.slice(0, 3).map((finding) => (
                    <li
                      key={`${finding.code}-${finding.filePaths[0] || finding.evidences[0] || ""}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      • {getSkillSafetyFindingTitle(t, finding)}
                      {finding.count > 1 ? ` × ${finding.count}` : ""}
                      {finding.filePaths[0] ? ` · ${finding.filePaths[0]}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {skill.security_audits && skill.security_audits.length > 0 && (
            <div className="mt-4 p-3 bg-accent/30 rounded-xl border border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t("skill.securityAudits", "Security Audits")}
              </span>
              <div className="mt-2 space-y-1">
                {skill.security_audits.map((audit) => (
                  <div key={audit} className="text-xs text-foreground/80">
                    {audit}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <TagIcon className="w-3 h-3 text-muted-foreground" />
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-accent px-2 py-0.5 rounded-full text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            {categoryLabel && (
              <span>{`${t("skill.category", "Category")}${isZh ? "：" : ": "}${categoryLabel}`}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {installed && !justUninstalled ? (
              <>
                {canShowUpdateActions && (
                  <>
                    <button
                      onClick={handleCheckUpdate}
                      disabled={isCheckingUpdate || isUpdating}
                      className={footerButtonNeutral}
                    >
                      {isCheckingUpdate ? (
                        <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="w-3.5 h-3.5" />
                      )}
                      {t(
                        updateStatus
                          ? "skill.recheckUpdate"
                          : "skill.checkUpdate",
                        updateStatus ? "Recheck update" : "Check update",
                      )}
                    </button>
                    {canApplyStoreUpdate && (
                      <button
                        onClick={() => handleUpdate(false)}
                        disabled={isCheckingUpdate || isUpdating}
                        className={footerButtonPrimary}
                      >
                        {isUpdating ? (
                          <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <DownloadIcon className="w-3.5 h-3.5" />
                        )}
                        {t("skill.update", "Update")}
                      </button>
                    )}
                    {canOverwriteLocalChanges && (
                      <button
                        onClick={() => handleUpdate(true)}
                        disabled={isUpdating}
                        className={`${footerButtonBase} border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300`}
                      >
                        {t(
                          "skill.overwriteLocalChanges",
                          "Overwrite local changes",
                        )}
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={handleUninstall}
                  disabled={isUninstalling}
                  className={footerButtonDanger}
                >
                  {isUninstalling ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <TrashIcon className="w-3.5 h-3.5" />
                  )}
                  {t("skill.removeFromLibrary", "Remove")}
                </button>
                {installedSkill ? (
                  <button
                    type="button"
                    onClick={handleOpenInstalledSkill}
                    className={`${footerStatusImported} transition-colors hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300`}
                    aria-label={t("skill.openInMySkills", "Open in My Skills")}
                    title={t("skill.openInMySkills", "Open in My Skills")}
                  >
                    <CheckIcon className="w-4 h-4" />
                    {t("skill.addedToLibrary", "Added")}
                  </button>
                ) : (
                  <div className={footerStatusImported}>
                    <CheckIcon className="w-4 h-4" />
                    {t("skill.addedToLibrary", "Added")}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className={`${footerButtonPrimary} px-5`}
              >
                {isInstalling ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    {t("skill.adding", "Adding...")}
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-4 h-4" />
                    {t("skill.addToLibrary", "Add to Library")}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Deploy to Platforms modal — auto-shown after adding from store */}
      {deploySkill && (
        <SkillQuickInstall
          skill={deploySkill}
          onClose={() => setDeploySkill(null)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingHighRiskInstallReport)}
        onClose={() => setPendingHighRiskInstallReport(null)}
        onConfirm={() => {
          const run = async () => {
            if (!pendingHighRiskInstallReport) return;
            setPendingHighRiskInstallReport(null);
            setInstallPending(true);
            try {
              const result = await installRegistrySkill(installableSkill);
              if (result) {
                setJustInstalled(true);
                showToast(
                  t("skill.addedToLibrary", "Added") + `: ${skill.name}`,
                  "success",
                );
                setDeploySkill(result);
                setTimeout(() => setJustInstalled(false), 2000);
              }
            } catch (error) {
              showToast(formatSkillInstallError(error, t), "error");
            } finally {
              setInstallPending(false);
            }
          };

          void run();
        }}
        title={t("skill.safetyHighRiskTitle", "High-Risk Skill Detected")}
        message={
          pendingHighRiskInstallReport ? (
            <div className="space-y-3 text-left">
              <p>{pendingHighRiskInstallReport.summary}</p>
              <ul className="space-y-1">
                {pendingHighRiskInstallReport.findings
                  .slice(0, 5)
                  .map((finding) => (
                    <li
                      key={`${finding.code}-${finding.filePath || finding.evidence || ""}`}
                    >
                      • {getSkillSafetyFindingTitle(t, finding)}
                      {finding.filePath ? ` · ${finding.filePath}` : ""}
                    </li>
                  ))}
              </ul>
              <p className="text-xs opacity-80">
                {t(
                  "skill.safetyHighRiskConfirm",
                  "If you trust the source, you may proceed. Otherwise, review the source code first.",
                )}
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmText={t("skill.addAnyway", "Add Anyway")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />
      <ConfirmDialog
        isOpen={showRetranslatePrompt}
        onClose={() => setShowRetranslatePrompt(false)}
        onConfirm={() => {
          setShowRetranslatePrompt(false);
          void handleRefreshTranslation();
        }}
        title={t(
          "skill.translationOutdatedTitle",
          "Saved translation is outdated",
        )}
        message={t(
          "skill.translationOutdatedMessage",
          "This skill's SKILL.md changed after the last translation. Retranslate now?",
        )}
        confirmText={t("skill.retranslateNow", "Retranslate now")}
        cancelText={t("common.cancel", "Cancel")}
      />
    </div>
  );
}
