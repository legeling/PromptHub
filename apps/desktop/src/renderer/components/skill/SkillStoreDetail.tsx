import { runSkillContentSafetyScan } from "../../services/skill-content-scan";
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
import type {
  CloudStorePackageResponse,
  RegistrySkill,
  Skill,
  SkillSafetyReport,
  SkillStoreSource,
  SkillUpdateSafetyReview,
} from "@prompthub/shared/types";
import {
  formatSkillInstallError,
  formatSkillPackageOperationError,
  formatSkillSafetyScanError,
  formatSkillTranslationError,
  getErrorMessage,
  groupSkillSafetyFindings,
  getSafetyScanAIConfig,
  resolveSkillExternalUrl,
  resolveSkillDescription,
  stripFrontmatter,
} from "./detail-utils";
import {
  computeSkillContentFingerprint,
  findInstalledRegistrySkill,
  type RegistrySkillUpdateCheck,
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
import { SkillStoreDetailMarkdown } from "./SkillStoreDetailMarkdown";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import { CloudStoreEngagement } from "./CloudStoreEngagement";
import { SkillStoreDetailOverlays } from "./SkillStoreDetailOverlays";
import { useSkillPackageInstall } from "./useSkillPackageInstall";
import { formatSkillSourceUnavailableMessage } from "./skill-source-update-diagnostics";
import {
  buildSkillVariantBadges,
  inferSkillVariantSourceDebugLabel,
} from "../../services/skill-variant-badges";
import {
  getCloudStorePackage,
  isCloudRegistrySkill,
} from "../../services/cloud-store";
import { resolveRegistrySkillContent } from "../../stores/skill/skill-source-update-workflow";
import {
  getSkillTranslationTargetLanguage,
  getVisibleSkillCategoryLabel,
  SKILL_STORE_DETAIL_FOOTER_STYLES,
} from "./skill-store-presentation";

interface SkillStoreDetailProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  storeLabel?: string;
  storeSourceId?: string;
  storeSourceType?: SkillStoreSource["type"];
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
  storeSourceId,
  storeSourceType,
  isInstalling: externalIsInstalling = false,
  onInstallPendingChange,
  onClose,
}: SkillStoreDetailProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const installOperation = useSkillPackageInstall();
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
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scanEnabled = useSettingsStore((state) => state.skillSafetyScanEnabled);
  const trustSkillUpdateSource = useSettingsStore(
    (state) => state.trustSkillUpdateSource,
  );
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
  const [pendingInstallContent, setPendingInstallContent] = useState("");
  const [pendingInstallPackage, setPendingInstallPackage] =
    useState<CloudStorePackageResponse | null>(null);
  const [showInstallReview, setShowInstallReview] = useState(false);
  const [pendingUpdateCheck, setPendingUpdateCheck] =
    useState<RegistrySkillUpdateCheck | null>(null);
  const [pendingUpdatePackage, setPendingUpdatePackage] =
    useState<CloudStorePackageResponse | null>(null);
  const [showUpdateReview, setShowUpdateReview] = useState(false);
  const [overwritePendingUpdate, setOverwritePendingUpdate] = useState(false);
  const [pendingSafetyReview, setPendingSafetyReview] = useState<{
    review: SkillUpdateSafetyReview;
    overwrite: boolean;
  } | null>(null);
  const [trustReviewedSource, setTrustReviewedSource] = useState(false);
  const [cloudPackage, setCloudPackage] =
    useState<CloudStorePackageResponse | null>(null);
  const [cloudPackageLoading, setCloudPackageLoading] = useState(false);
  const groupedSafetyFindings = safetyReport
    ? groupSkillSafetyFindings(safetyReport.findings ?? [])
    : [];
  const [showTranslation, setShowTranslation] = useState(false);
  const [showRetranslatePrompt, setShowRetranslatePrompt] = useState(false);
  const [deploySkill, setDeploySkill] = useState<Skill | null>(null);
  const stalePromptFingerprintRef = useRef<string | null>(null);
  const installFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const uninstallCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const installInFlightRef = useRef(false);
  const uninstallInFlightRef = useRef(false);
  const updateCheckInFlightRef = useRef(false);
  const updateInFlightRef = useRef(false);
  const translationInFlightRef = useRef(false);
  const safetyScanInFlightRef =
    useRef<Promise<SkillSafetyReport | null> | null>(null);
  const [translationSidecar, setTranslationSidecar] =
    useState<SkillTranslationSidecar | null>(null);
  const skillSourceKey = skill.source_id || skill.slug || skill.source_url;
  const effectiveStoreSourceId = storeSourceId || skill.source_id || "official";
  const cloudSourceId = skill.source_id;
  const isCloudSkill = isCloudRegistrySkill(skill);
  const safeSourceUrl = resolveSkillExternalUrl(skill.source_url);
  const safeStoreUrl = resolveSkillExternalUrl(skill.store_url);

  useEffect(() => {
    let cancelled = false;
    setCloudPackage(null);
    if (!isCloudSkill) {
      setCloudPackageLoading(false);
      return;
    }
    setCloudPackageLoading(true);
    void getCloudStorePackage({ source_id: cloudSourceId })
      .then((packageResponse) => {
        if (!cancelled) setCloudPackage(packageResponse);
      })
      .catch(() => {
        if (!cancelled) setCloudPackage(null);
      })
      .finally(() => {
        if (!cancelled) setCloudPackageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudSourceId, isCloudSkill]);

  const targetLang = useMemo(
    () => getSkillTranslationTargetLanguage(i18n.language),
    [i18n.language],
  );
  const isZh = i18n.language?.startsWith("zh");
  const categoryLabel = useMemo(
    () => getVisibleSkillCategoryLabel(skill, storeLabel, Boolean(isZh)),
    [isZh, skill, storeLabel],
  );

  const installedSkill = findInstalledRegistrySkill(skills, skill);
  const installedSkillMdContent =
    installedSkill?.instructions || installedSkill?.content || "";
  const registrySkillMdContent =
    cloudPackage?.package.files.find(
      (file) => file.path.toLowerCase() === "skill.md",
    )?.content || (typeof skill.content === "string" ? skill.content : "");
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
    installed && (isCloudSkill || Boolean(skill.content_url || skill.content));
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

  const scanSafety = useCallback(() => {
    if (safetyScanInFlightRef.current) {
      return safetyScanInFlightRef.current;
    }

    let scanPromise: Promise<SkillSafetyReport | null>;
    scanPromise = (async () => {
      setIsScanningSafety(true);
      try {
        const report = await runSkillContentSafetyScan({
          name: skill.name,
          content: installedSkillMdContent || registrySkillMdContent,
          sourceUrl: isCloudSkill ? undefined : skill.source_url,
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
        if (safetyScanInFlightRef.current === scanPromise) {
          safetyScanInFlightRef.current = null;
          setIsScanningSafety(false);
        }
      }
    })();
    safetyScanInFlightRef.current = scanPromise;
    return scanPromise;
  }, [
    aiModels,
    installedSkill,
    installedSkillMdContent,
    isCloudSkill,
    registrySkillMdContent,
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
    if (translationInFlightRef.current) {
      return;
    }
    translationInFlightRef.current = true;
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
      translationInFlightRef.current = false;
      setIsTranslating(false);
    }
  };

  const handleRefreshTranslation = async () => {
    if (translationInFlightRef.current) {
      return;
    }
    translationInFlightRef.current = true;
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
      translationInFlightRef.current = false;
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    stalePromptFingerprintRef.current = null;
    setShowRetranslatePrompt(false);
    setTranslationSidecar(null);
    setPendingUpdateCheck(null);
    setPendingUpdatePackage(null);
    setShowUpdateReview(false);
    setPendingSafetyReview(null);
    setPendingInstallContent("");
    setPendingInstallPackage(null);
    setShowInstallReview(false);
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

  const clearInstallFeedbackTimer = useCallback(() => {
    if (installFeedbackTimerRef.current) {
      clearTimeout(installFeedbackTimerRef.current);
      installFeedbackTimerRef.current = null;
    }
  }, []);

  const clearUninstallCloseTimer = useCallback(() => {
    if (uninstallCloseTimerRef.current) {
      clearTimeout(uninstallCloseTimerRef.current);
      uninstallCloseTimerRef.current = null;
    }
  }, []);

  const scheduleInstallFeedbackReset = useCallback(() => {
    clearInstallFeedbackTimer();
    installFeedbackTimerRef.current = setTimeout(() => {
      setJustInstalled(false);
      installFeedbackTimerRef.current = null;
    }, 2000);
  }, [clearInstallFeedbackTimer]);

  const scheduleUninstallClose = useCallback(() => {
    clearUninstallCloseTimer();
    uninstallCloseTimerRef.current = setTimeout(() => {
      setJustUninstalled(false);
      uninstallCloseTimerRef.current = null;
      onClose();
    }, 1000);
  }, [clearUninstallCloseTimer, onClose]);

  useEffect(() => {
    return () => {
      clearInstallFeedbackTimer();
      clearUninstallCloseTimer();
    };
  }, [clearInstallFeedbackTimer, clearUninstallCloseTimer]);

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
    if (isInstalling || installed || installInFlightRef.current) {
      return;
    }
    installInFlightRef.current = true;
    setInstallPending(true);
    try {
      const packageResponse = isCloudSkill
        ? await getCloudStorePackage(installableSkill)
        : null;
      const content = packageResponse
        ? packageResponse.package.files.find(
            (file) => file.path.toLowerCase() === "skill.md",
          )?.content || ""
        : await resolveRegistrySkillContent(installableSkill);
      if (!content.trim()) {
        throw new Error("STORE_SKILL_CONTENT_EMPTY");
      }

      setPendingInstallContent(content);
      setPendingInstallPackage(packageResponse);
      setShowInstallReview(true);
    } catch (e) {
      showToast(formatSkillInstallError(e, t), "error");
    } finally {
      installInFlightRef.current = false;
      setInstallPending(false);
    }
  };

  const markInstallComplete = (installedSkill: Skill) => {
    setShowInstallReview(false);
    setJustInstalled(true);
    setDeploySkill(installedSkill);
    showToast(
      t("skill.addedToLibrary", "Added") + `: ${skill.name}`,
      "success",
    );
    scheduleInstallFeedbackReset();
  };

  const handleConfirmInstall = async () => {
    if (installed || installInFlightRef.current) return;
    installInFlightRef.current = true;
    setInstallPending(true);
    try {
      if (pendingInstallContent) {
        const latestPackage = isCloudSkill
          ? await getCloudStorePackage(installableSkill)
          : null;
        const latestContent = latestPackage
          ? latestPackage.package.files.find(
              (file) => file.path.toLowerCase() === "skill.md",
            )?.content || ""
          : await resolveRegistrySkillContent(installableSkill);
        const releaseChanged = Boolean(
          latestPackage &&
          pendingInstallPackage &&
          latestPackage.release.id !== pendingInstallPackage.release.id,
        );
        if (releaseChanged || latestContent !== pendingInstallContent) {
          setPendingInstallContent(latestContent);
          setPendingInstallPackage(latestPackage);
          showToast(
            t(
              "skill.installReviewChanged",
              "The source changed while you were reviewing. Please review the latest preview again.",
            ),
            "warning",
          );
          return;
        }
      }
      const result = await installOperation.install(installableSkill, {});
      if (result?.status === "safety-review-required") {
        setShowInstallReview(false);
        return;
      }
      if (result?.status === "installed") {
        markInstallComplete(result.skill);
      }
    } catch (error) {
      showToast(formatSkillInstallError(error, t), "error");
    } finally {
      installInFlightRef.current = false;
      setInstallPending(false);
    }
  };

  const handleConfirmInstallSafetyReview = async () => {
    if (installInFlightRef.current) return;
    installInFlightRef.current = true;
    setInstallPending(true);
    try {
      const result = await installOperation.confirmReview();
      if (result?.status !== "installed") return;
      markInstallComplete(result.skill);
    } catch (error) {
      showToast(formatSkillInstallError(error, t), "error");
    } finally {
      installInFlightRef.current = false;
      setInstallPending(false);
    }
  };

  const handleUninstall = async () => {
    if (isUninstalling || uninstallInFlightRef.current) {
      return;
    }
    uninstallInFlightRef.current = true;
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
        scheduleUninstallClose();
      }
    } catch (e) {
      showToast(t("skill.updateFailed", "Failed") + `: ${e}`, "error");
    } finally {
      uninstallInFlightRef.current = false;
      setIsUninstalling(false);
    }
  };

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate || isUpdating || updateCheckInFlightRef.current) {
      return;
    }
    updateCheckInFlightRef.current = true;
    setIsCheckingUpdate(true);
    try {
      const check = await getRegistrySkillUpdateStatus(skill);
      setUpdateStatus(check.status);
      setPendingUpdateCheck(check);
      setPendingUpdatePackage(null);
      let message = t("skill.notInstalled", "Not installed");
      if (check.status === "update-available") {
        message = t("skill.updateAvailable", "Update available");
      } else if (check.status === "conflict") {
        message = t(
          "skill.updateConflict",
          "Local changes conflict with the store update",
        );
      } else if (check.status === "local-modified") {
        message = t("skill.localModified", "Local changes detected");
      } else if (check.status === "baseline-missing") {
        message = t(
          "skill.sourceUpdateBaselineMissing",
          "Unable to reconcile history. Keep local changes as a baseline, reset from source, or detach the source binding.",
        );
      } else if (check.status === "source-unavailable") {
        message = formatSkillSourceUnavailableMessage(check, t);
      } else if (check.status === "no-source") {
        message = t("skill.sourceUpdateNoSource", "This Skill is local only.");
      } else if (check.status === "up-to-date") {
        message = t("skill.upToDate", "Already up to date");
      }

      const needsReview = [
        "update-available",
        "local-modified",
        "conflict",
      ].includes(check.status);
      if (needsReview) {
        if (isCloudSkill && check.registrySkill.source_id) {
          try {
            const packageResponse = await getCloudStorePackage({
              source_id: check.registrySkill.source_id,
            });
            setPendingUpdatePackage(packageResponse);
          } catch (error) {
            showToast(
              `${t("skill.updatePreviewFailed", "Could not load the update preview")}: ${getErrorMessage(error)}`,
              "warning",
            );
          }
        }
        setOverwritePendingUpdate(check.status !== "update-available");
        setShowUpdateReview(true);
      }
      showToast(
        message,
        check.status === "update-available"
          ? "success"
          : check.status === "source-unavailable"
            ? "error"
            : "info",
      );
    } catch (error) {
      showToast(
        `${t("skill.updateCheckFailed", "Update check failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      updateCheckInFlightRef.current = false;
      setIsCheckingUpdate(false);
    }
  };

  const handleUpdate = async (
    overwriteLocalChanges = false,
    approvedPackageFingerprint?: string,
  ): Promise<boolean> => {
    if (isUpdating || updateInFlightRef.current) {
      return false;
    }
    updateInFlightRef.current = true;
    setIsUpdating(true);
    try {
      const result = await updateRegistrySkill(skillSourceKey, {
        overwriteLocalChanges,
        ...(approvedPackageFingerprint ? { approvedPackageFingerprint } : {}),
      });
      if (!result) {
        showToast(t("skill.updateFailed", "Failed"), "error");
        return false;
      }
      if (result.status === "safety-review-required") {
        setPendingSafetyReview({
          review: result.review,
          overwrite: overwriteLocalChanges,
        });
        setTrustReviewedSource(false);
        return false;
      }
      if (result.status === "linked-local-blocked") {
        setUpdateStatus(result.check.status);
        showToast(
          t(
            "skill.linkedLocalUpdateBlocked",
            "This Skill is linked to an external folder. Convert it to a managed copy before updating from source, or update the external folder manually.",
          ),
          "warning",
        );
        return false;
      }
      setUpdateStatus(result.status);
      if (result.status === "updated") {
        setShowUpdateReview(false);
        setPendingUpdateCheck(null);
        showToast(
          `${t("skill.updateSuccess", "Updated")}: ${skill.name}`,
          "success",
        );
        return true;
      }
      if (result.status === "conflict" || result.status === "local-modified") {
        showToast(
          t(
            "skill.updateConflict",
            "Local changes conflict with the store update",
          ),
          "warning",
        );
        return false;
      }
      if (result.status === "up-to-date") {
        showToast(t("skill.upToDate", "Already up to date"), "info");
      }
      return false;
    } catch (error) {
      showToast(
        `${t("skill.updateFailed", "Failed")}: ${formatSkillPackageOperationError(error, t)}`,
        "error",
      );
      return false;
    } finally {
      updateInFlightRef.current = false;
      setIsUpdating(false);
    }
  };

  const handleOpenUpdateReview = (overwriteLocalChanges: boolean) => {
    if (pendingUpdateCheck) {
      setOverwritePendingUpdate(overwriteLocalChanges);
      setShowUpdateReview(true);
      return;
    }
    void handleCheckUpdate();
  };

  const handleConfirmSafetyReview = async () => {
    if (!pendingSafetyReview || isUpdating) return;
    const pending = pendingSafetyReview;
    setPendingSafetyReview(null);
    const succeeded = await handleUpdate(
      pending.overwrite,
      pending.review.packageFingerprint,
    );
    if (succeeded && trustReviewedSource) {
      trustSkillUpdateSource(pending.review.sourceKey);
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
                <GlobeIcon aria-hidden="true" className="w-3 h-3" />
                {skill.author}
              </div>
            </div>
            {isCloudSkill && <CloudStoreEngagement slug={skill.slug} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
          >
            <XIcon aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
          {/* Translate button */}
          <div className="flex items-center justify-end mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTranslate}
                disabled={isTranslating}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showTranslation && cachedTranslation
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                {isTranslating ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="w-3.5 h-3.5 animate-spin"
                  />
                ) : (
                  <LanguagesIcon aria-hidden="true" className="w-3.5 h-3.5" />
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
                  type="button"
                  onClick={handleRefreshTranslation}
                  disabled={isTranslating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title={t("skill.refreshTranslation", "Refresh Translation")}
                  aria-label={t(
                    "skill.refreshTranslation",
                    "Refresh Translation",
                  )}
                >
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 ${isTranslating ? "animate-spin" : ""}`}
                  />
                  {t("skill.refreshTranslation", "Refresh Translation")}
                </button>
              )}
            </div>
          </div>

          {/* SKILL.md content rendered as markdown */}
          {cloudPackageLoading && isCloudSkill && !registrySkillMdContent && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              {t("skill.loadingCloudPackage", "Loading the latest package...")}
            </div>
          )}
          <SkillStoreDetailMarkdown
            contentUrl={skill.content_url}
            effectiveContent={effectiveRenderedContent}
            showTranslation={showTranslation}
            sourceUrl={skill.source_url}
            translatedContent={translatedRenderedContent}
            translationMode={translationMode}
          />

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
                {safeSourceUrl ? (
                  <a
                    href={safeSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-primary hover:underline mt-1 truncate"
                  >
                    {skill.source_url.replace("https://github.com/", "")}
                  </a>
                ) : (
                  <div className="mt-1 truncate text-xs text-foreground">
                    {skill.source_url}
                  </div>
                )}
              </div>
            )}

            {skill.store_url && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t("skill.storePage", "Store Page")}
                </span>
                {safeStoreUrl ? (
                  <a
                    href={safeStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-primary hover:underline mt-1 truncate"
                  >
                    {skill.store_url.replace("https://", "")}
                  </a>
                ) : (
                  <div className="mt-1 truncate text-xs text-foreground">
                    {skill.store_url}
                  </div>
                )}
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
                    <ShieldCheckIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                  ) : safetyReport ? (
                    <ShieldAlertIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 shrink-0 text-amber-500"
                    />
                  ) : (
                    <ShieldAlertIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                    />
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
                  type="button"
                  onClick={() => void scanSafety()}
                  title={
                    !scanEnabled ? t("settings.contentScanDisabled") : undefined
                  }
                  disabled={isScanningSafety || !scanEnabled}
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
                      type="button"
                      onClick={handleCheckUpdate}
                      disabled={isCheckingUpdate || isUpdating}
                      className={SKILL_STORE_DETAIL_FOOTER_STYLES.neutral}
                    >
                      {isCheckingUpdate ? (
                        <Loader2Icon
                          aria-hidden="true"
                          className="w-3.5 h-3.5 animate-spin"
                        />
                      ) : (
                        <RefreshCwIcon
                          aria-hidden="true"
                          className="w-3.5 h-3.5"
                        />
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
                        type="button"
                        onClick={() => handleOpenUpdateReview(false)}
                        disabled={isCheckingUpdate || isUpdating}
                        className={SKILL_STORE_DETAIL_FOOTER_STYLES.primary}
                      >
                        {isUpdating ? (
                          <Loader2Icon
                            aria-hidden="true"
                            className="w-3.5 h-3.5 animate-spin"
                          />
                        ) : (
                          <DownloadIcon
                            aria-hidden="true"
                            className="w-3.5 h-3.5"
                          />
                        )}
                        {t("skill.reviewUpdate", "Review update")}
                      </button>
                    )}
                    {canOverwriteLocalChanges && (
                      <button
                        type="button"
                        onClick={() => handleOpenUpdateReview(true)}
                        disabled={isUpdating}
                        className={`${SKILL_STORE_DETAIL_FOOTER_STYLES.buttonBase} border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300`}
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
                  type="button"
                  onClick={handleUninstall}
                  disabled={isUninstalling}
                  className={SKILL_STORE_DETAIL_FOOTER_STYLES.danger}
                >
                  {isUninstalling ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 animate-spin"
                    />
                  ) : (
                    <TrashIcon aria-hidden="true" className="w-3.5 h-3.5" />
                  )}
                  {t("skill.removeFromLibrary", "Remove")}
                </button>
                {installedSkill ? (
                  <button
                    type="button"
                    onClick={handleOpenInstalledSkill}
                    className={`${SKILL_STORE_DETAIL_FOOTER_STYLES.imported} transition-colors hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300`}
                    aria-label={t("skill.openInMySkills", "Open in My Skills")}
                    title={t("skill.openInMySkills", "Open in My Skills")}
                  >
                    <CheckIcon aria-hidden="true" className="w-4 h-4" />
                    {t("skill.addedToLibrary", "Added")}
                  </button>
                ) : (
                  <div className={SKILL_STORE_DETAIL_FOOTER_STYLES.imported}>
                    <CheckIcon aria-hidden="true" className="w-4 h-4" />
                    {t("skill.addedToLibrary", "Added")}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className={`${SKILL_STORE_DETAIL_FOOTER_STYLES.primary} px-5`}
              >
                {isInstalling ? (
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="w-4 h-4 animate-spin"
                    />
                    {t("skill.adding", "Adding...")}
                  </>
                ) : (
                  <>
                    <DownloadIcon aria-hidden="true" className="w-4 h-4" />
                    {t("skill.addToLibrary", "Add to Library")}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <SkillStoreDetailOverlays
        t={t}
        deploySkill={deploySkill}
        onCloseDeploy={() => setDeploySkill(null)}
        updateCheck={showUpdateReview ? pendingUpdateCheck : null}
        updateCloudDiff={pendingUpdatePackage?.release.diff}
        overwriteLocalChanges={overwritePendingUpdate}
        isUpdating={isUpdating}
        onCloseUpdatePreview={() => {
          if (!isUpdating) setShowUpdateReview(false);
        }}
        onConfirmUpdatePreview={() => void handleUpdate(overwritePendingUpdate)}
        installSkill={showInstallReview ? installableSkill : null}
        installContent={pendingInstallContent}
        installCloudDiff={pendingInstallPackage?.release.diff}
        isInstalling={isInstalling}
        onCloseInstallPreview={() => {
          if (!isInstalling) setShowInstallReview(false);
        }}
        onConfirmInstallPreview={() => void handleConfirmInstall()}
        installPackageReview={{
          review: installOperation.pendingReview?.review ?? null,
          trustSource: installOperation.trustReviewedSource,
          isLoading: installOperation.isConfirmingReview,
          onTrustSourceChange: installOperation.setTrustReviewedSource,
          onClose: installOperation.closeReview,
          onConfirm: () => void handleConfirmInstallSafetyReview(),
        }}
        updatePackageReview={{
          review: pendingSafetyReview?.review ?? null,
          trustSource: trustReviewedSource,
          isLoading: isUpdating,
          onTrustSourceChange: setTrustReviewedSource,
          onClose: () => {
            if (!isUpdating) setPendingSafetyReview(null);
          },
          onConfirm: () => void handleConfirmSafetyReview(),
        }}
        showRetranslatePrompt={showRetranslatePrompt}
        onCloseRetranslate={() => setShowRetranslatePrompt(false)}
        onConfirmRetranslate={() => {
          setShowRetranslatePrompt(false);
          void handleRefreshTranslation();
        }}
      />
    </div>
  );
}
