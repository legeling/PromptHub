import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, XCircleIcon, InfoIcon, AlertTriangleIcon, XIcon } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { MOTION_DURATION } from '../../styles/motion-tokens';

// Toast type
// Toast 类型
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /**
   * When true, the toast is in its exit animation. The DOM node remains
   * mounted for one duration-quick window so the fade-out / slide-out
   * classes have time to play before unmount.
   * 标记为 true 时，该 toast 处于退出动画阶段；DOM 节点会再保留一个
   * duration-quick 窗口让退场动画播完，然后才真正卸载。
   */
  leaving?: boolean;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, sendSystemNotification?: boolean) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// Toast Provider
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const enableNotifications = useSettingsStore((state) => state.enableNotifications);
  // Track timers so React strict-mode double-mount and rapid replacements
  // do not orphan setTimeout callbacks. Indexed by toast id.
  // 用 ref 记录定时器，避免 React strict-mode 双挂载与快速替换造成游离
  // setTimeout；以 toast id 为 key。
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Monotonic counter so two showToast calls inside the same millisecond
  // still get distinct ids (Date.now().toString() alone collides under
  // batched user actions).
  // 单调递增计数器，避免同一毫秒内连续 showToast 出现重复 id 与 React key
  // 冲突（仅靠 Date.now() 在批量操作下会撞 id）。
  const idCounter = useRef(0);

  const removeToast = useCallback((id: string) => {
    // Clear any pending auto-dismiss so we do not double-fire removeToast.
    // 清掉自动消失的定时器，避免之后再次触发 removeToast。
    const auto = autoDismissTimers.current.get(id);
    if (auto) {
      clearTimeout(auto);
      autoDismissTimers.current.delete(id);
    }
    // Already leaving? Don't restart the exit animation timer.
    // 已经处于退场状态就不再重置定时器，避免动画抖动。
    if (exitTimers.current.has(id)) return;
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
    );
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      exitTimers.current.delete(id);
    }, MOTION_DURATION.quick + 20); // small slack so the animation finishes
    exitTimers.current.set(id, timer);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', sendSystemNotification = false) => {
    idCounter.current += 1;
    const id = `${Date.now()}-${idCounter.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Send system notification (if enabled and requested)
    // 发送系统通知（如果启用且请求）
    if (sendSystemNotification && enableNotifications && window.electron?.showNotification) {
      const title =
        type === 'success'
          ? t('common.success', 'Success')
          : type === 'error'
            ? t('common.error', 'Error')
            : type === 'warning'
              ? t('common.warning', 'Warning')
              : t('common.info', 'Info');
      window.electron.showNotification(`PromptHub - ${title}`, message);
    }

    // Auto-dismiss after 3 seconds via the same exit-animation pipeline.
    // 3 秒后自动通过同一个退场动画管线消失。
    const dismiss = setTimeout(() => {
      autoDismissTimers.current.delete(id);
      removeToast(id);
    }, 3000);
    autoDismissTimers.current.set(id, dismiss);
  }, [enableNotifications, removeToast, t]);

  // Clean up timers on unmount.
  useEffect(() => {
    const exit = exitTimers.current;
    const auto = autoDismissTimers.current;
    return () => {
      exit.forEach((timer) => clearTimeout(timer));
      exit.clear();
      auto.forEach((timer) => clearTimeout(timer));
      auto.clear();
    };
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon aria-hidden="true" className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircleIcon aria-hidden="true" className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangleIcon aria-hidden="true" className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <InfoIcon aria-hidden="true" className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBgColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'info':
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container - z-index needs to be the highest to stay above everything */}
      {/* Toast 容器 - z-index 需要最高，确保在所有元素之上 */}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`
                flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl pointer-events-auto
                ${
                  toast.leaving
                    ? 'animate-out slide-out-to-right-10 fade-out duration-quick ease-exit'
                    : 'animate-in slide-in-from-right-10 fade-in duration-base ease-enter'
                }
                backdrop-blur-md
                ${getBgColor(toast.type)}
              `}
            >
              {getIcon(toast.type)}
              <span className="text-sm font-semibold text-foreground">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="ml-2 p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                aria-label={t('common.close', 'Close')}
                title={t('common.close') || 'Close'}
              >
                <XIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

// Hook
// Hook
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
