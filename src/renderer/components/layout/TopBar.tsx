import { SearchIcon, PlusIcon, SettingsIcon, SunIcon, MoonIcon, DownloadIcon, XIcon, ChevronUpIcon, ChevronDownIcon, SparklesIcon, EditIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { UpdateStatus } from '../UpdateDialog';
import { usePromptStore } from '../../stores/prompt.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useFolderStore } from '../../stores/folder.store';
import { useSkillStore } from '../../stores/skill.store';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CreatePromptModal } from '../prompt/CreatePromptModal';
import { QuickAddModal } from '../prompt/QuickAddModal';
import { CreateSkillModal } from '../skill/CreateSkillModal';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/ui.store';

interface TopBarProps {
  onOpenSettings: () => void;
  updateAvailable?: UpdateStatus | null;
  onShowUpdateDialog?: () => void;
}

export function TopBar({ onOpenSettings, updateAvailable, onShowUpdateDialog }: TopBarProps) {
  const { t } = useTranslation();
  // Prompt store
  const promptSearchQuery = usePromptStore((state) => state.searchQuery);
  const setPromptSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const prompts = usePromptStore((state) => state.prompts);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const createPrompt = usePromptStore((state) => state.createPrompt);
  
  // Skill store
  const skillSearchQuery = useSkillStore((state) => state.searchQuery);
  const setSkillSearchQuery = useSkillStore((state) => state.setSearchQuery);
  const getFilteredSkills = useSkillStore((state) => state.getFilteredSkills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const setDarkMode = useSettingsStore((state) => state.setDarkMode);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const creationMode = useSettingsStore((state) => state.creationMode);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const folders = useFolderStore((state) => state.folders);
  const uiViewMode = useUIStore((state) => state.viewMode);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isCreateSkillModalOpen, setIsCreateSkillModalOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  
  // Unified search query based on mode
  const searchQuery = uiViewMode === 'skill' ? skillSearchQuery : promptSearchQuery;
  const setSearchQuery = uiViewMode === 'skill' ? setSkillSearchQuery : setPromptSearchQuery;
  
  // Check if AI is configured
  const hasAiConfig = aiModels.length > 0 || (aiApiKey && aiApiKey.trim() !== '');

  // 计算 Prompt 搜索结果（与 MainContent 保持一致的逻辑）
  const promptSearchResults = useMemo(() => {
    if (uiViewMode !== 'prompt' || !promptSearchQuery.trim()) return [];

    const queryLower = promptSearchQuery.toLowerCase();
    const queryCompact = queryLower.replace(/\s+/g, '');
    const keywords = queryLower.split(/\s+/).filter((k) => k.length > 0);

    let filtered = prompts;

    // 如果在特定文件夹中，只搜索该文件夹
    if (selectedFolderId === 'favorites') {
      filtered = filtered.filter((p) => p.isFavorite);
    } else if (selectedFolderId) {
      filtered = filtered.filter((p) => p.folderId === selectedFolderId);
    } else {
      // 在"全部"视图中，隐藏私密文件夹内容
      const privateFolderIds = folders.filter(f => f.isPrivate).map(f => f.id);
      if (privateFolderIds.length > 0) {
        filtered = filtered.filter(p => !p.folderId || !privateFolderIds.includes(p.folderId));
      }
    }

    const isSubsequence = (needle: string, haystack: string) => {
      if (!needle) return true;
      if (needle.length > haystack.length) return false;
      let i = 0;
      for (let j = 0; j < haystack.length && i < needle.length; j++) {
        if (haystack[j] === needle[i]) i++;
      }
      return i === needle.length;
    };

    // 使用与 MainContent 相同的评分逻辑
    return filtered.map(p => {
      let score = 0;
      const titleLower = p.title.toLowerCase();
      const descLower = (p.description || '').toLowerCase();

      // 标题精确匹配
      if (titleLower === queryLower) score += 100;
      // 标题包含查询
      else if (titleLower.includes(queryLower)) score += 50;
      // 子序列匹配
      else if (queryCompact.length >= 2 && isSubsequence(queryCompact, titleLower.replace(/\s+/g, ''))) score += 30;

      // 描述包含查询
      if (descLower.includes(queryLower)) score += 20;

      // 所有关键词匹配
      const searchableText = [
        p.title,
        p.description || '',
        p.userPrompt,
        p.userPromptEn || '',
        p.systemPrompt || '',
        p.systemPromptEn || '',
      ].join(' ').toLowerCase();

      if (keywords.every(k => searchableText.includes(k))) {
        score += 10;
      }

      return { prompt: p, score };
    })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.prompt);
  }, [promptSearchQuery, prompts, selectedFolderId, folders, uiViewMode]);

  // 计算 Skill 搜索结果
  const skillSearchResults = useMemo(() => {
    if (uiViewMode !== 'skill') return [];
    return getFilteredSkills();
  }, [uiViewMode, skillSearchQuery, getFilteredSkills]);

  // 根据模式选择搜索结果
  const searchResults = uiViewMode === 'skill' ? skillSearchResults : promptSearchResults;
  const searchResultCount = searchResults.length;

  // 导航到上一个/下一个结果
  const navigateResult = useCallback((direction: 'prev' | 'next') => {
    if (searchResultCount === 0) return;

    let newIndex = currentResultIndex;
    if (direction === 'next') {
      newIndex = (currentResultIndex + 1) % searchResultCount;
    } else {
      newIndex = (currentResultIndex - 1 + searchResultCount) % searchResultCount;
    }
    setCurrentResultIndex(newIndex);
    
    if (uiViewMode === 'skill') {
      const skillResults = skillSearchResults;
      if (skillResults[newIndex]) {
        selectSkill(skillResults[newIndex].id);
      }
    } else {
      const promptResults = promptSearchResults;
      if (promptResults[newIndex]) {
        selectPrompt(promptResults[newIndex].id);
      }
    }
  }, [searchResultCount, currentResultIndex, selectPrompt, selectSkill, uiViewMode, skillSearchResults, promptSearchResults]);

  // 当搜索查询变化时重置索引并选中第一个结果
  useEffect(() => {
    setCurrentResultIndex(0);
    if (uiViewMode === 'skill') {
      if (skillSearchResults.length > 0) {
        selectSkill(skillSearchResults[0].id);
      }
    } else {
      if (promptSearchResults.length > 0) {
        selectPrompt(promptSearchResults[0].id);
      }
    }
  }, [searchQuery, uiViewMode]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && searchQuery && searchResultCount > 0) {
      e.preventDefault();
      navigateResult(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      searchInputRef.current?.blur();
    } else if (e.key === 'Enter' && searchResultCount > 0) {
      // Enter 确认选择当前结果
      if (uiViewMode === 'skill') {
        if (skillSearchResults[currentResultIndex]) {
          selectSkill(skillSearchResults[currentResultIndex].id);
        }
      } else {
        if (promptSearchResults[currentResultIndex]) {
          selectPrompt(promptSearchResults[currentResultIndex].id);
        }
      }
      searchInputRef.current?.blur();
    }
  };

  // Listen for shortcut events
  useEffect(() => {
    const handleNewPrompt = () => {
      setIsCreateModalOpen(true);
    };
    const handleSearch = () => {
      searchInputRef.current?.focus();
    };

    window.addEventListener('shortcut:newPrompt', handleNewPrompt);
    window.addEventListener('shortcut:search', handleSearch);

    return () => {
      window.removeEventListener('shortcut:newPrompt', handleNewPrompt);
      window.removeEventListener('shortcut:search', handleSearch);
    };
  }, []);

  // Click outside to close create menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false);
      }
    }
    
    // Listen for open-create-skill-modal event
    function handleOpenSkillModal() {
      setIsCreateSkillModalOpen(true);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('open-create-skill-modal', handleOpenSkillModal);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('open-create-skill-modal', handleOpenSkillModal);
    };
  }, []);

  const handleCreatePrompt = async (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    systemPromptEn?: string;
    userPrompt: string;
    userPromptEn?: string;
    tags?: string[];
    images?: string[];
    folderId?: string;
    source?: string;
  }) => {
    try {
      const prompt = await createPrompt({
        title: data.title,
        description: data.description,
        systemPrompt: data.systemPrompt,
        systemPromptEn: data.systemPromptEn,
        userPrompt: data.userPrompt,
        userPromptEn: data.userPromptEn,
        tags: data.tags || [],
        variables: [],
        images: data.images,
        folderId: data.folderId,
        source: data.source,
      });
      setIsCreateModalOpen(false);
      return prompt;
    } catch (error) {
      console.error('Failed to create prompt:', error);
      return null;
    }
  };

  const toggleTheme = () => {
    setDarkMode(!isDarkMode);
  };

  return (
    <>
      <header className="h-12 bg-card border-b border-border flex items-center px-4 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {/* 搜索框 - 居中，带清除按钮、结果计数和导航 */}
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-lg relative flex items-center">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={uiViewMode === 'skill' ? t('header.searchSkill', 'Search Skill...') : t('header.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-9 pl-9 pr-32 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
            {/* 右侧控件：结果计数 + 导航按钮 + 清除按钮 */}
            {searchQuery && (
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                {/* 结果计数 */}
                <span className="text-xs text-muted-foreground tabular-nums px-1">
                  {searchResultCount > 0
                    ? `${currentResultIndex + 1}/${searchResultCount}`
                    : t('header.noResults', '0 结果')
                  }
                </span>
                {/* 上下导航按钮 */}
                {searchResultCount > 1 && (
                  <>
                    <button
                      onClick={() => navigateResult('prev')}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title={t('header.prevResult', '上一个 (Shift+Tab)')}
                    >
                      <ChevronUpIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => navigateResult('next')}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title={t('header.nextResult', '下一个 (Tab)')}
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </>
                )}
                {/* 清除按钮 */}
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title={t('header.clearSearch', '清除搜索')}
                >
                  <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧操作按钮 - 只有按钮本身不可拖动 */}
        <div className="flex items-center gap-1 ml-4">
          {/* 更新提示 */}
          {updateAvailable && updateAvailable.status === 'available' && (
            <>
              <button
                onClick={onShowUpdateDialog}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-primary/50 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title={t('settings.updateAvailable')}
              >
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('settings.newVersion', { version: updateAvailable.info?.version })}</span>
              </button>
              <div className="w-px h-5 bg-border mx-1" />
            </>
          )}

          {/* Split Button for New Prompt / New Skill */}
          <div 
            ref={createMenuRef}
            className="flex items-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all ml-4 relative h-8" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={async () => {
                if (uiViewMode === 'skill') {
                  // Open Skill creation modal
                  setIsCreateSkillModalOpen(true);
                } else {
                  // Create Prompt
                  const mode = useSettingsStore.getState().creationMode;
                  if (mode === 'manual') setIsCreateModalOpen(true);
                  else setIsQuickAddModalOpen(true);
                }
              }}
              className="flex items-center gap-1.5 h-full pl-3 pr-2 text-sm font-medium border-r border-primary-foreground/20 active:scale-95 transition-transform"
            >
              {uiViewMode === 'skill' ? (
                <PlusIcon className="w-4 h-4" />
              ) : creationMode === 'manual' ? (
                <PlusIcon className="w-4 h-4" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
              <span>{uiViewMode === 'skill' ? t('header.new') : (creationMode === 'manual' ? t('header.new') : t('quickAdd.title'))}</span>
            </button>
            
            {uiViewMode === 'prompt' && (
            <>
            <button
              onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
              className="flex items-center justify-center h-full px-1.5 hover:bg-black/10 transition-colors rounded-r-lg"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            
            {isCreateMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-popover rounded-lg border border-border shadow-lg p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                  onClick={() => {
                    useSettingsStore.getState().setCreationMode('manual');
                    setIsCreateMenuOpen(false);
                  }}
                  className={clsx(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md",
                    creationMode === 'manual' && "bg-accent"
                  )}
                >
                  <PlusIcon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{t('header.new')}</span>
                    <span className="text-[10px] text-muted-foreground leading-none">{t('quickAdd.manualAddDesc') || '手动填写 Prompt 详细信息'}</span>
                  </div>
                  {creationMode === 'manual' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
                <div className="h-px bg-border my-1 mx-2 opacity-50" />
                <button
                  onClick={() => {
                    useSettingsStore.getState().setCreationMode('quick');
                    setIsCreateMenuOpen(false);
                  }}
                  className={clsx(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md",
                    creationMode === 'quick' && "bg-accent"
                  )}
                >
                  <SparklesIcon className="w-4 h-4 text-primary" />
                  <div className="flex flex-col items-start gap-0.5">
                     <span className="font-medium">{t('quickAdd.title')}</span>
                     <span className="text-[10px] text-muted-foreground leading-none">{t('quickAdd.desc') || '粘贴内容由 AI 智能分析并分类'}</span>
                  </div>
                  {creationMode === 'quick' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              </div>
            )}
            </>
            )}
          </div>

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {isDarkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 新建 Prompt 弹窗 */}
      <CreatePromptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreatePrompt}
        defaultFolderId={selectedFolderId || undefined}
      />
      
      {/* 快速添加弹窗 */}
      <QuickAddModal
        isOpen={isQuickAddModalOpen}
        onClose={() => setIsQuickAddModalOpen(false)}
        onCreate={handleCreatePrompt}
      />

      {/* 新建 Skill 弹窗 */}
      <CreateSkillModal
        isOpen={isCreateSkillModalOpen}
        onClose={() => setIsCreateSkillModalOpen(false)}
      />
    </>
  );
}
