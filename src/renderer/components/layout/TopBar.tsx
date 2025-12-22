import { SearchIcon, PlusIcon, SettingsIcon, SunIcon, MoonIcon, DownloadIcon, XIcon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { UpdateStatus } from '../UpdateDialog';
import { usePromptStore } from '../../stores/prompt.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useFolderStore } from '../../stores/folder.store';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CreatePromptModal } from '../prompt/CreatePromptModal';
import { useTranslation } from 'react-i18next';

interface TopBarProps {
  onOpenSettings: () => void;
  updateAvailable?: UpdateStatus | null;
  onShowUpdateDialog?: () => void;
}

export function TopBar({ onOpenSettings, updateAvailable, onShowUpdateDialog }: TopBarProps) {
  const { t } = useTranslation();
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const setSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const prompts = usePromptStore((state) => state.prompts);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const setDarkMode = useSettingsStore((state) => state.setDarkMode);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const folders = useFolderStore((state) => state.folders);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // 计算搜索结果（与 MainContent 保持一致的逻辑）
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const queryLower = searchQuery.toLowerCase();
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
  }, [searchQuery, prompts, selectedFolderId, folders]);

  // 导航到上一个/下一个结果
  const navigateResult = useCallback((direction: 'prev' | 'next') => {
    if (searchResults.length === 0) return;

    let newIndex = currentResultIndex;
    if (direction === 'next') {
      newIndex = (currentResultIndex + 1) % searchResults.length;
    } else {
      newIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    }
    setCurrentResultIndex(newIndex);
    selectPrompt(searchResults[newIndex].id);
  }, [searchResults, currentResultIndex, selectPrompt]);

  // 当搜索查询变化时重置索引并选中第一个结果
  useEffect(() => {
    setCurrentResultIndex(0);
    if (searchResults.length > 0) {
      selectPrompt(searchResults[0].id);
    }
  }, [searchQuery]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && searchQuery && searchResults.length > 0) {
      e.preventDefault();
      navigateResult(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      searchInputRef.current?.blur();
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      // Enter 确认选择当前结果
      selectPrompt(searchResults[currentResultIndex].id);
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

  const handleCreatePrompt = async (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    systemPromptEn?: string;
    userPrompt: string;
    userPromptEn?: string;
    tags: string[];
    images?: string[];
    folderId?: string;
  }) => {
    try {
      await createPrompt({
        title: data.title,
        description: data.description,
        systemPrompt: data.systemPrompt,
        systemPromptEn: data.systemPromptEn,
        userPrompt: data.userPrompt,
        userPromptEn: data.userPromptEn,
        tags: data.tags,
        variables: [],
        images: data.images,
        folderId: data.folderId,
      });
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Failed to create prompt:', error);
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
              placeholder={t('header.search')}
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
                  {searchResults.length > 0
                    ? `${currentResultIndex + 1}/${searchResults.length}`
                    : t('header.noResults', '0 结果')
                  }
                </span>
                {/* 上下导航按钮 */}
                {searchResults.length > 1 && (
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

          {/* 新建按钮 */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <PlusIcon className="w-4 h-4" />
            <span>{t('header.new')}</span>
          </button>

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {isDarkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </button>

          {/* 设置按钮 */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <SettingsIcon className="w-4 h-4" />
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
    </>
  );
}
