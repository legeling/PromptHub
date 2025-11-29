import { MinusIcon, SquareIcon, XIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

/**
 * Windows 自定义标题栏组件
 * 仅在 Windows 平台显示
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    // 检测是否为 Windows 平台
    const platform = navigator.userAgent.toLowerCase();
    setIsWindows(platform.includes('win'));
  }, []);

  // 非 Windows 平台不显示
  if (!isWindows) return null;

  const handleMinimize = () => {
    window.electron?.minimize?.();
  };

  const handleMaximize = () => {
    window.electron?.maximize?.();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electron?.close?.();
  };

  return (
    <div className="h-8 bg-background flex items-center justify-between select-none titlebar-drag border-b border-border">
      {/* 应用图标和标题 */}
      <div className="flex items-center gap-2 px-3">
        <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">P</span>
        </div>
        <span className="text-xs text-muted-foreground">PromptHub</span>
      </div>

      {/* 窗口控制按钮 */}
      <div className="flex h-full titlebar-no-drag">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-muted transition-colors"
          title="最小化"
        >
          <MinusIcon className="w-4 h-4 text-foreground/70" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-muted transition-colors"
          title={isMaximized ? '还原' : '最大化'}
        >
          <SquareIcon className="w-3.5 h-3.5 text-foreground/70" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          title="关闭"
        >
          <XIcon className="w-4 h-4 text-foreground/70 hover:text-white" />
        </button>
      </div>
    </div>
  );
}
