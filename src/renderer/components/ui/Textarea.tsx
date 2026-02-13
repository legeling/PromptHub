import { forwardRef, TextareaHTMLAttributes, useState, useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { useSettingsStore } from '../../stores/settings.store';

// Markdown list patterns
// Markdown 列表模式正则
const UNORDERED_LIST_PATTERN = /^(\s*)([-*+])\s(.*)$/;    // "- item", "* item", "+ item"
const ORDERED_LIST_PATTERN = /^(\s*)(\d+)\.\s(.*)$/;      // "1. item", "2. item"
const CHECKBOX_PATTERN = /^(\s*)([-*+])\s\[([ x])\]\s(.*)$/; // "- [ ] task", "- [x] task"

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** Enable Markdown list auto-continuation (-, *, +, 1., - [ ]) */
  /** 启用 Markdown 列表自动续行功能 */
  enableMarkdownList?: boolean;
}

/**
 * Handle Markdown list continuation in textarea
 * 处理 Textarea 中的 Markdown 列表续行
 */
export function handleMarkdownListKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange?: (newValue: string, cursorPos: number) => void
): boolean {
  // Only handle Enter key, skip if Shift is pressed
  // 只处理 Enter 键，如果按了 Shift 则跳过
  if (e.key !== 'Enter' || e.shiftKey) {
    return false;
  }

  const textarea = e.currentTarget;
  const { selectionStart, selectionEnd } = textarea;
  
  // Only handle when cursor is at end of selection (no text selected or cursor at end)
  // 只在光标在选择末尾时处理
  if (selectionStart !== selectionEnd) {
    return false;
  }

  // Get current line content
  // 获取当前行内容
  const beforeCursor = value.substring(0, selectionStart);
  const afterCursor = value.substring(selectionEnd);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  const currentLine = beforeCursor.substring(lineStart);
  
  // Check if cursor is at end of line (allow trailing spaces)
  // 检查光标是否在行尾（允许尾部空格）
  const lineEndIndex = afterCursor.indexOf('\n');
  const restOfLine = lineEndIndex === -1 ? afterCursor : afterCursor.substring(0, lineEndIndex);
  if (restOfLine.trim() !== '') {
    // Cursor not at end of line, don't handle
    // 光标不在行尾，不处理
    return false;
  }

  // Try to match checkbox list first (more specific)
  // 首先尝试匹配复选框列表（更具体）
  let match = currentLine.match(CHECKBOX_PATTERN);
  if (match) {
    const [, indent, marker, , content] = match;
    if (content.trim() === '') {
      // Empty checkbox item -> exit list mode
      // 空复选框项 -> 退出列表模式
      e.preventDefault();
      const newValue = value.substring(0, lineStart) + afterCursor.replace(/^\s*/, '');
      const newCursorPos = lineStart;
      onChange?.(newValue, newCursorPos);
      return true;
    } else {
      // Continue with new checkbox
      // 继续新的复选框
      e.preventDefault();
      const insertion = `\n${indent}${marker} [ ] `;
      const newValue = beforeCursor + insertion + afterCursor;
      const newCursorPos = selectionStart + insertion.length;
      onChange?.(newValue, newCursorPos);
      return true;
    }
  }

  // Try to match unordered list
  // 尝试匹配无序列表
  match = currentLine.match(UNORDERED_LIST_PATTERN);
  if (match) {
    const [, indent, marker, content] = match;
    if (content.trim() === '') {
      // Empty list item -> exit list mode
      // 空列表项 -> 退出列表模式
      e.preventDefault();
      const newValue = value.substring(0, lineStart) + afterCursor.replace(/^\s*/, '');
      const newCursorPos = lineStart;
      onChange?.(newValue, newCursorPos);
      return true;
    } else {
      // Continue with same marker
      // 继续使用相同的标记
      e.preventDefault();
      const insertion = `\n${indent}${marker} `;
      const newValue = beforeCursor + insertion + afterCursor;
      const newCursorPos = selectionStart + insertion.length;
      onChange?.(newValue, newCursorPos);
      return true;
    }
  }

  // Try to match ordered list
  // 尝试匹配有序列表
  match = currentLine.match(ORDERED_LIST_PATTERN);
  if (match) {
    const [, indent, numStr, content] = match;
    if (content.trim() === '') {
      // Empty list item -> exit list mode
      // 空列表项 -> 退出列表模式
      e.preventDefault();
      const newValue = value.substring(0, lineStart) + afterCursor.replace(/^\s*/, '');
      const newCursorPos = lineStart;
      onChange?.(newValue, newCursorPos);
      return true;
    } else {
      // Continue with incremented number
      // 继续使用递增的数字
      e.preventDefault();
      const nextNum = parseInt(numStr, 10) + 1;
      const insertion = `\n${indent}${nextNum}. `;
      const newValue = beforeCursor + insertion + afterCursor;
      const newCursorPos = selectionStart + insertion.length;
      onChange?.(newValue, newCursorPos);
      return true;
    }
  }

  return false;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, value, onChange, enableMarkdownList, onKeyDown, ...props }, ref) => {
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

    // Handle keydown for Markdown list continuation
    // 处理 Markdown 列表续行的键盘事件
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (enableMarkdownList) {
        const handled = handleMarkdownListKeyDown(
          e,
          String(value || ''),
          (newValue, cursorPos) => {
            // Create a synthetic event to call onChange
            // 创建合成事件来调用 onChange
            if (onChange && textareaRef.current) {
              const syntheticEvent = {
                target: { ...textareaRef.current, value: newValue },
                currentTarget: { ...textareaRef.current, value: newValue },
              } as React.ChangeEvent<HTMLTextAreaElement>;
              onChange(syntheticEvent);
              
              // Set cursor position after React updates the DOM
              // 在 React 更新 DOM 后设置光标位置
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.selectionStart = cursorPos;
                  textareaRef.current.selectionEnd = cursorPos;
                }
              });
            }
          }
        );
        if (handled) return;
      }
      
      // Call original onKeyDown if provided
      // 如果提供了原始的 onKeyDown 则调用它
      onKeyDown?.(e);
    }, [enableMarkdownList, value, onChange, onKeyDown]);

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
            onKeyDown={handleKeyDown}
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
