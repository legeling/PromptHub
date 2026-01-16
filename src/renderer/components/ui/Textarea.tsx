import { forwardRef, TextareaHTMLAttributes, useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useSettingsStore } from '../../stores/settings.store';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, value, onChange, ...props }, ref) => {
    const showLineNumbers = useSettingsStore((state) => state.showLineNumbers);
    const [lineCount, setLineCount] = useState(1);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    // Calculate line count
    // 计算行数
    useEffect(() => {
      const text = String(value || '');
      const lines = text.split('\n').length;
      setLineCount(Math.max(lines, 1));
    }, [value]);

    // Sync scroll
    // 同步滚动
    const handleScroll = () => {
      if (lineNumbersRef.current && textareaRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    };

    // Merge refs
    // 合并 ref
    const setRefs = (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element;
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    };

    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className={clsx(
          'flex rounded-xl overflow-hidden',
          'bg-muted/50 border-0',
          'focus-within:ring-2 focus-within:ring-primary/30 focus-within:bg-background',
          'transition-all duration-200',
          error && 'ring-2 ring-destructive/50'
        )}>
          {/* Line numbers */}
          {/* 行号 */}
          {showLineNumbers && (
            <div
              ref={lineNumbersRef}
              className="flex-shrink-0 py-3 px-2 text-right text-sm text-muted-foreground select-none overflow-y-auto font-mono bg-muted/30 scrollbar-hide"
              style={{ minWidth: '3rem', lineHeight: '1.625' }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>
                  {i + 1}
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={setRefs}
            value={value}
            onChange={onChange}
            onScroll={handleScroll}
            className={clsx(
              'flex-1 min-h-[120px] py-3 bg-transparent border-0',
              showLineNumbers ? 'pl-2 pr-4' : 'px-4',
              'text-sm placeholder:text-muted-foreground',
              'focus:outline-none',
              'resize-none',
              'font-mono',
              className
            )}
            style={{ lineHeight: '1.625' }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
