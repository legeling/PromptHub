import { useTranslation } from 'react-i18next';
import { XIcon, CheckIcon, DownloadIcon, Loader2Icon, CuboidIcon } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { PlatformIcon } from '../ui/PlatformIcon';
import type { Skill } from '../../../shared/types';

interface SkillPlatform {
  id: string;
  name: string;
  icon: string;
  skillsDir: { darwin: string; win32: string; linux: string };
}

interface SkillQuickInstallProps {
  skill: Skill;
  onClose: () => void;
}

/**
 * Quick Install Modal for Skills
 * 技能快速安装弹窗
 */
export function SkillQuickInstall({ skill, onClose }: SkillQuickInstallProps) {
  const { t } = useTranslation();
  
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState<Record<string, boolean>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Load platforms and status
  useEffect(() => {
    const loadData = async () => {
      try {
        const platforms = await window.api.skill.getSupportedPlatforms();
        setSupportedPlatforms(platforms);
        
        const detected = await window.api.skill.detectPlatforms();
        setDetectedPlatforms(detected);
        
        const status = await window.api.skill.getMdInstallStatus(skill.name);
        setInstallStatus(status);
      } catch (e) {
        console.error('Failed to load platforms:', e);
      }
    };
    loadData();
  }, [skill.name]);
  
  // Available platforms (detected on system)
  const availablePlatforms = useMemo(() => {
    return supportedPlatforms.filter(p => detectedPlatforms.includes(p.id));
  }, [supportedPlatforms, detectedPlatforms]);

  // Uninstalled platforms
  const uninstalledPlatforms = useMemo(() => {
    return availablePlatforms.filter(p => !installStatus[p.id]);
  }, [availablePlatforms, installStatus]);

  const togglePlatform = useCallback((platformId: string) => {
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

  const selectAll = useCallback(() => {
    setSelectedPlatforms(new Set(uninstalledPlatforms.map(p => p.id)));
  }, [uninstalledPlatforms]);

  const handleInstall = async () => {
    if (selectedPlatforms.size === 0) return;
    
    setIsInstalling(true);
    setInstallProgress({ current: 0, total: selectedPlatforms.size });
    
    try {
      const skillMdContent = await window.api.skill.export(skill.id, 'skillmd');
      const platformIds = Array.from(selectedPlatforms);
      
      for (let i = 0; i < platformIds.length; i++) {
        const platformId = platformIds[i];
        setInstallProgress({ current: i + 1, total: platformIds.length });
        
        try {
          await window.api.skill.installMd(skill.name, skillMdContent, platformId);
          setInstallStatus(prev => ({ ...prev, [platformId]: true }));
        } catch (e) {
          console.error(`Failed to install to ${platformId}:`, e);
        }
      }
      
      // Clear selection after install
      setSelectedPlatforms(new Set());
      
      // Close modal after short delay to show success
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e) {
      console.error('Install failed:', e);
      alert(`${t('skill.updateFailed')}: ${e}`);
    } finally {
      setIsInstalling(false);
      setInstallProgress(null);
    }
  };

  // All platforms installed
  const allInstalled = availablePlatforms.length > 0 && uninstalledPlatforms.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <CuboidIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{t('skill.quickInstall', '快速安装')}</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{skill.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 scrollbar-hide">
          {availablePlatforms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('skill.noPlatformsDetected', '未检测到可用平台')}</p>
            </div>
          ) : allInstalled ? (
            <div className="text-center py-8">
              <CheckIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-foreground font-medium">{t('skill.allPlatformsInstalled', '已安装到所有平台')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('skill.alreadyInstalled', '此技能已安装到检测到的所有平台')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('skill.selectPlatforms', '选择要安装的平台')}</p>
                <button
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                  disabled={isInstalling}
                >
                  {t('skill.selectAll')}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {availablePlatforms.map((platform) => {
                  const isInstalled = installStatus[platform.id];
                  const isSelected = selectedPlatforms.has(platform.id);
                  
                  return (
                    <div
                      key={platform.id}
                      onClick={() => {
                        if (!isInstalled && !isInstalling) {
                          togglePlatform(platform.id);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isInstalled
                          ? 'bg-green-500/5 border-green-500/20 cursor-default'
                          : isSelected
                            ? 'bg-primary/10 border-primary cursor-pointer'
                            : 'bg-accent/30 border-border hover:bg-accent/50 cursor-pointer'
                      } ${isInstalling && !isInstalled ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                          <PlatformIcon platformId={platform.id} size={26} />
                        </div>
                        <span className="font-medium text-sm">{platform.name}</span>
                      </div>
                      {isInstalled ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckIcon className="w-4 h-4" />
                          <span className="text-xs">{t('skill.installed')}</span>
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
            </>
          )}
        </div>

        {/* Footer */}
        {!allInstalled && availablePlatforms.length > 0 && (
          <div className="p-5 border-t border-border shrink-0">
            <button
              onClick={handleInstall}
              disabled={selectedPlatforms.size === 0 || isInstalling}
              className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors hover:bg-primary/90"
            >
              {isInstalling ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  {installProgress ? `${installProgress.current}/${installProgress.total}` : t('skill.installing')}
                </>
              ) : (
                <>
                  <DownloadIcon className="w-4 h-4" />
                  {t('skill.installSelected', '安装选中项')} {selectedPlatforms.size > 0 && `(${selectedPlatforms.size})`}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
