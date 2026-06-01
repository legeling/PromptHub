import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, CheckIcon } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  labelText?: string; // Searchable/Accessibility text
  group?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  ariaLabel,
  triggerClassName,
  disabled = false,
}: SelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) {
      return;
    }

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const dropdownHeight = Math.min(280, Math.max(spaceBelow, spaceAbove, 160));
      const shouldOpenUpwards = spaceBelow < 160 && spaceAbove > spaceBelow;

      setDropdownStyle({
        top: shouldOpenUpwards
          ? Math.max(12, rect.top - dropdownHeight - 4)
          : Math.min(viewportHeight - dropdownHeight - 12, rect.bottom + 4),
        left: rect.left,
        width: rect.width,
        maxHeight: dropdownHeight,
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close when clicking outside
  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const clickedTrigger = containerRef.current?.contains(targetNode);
      const clickedDropdown = listRef.current?.contains(targetNode);

      if (!clickedTrigger && !clickedDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on ESC
  // 按 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  // Get current selected label
  // 获取当前选中项的标签
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder || t('common.select');

  // Group options
  // 按分组整理选项
  const groups = options.reduce((acc, opt) => {
    const group = opt.group || '';
    if (!acc[group]) acc[group] = [];
    acc[group].push(opt);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  const groupNames = Object.keys(groups);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      {/* 触发按钮 */}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={
          triggerClassName ??
          `
            w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm text-left
            flex items-center justify-between gap-2
            focus:outline-none focus:ring-2 focus:ring-primary/30
            transition-all duration-quick
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/80'}
            ${isOpen ? 'ring-2 ring-primary/30' : ''}
          `
        }
      >
        <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
          {displayLabel}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-muted-foreground transition-transform duration-base ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown menu */}
      {/* 下拉菜单 */}
      {isOpen && dropdownStyle && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={listRef}
              className="
                fixed min-w-[180px]
                bg-popover border border-border rounded-lg shadow-lg
                overflow-hidden animate-in fade-in-0 zoom-in-95 duration-quick ease-enter
              "
              style={{
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                width: dropdownStyle.width,
                maxHeight: dropdownStyle.maxHeight,
                overflowY: 'auto',
                zIndex: 9999,
              }}
            >
              {groupNames.length === 1 && groupNames[0] === '' ? (
                <div className="py-1">
                  {options.map((opt) => (
                    <OptionItem
                      key={opt.value}
                      option={opt}
                      isSelected={opt.value === value}
                      onSelect={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </div>
              ) : (
                groupNames.map((groupName, idx) => (
                  <div key={groupName || 'default'}>
                    {groupName && (
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
                        {groupName}
                      </div>
                    )}
                    <div className="py-1">
                      {groups[groupName].map((opt) => (
                        <OptionItem
                          key={opt.value}
                          option={opt}
                          isSelected={opt.value === value}
                          onSelect={() => {
                            onChange(opt.value);
                            setIsOpen(false);
                          }}
                        />
                      ))}
                    </div>
                    {idx < groupNames.length - 1 && <div className="border-t border-border" />}
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// Option item component
// 选项组件
function OptionItem({
  option,
  isSelected,
  onSelect,
}: {
  option: SelectOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full px-3 py-2 text-sm text-left
        flex items-center justify-between gap-2
        transition-colors duration-instant
        ${isSelected 
          ? 'bg-primary/10 text-primary font-medium' 
          : 'text-foreground hover:bg-muted/50'
        }
      `}
    >
      <span className="truncate">{option.label}</span>
      {isSelected && <CheckIcon className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}

export default Select;
