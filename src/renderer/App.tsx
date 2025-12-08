import { useEffect, useState } from 'react';
import { Sidebar, TopBar, MainContent, TitleBar } from './components/layout';
import { SettingsPage } from './components/settings';
import { usePromptStore } from './stores/prompt.store';
import { useFolderStore } from './stores/folder.store';
import { useSettingsStore } from './stores/settings.store';
import { initDatabase, seedDatabase } from './services/database';
import { autoSync } from './services/webdav';
import { useToast } from './components/ui/Toast';
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core';
import i18n from './i18n';

// 页面类型
type PageType = 'home' | 'settings';

function App() {
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchFolders = useFolderStore((state) => state.fetchFolders);
  const folders = useFolderStore((state) => state.folders);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const applyTheme = useSettingsStore((state) => state.applyTheme);
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  // 处理 Prompt 拖拽到文件夹
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    // 检查是否是 Prompt 拖拽到文件夹
    const activeData = active.data.current;
    const overData = over.data.current;
    
    if (activeData?.type === 'prompt' && overData?.type === 'folder') {
      const promptId = activeData.prompt.id;
      const folderId = overData.folderId;
      const folder = folders.find(f => f.id === folderId);
      
      // 更新 Prompt 的文件夹
      updatePrompt(promptId, { folderId });
      showToast(`已移动到「${folder?.name || '文件夹'}」`, 'success');
    }
  };

  useEffect(() => {
    // 应用保存的主题设置
    applyTheme();
    
    // 同步语言设置：确保 settings store 与 i18n 实际语言一致
    const currentLang = i18n.language === 'en' ? 'en' : 'zh';
    const storedLang = useSettingsStore.getState().language;
    if (storedLang !== currentLang) {
      useSettingsStore.getState().setLanguage(currentLang as 'zh' | 'en');
    }
    
    // 初始化数据库，然后加载数据
    const init = async (retryCount = 0) => {
      // 设置最大加载时间，防止无限等待
      const maxLoadingTime = setTimeout(() => {
        console.warn('⚠️ Loading timeout, showing UI anyway');
        setIsLoading(false);
      }, 5000);
      
      try {
        await initDatabase();
        await seedDatabase();
        await fetchPrompts();
        await fetchFolders();
        console.log('✅ App initialized');
      } catch (error) {
        console.error('❌ Init failed:', error);
        // 如果是超时错误，尝试重试一次
        if (retryCount < 1 && error instanceof Error && error.message.includes('timeout')) {
          console.log('🔄 Retrying database initialization...');
          await new Promise(resolve => setTimeout(resolve, 500));
          clearTimeout(maxLoadingTime);
          return init(retryCount + 1);
        }
      } finally {
        clearTimeout(maxLoadingTime);
        setIsLoading(false);
      }
      
      // 启动后同步（在数据加载完成后执行，不阻塞 UI）
      const settings = useSettingsStore.getState();
      if (settings.webdavEnabled && settings.webdavSyncOnStartup && 
          settings.webdavUrl && settings.webdavUsername && settings.webdavPassword) {
        const delay = (settings.webdavSyncOnStartupDelay || 10) * 1000;
        console.log(`🔄 Will sync with WebDAV in ${delay / 1000}s...`);
        setTimeout(async () => {
          try {
            const result = await autoSync({
              url: settings.webdavUrl,
              username: settings.webdavUsername,
              password: settings.webdavPassword,
            });
            if (result.success) {
              console.log('✅ Startup sync completed:', result.message);
              // 同步后重新加载数据
              await fetchPrompts();
              await fetchFolders();
            } else {
              console.log('⚠️ Startup sync failed:', result.message);
            }
          } catch (syncError) {
            console.error('⚠️ Startup sync error:', syncError);
          }
        }, delay);
      }
    };
    init();
    
    // 定时自动同步
    const settings = useSettingsStore.getState();
    let intervalId: NodeJS.Timeout | null = null;
    if (settings.webdavEnabled && settings.webdavAutoSyncInterval > 0 &&
        settings.webdavUrl && settings.webdavUsername && settings.webdavPassword) {
      const intervalMs = settings.webdavAutoSyncInterval * 60 * 1000;
      console.log(`🔄 Auto sync interval: ${settings.webdavAutoSyncInterval} minutes`);
      intervalId = setInterval(async () => {
        try {
          const result = await autoSync({
            url: settings.webdavUrl,
            username: settings.webdavUsername,
            password: settings.webdavPassword,
          });
          if (result.success) {
            console.log('✅ Interval sync completed:', result.message);
            await fetchPrompts();
            await fetchFolders();
          }
        } catch (e) {
          console.error('⚠️ Interval sync error:', e);
        }
      }, intervalMs);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-muted-foreground text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Windows 标题栏 */}
        <TitleBar />
        
        <div className="flex flex-1 overflow-hidden">
          {/* 侧边栏 */}
          <Sidebar 
            currentPage={currentPage} 
            onNavigate={setCurrentPage} 
          />

          {/* 主内容区 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* 顶部栏 */}
            <TopBar onOpenSettings={() => setCurrentPage('settings')} />
            
            {/* 页面内容 */}
            {currentPage === 'home' ? (
              <MainContent />
            ) : (
              <SettingsPage onBack={() => setCurrentPage('home')} />
            )}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

export default App;
