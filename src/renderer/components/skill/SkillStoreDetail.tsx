import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, DownloadIcon, CheckIcon, GlobeIcon, TagIcon, Loader2Icon, TrashIcon, LanguagesIcon, RefreshCwIcon, ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { useSkillStore } from '../../stores/skill.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { SkillQuickInstall } from './SkillQuickInstall';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { RegistrySkill, Skill, SkillSafetyReport } from '../../../shared/types';
import { getErrorMessage, renderImmersiveSegments, stripFrontmatter } from './detail-utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface SkillStoreDetailProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  onClose: () => void;
}

/**
 * Skill Store Detail Modal
 * 技能商店详情弹窗
 */
export function SkillStoreDetail({ skill, isInstalled, onClose }: SkillStoreDetailProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const installFromRegistry = useSkillStore((state) => state.installFromRegistry);
  const uninstallRegistrySkill = useSkillStore((state) => state.uninstallRegistrySkill);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslation = useSkillStore((state) => state.getTranslation);
  const clearTranslation = useSkillStore((state) => state.clearTranslation);
  const translationMode = useSettingsStore((state) => state.translationMode);
  const autoScanBeforeInstall = useSettingsStore((state) => state.autoScanStoreSkillsBeforeInstall);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [justUninstalled, setJustUninstalled] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [safetyReport, setSafetyReport] = useState<SkillSafetyReport | null>(null);
  const [pendingHighRiskInstallReport, setPendingHighRiskInstallReport] = useState<SkillSafetyReport | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [deploySkill, setDeploySkill] = useState<Skill | null>(null);

  const targetLang = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return lang.startsWith('zh') ? '中文' : lang.startsWith('ja') ? '日本語' : lang.startsWith('ko') ? '한국어' : 'English';
  }, [i18n.language]);

  const translationCacheKey = `store_${skill.slug}_${targetLang}_${translationMode}`;
  const cachedTranslation = getTranslation(translationCacheKey);
  const safetyTone =
    safetyReport?.level === 'blocked'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : safetyReport?.level === 'high-risk'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
        : safetyReport?.level === 'warn'
          ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';

  const scanSafety = useCallback(async () => {
    setIsScanningSafety(true);
    try {
      const report = await window.api.skill.scanSafety({
        name: skill.name,
        content: skill.content,
        sourceUrl: skill.source_url,
        contentUrl: skill.content_url,
        securityAudits: skill.security_audits,
      });
      setSafetyReport(report);
      return report;
    } catch (error: unknown) {
      showToast(`${t('skill.safetyScanFailed', 'Safety scan failed')}: ${getErrorMessage(error)}`, 'error');
      return null;
    } finally {
      setIsScanningSafety(false);
    }
  }, [
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
      const body = stripFrontmatter(skill.content);
      const textToTranslate = body.length > 0 ? body : skill.description;
      await translateContent(textToTranslate, translationCacheKey, targetLang);
      setShowTranslation(true);
      showToast(t('skill.translateSuccess', 'Translation complete'), 'success');
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
        showToast(t('skill.aiNotConfigured', 'Please configure AI model in Settings first'), 'error');
      } else {
        showToast(`${t('skill.translateFailed', 'Translation failed')}: ${getErrorMessage(error)}`, 'error');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRefreshTranslation = async () => {
    setIsTranslating(true);
    try {
      clearTranslation(translationCacheKey);
      const body = stripFrontmatter(skill.content);
      const textToTranslate = body.length > 0 ? body : skill.description;
      await translateContent(textToTranslate, translationCacheKey, targetLang, { forceRefresh: true });
      setShowTranslation(true);
      showToast(t('skill.translateRefreshed', 'Translation refreshed'), 'success');
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
        showToast(t('skill.aiNotConfigured', 'Please configure AI model in Settings first'), 'error');
      } else {
        showToast(`${t('skill.translateFailed', 'Translation failed')}: ${getErrorMessage(error)}`, 'error');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleInstall = async () => {
    if (isInstalling || installed) {
      return;
    }
    setIsInstalling(true);
    try {
      const performInstall = async () => {
        const result = await installFromRegistry(skill.slug);
        if (result) {
          setJustInstalled(true);
          showToast(t('skill.addedToLibrary', 'Added') + `: ${skill.name}`, 'success');
          setDeploySkill(result);
          setTimeout(() => setJustInstalled(false), 2000);
        }
      };

      if (autoScanBeforeInstall) {
        const report = await scanSafety();
        if (report?.level === 'blocked') {
          showToast(
            t(
              'skill.safetyScanBlockedInstall',
              'This skill was flagged as high risk. Review the safety report before adding it.',
            ),
            'error',
          );
          return;
        }
        if (report?.level === 'high-risk') {
          setPendingHighRiskInstallReport(report);
          return;
        }
      }

      await performInstall();
    } catch (e) {
      showToast(t('skill.updateFailed', 'Failed') + `: ${e}`, 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    try {
      const success = await uninstallRegistrySkill(skill.slug);
      if (success) {
        setJustUninstalled(true);
        showToast(t('skill.uninstallSuccess', 'Uninstall successful') + `: ${skill.name}`, 'success');
        setTimeout(() => {
          setJustUninstalled(false);
          onClose();
        }, 1000);
      }
    } catch (e) {
      showToast(t('skill.updateFailed', 'Failed') + `: ${e}`, 'error');
    } finally {
      setIsUninstalling(false);
    }
  };

  const installed = isInstalled || justInstalled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
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
            <h2 className="text-base font-bold text-foreground">{skill.name}</h2>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                v{skill.version}
              </span>
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
                    ? 'bg-primary/10 text-primary'
                    : 'bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground'
                } disabled:opacity-50`}
              >
                {isTranslating ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LanguagesIcon className="w-3.5 h-3.5" />
                )}
                {isTranslating
                  ? t('skill.translating', 'Translating...')
                  : showTranslation && cachedTranslation
                    ? t('skill.showOriginal', 'Show Original')
                    : cachedTranslation
                      ? t('skill.showTranslation', 'Show Translation')
                      : t('skill.translate', 'AI Translate')}
              </button>
              {cachedTranslation && (
                <button
                  onClick={handleRefreshTranslation}
                  disabled={isTranslating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title={t('skill.refreshTranslation', '刷新翻译')}
                >
                  <RefreshCwIcon className={`w-3.5 h-3.5 ${isTranslating ? 'animate-spin' : ''}`} />
                  {t('skill.refreshTranslation', '刷新翻译')}
                </button>
              )}
            </div>
          </div>

          {/* SKILL.md content rendered as markdown */}
          {(() => {
            const body = stripFrontmatter(skill.content);
            const originalContent = body.length > 0 ? body : skill.description;

            if (showTranslation && cachedTranslation) {
              // Immersive mode: interleaved original + translation
              if (translationMode === 'immersive') {
                const segments = renderImmersiveSegments(cachedTranslation);
                return (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                    <div className="markdown-body">
                      {segments.map((seg, i) =>
                        seg.type === 'translation' ? (
                          <div key={i} className="border-l-2 border-primary/40 pl-3 my-1 text-primary/70 text-[12px] italic">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                              {seg.text}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                            {seg.text}
                          </ReactMarkdown>
                        )
                      )}
                    </div>
                  </div>
                );
              }
              // Full mode: show translated text only
              return (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {cachedTranslation}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }

            return (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-foreground/80 prose-p:text-[13px] prose-strong:text-foreground prose-li:text-foreground/80 prose-li:text-[13px] prose-code:text-primary prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {originalContent}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })()}

          {/* Prerequisites */}
          {skill.prerequisites && skill.prerequisites.length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">
                {t('skill.prerequisites', 'Prerequisites')}
              </h4>
              <ul className="space-y-1">
                {skill.prerequisites.map((prereq, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
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
                  {t('skill.weeklyInstalls', 'Weekly Installs')}
                </span>
                <div className="mt-1 text-xs text-foreground">{skill.weekly_installs}</div>
              </div>
            )}

            {skill.github_stars && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('skill.githubStars', 'GitHub Stars')}
                </span>
                <div className="mt-1 text-xs text-foreground">{skill.github_stars}</div>
              </div>
            )}

            {/* Source */}
            {skill.source_url && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('skill.source', 'Source')}</span>
                <a
                  href={skill.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-primary hover:underline mt-1 truncate"
                >
                  {skill.source_url.replace('https://github.com/', '')}
                </a>
              </div>
            )}

            {skill.store_url && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('skill.storePage', 'Store Page')}
                </span>
                <a
                  href={skill.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-primary hover:underline mt-1 truncate"
                >
                  {skill.store_url.replace('https://', '')}
                </a>
              </div>
            )}

            {/* Compatibility */}
            {skill.compatibility && skill.compatibility.length > 0 && (
              <div className="p-3 bg-accent/30 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('skill.compatibility', 'Compatible with')}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {skill.compatibility.map((platform) => (
                    <span key={platform} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize">
                      {platform}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {skill.security_audits && skill.security_audits.length > 0 && (
            <div className="mt-4 p-3 bg-accent/30 rounded-xl border border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('skill.securityAudits', 'Security Audits')}
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

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {t('skill.safetyAssessment', '安全评估')}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    'skill.safetyAssessmentDesc',
                    '手动检查这个 Skill 的来源、脚本行为和可疑文件；商店默认不会自动检查。',
                  )}
                </p>
              </div>
              <button
                onClick={() => void scanSafety()}
                disabled={isScanningSafety}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
              >
                {isScanningSafety
                  ? t('skill.safetyScanning', '检查中...')
                  : t('skill.runSafetyAssessment', '立即检查')}
              </button>
            </div>

            {safetyReport && (
              <div className={`mt-3 rounded-xl border p-3 ${safetyTone}`}>
                <div className="flex items-start gap-2">
                  {safetyReport.level === 'safe' ? (
                    <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {t('skill.safetyLevelLabel', '风险级别')}: {safetyReport.level}
                    </div>
                    <p className="mt-1 text-xs opacity-90">
                      {safetyReport.summary}
                    </p>
                    {safetyReport.findings.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs opacity-90">
                        {safetyReport.findings.slice(0, 4).map((finding) => (
                          <li key={`${finding.code}-${finding.filePath || finding.evidence || ''}`}>
                            • {finding.title}
                            {finding.filePath ? ` · ${finding.filePath}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <TagIcon className="w-3 h-3 text-muted-foreground" />
              {skill.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-accent px-2 py-0.5 rounded-full text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            {skill.category && (
              <span className="capitalize">{skill.category}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {installed && !justUninstalled ? (
              <>
                <button
                  onClick={handleUninstall}
                  disabled={isUninstalling}
                  className="px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUninstalling ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <TrashIcon className="w-3.5 h-3.5" />
                  )}
                  {t('skill.removeFromLibrary', 'Remove')}
                </button>
                <div className="px-4 py-2 bg-green-500/10 text-green-500 rounded-xl text-sm font-bold flex items-center gap-2">
                  <CheckIcon className="w-4 h-4" />
                  {t('skill.addedToLibrary', 'Added')}
                </div>
              </>
            ) : (
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 active:scale-95"
              >
                {isInstalling ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    {t('skill.adding', 'Adding...')}
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-4 h-4" />
                    {t('skill.addToLibrary', 'Add to Library')}
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
            setIsInstalling(true);
            try {
              const result = await installFromRegistry(skill.slug);
              if (result) {
                setJustInstalled(true);
                showToast(t('skill.addedToLibrary', 'Added') + `: ${skill.name}`, 'success');
                setDeploySkill(result);
                setTimeout(() => setJustInstalled(false), 2000);
              }
            } catch (error) {
              showToast(t('skill.updateFailed', 'Failed') + `: ${error}`, 'error');
            } finally {
              setIsInstalling(false);
            }
          };

          void run();
        }}
        title={t('skill.safetyHighRiskTitle', '检测到高风险 Skill')}
        message={
          pendingHighRiskInstallReport ? (
            <div className="space-y-3 text-left">
              <p>{pendingHighRiskInstallReport.summary}</p>
              <ul className="space-y-1">
                {pendingHighRiskInstallReport.findings.slice(0, 5).map((finding) => (
                  <li key={`${finding.code}-${finding.filePath || finding.evidence || ''}`}>
                    • {finding.title}
                    {finding.filePath ? ` · ${finding.filePath}` : ''}
                  </li>
                ))}
              </ul>
              <p className="text-xs opacity-80">
                {t(
                  'skill.safetyHighRiskConfirm',
                  '如果你确认来源可信，仍然可以继续添加；否则建议先检查源码和来源。',
                )}
              </p>
            </div>
          ) : (
            ''
          )
        }
        confirmText={t('skill.addAnyway', '仍然添加')}
        cancelText={t('common.cancel', '取消')}
        variant="destructive"
      />
    </div>
  );
}
