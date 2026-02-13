import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, PlusIcon, CheckIcon, Loader2Icon, LayoutGridIcon, CodeIcon, SparklesIcon, BarChartIcon, ShieldIcon, RocketIcon, PaletteIcon, WandIcon, BriefcaseIcon, FileSpreadsheetIcon } from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { SkillStoreDetail } from './SkillStoreDetail';
import { useSkillStore } from '../../stores/skill.store';
import { useToast } from '../ui/Toast';
import type { RegistrySkill, SkillCategory } from '../../../shared/types';
import { SKILL_CATEGORIES } from '../../../shared/constants/skill-registry';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <LayoutGridIcon className="w-3.5 h-3.5" />,
  office: <FileSpreadsheetIcon className="w-3.5 h-3.5" />,
  dev: <CodeIcon className="w-3.5 h-3.5" />,
  ai: <SparklesIcon className="w-3.5 h-3.5" />,
  data: <BarChartIcon className="w-3.5 h-3.5" />,
  management: <BriefcaseIcon className="w-3.5 h-3.5" />,
  deploy: <RocketIcon className="w-3.5 h-3.5" />,
  design: <PaletteIcon className="w-3.5 h-3.5" />,
  security: <ShieldIcon className="w-3.5 h-3.5" />,
  meta: <WandIcon className="w-3.5 h-3.5" />,
};

/**
 * Skill Store page — browse and install skills from the built-in registry
 * 技能商店页面 — 浏览和安装内置注册表中的技能
 */
export function SkillStore() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');

  const loadRegistry = useSkillStore((state) => state.loadRegistry);
  const storeCategory = useSkillStore((state) => state.storeCategory);
  const setStoreCategory = useSkillStore((state) => state.setStoreCategory);
  const storeSearchQuery = useSkillStore((state) => state.storeSearchQuery);
  const setStoreSearchQuery = useSkillStore((state) => state.setStoreSearchQuery);
  const getFilteredRegistrySkills = useSkillStore((state) => state.getFilteredRegistrySkills);
  const installFromRegistry = useSkillStore((state) => state.installFromRegistry);
  const skills = useSkillStore((state) => state.skills);
  const selectRegistrySkill = useSkillStore((state) => state.selectRegistrySkill);
  const selectedRegistrySlug = useSkillStore((state) => state.selectedRegistrySlug);
  const registrySkills = useSkillStore((state) => state.registrySkills);

  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const { showToast } = useToast();

  // Load registry on mount
  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  // Get filtered skills
  const { installed, recommended } = useMemo(() => {
    return getFilteredRegistrySkills();
  }, [getFilteredRegistrySkills, storeCategory, storeSearchQuery, skills, registrySkills]);

  // Get the selected detail skill
  const selectedDetailSkill = useMemo(() => {
    if (!selectedRegistrySlug) return null;
    return registrySkills.find((s) => s.slug === selectedRegistrySlug) || null;
  }, [selectedRegistrySlug, registrySkills]);

  const installedSlugs = useMemo(() => {
    return skills.filter((s) => s.registry_slug).map((s) => s.registry_slug!);
  }, [skills]);

  const handleQuickInstall = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInstallingSlug(slug);
    try {
      const result = await installFromRegistry(slug);
      if (result) {
        const skill = registrySkills.find(s => s.slug === slug);
        showToast(t('skill.addedToLibrary', 'Added') + `: ${skill?.name || slug}`, 'success');
      }
    } catch (err) {
      showToast(t('skill.updateFailed', 'Failed') + `: ${err}`, 'error');
    } finally {
      setTimeout(() => setInstallingSlug(null), 500);
    }
  };

  const categories: { key: SkillCategory | 'all'; label: string }[] = [
    { key: 'all', label: isZh ? '全部' : 'All' },
    ...Object.entries(SKILL_CATEGORIES).map(([key, val]) => ({
      key: key as SkillCategory,
      label: isZh ? val.label : val.labelEn,
    })),
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('skill.store', 'Skill Store')}</h2>
          <span className="text-[11px] font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full border border-white/5">
            {registrySkills.length} {isZh ? '个技能' : 'skills'}
          </span>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={storeSearchQuery}
            onChange={(e) => setStoreSearchQuery(e.target.value)}
            placeholder={t('skill.searchStore', 'Search skills...')}
            className="w-full pl-9 pr-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border bg-background/30 overflow-x-auto scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setStoreCategory(cat.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              storeCategory === cat.key
                ? 'bg-primary text-white shadow-sm'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {CATEGORY_ICONS[cat.key]}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {/* Installed Section */}
        {installed.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {t('skill.installedSection', 'Installed')}
              </h3>
              <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-bold">
                {installed.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {installed.map((skill, index) => (
                <SkillStoreCard
                  key={skill.slug}
                  skill={skill}
                  isInstalled={true}
                  index={index}
                  onClick={() => selectRegistrySkill(skill.slug)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recommended Section */}
        {recommended.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {t('skill.recommendedSection', 'Recommended')}
              </h3>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                {recommended.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {recommended.map((skill, index) => (
                <SkillStoreCard
                  key={skill.slug}
                  skill={skill}
                  isInstalled={false}
                  index={index}
                  installingSlug={installingSlug}
                  onQuickInstall={handleQuickInstall}
                  onClick={() => selectRegistrySkill(skill.slug)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {installed.length === 0 && recommended.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <SearchIcon className="w-12 h-12 opacity-20 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {t('skill.noResults', 'No skills found')}
            </h3>
            <p className="text-sm opacity-70">
              {t('skill.tryDifferentSearch', 'Try a different search or category')}
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedDetailSkill && (
        <SkillStoreDetail
          skill={selectedDetailSkill}
          isInstalled={installedSlugs.includes(selectedDetailSkill.slug)}
          onClose={() => selectRegistrySkill(null)}
        />
      )}
    </div>
  );
}

// ─── Skill Card Component ───

interface SkillStoreCardProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  index: number;
  installingSlug?: string | null;
  onQuickInstall?: (slug: string, e: React.MouseEvent) => void;
  onClick: () => void;
}

function SkillStoreCard({ skill, isInstalled, index, installingSlug, onQuickInstall, onClick }: SkillStoreCardProps) {
  const { t } = useTranslation();
  const isInstallingThis = installingSlug === skill.slug;

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${index * 30}ms` }}
      className="group relative flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/40 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 hover:shadow-md"
    >
      <SkillIcon
        iconUrl={skill.icon_url}
        iconEmoji={skill.icon_emoji}
        name={skill.name}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {skill.name}
        </h4>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {skill.description}
        </p>
      </div>

      {/* Action button */}
      <div className="shrink-0">
        {isInstalled ? (
          <div className="p-1.5 text-green-500" title={t('skill.installed', 'Installed')}>
            <CheckIcon className="w-4 h-4" />
          </div>
        ) : (
          <button
            onClick={(e) => onQuickInstall?.(skill.slug, e)}
            disabled={isInstallingThis}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90 disabled:opacity-50"
            title={t('skill.install', 'Install')}
          >
            {isInstallingThis ? (
              <Loader2Icon className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
