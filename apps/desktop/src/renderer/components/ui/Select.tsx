import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

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
  presentation?: "default" | "form" | "compact";
  dropdownWidth?: "default" | "trigger";
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  ariaLabel,
  triggerClassName,
  disabled = false,
  presentation = "default",
  dropdownWidth = "default",
}: SelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();
  const [dropdownStyle, setDropdownStyle] = useState<{
    top?: number;
    bottom?: number;
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
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 16);
      const spaceAbove = Math.max(0, rect.top - 16);
      const shouldOpenUpwards = spaceBelow < 160 && spaceAbove > spaceBelow;
      const width = Math.min(
        dropdownWidth === "trigger" ? rect.width : Math.max(180, rect.width),
        Math.max(0, window.innerWidth - 24),
      );

      setDropdownStyle({
        top: shouldOpenUpwards ? undefined : rect.bottom + 4,
        bottom: shouldOpenUpwards ? viewportHeight - rect.top + 4 : undefined,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
        maxHeight: Math.min(280, shouldOpenUpwards ? spaceAbove : spaceBelow),
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, dropdownWidth]);

  // Close when clicking outside
  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const clickedTrigger = containerRef.current?.contains(targetNode);
      const clickedDropdown = listRef.current?.contains(targetNode);

      if (!clickedTrigger && !clickedDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on ESC
  // 按 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  // Get current selected label
  // 获取当前选中项的标签
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel =
    selectedOption?.label || placeholder || t("common.select");

  // Group options
  // 按分组整理选项
  const groups = options.reduce(
    (acc, opt) => {
      const group = opt.group || "";
      if (!acc[group]) acc[group] = [];
      acc[group].push(opt);
      return acc;
    },
    {} as Record<string, SelectOption[]>,
  );

  const groupNames = Object.keys(groups);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      {/* 触发按钮 */}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={
          triggerClassName ??
          `
            w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm text-left
            flex items-center justify-between gap-2
            focus:outline-none focus:ring-2 focus:ring-primary/30
            transition-all duration-quick
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/80"}
            ${isOpen ? "ring-2 ring-primary/30" : ""}
          `
        }
      >
        <span
          className={`min-w-0 flex-1 overflow-hidden ${
            selectedOption ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {presentation === "compact" ? (
            <span className="grid">
              <span className="col-start-1 row-start-1">{displayLabel}</span>
              {options.map((option) => (
                <span
                  key={option.value}
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 h-0 overflow-hidden"
                >
                  {option.label}
                </span>
              ))}
            </span>
          ) : (
            displayLabel
          )}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown menu */}
      {/* 下拉菜单 */}
      {isOpen && dropdownStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              id={listboxId}
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              className={
                presentation === "form"
                  ? "fixed overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-quick ease-enter"
                  : "fixed overflow-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-[0_18px_48px_rgba(0,0,0,0.22)] animate-in fade-in-0 zoom-in-95 duration-quick ease-enter"
              }
              style={{
                top: dropdownStyle.top,
                bottom: dropdownStyle.bottom,
                left: dropdownStyle.left,
                width: dropdownStyle.width,
                maxHeight: dropdownStyle.maxHeight,
                overflowY: "auto",
                zIndex: 9999,
              }}
            >
              {groupNames.length === 1 && groupNames[0] === "" ? (
                <div>
                  {options.map((opt) => (
                    <OptionItem
                      key={opt.value}
                      option={opt}
                      isSelected={opt.value === value}
                      presentation={presentation}
                      onSelect={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </div>
              ) : (
                groupNames.map((groupName, idx) => (
                  <div key={groupName || "default"}>
                    {groupName && (
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
                        {groupName}
                      </div>
                    )}
                    <div>
                      {groups[groupName].map((opt) => (
                        <OptionItem
                          key={opt.value}
                          option={opt}
                          isSelected={opt.value === value}
                          presentation={presentation}
                          onSelect={() => {
                            onChange(opt.value);
                            setIsOpen(false);
                          }}
                        />
                      ))}
                    </div>
                    {idx < groupNames.length - 1 && (
                      <div className="border-t border-border" />
                    )}
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
  presentation,
  onSelect,
}: {
  option: SelectOption;
  isSelected: boolean;
  presentation: "default" | "form" | "compact";
  onSelect: () => void;
}) {
  const formPresentation = presentation === "form";

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      aria-label={option.labelText}
      onClick={onSelect}
      className={`
        w-full ${formPresentation ? "rounded-sm px-3 py-2.5" : presentation === "compact" ? "rounded-lg px-2.5 py-1.5" : "rounded-lg px-2.5 py-2"} text-sm text-left
        flex items-center justify-between gap-2
        transition-colors duration-instant
        ${
          isSelected
            ? formPresentation
              ? "bg-muted text-foreground font-medium"
              : "bg-primary/10 text-primary font-medium"
            : "text-foreground hover:bg-muted/60"
        }
      `}
    >
      <span className="min-w-0 flex-1 overflow-hidden">{option.label}</span>
      {isSelected && (
        <CheckIcon
          aria-hidden="true"
          className={`h-4 w-4 flex-shrink-0 ${formPresentation ? "text-primary" : ""}`}
        />
      )}
    </button>
  );
}

export default Select;
