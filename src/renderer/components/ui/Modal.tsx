import { ReactNode, useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'fullscreen';
}

/**
 * Size mapping to CSS values for smooth transitions.
 * Use fixed units (px, vh, vw) to ensure browser can interpolate effectively.
 */
const SIZE_CONFIG = {
  sm: { maxWidth: '400px', height: 'auto', maxHeight: '85vh' },
  md: { maxWidth: '500px', height: 'auto', maxHeight: '85vh' },
  lg: { maxWidth: '600px', height: 'auto', maxHeight: '85vh' },
  xl: { maxWidth: '800px', height: 'auto', maxHeight: '85vh' },
  '2xl': { maxWidth: '1000px', height: 'auto', maxHeight: '85vh' },
  full: { maxWidth: '1200px', height: 'auto', maxHeight: '85vh' },
  // Fullscreen keeps 64px margin on all sides to avoid overlapping OS window controls
  fullscreen: { maxWidth: 'calc(100vw - 128px)', height: 'calc(100vh - 128px)', maxHeight: 'none' },
};

export function Modal({ isOpen, onClose, title, headerActions, children, size = 'md' }: ModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Detect macOS to handle window controls
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  }, []);

  // Handle mount/unmount animation logic
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Double requestAnimationFrame ensures the browser hits the starting state (opacity 0) 
      // before applying the entrance animation.
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const isFullscreen = size === 'fullscreen';
  const config = SIZE_CONFIG[size as keyof typeof SIZE_CONFIG] || SIZE_CONFIG.md;

  const modalContent = (
    <div
      className={clsx(
        'fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200 ease-in-out',
        // In fullscreen mode, use p-16 (64px) to move the entire modal box away from traffic lights
        isFullscreen ? 'p-16' : 'p-4'
      )}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Backdrop */}
      <div
        className={clsx(
          'absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-md transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className={clsx(
          'relative bg-card shadow-[0_0_100px_-20px_rgba(0,0,0,0.6)] border border-border',
          'overflow-hidden flex flex-col rounded-2xl',
          'transition-all duration-200 ease-out', // Faster transition without bounce
          // Mount/Unmount animation states (opacity + scale + drift)
          isAnimating 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 translate-y-4'
        )}
        style={{ 
          margin: 'auto',
          width: '100%',
          maxWidth: config.maxWidth,
          height: isFullscreen ? config.height : 'auto',
          maxHeight: config.maxHeight,
        }}
      >
        {/* Header / Title Bar */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 relative z-10 bg-card/90 backdrop-blur-sm">
            <div className="flex-1 min-w-0">
               <h2 className="text-xl font-bold tracking-tight text-foreground truncate">{title}</h2>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {headerActions}
              <div className="w-[1px] h-4 bg-border mx-1" />
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Form / Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
