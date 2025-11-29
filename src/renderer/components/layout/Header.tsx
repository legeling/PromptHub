import { SearchIcon, PlusIcon, SettingsIcon, SunIcon, MoonIcon } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt.store';
import { useState, useEffect } from 'react';
import { CreatePromptModal } from '../prompt/CreatePromptModal';
import { SettingsModal } from '../settings/SettingsModal';

export function Header() {
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const setSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const [isDark, setIsDark] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleCreatePrompt = (data: {
    title: string;
    description?: string;
    systemPrompt?: string;
    userPrompt: string;
    tags: string[];
  }) => {
    // TODO: 调用 API 创建 Prompt
    console.log('Creating prompt:', data);
  };

  useEffect(() => {
    // 检测系统主题
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(darkModeMediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    darkModeMediaQuery.addEventListener('change', handler);
    return () => darkModeMediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <header className="h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center gap-4 px-5 titlebar-drag sticky top-0 z-10">
      {/* 搜索框 - iOS 风格 */}
      <div className="flex-1 max-w-lg titlebar-no-drag">
        <div className="relative group">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="搜索 Prompt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              w-full h-10 pl-10 pr-4 rounded-xl
              bg-muted/50 border-0
              text-sm placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background
              transition-all duration-200
            "
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        {/* 新建按钮 - iOS 风格 */}
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="
            flex items-center gap-2 h-9 px-4 rounded-lg
            bg-primary text-white text-sm font-medium
            hover:bg-primary/90
            transition-colors duration-150
          "
        >
          <PlusIcon className="w-4 h-4" />
          <span>新建</span>
        </button>

        {/* 主题切换 */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="
            p-2 rounded-lg
            text-muted-foreground hover:text-foreground
            hover:bg-accent
            transition-colors duration-150
          "
        >
          {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
        </button>

        {/* 设置按钮 */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="
            p-2 rounded-lg
            text-muted-foreground hover:text-foreground
            hover:bg-accent
            transition-colors duration-150
          "
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>

      {/* 新建 Prompt 弹窗 */}
      <CreatePromptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreatePrompt}
      />

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </header>
  );
}
