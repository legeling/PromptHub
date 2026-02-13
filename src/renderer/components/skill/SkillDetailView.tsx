import { useTranslation } from 'react-i18next';
import { XIcon, CuboidIcon, GithubIcon, CopyIcon, CheckIcon, DownloadIcon, GlobeIcon, Edit3Icon, BookOpenIcon, CodeIcon, ChevronRightIcon, PencilIcon, FileJsonIcon, FileTextIcon, Loader2Icon, CheckSquareIcon, SquareIcon } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSkillStore } from '../../stores/skill.store';
import { EditSkillModal } from './EditSkillModal';
import { PlatformIcon } from '../ui/PlatformIcon';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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

export function SkillDetailView() {
  const { t } = useTranslation();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const skills = useSkillStore((state) => state.skills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const updateSkill = useSkillStore((state) => state.updateSkill);
  
  // Memoize selectedSkill to avoid unnecessary re-renders
  // 使用 useMemo 缓存 selectedSkill，避免不必要的重新渲染
  const selectedSkill = useMemo(() => skills.find(s => s.id === selectedSkillId), [skills, selectedSkillId]);
  
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [editedInstructions, setEditedInstructions] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // SKILL.md Multi-Platform Installation State
  // SKILL.md 多平台安装状态
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [skillMdInstallStatus, setSkillMdInstallStatus] = useState<Record<string, boolean>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Confirmation dialog states
  // 确认对话框状态
  const [confirmInstallOpen, setConfirmInstallOpen] = useState(false);
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);
  const [pendingUninstallPlatform, setPendingUninstallPlatform] = useState<string | null>(null);
  
  // Load supported platforms on mount
  // 组件挂载时加载支持的平台
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
  
  // Refresh status when skill selection changes
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
      // Reset selection when status changes
      // 状态变化时重置选择
      setSelectedPlatforms(new Set());
    } catch (e) {
      console.error('Failed to check SKILL.md install status:', e);
    }
  };
  
  // Filter to only show detected (installed) platforms
  // 只显示检测到（已安装）的平台
  const availablePlatforms = useMemo(() => {
    return supportedPlatforms.filter(p => detectedPlatforms.includes(p.id));
  }, [supportedPlatforms, detectedPlatforms]);

  // Get platforms that are not yet installed (can be selected for batch install)
  // 获取未安装的平台（可被选择进行批量安装）
  const uninstalledPlatforms = useMemo(() => {
    return availablePlatforms.filter(p => !skillMdInstallStatus[p.id]);
  }, [availablePlatforms, skillMdInstallStatus]);

  // Toggle platform selection
  // 切换平台选择
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

  // Select all uninstalled platforms
  // 全选未安装的平台
  const selectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set(uninstalledPlatforms.map(p => p.id)));
  }, [uninstalledPlatforms]);

  // Deselect all platforms
  // 取消全选
  const deselectAllPlatforms = useCallback(() => {
    setSelectedPlatforms(new Set());
  }, []);

  // Show install confirmation dialog
  // 显示安装确认对话框
  const showInstallConfirm = () => {
    if (!selectedSkill || selectedPlatforms.size === 0) return;
    setConfirmInstallOpen(true);
  };

  // Batch install selected platforms (called after confirmation)
  // 批量安装选中的平台（确认后调用）
  const batchInstall = async () => {
    if (!selectedSkill || selectedPlatforms.size === 0) return;
    
    setConfirmInstallOpen(false);
    setIsBatchInstalling(true);
    setInstallProgress({ current: 0, total: selectedPlatforms.size });
    
    try {
      const skillMdContent = await window.api.skill.export(selectedSkill.id, 'skillmd');
      const platformIds = Array.from(selectedPlatforms);
      
      for (let i = 0; i < platformIds.length; i++) {
        const platformId = platformIds[i];
        setInstallProgress({ current: i + 1, total: platformIds.length });
        
        try {
          await window.api.skill.installMd(selectedSkill.name, skillMdContent, platformId);
        } catch (e) {
          console.error(`Failed to install to ${platformId}:`, e);
        }
      }
      
      await checkSkillMdInstallStatus();
    } catch (e) {
      console.error('Batch install failed:', e);
      alert(`${t('skill.updateFailed')}: ${e}`);
    } finally {
      setIsBatchInstalling(false);
      setInstallProgress(null);
    }
  };

  // Show uninstall confirmation dialog
  // 显示卸载确认对话框
  const showUninstallConfirm = (platformId: string) => {
    if (!selectedSkill) return;
    setPendingUninstallPlatform(platformId);
    setConfirmUninstallOpen(true);
  };

  // Uninstall from a single platform (called after confirmation)
  // 从单个平台卸载（确认后调用）
  const uninstallFromPlatform = async () => {
    if (!selectedSkill || !pendingUninstallPlatform) return;
    
    setConfirmUninstallOpen(false);
    const platformId = pendingUninstallPlatform;
    setPendingUninstallPlatform(null);
    
    try {
      await window.api.skill.uninstallMd(selectedSkill.name, platformId);
      await checkSkillMdInstallStatus();
    } catch (e) {
      console.error(`Failed to uninstall from ${platformId}:`, e);
      alert(`${t('skill.updateFailed')}: ${e}`);
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
      
      // Create download
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

  return (
    <div className="flex flex-col h-full bg-card border-l border-border animate-in slide-in-from-right duration-300 w-full md:w-[500px] lg:w-[650px] shadow-2xl relative z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20">
            <CuboidIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-foreground leading-tight">{selectedSkill.name}</h2>
            <div className="flex items-center gap-3 mt-1.5">
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
            onClick={() => setIsEditModalOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-95"
            title={t('skill.edit', '编辑技能')}
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => selectSkill(null)}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-all active:scale-95"
          >
            <XIcon className="w-6 h-6" />
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

      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide pb-32">
        {activeTab === 'preview' ? (
          <>
            {/* Description */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                {t('skill.skillDescription', '技能描述')}
              </h3>
              <div className="bg-accent/10 p-5 rounded-2xl border border-white/5">
                <p className="text-base text-foreground/90 leading-relaxed italic">
                  {selectedSkill.description || t('skill.defaultDescriptionLong')}
                </p>
              </div>
            </section>

            {/* SKILL.md Platform Installation */}
            {/* SKILL.md 平台安装 */}
            {availablePlatforms.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.platformIntegration').toUpperCase()}</h3>
                   <span className="text-[10px] text-muted-foreground">SKILL.md</span>
                </div>
                
                {/* Batch install toolbar */}
                {/* 批量安装工具栏 */}
                {uninstalledPlatforms.length > 0 && (
                  <div className="flex items-center justify-between gap-2 p-3 bg-accent/30 rounded-xl border border-border">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectedPlatforms.size === uninstalledPlatforms.length ? deselectAllPlatforms : selectAllPlatforms}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                        disabled={isBatchInstalling}
                      >
                        {selectedPlatforms.size === uninstalledPlatforms.length ? (
                          <>
                            <CheckSquareIcon className="w-4 h-4" />
                            {t('skill.deselectAll', '取消全选')}
                          </>
                        ) : (
                          <>
                            <SquareIcon className="w-4 h-4" />
                            {t('skill.selectAll', '全选')}
                          </>
                        )}
                      </button>
                      {selectedPlatforms.size > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t('skill.selected', '已选择')} {selectedPlatforms.size}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={showInstallConfirm}
                      disabled={selectedPlatforms.size === 0 || isBatchInstalling}
                      className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {isBatchInstalling ? (
                        <>
                          <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                          {installProgress ? `${installProgress.current}/${installProgress.total}` : t('skill.installing', '安装中...')}
                        </>
                      ) : (
                        <>
                          <DownloadIcon className="w-3.5 h-3.5" />
                          {t('skill.batchInstall', '批量安装')}
                        </>
                      )}
                    </button>
                  </div>
                )}
                
                <div className={`grid gap-3 ${availablePlatforms.length === 1 ? 'grid-cols-1' : availablePlatforms.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
                   {availablePlatforms.map((platform) => {
                     const isInstalled = skillMdInstallStatus[platform.id];
                     const isSelected = selectedPlatforms.has(platform.id);
                     
                     return (
                       <div 
                         key={platform.id}
                         onClick={() => {
                           if (isInstalled) return; // Can't select installed platforms
                           if (!isBatchInstalling) {
                             togglePlatformSelection(platform.id);
                           }
                         }}
                         className={`p-4 rounded-2xl border transition-all ${
                           isInstalled 
                             ? 'bg-primary/5 border-primary shadow-sm cursor-default' 
                             : isSelected
                               ? 'bg-primary/10 border-primary cursor-pointer'
                               : 'bg-sidebar-accent/30 border-border hover:bg-sidebar-accent/50 cursor-pointer'
                         } ${isBatchInstalling && !isInstalled ? 'opacity-70 cursor-wait' : ''}`}
                       >
                          <div className="flex items-center justify-between mb-3">
                             <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                <PlatformIcon platformId={platform.id} size={26} />
                             </div>
                             {isInstalled ? (
                               <div className="flex items-center gap-2">
                                 <CheckIcon className="w-4 h-4 text-primary" />
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     showUninstallConfirm(platform.id);
                                   }}
                                   className="text-[10px] text-destructive hover:underline"
                                   title={t('skill.uninstall', '卸载')}
                                 >
                                   {t('skill.uninstall', '卸载')}
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
                          <h4 className="font-bold text-sm">{platform.name}</h4>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {isInstalled 
                              ? t('skill.installed') 
                              : isSelected
                                ? t('skill.selectedForInstall', '待安装')
                                : t('skill.clickToSelect', '点击选择')
                            }
                          </p>
                       </div>
                     );
                   })}
                </div>
              </section>
            )}

            {/* Markdown Instructions */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                   {t('skill.instructionsSection')}
                   <span className="text-[10px] lowercase font-normal opacity-60">{t('common.preview')}</span>
                </h3>
                <div className="flex gap-2">
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
              
              <div className="rounded-2xl border border-border bg-sidebar-accent/20 overflow-hidden shadow-inner min-h-[200px]">
                {isEditing ? (
                  <div className="flex flex-col">
                    <textarea
                      value={editedInstructions}
                      onChange={(e) => setEditedInstructions(e.target.value)}
                      className="w-full h-[400px] p-5 bg-background text-sm font-mono border-none focus:ring-0 focus:outline-none resize-none scrollbar-hide"
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
                  <div className="p-6 prose dark:prose-invert prose-sm max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                    {selectedSkill.instructions ? (
                        <div className="markdown-body">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]} 
                            rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                          >
                            {selectedSkill.instructions}
                          </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30">
                           <BookOpenIcon className="w-12 h-12 mb-2" />
                           <p>{t('skill.noInstructions')}</p>
                        </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          /* Source Tab: Raw Config & Metadata */
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <section className="space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.metadata').toUpperCase()}</h3>
                <div className="bg-accent/10 border border-white/5 rounded-2xl p-5 space-y-4">
                   <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                      <span className="text-muted-foreground">{t('skill.id')}</span>
                      <span className="font-mono text-[11px] bg-black/30 px-2 py-0.5 rounded">{selectedSkill.id}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                      <span className="text-muted-foreground">{t('skill.protocol')}</span>
                      <span className="font-bold uppercase tracking-tight flex items-center gap-1.5 text-primary">
                         <ChevronRightIcon className="w-4 h-4" />
                         {selectedSkill.protocol_type}
                      </span>
                   </div>
                   <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                      <span className="text-muted-foreground">{t('skill.createdAt')}</span>
                      <span className="opacity-80">{new Date(selectedSkill.created_at).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('skill.updatedAt')}</span>
                      <span className="opacity-80">{new Date(selectedSkill.updated_at).toLocaleString()}</span>
                   </div>
                </div>
             </section>
             
             {selectedSkill.source_url && (
               <section>
                  <a 
                    href={selectedSkill.source_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-center gap-3 p-5 bg-github text-white rounded-2xl hover:opacity-90 transition-opacity font-bold shadow-lg"
                  >
                    <GithubIcon className="w-5 h-5" />
                    {t('skill.visitRepo', 'Visit Skill Repository')}
                  </a>
               </section>
             )}

             {/* Export Section */}
             <section className="space-y-4">
               <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('skill.export', '导出')}</h3>
               <div className="grid grid-cols-2 gap-3">
                 <button
                   onClick={() => handleExport('skillmd')}
                   className="flex items-center justify-center gap-2 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group"
                 >
                   <FileTextIcon className="w-5 h-5 text-primary" />
                   <div className="text-left">
                     <div className="font-medium text-sm">SKILL.md</div>
                     <div className="text-[10px] text-muted-foreground">{t('skill.exportSkillMd', 'Claude 兼容格式')}</div>
                   </div>
                 </button>
                 <button
                   onClick={() => handleExport('json')}
                   className="flex items-center justify-center gap-2 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group"
                 >
                   <FileJsonIcon className="w-5 h-5 text-primary" />
                   <div className="text-left">
                     <div className="font-medium text-sm">JSON</div>
                     <div className="text-[10px] text-muted-foreground">{t('skill.exportJson', '备份/分享格式')}</div>
                   </div>
                 </button>
               </div>
             </section>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditSkillModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        skill={selectedSkill}
      />

      {/* Install Confirmation Dialog */}
      {/* 安装确认对话框 */}
      <ConfirmDialog
        isOpen={confirmInstallOpen}
        onClose={() => setConfirmInstallOpen(false)}
        onConfirm={batchInstall}
        title={t('skill.confirmInstallTitle', '确认安装')}
        message={
          <div>
            <p>{t('skill.confirmInstallMessage', '将安装技能到以下平台：')}</p>
            <ul className="mt-2 space-y-1">
              {Array.from(selectedPlatforms).map(platformId => {
                const platform = supportedPlatforms.find(p => p.id === platformId);
                return platform ? (
                  <li key={platformId} className="flex items-center gap-2 text-sm">
                    <PlatformIcon platformId={platformId} size={16} />
                    <span>{platform.name}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        }
        confirmText={t('skill.batchInstall', '批量安装')}
        cancelText={t('common.cancel', '取消')}
      />

      {/* Uninstall Confirmation Dialog */}
      {/* 卸载确认对话框 */}
      <ConfirmDialog
        isOpen={confirmUninstallOpen}
        onClose={() => {
          setConfirmUninstallOpen(false);
          setPendingUninstallPlatform(null);
        }}
        onConfirm={uninstallFromPlatform}
        title={t('skill.confirmUninstallTitle', '确认卸载')}
        message={
          pendingUninstallPlatform ? (
            <p>
              {t('skill.confirmUninstallMessage', '确定要从 {{platform}} 卸载此技能吗？', {
                platform: supportedPlatforms.find(p => p.id === pendingUninstallPlatform)?.name || pendingUninstallPlatform
              })}
            </p>
          ) : null
        }
        confirmText={t('skill.uninstall', '卸载')}
        cancelText={t('common.cancel', '取消')}
        variant="destructive"
      />
    </div>
  );
}
