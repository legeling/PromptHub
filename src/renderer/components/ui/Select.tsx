import { useState, useRef, useEffect } from 'react';
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
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select / 请选择',
  className = '',
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
  const displayLabel = selectedOption?.label || placeholder;

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
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm text-left
          flex items-center justify-between gap-2
          focus:outline-none focus:ring-2 focus:ring-primary/30
          transition-all duration-150
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/80'}
          ${isOpen ? 'ring-2 ring-primary/30' : ''}
        `}
      >
        <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
          {displayLabel}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown menu */}
      {/* 下拉菜单 */}
      {isOpen && (
        <div
          ref={listRef}
          className="
            absolute mt-1 w-full min-w-[180px]
            bg-popover border border-border rounded-lg shadow-lg
            overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150
          "
          style={{ maxHeight: '280px', overflowY: 'auto', zIndex: 9999 }}
        >
          {groupNames.length === 1 && groupNames[0] === '' ? (
            // No grouping
            // 无分组
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
            // With grouping
            // 有分组
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
        </div>
      )}
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
        transition-colors duration-100
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
