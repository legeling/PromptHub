import { useEffect, useState } from 'react';
import { Sidebar, TopBar, MainContent, TitleBar } from './components/layout';
import { SettingsPage } from './components/settings';
import { usePromptStore } from './stores/prompt.store';
import { useFolderStore } from './stores/folder.store';
import { useSettingsStore } from './stores/settings.store';
import { initDatabase, seedDatabase } from './services/database';
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core';

// 页面类型
type PageType = 'home' | 'settings';

function App() {
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchFolders = useFolderStore((state) => state.fetchFolders);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const applyTheme = useSettingsStore((state) => state.applyTheme);
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [isLoading, setIsLoading] = useState(true);

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
      
      // 更新 Prompt 的文件夹
      updatePrompt(promptId, { folderId });
    }
  };

  useEffect(() => {
    // 应用保存的主题设置
    applyTheme();
    
    // 初始化数据库，然后加载数据
    const init = async () => {
      try {
        await initDatabase();
        await seedDatabase();
        await fetchPrompts();
        await fetchFolders();
        console.log('✅ App initialized');
      } catch (error) {
        console.error('❌ Init failed:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">加载中...</div>
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
