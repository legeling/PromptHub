import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SearchIcon,
  CheckIcon,
  Loader2Icon,
  LayoutGridIcon,
  CodeIcon,
  SparklesIcon,
  BarChartIcon,
  ShieldIcon,
  RocketIcon,
  PaletteIcon,
  WandIcon,
  BriefcaseIcon,
  FileSpreadsheetIcon,
  StoreIcon,
  BoxesIcon,
  LinkIcon,
  TrashIcon,
  PowerIcon,
  PlusIcon,
  GlobeIcon,
  FolderIcon,
  DatabaseIcon,
} from 'lucide-react';
import { SkillIcon } from './SkillIcon';
import { SkillStoreDetail } from './SkillStoreDetail';
import { useSkillStore } from '../../stores/skill.store';
import { useToast } from '../ui/Toast';
import type { RegistrySkill, SkillCategory, SkillStoreSource } from '../../../shared/types';
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

const CUSTOM_SOURCE_TYPE_OPTIONS: Array<{
  value: Extract<SkillStoreSource['type'], 'marketplace-json' | 'git-repo' | 'local-dir'>;
  icon: React.ReactNode;
}> = [
  {
    value: 'marketplace-json',
    icon: <DatabaseIcon className="w-4 h-4" />,
  },
  {
    value: 'git-repo',
    icon: <GlobeIcon className="w-4 h-4" />,
  },
  {
    value: 'local-dir',
    icon: <FolderIcon className="w-4 h-4" />,
  },
];

const REMOTE_STORE_TTL = 1000 * 60 * 60;

function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: '', description: '', tags: [] as string[] };
  }

  const block = match[1];
  const tagsLine = block.match(/^tags:\s*\[(.+)\]$/m)?.[1] ?? '';

  return {
    name: stripQuotes(block.match(/^name:\s*(.+)$/m)?.[1] ?? ''),
    description: stripQuotes(block.match(/^description:\s*(.+)$/m)?.[1] ?? ''),
    tags: tagsLine
      .split(',')
      .map((tag) => stripQuotes(tag))
      .filter(Boolean),
  };
}

function toTitleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferCategory(slug: string, description: string): SkillCategory {
  const text = `${slug} ${description}`.toLowerCase();
  if (/(pdf|doc|ppt|sheet|spreadsheet|word|xlsx|docx)/.test(text)) return 'office';
  if (/(github|git|web|playwright|mcp|code|cli|dev|pr)/.test(text)) return 'dev';
  if (/(design|figma|css|ui|frontend|canvas|brand)/.test(text)) return 'design';
  if (/(deploy|vercel|docker|cloudflare|netlify)/.test(text)) return 'deploy';
  if (/(secure|security|audit|auth|secret)/.test(text)) return 'security';
  if (/(analy|data|sql|chart|research)/.test(text)) return 'data';
  if (/(manage|project|notion|linear)/.test(text)) return 'management';
  if (/(ai|generate|translation|speech|image|video|art)/.test(text)) return 'ai';
  return 'general';
}

function resolveUrl(baseUrl: string, value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function parseGithubRepo(url: string) {
  const normalized = url
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const match = normalized.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    repositoryUrl: `https://github.com/${match[1]}/${match[2]}`,
  };
}

function dedupeRegistrySkills(skills: RegistrySkill[]) {
  const map = new Map<string, RegistrySkill>();
  for (const skill of skills) {
    map.set(skill.slug, skill);
  }
  return Array.from(map.values());
}

export function SkillStore() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');

  const loadRegistry = useSkillStore((state) => state.loadRegistry);
  const storeCategory = useSkillStore((state) => state.storeCategory);
  const setStoreCategory = useSkillStore((state) => state.setStoreCategory);
  const storeSearchQuery = useSkillStore((state) => state.storeSearchQuery);
  const setStoreSearchQuery = useSkillStore((state) => state.setStoreSearchQuery);
  const installRegistrySkill = useSkillStore((state) => state.installRegistrySkill);
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const skills = useSkillStore((state) => state.skills);
  const selectRegistrySkill = useSkillStore((state) => state.selectRegistrySkill);
  const selectedRegistrySlug = useSkillStore((state) => state.selectedRegistrySlug);
  const registrySkills = useSkillStore((state) => state.registrySkills);
  const selectedStoreSourceId = useSkillStore((state) => state.selectedStoreSourceId);
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources = useSkillStore((state) => state.customStoreSources);
  const addCustomStoreSource = useSkillStore((state) => state.addCustomStoreSource);
  const removeCustomStoreSource = useSkillStore((state) => state.removeCustomStoreSource);
  const toggleCustomStoreSource = useSkillStore((state) => state.toggleCustomStoreSource);
  const remoteStoreEntries = useSkillStore((state) => state.remoteStoreEntries);
  const setRemoteStoreEntry = useSkillStore((state) => state.setRemoteStoreEntry);

  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<Extract<SkillStoreSource['type'], 'marketplace-json' | 'git-repo' | 'local-dir'>>('marketplace-json');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const installedSlugs = useMemo(() => {
    return skills.filter((skill) => skill.registry_slug).map((skill) => skill.registry_slug!);
  }, [skills]);

  const selectedCustomSource = useMemo(
    () => customStoreSources.find((source) => source.id === selectedStoreSourceId) || null,
    [customStoreSources, selectedStoreSourceId],
  );

  const selectedRemoteEntry = remoteStoreEntries[selectedStoreSourceId];
  const isSelectedSourceRemote = selectedStoreSourceId === 'claude-code' || Boolean(selectedCustomSource);

  const loadGitHubSkillRepo = useCallback(
    async (repoUrl: string): Promise<RegistrySkill[]> => {
      const parsedRepo = parseGithubRepo(repoUrl);
      if (!parsedRepo) {
        throw new Error(t('skill.invalidGitRepo', '暂时只支持 GitHub 仓库地址'));
      }

      const repoMetaRaw = await window.api.skill.fetchRemoteContent(
        `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`,
      );
      const repoMeta = JSON.parse(repoMetaRaw || '{}');
      const defaultBranch = repoMeta.default_branch || 'main';

      const treeRaw = await window.api.skill.fetchRemoteContent(
        `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/git/trees/${defaultBranch}?recursive=1`,
      );
      const treeData = JSON.parse(treeRaw || '{}');
      const skillFiles = Array.isArray(treeData.tree)
        ? treeData.tree.filter(
            (item: any) =>
              item?.type === 'blob' &&
              typeof item.path === 'string' &&
              item.path.startsWith('skills/') &&
              item.path.endsWith('/SKILL.md'),
          )
        : [];

      const builtinBySlug = new Map(registrySkills.map((skill) => [skill.slug, skill]));

      const remoteSkills = await Promise.all(
        skillFiles.map(async (item: any) => {
          const path = item.path as string;
          const slug = path.split('/').slice(-2, -1)[0];
          const rawUrl = `https://raw.githubusercontent.com/${parsedRepo.owner}/${parsedRepo.repo}/${defaultBranch}/${path}`;
          const sourceRepoUrl = `${parsedRepo.repositoryUrl}/tree/${defaultBranch}/${path.replace(/\/SKILL\.md$/, '')}`;
          const content = await window.api.skill.fetchRemoteContent(rawUrl);
          if (!content) return null;

          const builtin = builtinBySlug.get(slug);
          const parsed = parseFrontmatter(content);
          const description = parsed.description || builtin?.description || `${toTitleCase(slug)} skill`;

          return {
            slug,
            name: builtin?.name || parsed.name || toTitleCase(slug),
            description,
            category: builtin?.category || inferCategory(slug, description),
            icon_url: builtin?.icon_url,
            icon_emoji: builtin?.icon_emoji,
            author:
              builtin?.author ||
              repoMeta?.owner?.login ||
              (parsedRepo.owner === 'anthropics' ? 'Anthropic' : parsedRepo.owner),
            source_url: sourceRepoUrl,
            tags: builtin?.tags?.length ? builtin.tags : parsed.tags.length ? parsed.tags : slug.split(/[-_]/).filter(Boolean),
            version: builtin?.version || '1.0.0',
            content,
            content_url: rawUrl,
            prerequisites: builtin?.prerequisites,
            compatibility: builtin?.compatibility || ['claude', 'cursor'],
          } satisfies RegistrySkill;
        }),
      );

      return dedupeRegistrySkills(remoteSkills.filter((skill): skill is RegistrySkill => Boolean(skill)));
    },
    [registrySkills, t],
  );

  const loadMarketplaceStore = useCallback(
    async (url: string, visited = new Set<string>()): Promise<RegistrySkill[]> => {
      const resolvedUrl = resolveUrl(url, url);
      if (!resolvedUrl || visited.has(resolvedUrl)) return [];
      visited.add(resolvedUrl);

      const raw = await window.api.skill.fetchRemoteContent(resolvedUrl);
      if (!raw) return [];

      const data = JSON.parse(raw);
      const builtinBySlug = new Map(registrySkills.map((skill) => [skill.slug, skill]));
      const directSkills = Array.isArray(data.skills) ? data.skills : [];

      const mappedSkills = await Promise.all(
        directSkills.map(async (item: any) => {
          const slug = item.slug || item.id || slugify(item.name || item.title || 'remote-skill');
          if (!slug) return null;

          const builtin = builtinBySlug.get(slug);
          const contentUrl =
            resolveUrl(
              resolvedUrl,
              item.content_url || item.contentUrl || item.skill_url || item.skillUrl || item.raw_url || item.rawUrl,
            ) || undefined;
          const sourceUrl =
            resolveUrl(
              resolvedUrl,
              item.source_url || item.sourceUrl || item.repo_url || item.repoUrl || item.repository || item.repo,
            ) || contentUrl || resolvedUrl;

          let content = typeof item.content === 'string' ? item.content : '';
          if (!content && contentUrl) {
            try {
              content = await window.api.skill.fetchRemoteContent(contentUrl);
            } catch {
              content = '';
            }
          }

          const parsed = content ? parseFrontmatter(content) : { name: '', description: '', tags: [] as string[] };
          const description =
            item.description || parsed.description || builtin?.description || `${toTitleCase(slug)} skill`;

          return {
            slug,
            name: item.name || item.title || parsed.name || builtin?.name || toTitleCase(slug),
            description,
            category: (item.category as SkillCategory) || builtin?.category || inferCategory(slug, description),
            icon_url: item.icon_url || item.iconUrl || builtin?.icon_url,
            icon_emoji: item.icon_emoji || item.iconEmoji || builtin?.icon_emoji,
            author: item.author || builtin?.author || 'Community',
            source_url: sourceUrl,
            tags:
              Array.isArray(item.tags) && item.tags.length > 0
                ? item.tags
                : parsed.tags.length > 0
                  ? parsed.tags
                  : builtin?.tags || slug.split(/[-_]/).filter(Boolean),
            version: String(item.version || builtin?.version || '1.0.0'),
            content: content || `# ${item.name || parsed.name || toTitleCase(slug)}`,
            content_url: contentUrl,
            prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites : builtin?.prerequisites,
            compatibility: Array.isArray(item.compatibility)
              ? item.compatibility
              : builtin?.compatibility || ['claude', 'cursor'],
          } satisfies RegistrySkill;
        }),
      );

      const nestedStoreRefs = [
        ...(Array.isArray(data.marketplaces) ? data.marketplaces : []),
        ...(Array.isArray(data.sources) ? data.sources : []),
        ...(Array.isArray(data.registries) ? data.registries : []),
      ]
        .map((entry: any) => (typeof entry === 'string' ? entry : entry?.url || entry?.index || entry?.manifest))
        .filter(Boolean)
        .map((entry: string) => resolveUrl(resolvedUrl, entry))
        .filter((entry: string | null): entry is string => Boolean(entry));

      const nestedSkills = await Promise.all(
        nestedStoreRefs.map((entry) => loadMarketplaceStore(entry, visited)),
      );

      return dedupeRegistrySkills([
        ...mappedSkills.filter((skill): skill is RegistrySkill => Boolean(skill)),
        ...nestedSkills.flat(),
      ]);
    },
    [registrySkills],
  );

  const loadLocalDirectoryStore = useCallback(
    async (dirPath: string): Promise<RegistrySkill[]> => {
      const scannedSkills = await scanLocalPreview([dirPath]);
      return scannedSkills.map((skill) => ({
        slug: slugify(skill.name),
        name: skill.name,
        description: skill.description || `${skill.name} skill`,
        category: inferCategory(skill.name, skill.description || ''),
        author: skill.author || 'Local',
        source_url: skill.localPath || dirPath,
        tags: skill.tags?.length ? skill.tags : slugify(skill.name).split('-').filter(Boolean),
        version: skill.version || '1.0.0',
        content: skill.instructions,
        content_url: skill.filePath,
        compatibility: skill.platforms,
      }));
    },
    [scanLocalPreview],
  );

  const loadStoreSource = useCallback(
    async (sourceId: string, forceRefresh = false) => {
      if (sourceId === 'official' || sourceId === 'community' || sourceId === 'new-custom') {
        return;
      }

      const source =
        sourceId === 'claude-code'
          ? {
              id: 'claude-code',
              type: 'git-repo' as const,
              url: 'https://github.com/anthropics/skills',
            }
          : customStoreSources.find((item) => item.id === sourceId);

      if (!source) return;
      if ('enabled' in source && !source.enabled) return;

      const cachedEntry = remoteStoreEntries[sourceId];
      const isFresh = cachedEntry && Date.now() - cachedEntry.loadedAt < REMOTE_STORE_TTL;
      if (!forceRefresh && isFresh) return;

      setLoadingSourceId(sourceId);
      try {
        let skillsForSource: RegistrySkill[] = [];
        if (source.type === 'git-repo') {
          skillsForSource = await loadGitHubSkillRepo(source.url);
        } else if (source.type === 'marketplace-json') {
          skillsForSource = await loadMarketplaceStore(source.url);
        } else if (source.type === 'local-dir') {
          skillsForSource = await loadLocalDirectoryStore(source.url);
        }

        setRemoteStoreEntry(sourceId, {
          loadedAt: Date.now(),
          error: null,
          skills: skillsForSource,
        });
      } catch (error) {
        console.error(`Failed to load remote store ${sourceId}:`, error);
        setRemoteStoreEntry(sourceId, {
          loadedAt: Date.now(),
          error: error instanceof Error ? error.message : t('skill.remoteStoreLoadFailed', '拉取远程商店失败'),
          skills: cachedEntry?.skills || [],
        });
      } finally {
        setLoadingSourceId((current) => (current === sourceId ? null : current));
      }
    },
    [customStoreSources, loadGitHubSkillRepo, loadLocalDirectoryStore, loadMarketplaceStore, remoteStoreEntries, setRemoteStoreEntry, t],
  );

  useEffect(() => {
    if (!isSelectedSourceRemote) return;
    void loadStoreSource(selectedStoreSourceId);
  }, [isSelectedSourceRemote, loadStoreSource, selectedStoreSourceId]);

  const sourceRegistrySkills = useMemo(() => {
    let baseSkills: RegistrySkill[] = [];
    if (selectedStoreSourceId === 'official') {
      baseSkills = registrySkills;
    } else if (selectedStoreSourceId === 'community') {
      baseSkills = [];
    } else {
      baseSkills = selectedRemoteEntry?.skills || [];
    }

    if (storeCategory !== 'all') {
      baseSkills = baseSkills.filter((skill) => skill.category === storeCategory);
    }

    if (storeSearchQuery.trim()) {
      const query = storeSearchQuery.toLowerCase();
      baseSkills = baseSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return baseSkills;
  }, [registrySkills, selectedRemoteEntry?.skills, selectedStoreSourceId, storeCategory, storeSearchQuery]);

  const selectedDetailSkill = useMemo(() => {
    if (!selectedRegistrySlug) return null;
    return sourceRegistrySkills.find((skill) => skill.slug === selectedRegistrySlug) || null;
  }, [selectedRegistrySlug, sourceRegistrySkills]);

  const installed = useMemo(
    () => sourceRegistrySkills.filter((skill) => installedSlugs.includes(skill.slug)),
    [installedSlugs, sourceRegistrySkills],
  );

  const recommended = useMemo(
    () => sourceRegistrySkills.filter((skill) => !installedSlugs.includes(skill.slug)),
    [installedSlugs, sourceRegistrySkills],
  );

  const handleQuickInstall = async (skill: RegistrySkill, e: React.MouseEvent) => {
    e.stopPropagation();
    setInstallingSlug(skill.slug);
    try {
      const result = await installRegistrySkill(skill);
      if (result) {
        showToast(`${t('skill.addedToLibrary', 'Imported')}: ${skill.name}`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || t('skill.updateFailed', 'Failed'), 'error');
    } finally {
      setTimeout(() => setInstallingSlug(null), 500);
    }
  };

  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(t('skill.storeSourceRequired', '请填写商店名称和地址'), 'error');
      return;
    }

    addCustomStoreSource(sourceName, sourceUrl, sourceType);
    const createdId = useSkillStore.getState().selectedStoreSourceId;
    setSourceName('');
    setSourceUrl('');
    setSourceType('marketplace-json');
    showToast(t('skill.storeSourceAdded', '商店已添加'), 'success');
    if (createdId) {
      void loadStoreSource(createdId, true);
    }
  };

  const categories: { key: SkillCategory | 'all'; label: string }[] = [
    { key: 'all', label: isZh ? '全部' : 'All' },
    ...Object.entries(SKILL_CATEGORIES).map(([key, value]) => ({
      key: key as SkillCategory,
      label: isZh ? value.label : value.labelEn,
    })),
  ];

  const sourceMeta = useMemo(() => {
    if (selectedStoreSourceId === 'community') {
      return {
        title: t('skill.communityStore', '社区商店'),
        hint: t(
          'skill.communityStoreHint',
          '这里聚合第三方社区发布的 skill 源。你也可以通过左侧自定义商店接入自己的 marketplace。',
        ),
        count: 0,
        showCatalog: false,
      };
    }

    if (selectedStoreSourceId === 'claude-code') {
      return {
        title: t('skill.claudeCodeStore', 'Claude Code 商店'),
        hint: t(
          'skill.claudeCodeStoreHint',
          '实时拉取 anthropics/skills 仓库，并按 PromptHub 的商店卡片结构展示。',
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
      };
    }

    if (selectedStoreSourceId === 'new-custom') {
      return {
        title: t('skill.addStoreSource', '添加商店'),
        hint: t(
          'skill.customStoresHint',
          '添加后会立即尝试拉取远程内容。支持 marketplace.json、GitHub 仓库和本地目录。',
        ),
        count: customStoreSources.length,
        showCatalog: false,
      };
    }

    if (selectedCustomSource) {
      return {
        title: selectedCustomSource.name,
        hint: selectedCustomSource.url,
        count: sourceRegistrySkills.length,
        showCatalog: true,
      };
    }

    return {
      title: t('skill.officialStore', '官方商店'),
      hint: t('skill.storeHint', '从官方内置商店导入 PromptHub 已整理好的 skills。'),
      count: sourceRegistrySkills.length,
      showCatalog: true,
    };
  }, [customStoreSources.length, selectedCustomSource, selectedStoreSourceId, sourceRegistrySkills.length, t]);

  const currentRemoteError = selectedRemoteEntry?.error || null;
  const shouldShowInitialLoading =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    (!selectedRemoteEntry || selectedRemoteEntry.skills.length === 0);
  const isRefreshingCachedSource =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    Boolean(selectedRemoteEntry?.skills.length);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 bg-background/50 backdrop-blur-sm z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">{sourceMeta.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{sourceMeta.hint}</p>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full border border-white/5">
            {sourceMeta.count} {isZh ? '个技能' : 'skills'}
          </span>
          {isRefreshingCachedSource && (
            <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border inline-flex items-center gap-1">
              <Loader2Icon className="w-3 h-3 animate-spin" />
              {t('common.refreshing', '刷新中')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sourceMeta.showCatalog && (
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
          )}
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border bg-background/30 space-y-3">
        {sourceMeta.showCatalog && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
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
        )}

        {selectedStoreSourceId === 'new-custom' && (
          <div className="space-y-4 bg-card border border-border rounded-2xl p-4">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {t('skill.storeSourceType', '商店类型')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {CUSTOM_SOURCE_TYPE_OPTIONS.map((option) => {
                  const active = sourceType === option.value;
                  const label =
                    option.value === 'marketplace-json'
                      ? t('skill.sourceTypeMarketplace', 'Marketplace JSON')
                      : option.value === 'git-repo'
                        ? t('skill.sourceTypeGit', 'Git 仓库')
                        : t('skill.sourceTypeLocal', '本地目录');
                  const hint =
                    option.value === 'marketplace-json'
                      ? t('skill.sourceTypeMarketplaceHint', '直接拉取 marketplace.json 并解析其中的 skills 列表。')
                      : option.value === 'git-repo'
                        ? t('skill.sourceTypeGitHint', '输入 GitHub 仓库地址，自动扫描 skills/*/SKILL.md。')
                        : t('skill.sourceTypeLocalHint', '输入本地目录路径，扫描目录中的 skills。');

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSourceType(option.value)}
                      className={`text-left rounded-xl border px-4 py-3 transition-all ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_rgba(96,165,250,0.2)]'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className={`${active ? 'text-primary' : 'text-muted-foreground'}`}>{option.icon}</span>
                        {label}
                      </div>
                      <div className="mt-1 text-xs leading-5">{hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr_auto] gap-2">
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={t('skill.storeNamePlaceholder', '商店名称')}
                className="px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={
                  sourceType === 'local-dir'
                    ? t('skill.storePathPlaceholder', '本地目录路径')
                    : t('skill.storeUrlPlaceholder', '商店地址 / manifest URL')
                }
                className="px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
              <button
                onClick={handleAddSource}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:opacity-90 transition-opacity"
              >
                {t('common.add', '添加')}
              </button>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-6">
              <div className="font-medium text-foreground mb-1">{t('skill.storeExamples', '示例')}</div>
              {sourceType === 'marketplace-json' && (
                <>
                  <div>{t('skill.storeExampleMarketplace', 'Marketplace JSON 示例')}</div>
                  <div className="mt-1 font-mono break-all text-[11px]">
                    https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
                  </div>
                </>
              )}
              {sourceType === 'git-repo' && (
                <>
                  <div>{t('skill.storeExampleGit', 'Git 仓库示例')}</div>
                  <div className="mt-1 font-mono break-all text-[11px]">
                    https://github.com/anthropics/skills
                  </div>
                </>
              )}
              {sourceType === 'local-dir' && (
                <>
                  <div>{t('skill.storeExampleLocal', '本地目录示例')}</div>
                  <div className="mt-1 font-mono break-all text-[11px]">~/Documents/my-skills</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {shouldShowInitialLoading && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            {selectedStoreSourceId === 'claude-code'
              ? t('skill.loadingRemoteStore', '正在拉取 Claude Code 远程技能列表...')
              : t('skill.loadingCustomStore', '正在拉取自定义商店内容...')}
          </div>
        )}

        {currentRemoteError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {t('skill.remoteStoreLoadFailed', '拉取远程商店失败')}：{currentRemoteError}
          </div>
        )}

        {sourceMeta.showCatalog && (
          <>
            {installed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t('skill.importedSection', '已导入')}
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

            {recommended.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t('skill.availableSection', '可导入')}
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

            {installed.length === 0 && recommended.length === 0 && !shouldShowInitialLoading && (
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
          </>
        )}

        {selectedStoreSourceId === 'claude-code' && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">{t('skill.claudeCodeStore', 'Claude Code 商店')}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                'skill.claudeCodeStoreDetail',
                '这个来源会实时读取 anthropics/skills 仓库，并把其中的 SKILL.md 解析成可导入的商店卡片。缓存会保存在本地，后续进入页面会优先展示缓存，再静默刷新。',
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">{t('skill.supportedFormat', '支持格式')}</div>
                <div className="text-xs text-muted-foreground leading-6">
                  `SKILL.md` 目录型仓库
                  <br />
                  `marketplace.json` 索引型商店
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">{t('skill.exampleSources', '内置参考源')}</div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/anthropics/skills
                  <br />
                  https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === 'community' && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3 text-foreground">
              <BoxesIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">{t('skill.communityStore', '社区商店')}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              {t(
                'skill.communityStoreHint',
                '这里将聚合第三方社区发布的 skill 源。你也可以先通过左侧“添加商店”接入真实 marketplace.json 或 Git 仓库。',
              )}
            </p>
          </div>
        )}

        {(selectedStoreSourceId === 'new-custom' || selectedCustomSource) && (
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {selectedCustomSource ? selectedCustomSource.name : t('skill.customStores', '我的商店')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCustomSource
                  ? selectedCustomSource.url
                  : t('skill.customStoresHint', '支持添加你自己的商店地址，并真实拉取远程 skills 内容。')}
              </p>
            </div>

            {!selectedCustomSource && customStoreSources.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
                <LinkIcon className="w-10 h-10 mx-auto opacity-30 mb-3" />
                <h4 className="text-base font-semibold text-foreground mb-1">
                  {t('skill.noCustomStores', '还没有自定义商店')}
                </h4>
                <p className="text-sm">
                  {t('skill.noCustomStoresHint', '点击左侧虚线框“添加商店”开始接入你自己的 skill 来源。')}
                </p>
              </div>
            ) : selectedCustomSource ? (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground truncate">{selectedCustomSource.name}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          selectedCustomSource.enabled
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {selectedCustomSource.enabled
                          ? t('common.enabled', '已启用')
                          : t('common.disabled', '已停用')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">{selectedCustomSource.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCustomStoreSource(selectedCustomSource.id)}
                    className="px-3 py-2 text-sm rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors"
                  >
                    {selectedCustomSource.enabled ? t('common.disable', '停用') : t('common.enable', '启用')}
                  </button>
                  <button
                    onClick={() => void loadStoreSource(selectedCustomSource.id, true)}
                    className="px-3 py-2 text-sm rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors inline-flex items-center gap-2"
                  >
                    <Loader2Icon className={`w-4 h-4 ${loadingSourceId === selectedCustomSource.id ? 'animate-spin' : ''}`} />
                    {t('common.refresh', '刷新')}
                  </button>
                  <button
                    onClick={() => {
                      removeCustomStoreSource(selectedCustomSource.id);
                      selectStoreSource('official');
                    }}
                    className="px-3 py-2 text-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    {t('common.delete', '删除')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {customStoreSources.map((source) => {
                  const count = remoteStoreEntries[source.id]?.skills.length || 0;
                  return (
                    <div
                      key={source.id}
                      className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <LinkIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground truncate">{source.name}</h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              source.enabled ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {source.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已停用')}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
                            {count} {isZh ? '个技能' : 'skills'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">{source.url}</p>
                      </div>
                      <button
                        onClick={() => toggleCustomStoreSource(source.id)}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                        title={source.enabled ? t('common.disable', '停用') : t('common.enable', '启用')}
                      >
                        <PowerIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void loadStoreSource(source.id, true)}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                        title={t('common.refresh', '刷新')}
                      >
                        <Loader2Icon className={`w-4 h-4 ${loadingSourceId === source.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => removeCustomStoreSource(source.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title={t('common.delete', '删除')}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

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

interface SkillStoreCardProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  index: number;
  installingSlug?: string | null;
  onQuickInstall?: (skill: RegistrySkill, e: React.MouseEvent) => void;
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
      <SkillIcon iconUrl={skill.icon_url} iconEmoji={skill.icon_emoji} name={skill.name} size="md" />

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {skill.name}
        </h4>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{skill.description}</p>
      </div>

      <div className="shrink-0">
        {isInstalled ? (
          <div className="p-1.5 text-green-500" title={t('skill.imported', 'Imported')}>
            <CheckIcon className="w-4 h-4" />
          </div>
        ) : (
          <button
            onClick={(e) => onQuickInstall?.(skill, e)}
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
