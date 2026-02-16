import { useTranslation } from 'react-i18next';
import { CuboidIcon, StarIcon, TrashIcon, DownloadIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { useState, useEffect, useMemo } from 'react';
import { useSkillStore } from '../../stores/skill.store';
import { PlatformIcon } from '../ui/PlatformIcon';
import type { Skill } from '../../../shared/types';

interface SkillListViewProps {
  skills: Skill[];
  onQuickInstall: (skill: Skill) => void;
}

interface SkillPlatform {
  id: string;
  name: string;
}

/**
 * Compact List View for Skills
 * 技能紧凑列表视图
 */
export function SkillListView({ skills, onQuickInstall }: SkillListViewProps) {
  const { t } = useTranslation();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const filterType = useSkillStore((state) => state.filterType);
  
  // Platform status cache
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, Record<string, boolean>>>({});
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);

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

  // Load install status for all skills
  useEffect(() => {
    const loadStatuses = async () => {
      const statuses: Record<string, Record<string, boolean>> = {};
      for (const skill of skills) {
        try {
          const status = await window.api.skill.getMdInstallStatus(skill.name);
          statuses[skill.id] = status;
        } catch (e) {
          // ignore
        }
      }
      setPlatformStatuses(statuses);
    };
    if (skills.length > 0) {
      loadStatuses();
    }
  }, [skills]);

  const availablePlatforms = useMemo(() => {
    return supportedPlatforms.filter(p => detectedPlatforms.includes(p.id));
  }, [supportedPlatforms, detectedPlatforms]);

  // Get install count for a skill
  const getInstallCount = (skillId: string) => {
    const status = platformStatuses[skillId];
    if (!status) return 0;
    return Object.values(status).filter(Boolean).length;
  };

  if (skills.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-500 py-20">
        <div className="p-8 bg-accent/30 rounded-full mb-6 relative">
          <CuboidIcon className="w-20 h-20 opacity-20" />
          <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {filterType === 'favorites' ? t('skill.noFavorites', '暂无收藏技能') : t('skill.noSkills', '暂无技能')}
        </h3>
        <p className="text-sm opacity-70 mb-8 max-w-sm text-center">
          {filterType === 'favorites' 
            ? t('skill.noFavoritesHint', '点击技能卡片上的星标添加收藏') 
            : t('skill.noSkillsHint', '扫描本地环境或手动创建技能开始使用')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="w-full">
        <div className="divide-y divide-border">
          {skills.map((skill, index) => {
            const isSelected = selectedSkillId === skill.id;
            const installCount = getInstallCount(skill.id);
            const totalPlatforms = availablePlatforms.length;
            
            return (
              <div
                key={skill.id}
                onClick={() => selectSkill(skill.id)}
                style={{ animationDelay: `${index * 30}ms` }}
                className={`group flex items-center gap-4 px-6 py-4 cursor-pointer transition-all animate-in fade-in slide-in-from-left-2 ${
                  isSelected 
                    ? 'bg-primary/5' 
                    : 'hover:bg-accent/50'
                }`}
              >
                {/* Icon */}
                <div className="shrink-0">
                  <SkillIcon
                    iconUrl={skill.icon_url}
                    iconEmoji={skill.icon_emoji}
                    name={skill.name}
                    size="md"
                    className={isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : ''}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold truncate transition-colors ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                      {skill.name}
                    </h3>
                    <span className="text-[10px] bg-accent px-2 py-0.5 rounded-full text-muted-foreground font-medium shrink-0">
                      v{skill.version || '1.0.0'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {skill.description || t('skill.defaultDescription')}
                  </p>
                </div>

                {/* Platform indicators */}
                {totalPlatforms > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {availablePlatforms.slice(0, 3).map((platform) => {
                      const isInstalled = platformStatuses[skill.id]?.[platform.id];
                      return (
                        <div 
                          key={platform.id}
                          className="flex items-center justify-center"
                          title={`${platform.name}: ${isInstalled ? t('skill.installed') : t('skill.notInstalled', '未安装')}`}
                        >
                          <PlatformIcon platformId={platform.id} size={16} className={isInstalled ? 'opacity-100' : 'opacity-40'} />
                        </div>
                      );
                    })}
                    <span className="text-[10px] text-primary font-medium ml-1">
                      {installCount}/{totalPlatforms}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickInstall(skill);
                    }}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90"
                    title={t('skill.quickInstall', '快速安装')}
                  >
                    <DownloadIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(skill.id);
                    }}
                    className={`p-2 rounded-lg transition-all active:scale-90 ${
                      skill.is_favorite
                        ? 'text-yellow-500 hover:text-yellow-600'
                        : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'
                    }`}
                    title={skill.is_favorite ? t('skill.removeFavorite') : t('skill.addFavorite')}
                  >
                    <StarIcon className={`w-4 h-4 ${skill.is_favorite ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t('skill.confirmDelete', { name: skill.name }) || `Delete skill "${skill.name}"?`)) {
                        deleteSkill(skill.id);
                      }
                    }}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90"
                    title={t('common.delete')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
