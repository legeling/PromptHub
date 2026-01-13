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

// Page type
// 页面类型
type PageType = 'home' | 'settings';

function App() {
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchFolders = useFolderStore((state) => state.fetchFolders);
  const folders = useFolderStore((state) => state.folders);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const movePrompts = usePromptStore((state) => state.movePrompts);
  const selectedIds = usePromptStore((state) => state.selectedIds);
  const applyTheme = useSettingsStore((state) => state.applyTheme);
  const debugMode = useSettingsStore((state) => state.debugMode);
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();
  
  // Update state
  // 更新状态
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [initialUpdateStatus, setInitialUpdateStatus] = useState<UpdateStatus | null>(null);
  
  // Close dialog state (Windows)
  // 关闭对话框状态（Windows）
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Update status (used for TopBar indicator)
  // 更新状态（用于顶部栏显示更新提示）
  const [updateAvailable, setUpdateAvailable] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    // Listen for update status
    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      // If update available, save status for TopBar indicator (don't auto-show dialog)
      if (status.status === 'available') {
        setUpdateAvailable(status);
        setInitialUpdateStatus(status);
        // Do not auto-show dialog; only show after user clicks TopBar indicator
        // 不再自动弹窗，用户点击顶部栏提示后才显示
        // setShowUpdateDialog(true);
      }
    };

    const offUpdaterStatus = window.electron?.updater?.onStatus(handleStatus);
    
    // Listen for close dialog trigger (Windows)
    // 监听关闭对话框触发（Windows）
    const handleShowCloseDialog = () => setShowCloseDialog(true);
    const offShowCloseDialog = window.electron?.onShowCloseDialog?.(handleShowCloseDialog);

    // Listen for global shortcut triggers
    // 监听全局快捷键触发
    const handleShortcutTriggered = (action: string) => {
      switch (action) {
        case 'newPrompt':
          // Dispatch custom event to trigger new prompt modal
          // 触发自定义事件以打开“新建 Prompt”弹窗
          window.dispatchEvent(new CustomEvent('shortcut:newPrompt'));
          break;
        case 'search':
          // Focus search input
          // 聚焦搜索输入框
          window.dispatchEvent(new CustomEvent('shortcut:search'));
          break;
        case 'settings':
          setCurrentPage('settings');
          break;
        // showApp is handled in main process
        // showApp 由主进程处理
      }
    };
    const offShortcutTriggered = window.electron?.onShortcutTriggered?.(handleShortcutTriggered);

    // Check for updates on startup and periodically
    // 启动时和周期性检查更新
    const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
    let updateCheckTimer: NodeJS.Timeout | null = null;
    let startupUpdateCheckTimer: NodeJS.Timeout | null = null;
    let isCheckingUpdate = false;

    const checkForUpdates = () => {
      const settings = useSettingsStore.getState();
      if (settings.autoCheckUpdate) {
        if (isCheckingUpdate) return;
        isCheckingUpdate = true;
        const p = window.electron?.updater?.check();
        if (p && typeof (p as any).finally === 'function') {
          (p as Promise<any>).finally(() => {
            isCheckingUpdate = false;
          });
        } else {
          isCheckingUpdate = false;
        }
      }
    };

    // Initial check after 3 seconds
    // 启动后 3 秒进行首次检查
    startupUpdateCheckTimer = setTimeout(checkForUpdates, 3000);

    // Periodic check every hour
    // 每小时周期性检查
    updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

    // Listen for manual check trigger - always force a fresh check
    // 监听手动检查触发（始终强制刷新检查状态）
    const handleOpenUpdate = () => {
       setInitialUpdateStatus(null);
       setUpdateAvailable(null); // Clear cached status
       setShowUpdateDialog(true);
    };
    window.addEventListener('open-update-dialog', handleOpenUpdate);

    return () => {
      // Cleanup Electron/IPC listeners to prevent leaks on unmount/remount
      // 清理 Electron/IPC 监听，避免卸载/重挂载导致重复触发
      if (typeof offUpdaterStatus === 'function') {
        offUpdaterStatus();
      } else {
        // Backward compatible fallback (may remove all updater listeners)
        // 兼容旧实现兜底（可能移除所有 updater 监听）
        window.electron?.updater?.offStatus?.();
      }
      if (typeof offShowCloseDialog === 'function') {
        offShowCloseDialog();
      }
      if (typeof offShortcutTriggered === 'function') {
        offShortcutTriggered();
      }

      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
      }
      if (startupUpdateCheckTimer) {
        clearTimeout(startupUpdateCheckTimer);
      }
      window.removeEventListener('open-update-dialog', handleOpenUpdate);
    };
  }, []);

  // Handle dragging a prompt into a folder
  // 处理 Prompt 拖拽到文件夹
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    // Check if a prompt is dragged into a folder
    // 检查是否是 Prompt 拖拽到文件夹
    const activeData = active.data.current;
    const overData = over.data.current;
    
    if (activeData?.type === 'prompt' && (overData?.type === 'folder' || overData?.type === 'folder-nest')) {
      const promptId = activeData.prompt.id;
      const folderId = overData.folderId;
      const folder = folders.find(f => f.id === folderId);
      
      // Determine prompts to move
      // 确定要移动的 prompts
      let promptsToMove = [promptId];
      
      // If the dragged prompt is part of the current selection, move all selected prompts
      // 如果拖拽的 Prompt 是当前选中项的一部分，则移动所有选中的 Prompts
      if (selectedIds.includes(promptId)) {
        promptsToMove = selectedIds;
      }
      
      // Update prompts folder
      // 更新 Prompts 的文件夹
      await movePrompts(promptsToMove, folderId);
      
      const count = promptsToMove.length;
      showToast(
        count > 1 
          ? `已将 ${count} 个 Prompt 移动到「${folder?.name || '文件夹'}」` 
          : `已移动到「${folder?.name || '文件夹'}」`,
        'success'
      );
    }
  };

  // Sync debug mode
  useEffect(() => {
    window.electron?.setDebugMode?.(debugMode);
  }, [debugMode]);

  useEffect(() => {
    // Apply persisted theme settings
    // 应用保存的主题设置
    applyTheme();
    
    // Sync language setting: use settings store as the source of truth (zh/zh-TW/en/ja/es/de/fr)
    // i18n reads from the persisted store on init, but we also apply it here as a fallback
    // 同步语言设置：以 settings store 为准（支持 zh/zh-TW/en/ja/es/de/fr）
    // i18n 初始化时会尝试从同一个 persist store 读取语言，但这里再兜底一次，避免初始化顺序导致的覆盖问题
    const languageSettings = useSettingsStore.getState();
    if (languageSettings.language && i18n.language !== languageSettings.language) {
      languageSettings.setLanguage(languageSettings.language);
    }
    
    // Initialize database, then load data
    // 初始化数据库，然后加载数据
    const init = async (retryCount = 0) => {
      // Set max loading time to avoid waiting forever
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
        // Retry once for timeout errors
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
      
      // Sync after startup (run after data is loaded; do not block UI)
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
              // Reload data after sync
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
    
    // Periodic auto sync
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
        {/* Windows title bar */}
        {/* Windows 标题栏 */}
        <TitleBar />
        
        <div className="flex flex-1 overflow-y-hidden overflow-x-visible">
          {/* Sidebar */}
          {/* 侧边栏 */}
          <Sidebar 
            currentPage={currentPage} 
            onNavigate={setCurrentPage} 
          />

          {/* Main content */}
          {/* 主内容区 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Top bar */}
            {/* 顶部栏 */}
            <TopBar 
              onOpenSettings={() => setCurrentPage('settings')} 
              updateAvailable={updateAvailable}
              onShowUpdateDialog={() => setShowUpdateDialog(true)}
            />
            
            {/* Page content */}
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
        
        {/* Windows close dialog */}
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
