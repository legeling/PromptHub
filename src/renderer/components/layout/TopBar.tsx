import { SearchIcon, PlusIcon, SettingsIcon, SunIcon, MoonIcon, DownloadIcon } from 'lucide-react';
import { UpdateStatus } from '../UpdateDialog';
import { usePromptStore } from '../../stores/prompt.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useFolderStore } from '../../stores/folder.store';
import { useState, useEffect, useRef } from 'react';
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
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const setDarkMode = useSettingsStore((state) => state.setDarkMode);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        {/* 搜索框 - 居中，整个区域可拖动，只有 input 不可拖动 */}
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-lg relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('header.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
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
