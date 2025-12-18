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
import { UpdateDialog, UpdateStatus } from './components/UpdateDialog';
import { CloseDialog } from './components/ui/CloseDialog';

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
  
  // Update state
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [initialUpdateStatus, setInitialUpdateStatus] = useState<UpdateStatus | null>(null);
  
  // Close dialog state (Windows)
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // 更新状态（用于顶部栏显示更新提示）
  const [updateAvailable, setUpdateAvailable] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    // Listen for update status
    const handleStatus = (status: UpdateStatus) => {
      // If update available, save status for TopBar indicator (don't auto-show dialog)
      if (status.status === 'available') {
        setUpdateAvailable(status);
        setInitialUpdateStatus(status);
        // 不再自动弹窗，用户点击顶部栏提示后才显示
        // setShowUpdateDialog(true);
      }
    };

    window.electron?.updater?.onStatus(handleStatus);
    
    // Listen for close dialog trigger (Windows)
    window.electron?.onShowCloseDialog?.(() => {
      setShowCloseDialog(true);
    });

    // Listen for global shortcut triggers
    window.electron?.onShortcutTriggered?.((action: string) => {
      switch (action) {
        case 'newPrompt':
          // Dispatch custom event to trigger new prompt modal
          window.dispatchEvent(new CustomEvent('shortcut:newPrompt'));
          break;
        case 'search':
          // Focus search input
          window.dispatchEvent(new CustomEvent('shortcut:search'));
          break;
        case 'settings':
          setCurrentPage('settings');
          break;
        // showApp is handled in main process
      }
    });

    // Check for updates on startup and periodically
    const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
    let updateCheckTimer: NodeJS.Timeout | null = null;

    const checkForUpdates = () => {
      const settings = useSettingsStore.getState();
      if (settings.autoCheckUpdate) {
        window.electron?.updater?.check();
      }
    };

    // Initial check after 3 seconds
    setTimeout(checkForUpdates, 3000);

    // Periodic check every hour
    updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

    // Listen for manual check trigger - always force a fresh check
    const handleOpenUpdate = () => {
       setInitialUpdateStatus(null);
       setUpdateAvailable(null); // Clear cached status
       setShowUpdateDialog(true);
    };
    window.addEventListener('open-update-dialog', handleOpenUpdate);

    return () => {
      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
      }
      window.removeEventListener('open-update-dialog', handleOpenUpdate);
    };
  }, []);

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
    
    // 同步语言设置：以 settings store 为准（支持 zh/zh-TW/en/ja/es/de/fr）
    // i18n 初始化时会尝试从同一个 persist store 读取语言，但这里再兜底一次，避免初始化顺序导致的覆盖问题
    const languageSettings = useSettingsStore.getState();
    if (languageSettings.language && i18n.language !== languageSettings.language) {
      languageSettings.setLanguage(languageSettings.language);
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
            const result = await autoSync(
              {
                url: settings.webdavUrl,
                username: settings.webdavUsername,
                password: settings.webdavPassword,
              },
              {
                includeImages: settings.webdavIncludeImages,
                incrementalSync: settings.webdavIncrementalSync,
                encryptionPassword: settings.webdavEncryptionEnabled && settings.webdavEncryptionPassword ? settings.webdavEncryptionPassword : undefined,
              }
            );
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
          const result = await autoSync(
            {
              url: settings.webdavUrl,
              username: settings.webdavUsername,
              password: settings.webdavPassword,
            },
            {
              includeImages: settings.webdavIncludeImages,
              incrementalSync: settings.webdavIncrementalSync,
              encryptionPassword: settings.webdavEncryptionEnabled && settings.webdavEncryptionPassword ? settings.webdavEncryptionPassword : undefined,
            }
          );
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
            <TopBar 
              onOpenSettings={() => setCurrentPage('settings')} 
              updateAvailable={updateAvailable}
              onShowUpdateDialog={() => setShowUpdateDialog(true)}
            />
            
            {/* 页面内容 */}
            {currentPage === 'home' ? (
              <MainContent />
            ) : (
              <SettingsPage onBack={() => setCurrentPage('home')} />
            )}
          </div>
        </div>
        
        <UpdateDialog 
          isOpen={showUpdateDialog} 
          onClose={() => setShowUpdateDialog(false)} 
          initialStatus={initialUpdateStatus}
        />
        
        {/* Windows 关闭对话框 */}
        <CloseDialog
          isOpen={showCloseDialog}
          onClose={() => setShowCloseDialog(false)}
        />
      </div>
    </DndContext>
  );
}

export default App;
