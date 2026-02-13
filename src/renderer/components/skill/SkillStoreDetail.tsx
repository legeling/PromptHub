import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, DownloadIcon, CheckIcon, GlobeIcon, TagIcon, Loader2Icon, TrashIcon, LanguagesIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { useSkillStore } from '../../stores/skill.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { SkillQuickInstall } from './SkillQuickInstall';
import type { RegistrySkill, Skill } from '../../../shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Strip YAML frontmatter from SKILL.md content
 * 剥离 SKILL.md 中的 YAML frontmatter
 */
function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return trimmed;
  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return trimmed;
  const body = trimmed.slice(endIdx + 3).trim();
  return body;
}

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
  const translationMode = useSettingsStore((state) => state.translationMode);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [justUninstalled, setJustUninstalled] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [deploySkill, setDeploySkill] = useState<Skill | null>(null);

  // Render immersive translation: split interleaved <t>...</t> lines
  const renderImmersive = useCallback((raw: string) => {
    const lines = raw.split('\n');
    const segments: { type: 'original' | 'translation'; text: string }[] = [];
    let buf: string[] = [];
    let currentType: 'original' | 'translation' = 'original';

    const flush = () => {
      const joined = buf.join('\n');
      if (joined.trim()) segments.push({ type: currentType, text: joined });
      buf = [];
    };

    for (const line of lines) {
      const tMatch = line.match(/^<t>(.*)<\/t>$/);
      if (tMatch) {
        flush();
        currentType = 'translation';
        buf.push(tMatch[1]);
        flush();
        currentType = 'original';
      } else {
        buf.push(line);
      }
    }
    flush();
    return segments;
  }, []);

  const targetLang = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return lang.startsWith('zh') ? '中文' : lang.startsWith('ja') ? '日本語' : lang.startsWith('ko') ? '한국어' : 'English';
  }, [i18n.language]);

  const translationCacheKey = `store_${skill.slug}_${targetLang}_${translationMode}`;
  const cachedTranslation = getTranslation(translationCacheKey);

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
    } catch (e: any) {
      if (e?.message === 'AI_NOT_CONFIGURED') {
        showToast(t('skill.aiNotConfigured', 'Please configure AI model in Settings first'), 'error');
      } else {
        showToast(t('skill.translateFailed', 'Translation failed') + `: ${e}`, 'error');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const result = await installFromRegistry(skill.slug);
      if (result) {
        setJustInstalled(true);
        showToast(t('skill.addedToLibrary', 'Added') + `: ${skill.name}`, 'success');
        // Auto-show deploy to platforms modal
        setDeploySkill(result);
        setTimeout(() => setJustInstalled(false), 2000);
      }
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
          </div>

          {/* SKILL.md content rendered as markdown */}
          {(() => {
            const body = stripFrontmatter(skill.content);
            const originalContent = body.length > 0 ? body : skill.description;

            if (showTranslation && cachedTranslation) {
              // Immersive mode: interleaved original + translation
              if (translationMode === 'immersive') {
                const segments = renderImmersive(cachedTranslation);
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
    </div>
  );
}
