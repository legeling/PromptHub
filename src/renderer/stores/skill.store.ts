import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Skill, CreateSkillParams, UpdateSkillParams, RegistrySkill, SkillCategory } from '../../shared/types';
import { BUILTIN_SKILL_REGISTRY, SKILL_CATEGORIES } from '../../shared/constants/skill-registry';
import { chatCompletion } from '../services/ai';
import { useSettingsStore } from './settings.store';

export type SkillFilterType = 'all' | 'favorites' | 'installed' | 'deployed';
export type SkillViewMode = 'gallery' | 'list';
export type SkillStoreView = 'my-skills' | 'store';

interface SkillState {
  skills: Skill[];
  selectedSkillId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // View mode
  // 视图模式
  viewMode: SkillViewMode;
  
  // Search & Filter
  searchQuery: string;
  filterType: SkillFilterType;

  // Skill Store (registry)
  // 技能商店（注册表）
  storeView: SkillStoreView;
  registrySkills: RegistrySkill[];
  isLoadingRegistry: boolean;
  storeCategory: SkillCategory | 'all';
  storeSearchQuery: string;
  selectedRegistrySlug: string | null;

  // Actions
  loadSkills: () => Promise<void>;
  selectSkill: (id: string | null) => void;
  createSkill: (data: CreateSkillParams) => Promise<Skill | null>;
  updateSkill: (id: string, data: UpdateSkillParams) => Promise<Skill | null>;
  deleteSkill: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  scanLocalSkills: () => Promise<number>;
  installToPlatform: (platform: 'claude' | 'cursor', name: string, mcpConfig: any) => Promise<void>;
  uninstallFromPlatform: (platform: 'claude' | 'cursor', name: string) => Promise<void>;
  getPlatformStatus: (name: string) => Promise<Record<string, boolean>>;
  
  // View mode actions
  // 视图模式操作
  setViewMode: (mode: SkillViewMode) => void;
  
  // Search & Filter Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: SkillFilterType) => void;
  filterTags: string[];
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  getFilteredSkills: () => Skill[];

  // Skill Store Actions
  // 技能商店操作
  setStoreView: (view: SkillStoreView) => void;
  loadRegistry: () => void;
  installFromRegistry: (slug: string) => Promise<Skill | null>;
  uninstallRegistrySkill: (slug: string) => Promise<boolean>;
  setStoreCategory: (category: SkillCategory | 'all') => void;
  setStoreSearchQuery: (query: string) => void;
  selectRegistrySkill: (slug: string | null) => void;
  getInstalledSlugs: () => string[];
  getRecommendedSkills: () => RegistrySkill[];
  getFilteredRegistrySkills: () => { installed: RegistrySkill[]; recommended: RegistrySkill[] };

  // Deployed tracking
  // 已分发到平台的技能名称集合
  deployedSkillNames: Set<string>;
  loadDeployedStatus: () => Promise<void>;

  // Translation cache
  // 翻译缓存
  translationCache: Record<string, string>;
  translateContent: (content: string, cacheKey: string, targetLang: string) => Promise<string | null>;
  getTranslation: (cacheKey: string) => string | null;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
  skills: [],
  selectedSkillId: null,
  isLoading: false,
  error: null,
  viewMode: 'gallery' as SkillViewMode,
  searchQuery: '',
  filterType: 'all',
  filterTags: [] as string[],

  // Deployed tracking
  deployedSkillNames: new Set<string>(),

  // Skill Store state
  storeView: 'my-skills' as SkillStoreView,
  registrySkills: [] as RegistrySkill[],
  isLoadingRegistry: false,
  storeCategory: 'all' as SkillCategory | 'all',
  storeSearchQuery: '',
  selectedRegistrySlug: null,

  loadSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const skills = await window.api.skill.getAll();
      set({ skills, isLoading: false });
    } catch (error) {
      console.error('Failed to load skills:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  loadDeployedStatus: async () => {
    const { skills } = get();
    const deployed = new Set<string>();
    for (const skill of skills) {
      try {
        const status = await window.api.skill.getMdInstallStatus(skill.name);
        if (Object.values(status).some(Boolean)) {
          deployed.add(skill.name);
        }
      } catch {
        // skip
      }
    }
    set({ deployedSkillNames: deployed });
  },

  selectSkill: (id) => {
    set({ selectedSkillId: id });
  },

  createSkill: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const newSkill = await window.api.skill.create(data);
      if (newSkill) {
        set((state) => ({
          skills: [newSkill, ...state.skills],
          selectedSkillId: newSkill.id,
          isLoading: false,
        }));
        return newSkill;
      }
      return null;
    } catch (error) {
      console.error('Failed to create skill:', error);
      set({ error: String(error), isLoading: false });
      return null;
    }
  },

  updateSkill: async (id, data) => {
    try {
      const updatedSkill = await window.api.skill.update(id, data);
      if (updatedSkill) {
        set((state) => ({
          skills: state.skills.map((s) => (s.id === id ? updatedSkill : s)),
        }));
        return updatedSkill;
      }
      return null;
    } catch (error) {
      console.error('Failed to update skill:', error);
      return null;
    }
  },

  deleteSkill: async (id) => {
    try {
      const success = await window.api.skill.delete(id);
      if (success) {
        set((state) => ({
          skills: state.skills.filter((s) => s.id !== id),
          selectedSkillId: state.selectedSkillId === id ? null : state.selectedSkillId,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete skill:', error);
      return false;
    }
  },

  scanLocalSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const count = await window.api.skill.scanLocal();
      if (count > 0) {
          const skills = await window.api.skill.getAll();
          set({ skills, isLoading: false });
      } else {
          set({ isLoading: false });
      }
      return count;
    } catch (error) {
      console.error('Failed to scan local skills:', error);
      set({ error: String(error), isLoading: false });
      return 0;
    }
  },

  installToPlatform: async (platform, name, mcpConfig) => {
      try {
          await window.api.skill.installToPlatform(platform, name, mcpConfig);
      } catch (error) {
          console.error(`Failed to install to ${platform}:`, error);
          throw error;
      }
  },

  uninstallFromPlatform: async (platform, name) => {
      try {
          await window.api.skill.uninstallFromPlatform(platform, name);
      } catch (error) {
          console.error(`Failed to uninstall from ${platform}:`, error);
          throw error;
      }
  },

  getPlatformStatus: async (name) => {
      try {
          return await window.api.skill.getPlatformStatus(name);
      } catch (error) {
          console.error(`Failed to get platform status for ${name}:`, error);
          return { claude: false, cursor: false };
      }
  },

  toggleFavorite: async (id) => {
    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;
    
    try {
      const updatedSkill = await window.api.skill.update(id, { is_favorite: !skill.is_favorite });
      if (updatedSkill) {
        set((state) => ({
          skills: state.skills.map((s) => (s.id === id ? updatedSkill : s)),
        }));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setFilterType: (filter) => {
    set({ filterType: filter });
  },

  toggleFilterTag: (tag) => {
    const { filterTags } = get();
    if (filterTags.includes(tag)) {
      set({ filterTags: filterTags.filter(t => t !== tag) });
    } else {
      set({ filterTags: [...filterTags, tag] });
    }
  },

  clearFilterTags: () => {
    set({ filterTags: [] });
  },

  getFilteredSkills: () => {
    const { skills, searchQuery, filterType } = get();
    let filtered = skills;

    // Apply filter
    if (filterType === 'favorites') {
      filtered = filtered.filter((s) => s.is_favorite);
    } else if (filterType === 'installed') {
      filtered = filtered.filter((s) => !!s.registry_slug);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => {
        const nameMatch = s.name.toLowerCase().includes(query);
        const descMatch = s.description?.toLowerCase().includes(query);
        const tagsMatch = s.tags?.some((tag) => tag.toLowerCase().includes(query));
        const instructionsMatch = s.instructions?.toLowerCase().includes(query);
        return nameMatch || descMatch || tagsMatch || instructionsMatch;
      });
    }

    return filtered;
  },

  // ─── Skill Store Actions / 技能商店操作 ───

  setStoreView: (view) => {
    set({ storeView: view, selectedRegistrySlug: null });
  },

  loadRegistry: () => {
    set({ isLoadingRegistry: true });
    // Load built-in registry with embedded content
    // 加载内置注册表（使用嵌入内容）
    const registry = [...BUILTIN_SKILL_REGISTRY];
    set({ registrySkills: registry, isLoadingRegistry: false });

    // If any skills have content_url, fetch real content in the background
    // 如果有技能有 content_url，在后台获取真实内容
    const withUrls = registry.filter(s => s.content_url);
    if (withUrls.length > 0) {
      (async () => {
        const updated = [...registry];
        let hasUpdates = false;

        await Promise.allSettled(
          updated.map(async (skill, index) => {
            if (!skill.content_url) return;
            try {
              const realContent = await window.api.skill.fetchRemoteContent(skill.content_url);
              if (realContent && realContent.trim().length > 0) {
                updated[index] = { ...skill, content: realContent };
                hasUpdates = true;
              }
            } catch {
              // Silently fall back to embedded content
            }
          })
        );

        if (hasUpdates) {
          set({ registrySkills: [...updated] });
        }
      })();
    }
  },

  installFromRegistry: async (slug) => {
    const { registrySkills, loadSkills } = get();
    const regSkill = registrySkills.find((s) => s.slug === slug);
    if (!regSkill) return null;

    try {
      const newSkill = await window.api.skill.create({
        name: regSkill.slug,
        description: regSkill.description,
        instructions: regSkill.content,
        content: regSkill.content,
        protocol_type: 'skill',
        version: regSkill.version,
        author: regSkill.author,
        source_url: regSkill.source_url,
        tags: regSkill.tags,
        is_favorite: false,
        icon_url: regSkill.icon_url,
        icon_emoji: regSkill.icon_emoji,
        category: regSkill.category,
        is_builtin: true,
        registry_slug: regSkill.slug,
        content_url: regSkill.content_url,
        prerequisites: regSkill.prerequisites,
        compatibility: regSkill.compatibility,
      });
      if (newSkill) {
        await loadSkills();
        return newSkill;
      }
      return null;
    } catch (error) {
      console.error('Failed to install from registry:', error);
      return null;
    }
  },

  uninstallRegistrySkill: async (slug) => {
    const { skills, loadSkills } = get();
    const skill = skills.find((s) => s.registry_slug === slug);
    if (!skill) return false;

    try {
      const success = await window.api.skill.delete(skill.id);
      if (success) {
        await loadSkills();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to uninstall registry skill:', error);
      return false;
    }
  },

  setStoreCategory: (category) => {
    set({ storeCategory: category });
  },

  setStoreSearchQuery: (query) => {
    set({ storeSearchQuery: query });
  },

  selectRegistrySkill: (slug) => {
    set({ selectedRegistrySlug: slug });
  },

  getInstalledSlugs: () => {
    return get().skills
      .filter((s) => s.registry_slug)
      .map((s) => s.registry_slug!);
  },

  getRecommendedSkills: () => {
    const installedSlugs = get().getInstalledSlugs();
    return get().registrySkills.filter((s) => !installedSlugs.includes(s.slug));
  },

  getFilteredRegistrySkills: () => {
    const { registrySkills, skills, storeCategory, storeSearchQuery } = get();
    const installedSlugs = skills
      .filter((s) => s.registry_slug)
      .map((s) => s.registry_slug!);

    let filtered = registrySkills;

    // Category filter
    if (storeCategory !== 'all') {
      filtered = filtered.filter((s) => s.category === storeCategory);
    }

    // Search filter
    if (storeSearchQuery.trim()) {
      const q = storeSearchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    const installed = filtered.filter((s) => installedSlugs.includes(s.slug));
    const recommended = filtered.filter((s) => !installedSlugs.includes(s.slug));

    return { installed, recommended };
  },

  // ─── Translation / 翻译 ───

  translationCache: {} as Record<string, string>,

  translateContent: async (content, cacheKey, targetLang) => {
    // Check cache first
    const cached = get().translationCache[cacheKey];
    if (cached) return cached;

    // Get AI config from settings store
    const settingsState = useSettingsStore.getState();
    const chatModels = settingsState.aiModels.filter((m) => (m.type ?? 'chat') === 'chat');
    const defaultModel = chatModels.find((m) => m.isDefault) ?? chatModels[0];

    const config = defaultModel
      ? {
          provider: defaultModel.provider,
          apiKey: defaultModel.apiKey,
          apiUrl: defaultModel.apiUrl,
          model: defaultModel.model,
          chatParams: defaultModel.chatParams as any,
        }
      : {
          provider: settingsState.aiProvider,
          apiKey: settingsState.aiApiKey,
          apiUrl: settingsState.aiApiUrl,
          model: settingsState.aiModel,
        };

    if (!config.apiKey || !config.apiUrl || !config.model) {
      throw new Error('AI_NOT_CONFIGURED');
    }

    try {
      const translationMode = settingsState.translationMode || 'immersive';

      const systemPrompt = translationMode === 'immersive'
        ? `You are a professional immersive translator. Your task is to produce a bilingual interleaved document.

Rules:
1. Process the input paragraph by paragraph (split by blank lines or headings).
2. For EACH paragraph/heading/list-block, output the ORIGINAL text first, then on the very next line output the translated version wrapped in an HTML tag: <t>translated text</t>
3. Preserve ALL markdown formatting, code blocks, and technical terms in both versions.
4. Do NOT translate code blocks — just keep them as-is without a <t>...</t> line.
5. Do NOT add any extra commentary, just the interleaved output.
6. Target language: ${targetLang}

Example input:
## Overview
This skill helps you write tests.

Example output:
## Overview
<t>## 概述</t>
This skill helps you write tests.
<t>此技能帮助你编写测试。</t>`
        : `You are a professional translator. Translate the following technical documentation to ${targetLang}. Preserve all markdown formatting, code blocks, and technical terms. Only output the translated text, nothing else.`;

      const result = await chatCompletion(config, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ], { temperature: 0.3, maxTokens: 8192 });

      const translated = result.content;
      if (translated) {
        set((state) => ({
          translationCache: { ...state.translationCache, [cacheKey]: translated },
        }));
        return translated;
      }
      return null;
    } catch (error) {
      console.error('Translation failed:', error);
      throw error;
    }
  },

  getTranslation: (cacheKey) => {
    return get().translationCache[cacheKey] || null;
  },
}),
    {
      name: 'skill-store',
      partialize: (state) => ({
        viewMode: state.viewMode,
        filterType: state.filterType,
        translationCache: state.translationCache,
      }),
    }
  )
);
