import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, CuboidIcon, GithubIcon, CopyIcon, CheckIcon, DownloadIcon, GlobeIcon, Edit3Icon, BookOpenIcon, CodeIcon, ChevronRightIcon, PencilIcon, FileJsonIcon, FileTextIcon, Loader2Icon, CheckSquareIcon, SquareIcon, StarIcon, TrashIcon, LinkIcon, CopyPlusIcon, LanguagesIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSkillStore } from '../../stores/skill.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { EditSkillModal } from './EditSkillModal';
import { PlatformIcon } from '../ui/PlatformIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import 'highlight.js/styles/github-dark.css';

interface SkillPlatform {
  id: string;
  name: string;
  icon: string;
  skillsDir: { darwin: string; win32: string; linux: string };
}

/**
 * Strip YAML frontmatter from SKILL.md content
 * 剥离 SKILL.md 中的 YAML frontmatter
 */
function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return trimmed;
  // Handle both multi-line and single-line frontmatter
  // Multi-line: ---\nkey: value\n---\nbody
  // Single-line: --- key: value ---\nbody
  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return trimmed;
  const result = trimmed.slice(endIdx + 3).trim();
  // If stripping left nothing, the content was frontmatter-only; return empty
  return result;
}

/**
 * Full-width Skill Detail Page
 * 全宽技能详情页
 */
export type InstallMode = 'copy' | 'symlink';

export function SkillFullDetailPage() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const skills = useSkillStore((state) => state.skills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  
  const selectedSkill = useMemo(() => skills.find(s => s.id === selectedSkillId), [skills, selectedSkillId]);
  
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [editedInstructions, setEditedInstructions] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Platform installation state
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [skillMdInstallStatus, setSkillMdInstallStatus] = useState<Record<string, boolean>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number } | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>('copy');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslation = useSkillStore((state) => state.getTranslation);
  const translationMode = useSettingsStore((state) => state.translationMode);

  const targetLang = useMemo(() => {
    const lang = (i18n.language || '').toLowerCase();
    return lang.startsWith('zh') ? '中文' : lang.startsWith('ja') ? '日本語' : lang.startsWith('ko') ? '한국어' : 'English';
  }, [i18n.language]);

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
  
  // Load platforms on mount
  useEffect(() => {
    const loadPlatforms = async () => {
      try {
        const platforms = await window.api.skill.getSupportedPlatforms();
        setSupportedPlatforms(platforms);
        const detected = await window.api.skill.detectPlatforms();
        setDetectedPlatforms(detected);
      } catch (e) {
        console.error('Failed to load platforms:', e);
      }
    };
    loadPlatforms();
  }, []);
  
  // Refresh when skill changes
  useEffect(() => {
    if (selectedSkill) {
      setEditedInstructions(selectedSkill.instructions || '');
      setIsEditing(false);
      checkSkillMdInstallStatus();
    }
  }, [selectedSkill?.id]);

  const checkSkillMdInstallStatus = async () => {
    if (!selectedSkill) return;
    try {
      const status = await window.api.skill.getMdInstallStatus(selectedSkill.name);
      setSkillMdInstallStatus(status);
      setSelectedPlatforms(new Set());
    } catch (e) {
      console.error('Failed to check SKILL.md install status:', e);
    }
  };
  
  const availablePlatforms = useMemo(() => {
    return supportedPlatforms.filter(p => detectedPlatforms.includes(p.id));
  }, [supportedPlatforms, detectedPlatforms]);

  const uninstalledPlatforms = useMemo(() => {
    return availablePlatforms.filter(p => !skillMdInstallStatus[p.id]);
  }, [availablePlatforms, skillMdInstallStatus]);

  const togglePlatformSelection = useCallback((platformId: string) => {
    setSelectedPlatforms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(platformId)) {
        newSet.delete(platformId);
      } else {
        newSet.add(platformId);
      }
      return newSet;
    });
  }, []);

  const selectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set(uninstalledPlatforms.map(p => p.id)));
  }, [uninstalledPlatforms]);

  const deselectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set());
  }, []);

  const batchInstall = async () => {
    if (!selectedSkill || selectedPlatforms.size === 0) return;
    
    setIsBatchInstalling(true);
    setInstallProgress({ current: 0, total: selectedPlatforms.size });
    
    try {
      const skillMdContent = await window.api.skill.export(selectedSkill.id, 'skillmd');
      const platformIds = Array.from(selectedPlatforms);
      
      let successCount = 0;
      for (let i = 0; i < platformIds.length; i++) {
        const platformId = platformIds[i];
        setInstallProgress({ current: i + 1, total: platformIds.length });
        
        try {
          if (installMode === 'symlink') {
            await window.api.skill.installMdSymlink(selectedSkill.name, skillMdContent, platformId);
          } else {
            await window.api.skill.installMd(selectedSkill.name, skillMdContent, platformId);
          }
          successCount++;
        } catch (e) {
          console.error(`Failed to install to ${platformId}:`, e);
        }
      }
      
      await checkSkillMdInstallStatus();
      if (successCount > 0) {
        const modeLabel = installMode === 'symlink' ? t('skill.symlink', 'Symlink') : t('skill.copyMode', 'Copy');
        showToast(`${t('skill.installSuccess', 'Installation successful')} (${modeLabel}) — ${successCount}/${platformIds.length}`, 'success');
      }
    } catch (e) {
      console.error('Batch install failed:', e);
      showToast(`${t('skill.updateFailed')}: ${e}`, 'error');
    } finally {
      setIsBatchInstalling(false);
      setInstallProgress(null);
    }
  };

  const uninstallFromPlatform = async (platformId: string) => {
    if (!selectedSkill) return;
    
    try {
      await window.api.skill.uninstallMd(selectedSkill.name, platformId);
      await checkSkillMdInstallStatus();
      showToast(t('skill.uninstallSuccess', 'Uninstall successful'), 'success');
    } catch (e) {
      console.error(`Failed to uninstall from ${platformId}:`, e);
      showToast(`${t('skill.updateFailed')}: ${e}`, 'error');
    }
  };

  if (!selectedSkill) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus({ ...copyStatus, [key]: true });
    setTimeout(() => {
      setCopyStatus({ ...copyStatus, [key]: false });
    }, 2000);
  };

  const handleSaveInstructions = async () => {
    if (!selectedSkill) return;
    setIsSaving(true);
    try {
      await updateSkill(selectedSkill.id, { instructions: editedInstructions });
      setIsEditing(false);
    } catch (e) {
      alert('Failed to save instructions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: 'skillmd' | 'json') => {
    if (!selectedSkill) return;
    try {
      const content = await window.api.skill.export(selectedSkill.id, format);
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'skillmd' 
        ? `${selectedSkill.name}-SKILL.md` 
        : `${selectedSkill.name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setCopyStatus({ ...copyStatus, [`export_${format}`]: true });
      setTimeout(() => {
        setCopyStatus({ ...copyStatus, [`export_${format}`]: false });
      }, 2000);
    } catch (e) {
      alert(`Export failed: ${e}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedSkill) return;
    if (confirm(t('skill.confirmDelete', { name: selectedSkill.name }) || `Delete skill "${selectedSkill.name}"?`)) {
      await deleteSkill(selectedSkill.id);
      selectSkill(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => selectSkill(null)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-95"
            title={t('common.back', '返回')}
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <SkillIcon
            iconUrl={selectedSkill.icon_url}
            iconEmoji={selectedSkill.icon_emoji}
            name={selectedSkill.name}
            size="lg"
            className="shadow-lg shadow-primary/20"
          />
          <div>
            <h2 className="font-bold text-xl text-foreground leading-tight">{selectedSkill.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                v{selectedSkill.version || '1.0.0'}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                <GlobeIcon className="w-3.5 h-3.5" />
                {selectedSkill.author || t('skill.localStorage')}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => toggleFavorite(selectedSkill.id)}
            className={`p-2.5 rounded-full transition-all active:scale-95 ${
              selectedSkill.is_favorite 
                ? 'text-yellow-500 hover:text-yellow-600' 
                : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'
            }`}
            title={selectedSkill.is_favorite ? t('skill.removeFavorite', '取消收藏') : t('skill.addFavorite', '添加收藏')}
          >
            <StarIcon className={`w-5 h-5 ${selectedSkill.is_favorite ? 'fill-current' : ''}`} />
          </button>
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-95"
            title={t('skill.edit', '编辑技能')}
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={handleDelete}
            className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all active:scale-95"
            title={t('common.delete', '删除')}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 gap-6 border-b border-border bg-accent/20">
        <button 
          onClick={() => setActiveTab('preview')}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === 'preview' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4" />
            {t('common.preview', '预览')}
          </div>
          {activeTab === 'preview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('code')}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === 'code' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <CodeIcon className="w-4 h-4" />
            {t('common.content', '源码/内容')}
          </div>
          {activeTab === 'code' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
        </button>
      </div>

      {/* Main content - two column layout */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-6xl mx-auto p-6">
          {activeTab === 'preview' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column: SKILL.md content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Description */}
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                    {t('skill.skillDescription', '技能描述')}
                  </h3>
                  <div className="bg-card p-5 rounded-2xl border border-border">
                    <p className="text-sm text-foreground/90 leading-relaxed italic">
                      {selectedSkill.description || t('skill.defaultDescriptionLong')}
                    </p>
                  </div>
                </section>

                {/* Markdown Instructions */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                      {t('skill.instructionsSection')}
                    </h3>
                    <div className="flex gap-2">
                      {selectedSkill.instructions && (() => {
                        const cacheKey = `skill_${selectedSkill.id}_${targetLang}_${translationMode}`;
                        const cached = getTranslation(cacheKey);
                        return (
                          <button
                            onClick={async () => {
                              if (cached) { setShowTranslation(!showTranslation); return; }
                              setIsTranslating(true);
                              try {
                                const stripped = stripFrontmatter(selectedSkill.instructions || '');
                                await translateContent(stripped, cacheKey, targetLang);
                                setShowTranslation(true);
                                showToast(t('skill.translateSuccess', 'Translation complete'), 'success');
                              } catch (e: any) {
                                if (e?.message === 'AI_NOT_CONFIGURED') {
                                  showToast(t('skill.aiNotConfigured', 'Please configure AI model in Settings first'), 'error');
                                } else {
                                  showToast(t('skill.translateFailed', 'Translation failed'), 'error');
                                }
                              } finally { setIsTranslating(false); }
                            }}
                            disabled={isTranslating}
                            className={`p-1 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                              showTranslation && cached ? 'bg-primary/10 text-primary' : 'bg-accent/50 hover:bg-accent'
                            } disabled:opacity-50`}
                          >
                            {isTranslating ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <LanguagesIcon className="w-3.5 h-3.5" />}
                            {isTranslating ? t('skill.translating', 'Translating...') : showTranslation && cached ? t('skill.showOriginal', 'Original') : cached ? t('skill.showTranslation', 'Translation') : t('skill.translate', 'AI Translate')}
                          </button>
                        );
                      })()}
                      <button 
                        onClick={() => handleCopy(selectedSkill.instructions || '', 'instr')}
                        className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                      >
                        {copyStatus['instr'] ? <CheckIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
                        {copyStatus['instr'] ? t('skill.copied') : t('skill.copyMd')}
                      </button>
                      <button 
                        onClick={() => setIsEditing(!isEditing)}
                        className={`p-1 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isEditing ? 'bg-primary text-white' : 'bg-accent/50 hover:bg-accent'}`}
                      >
                        <Edit3Icon className="w-3.5 h-3.5" />
                        {isEditing ? t('skill.editing') : t('common.edit')}
                      </button>
                    </div>
                  </div>
                  
                  <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm min-h-[300px]">
                    {isEditing ? (
                      <div className="flex flex-col">
                        <textarea
                          value={editedInstructions}
                          onChange={(e) => setEditedInstructions(e.target.value)}
                          className="w-full h-[500px] p-5 bg-background text-sm font-mono border-none focus:ring-0 focus:outline-none resize-none scrollbar-hide"
                          placeholder={t('skill.instructionsPlaceholder')}
                        />
                        <div className="p-3 bg-accent/30 border-t border-border flex justify-end gap-2">
                          <button onClick={() => {setIsEditing(false); setEditedInstructions(selectedSkill.instructions || '')}} className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 rounded-lg transition-colors">{t('skill.cancel')}</button>
                          <button onClick={handleSaveInstructions} disabled={isSaving} className="px-4 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50">
                            {isSaving ? t('common.saving') : t('skill.saveChanges')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 prose dark:prose-invert prose-sm max-w-none prose-h1:text-base prose-h1:font-bold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold prose-p:text-[13px] prose-li:text-[13px] prose-code:text-[12px] prose-pre:text-[12px] prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                        {selectedSkill.instructions ? (
                          (() => {
                            const cacheKey = `skill_${selectedSkill.id}_${targetLang}_${translationMode}`;
                            const cached = getTranslation(cacheKey);
                            if (showTranslation && cached) {
                              // Immersive mode: interleaved original + translation
                              if (translationMode === 'immersive') {
                                const segments = renderImmersive(cached);
                                return (
                                  <div className="markdown-body">
                                    {segments.map((seg, i) =>
                                      seg.type === 'translation' ? (
                                        <div key={i} className="border-l-2 border-primary/40 pl-3 my-1 text-primary/70 text-[12px] italic">
                                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                                            {seg.text}
                                          </ReactMarkdown>
                                        </div>
                                      ) : (
                                        <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                                          {seg.text}
                                        </ReactMarkdown>
                                      )
                                    )}
                                  </div>
                                );
                              }
                              // Full mode: show translated text only
                              return (
                                <div className="markdown-body">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                                    {cached}
                                  </ReactMarkdown>
                                </div>
                              );
                            }
                            return (
                              <div className="markdown-body">
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]} 
                                  rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                                >
                                  {stripFrontmatter(selectedSkill.instructions)}
                                </ReactMarkdown>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16 opacity-30">
                            <BookOpenIcon className="w-12 h-12 mb-2" />
                            <p>{t('skill.noInstructions')}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Right column: Platform installation & metadata */}
              <div className="space-y-6">
                {/* Platform Installation */}
                {availablePlatforms.length > 0 && (
                  <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.platformIntegration')}</h3>
                      <span className="text-[10px] text-muted-foreground">SKILL.md</span>
                    </div>
                    
                    {/* Install mode toggle */}
                    <div className="flex items-center gap-1 p-1 bg-accent/50 rounded-lg">
                      <button
                        onClick={() => setInstallMode('copy')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                          installMode === 'copy' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <CopyPlusIcon className="w-3 h-3" />
                        {t('skill.copyMode', 'Copy')}
                      </button>
                      <button
                        onClick={() => setInstallMode('symlink')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                          installMode === 'symlink' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <LinkIcon className="w-3 h-3" />
                        {t('skill.symlink', 'Symlink')}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {installMode === 'copy'
                        ? t('skill.copyModeDesc', 'Copy: Copies the SKILL.md file to each platform directory. Each copy is independent — edits in PromptHub won\'t sync automatically.')
                        : t('skill.symlinkDesc', 'Symlink: Creates a symbolic link pointing to the source file. All platforms share the same source — edits sync instantly, but requires filesystem support.')}
                    </p>

                    {/* Batch install toolbar */}
                    {uninstalledPlatforms.length > 0 && (
                      <div className="flex flex-col gap-2 p-3 bg-accent/30 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={selectedPlatforms.size === uninstalledPlatforms.length ? deselectAllPlatforms : selectAllPlatforms}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                            disabled={isBatchInstalling}
                          >
                            {selectedPlatforms.size === uninstalledPlatforms.length ? (
                              <>
                                <CheckSquareIcon className="w-4 h-4" />
                                {t('skill.deselectAll')}
                              </>
                            ) : (
                              <>
                                <SquareIcon className="w-4 h-4" />
                                {t('skill.selectAll')}
                              </>
                            )}
                          </button>
                          {selectedPlatforms.size > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {selectedPlatforms.size} {t('skill.selected')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={batchInstall}
                          disabled={selectedPlatforms.size === 0 || isBatchInstalling}
                          className="w-full px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                        >
                          {isBatchInstalling ? (
                            <>
                              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                              {installProgress ? `${installProgress.current}/${installProgress.total}` : t('skill.installing')}
                            </>
                          ) : (
                            <>
                              <DownloadIcon className="w-3.5 h-3.5" />
                              {t('skill.batchInstall')}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {availablePlatforms.map((platform) => {
                        const isInstalled = skillMdInstallStatus[platform.id];
                        const isSelected = selectedPlatforms.has(platform.id);
                        
                        return (
                          <div 
                            key={platform.id}
                            onClick={() => {
                              if (isInstalled) return;
                              if (!isBatchInstalling) {
                                togglePlatformSelection(platform.id);
                              }
                            }}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                              isInstalled 
                                ? 'bg-primary/5 border-primary cursor-default' 
                                : isSelected
                                  ? 'bg-primary/10 border-primary cursor-pointer'
                                  : 'bg-accent/30 border-border hover:bg-accent/50 cursor-pointer'
                            } ${isBatchInstalling && !isInstalled ? 'opacity-70 cursor-wait' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                                <PlatformIcon platformId={platform.id} size={28} />
                              </div>
                              <div>
                                <h4 className="font-medium text-sm">{platform.name}</h4>
                                <p className="text-[10px] text-muted-foreground">
                                  {isInstalled 
                                    ? t('skill.installed') 
                                    : isSelected
                                      ? t('skill.selectedForInstall')
                                      : t('skill.clickToSelect')
                                  }
                                </p>
                              </div>
                            </div>
                            {isInstalled ? (
                              <div className="flex items-center gap-2">
                                <CheckIcon className="w-4 h-4 text-primary" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    uninstallFromPlatform(platform.id);
                                  }}
                                  className="text-[10px] text-destructive hover:underline"
                                >
                                  {t('skill.uninstall')}
                                </button>
                              </div>
                            ) : (
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                              }`}>
                                {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Metadata */}
                <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.metadata')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('skill.id')}</span>
                      <span className="font-mono text-[10px] bg-accent px-2 py-0.5 rounded truncate max-w-[150px]">{selectedSkill.id}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('skill.protocol')}</span>
                      <span className="font-bold uppercase tracking-tight flex items-center gap-1 text-primary text-xs">
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                        {selectedSkill.protocol_type}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('skill.createdAt')}</span>
                      <span className="text-xs opacity-80">{new Date(selectedSkill.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('skill.updatedAt')}</span>
                      <span className="text-xs opacity-80">{new Date(selectedSkill.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </section>

                {/* Export */}
                <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.export')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleExport('skillmd')}
                      className="flex flex-col items-center gap-1 p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors"
                    >
                      <FileTextIcon className="w-5 h-5 text-primary" />
                      <span className="font-medium text-xs">SKILL.md</span>
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="flex flex-col items-center gap-1 p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors"
                    >
                      <FileJsonIcon className="w-5 h-5 text-primary" />
                      <span className="font-medium text-xs">JSON</span>
                    </button>
                  </div>
                </section>

                {/* GitHub link */}
                {selectedSkill.source_url && (
                  <a 
                    href={selectedSkill.source_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 p-4 bg-[#24292e] text-white rounded-2xl hover:opacity-90 transition-opacity font-bold text-sm"
                  >
                    <GithubIcon className="w-5 h-5" />
                    {t('skill.visitRepo')}
                  </a>
                )}
              </div>
            </div>
          ) : (
            /* Code Tab: Raw Config & Metadata */
            <div className="max-w-4xl mx-auto space-y-8">
              {/* Raw content */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.rawContent', 'SKILL.md Content')}</h3>
                  {selectedSkill.instructions && (
                    <button
                      onClick={() => handleCopy(selectedSkill.instructions || '', 'raw')}
                      className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      {copyStatus['raw'] ? <CheckIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
                      {copyStatus['raw'] ? t('skill.copied') : t('skill.copyMd')}
                    </button>
                  )}
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {selectedSkill.instructions ? (
                    <pre className="p-5 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto scrollbar-hide">{selectedSkill.instructions}</pre>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      {t('skill.noContent', 'No content available')}
                    </div>
                  )}
                </div>
              </section>

              {/* Metadata */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.metadata')}</h3>
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="text-muted-foreground">{t('skill.id')}</span>
                    <span className="font-mono text-[11px] bg-accent px-2 py-0.5 rounded">{selectedSkill.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="text-muted-foreground">{t('skill.protocol')}</span>
                    <span className="font-bold uppercase tracking-tight flex items-center gap-1.5 text-primary">
                      <ChevronRightIcon className="w-4 h-4" />
                      {selectedSkill.protocol_type}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="text-muted-foreground">{t('skill.createdAt')}</span>
                    <span className="opacity-80">{new Date(selectedSkill.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t('skill.updatedAt')}</span>
                    <span className="opacity-80">{new Date(selectedSkill.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditSkillModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        skill={selectedSkill}
      />
    </div>
  );
}
