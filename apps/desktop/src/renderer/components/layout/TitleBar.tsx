import { MinusIcon, SquareIcon, XIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import appIconUrl from '../../../assets/icon.png';

/**
 * Windows 自定义标题栏组件
 * 仅在 Windows 平台显示
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const { t } = useTranslation();

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
    setIsMaximized((current) => !current);
  };

  const handleClose = () => {
    window.electron?.close?.();
  };

  return (
    <div className="h-8 app-wallpaper-panel-strong flex items-center justify-between select-none titlebar-drag border-b border-border">
      {/* 应用图标和标题 */}
      <div className="flex items-center gap-2 px-3">
        <img src={appIconUrl} alt="PromptHub" className="h-4 w-4 rounded-[4px]" />
        <span className="text-xs text-muted-foreground">PromptHub</span>
      </div>

      {/* 窗口控制按钮 */}
      <div className="flex h-full titlebar-no-drag">
        <button
          type="button"
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label={t('common.minimize', 'Minimize')}
          title={t('common.minimize', 'Minimize')}
        >
          <MinusIcon className="w-4 h-4 text-foreground/70" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label={
            isMaximized
              ? t('common.restore', 'Restore')
              : t('common.maximize', 'Maximize')
          }
          title={
            isMaximized
              ? t('common.restore', 'Restore')
              : t('common.maximize', 'Maximize')
          }
        >
          <SquareIcon className="w-3.5 h-3.5 text-foreground/70" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          aria-label={t('common.close', 'Close')}
          title={t('common.close', 'Close')}
        >
          <XIcon className="w-4 h-4 text-foreground/70 hover:text-white" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
