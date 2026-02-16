import React, { useEffect, useMemo, lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CuboidIcon, RefreshCwIcon, TrashIcon, StarIcon, LayoutGridIcon, ListIcon, DownloadIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { useSkillStore } from '../../stores/skill.store';
import { SkillFullDetailPage } from './SkillFullDetailPage';
import { SkillQuickInstall } from './SkillQuickInstall';
import { SkillStore } from './SkillStore';
import type { Skill } from '../../../shared/types';

// Lazy load list view for better performance
// 懒加载列表视图以提升性能
const SkillListView = lazy(() => import('./SkillListView').then(m => ({ default: m.SkillListView })));

export function SkillManager() {
  const { t } = useTranslation();
  const skills = useSkillStore((state) => state.skills);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const isLoading = useSkillStore((state) => state.isLoading);
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const filterType = useSkillStore((state) => state.filterType);
  const viewMode = useSkillStore((state) => state.viewMode);
  const setViewMode = useSkillStore((state) => state.setViewMode);
  const storeView = useSkillStore((state) => state.storeView);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  
  // Get filtered skills - filter directly in useMemo instead of using store function
  // 直接在 useMemo 中过滤，而不是使用 store 函数（避免函数引用作为依赖）
  const filteredSkills = useMemo(() => {
    let result = skills;
    if (filterType === 'favorites') result = result.filter(s => s.is_favorite);
    else if (filterType === 'installed') result = result.filter(s => !!s.registry_slug);
    else if (filterType === 'deployed') result = result.filter(s => deployedSkillNames.has(s.name));
    // Apply tag filter
    if (skillFilterTags.length > 0) {
      result = result.filter(s => s.tags && skillFilterTags.some(tag => s.tags!.includes(tag)));
    }
    return result;
  }, [skills, filterType, deployedSkillNames, skillFilterTags]);
  
  // Quick install state
  // 快速安装状态
  const [quickInstallSkill, setQuickInstallSkill] = useState<Skill | null>(null);
  
  // Load skills on mount, then load deployed status
  useEffect(() => {
    loadSkills().then(() => loadDeployedStatus());
  }, [loadSkills, loadDeployedStatus]);
  
  // Store view: show the skill store page
  // 商店视图：显示技能商店页面
  if (storeView === 'store') {
    return <SkillStore />;
  }

  // If a skill is selected, show full detail page (same behavior for both gallery and list views)
  // 如果选中了技能，显示全宽详情页（画廊和列表视图使用相同交互）
  if (selectedSkillId) {
    return <SkillFullDetailPage />;
  }

  return (
    <div className="flex-1 flex flex-row h-full bg-background overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2">
                <CuboidIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('common.skills')}</h2>
             </div>
             <div className="h-4 w-px bg-border mx-1" />
             <span className="text-[11px] font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full border border-white/5">
               {filteredSkills.length}{filterType !== 'all' ? ` / ${skills.length}` : ''}
             </span>
          </div>
          
          <div className="flex items-center gap-2">
             {/* View mode toggle */}
             {/* 视图模式切换 */}
             <div className="flex items-center bg-muted rounded-lg p-0.5">
               <button
                 onClick={() => setViewMode('gallery')}
                 className={`p-2 rounded-md transition-colors ${
                   viewMode === 'gallery' 
                     ? 'bg-background text-foreground shadow-sm' 
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
                 title={t('skill.galleryView', '画廊视图')}
               >
                 <LayoutGridIcon className="w-4 h-4" />
               </button>
               <button
                 onClick={() => setViewMode('list')}
                 className={`p-2 rounded-md transition-colors ${
                   viewMode === 'list' 
                     ? 'bg-background text-foreground shadow-sm' 
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
                 title={t('skill.listView', '列表视图')}
               >
                 <ListIcon className="w-4 h-4" />
               </button>
             </div>
             <div className="h-4 w-px bg-border" />
             <button 
               onClick={() => loadSkills()}
               className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
               title={t('settings.refresh')}
             >
               <RefreshCwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {viewMode === 'list' ? (
            /* List View */
            /* 列表视图 */
            <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
              <SkillListView 
                skills={filteredSkills} 
                onQuickInstall={setQuickInstallSkill}
              />
            </Suspense>
          ) : (
            /* Gallery View */
            /* 画廊视图 */
            <div className="p-6">
              {filteredSkills.length === 0 ? (
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
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                   {filteredSkills.map((skill, index) => (
                     <div 
                       key={skill.id} 
                       onClick={() => selectSkill(skill.id)}
                       style={{ animationDelay: `${index * 50}ms` }}
                       className="group relative bg-card border border-border rounded-2xl p-5 hover:border-primary/50 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 hover:shadow-xl hover:-translate-y-1"
                     >
                        <div className="flex items-start justify-between mb-4">
                           <SkillIcon
                              iconUrl={skill.icon_url}
                              iconEmoji={skill.icon_emoji}
                              name={skill.name}
                              size="lg"
                              className="transition-transform group-hover:scale-110 group-hover:shadow-lg"
                           />
                           <div className="flex gap-1">
                             {/* Quick install button */}
                             {/* 快速安装按钮 */}
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setQuickInstallSkill(skill);
                               }}
                               className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90"
                               title={t('skill.quickInstall', '快速安装')}
                             >
                               <DownloadIcon className="w-4 h-4" />
                             </button>
                             {/* Favorite button */}
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 toggleFavorite(skill.id);
                               }}
                               className={`p-2 rounded-lg transition-all active:scale-90 ${
                                 skill.is_favorite 
                                   ? 'text-yellow-500 hover:text-yellow-600' 
                                   : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'
                               }`}
                               title={skill.is_favorite ? t('skill.removeFavorite', '取消收藏') : t('skill.addFavorite', '添加收藏')}
                             >
                               <StarIcon className={`w-4 h-4 ${skill.is_favorite ? 'fill-current' : ''}`} />
                             </button>
                             {/* Delete button */}
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if(confirm(t('skill.confirmDelete', { name: skill.name }) || `Delete skill "${skill.name}"?`)) deleteSkill(skill.id);
                               }}
                               className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90"
                               title={t('skill.delete', '删除')}
                             >
                               <TrashIcon className="w-4 h-4" />
                             </button>
                           </div>
                        </div>
                        
                        <h3 className="font-bold text-foreground text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors" title={skill.name}>
                          {skill.name}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4 leading-relaxed italic opacity-80">
                          {skill.description || t('skill.defaultDescription', '技能描述，帮助 AI 理解何时使用此技能')}
                        </p>
                        
                        <div className="flex items-center gap-2 mt-auto">
                          <span className="text-[10px] bg-sidebar-accent/50 px-2.5 py-1 rounded-full text-muted-foreground font-semibold border border-white/5 uppercase tracking-wider">
                            v{skill.version || '1.0.0'}
                          </span>
                        </div>
                     </div>
                   ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Install Modal */}
      {/* 快速安装弹窗 */}
      {quickInstallSkill && (
        <SkillQuickInstall
          skill={quickInstallSkill}
          onClose={() => setQuickInstallSkill(null)}
        />
      )}
    </div>
  );
}
