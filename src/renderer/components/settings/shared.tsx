import { useState, useRef, memo } from "react";
import type { ReactNode } from "react";
import { EyeIcon, EyeOffIcon, XIcon, AlertTriangleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select } from "../ui/Select";

// Settings section component - flattened design
// 设置区块组件 - 扁平化设计
export function SettingSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="bg-card rounded-xl border border-border shadow-sm">
        {children}
      </div>
    </div>
  );
}

// Settings item component
// 设置项组件
export function SettingItem({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 last:border-0 transition-colors hover:bg-muted/20">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// Toggle switch component
// 开关组件
interface ToggleSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  defaultChecked = false,
}: ToggleSwitchProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;

  const handleClick = () => {
    const newValue = !isChecked;
    if (!isControlled) {
      setInternalChecked(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <button
      onClick={handleClick}
      className={`relative w-12 h-7 rounded-full transition-all duration-200 flex-shrink-0 border-2 ${
        isChecked
          ? "bg-primary border-primary"
          : "bg-muted border-border dark:bg-primary/20 dark:border-primary/40"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ${
          isChecked ? "bg-white" : "bg-muted-foreground/50 dark:bg-primary/60"
        }`}
        style={{ left: isChecked ? "22px" : "2px" }}
      />
    </button>
  );
}

// Reusable password input component - wrapped with React.memo for performance
// 可复用的密码输入组件 - 使用 React.memo 包装以提升性能
export const PasswordInput = memo(function PasswordInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-10 px-3 pr-10 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? (
          <EyeOffIcon className="w-4 h-4" />
        ) : (
          <EyeIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
});

// Shortcut input component - wrapped with React.memo for performance
// 快捷键输入组件 - 使用 React.memo 包装以提升性能
export const ShortcutItem = memo(function ShortcutItem({
  label,
  description,
  shortcut,
  onShortcutChange,
  onClear,
  conflict,
  mode,
  onModeChange,
}: {
  label: string;
  description: string;
  shortcut: string;
  onShortcutChange: (shortcut: string) => void;
  onClear: () => void;
  conflict?: string;
  mode?: "global" | "local";
  onModeChange?: (mode: "global" | "local") => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatShortcut = (shortcut: string) => {
    if (!shortcut) return t("settings.notSet");
    return shortcut
      .replace(
        "CommandOrControl",
        navigator.platform.includes("Mac") ? "⌘" : "Ctrl",
      )
      .replace("Control", navigator.platform.includes("Mac") ? "⌃" : "Ctrl")
      .replace("Alt", navigator.platform.includes("Mac") ? "⌥" : "Alt")
      .replace("Shift", navigator.platform.includes("Mac") ? "⇧" : "Shift")
      .replace("Meta", "⌘")
      .replace(/\+/g, " + ");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];
    if (e.metaKey || e.ctrlKey) keys.push("CommandOrControl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");

    const key = e.key.toUpperCase();
    if (!["CONTROL", "ALT", "SHIFT", "META"].includes(key)) {
      keys.push(key === " " ? "Space" : key);
    }

    setTempKeys(keys);

    // Finish recording when there are modifiers and a regular key
    // 如果有修饰键和普通键，完成录制
    if (
      keys.length >= 2 &&
      !["CONTROL", "ALT", "SHIFT", "META"].includes(key)
    ) {
      const shortcutStr = keys.join("+");
      setRecording(false);
      setTempKeys([]);
      onShortcutChange(shortcutStr);
    }
  };

  const handleBlur = () => {
    setRecording(false);
    setTempKeys([]);
  };

  return (
    <div className="flex items-center justify-between px-4 py-5 border-b border-border/50 last:border-0 transition-colors hover:bg-muted/10">
      <div className="flex-1 min-w-0 mr-8">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-1.5 leading-normal">
          {description}
        </div>
        {conflict && (
          <div className="text-xs text-red-500 mt-2 flex items-center gap-1.5 font-medium">
            <AlertTriangleIcon className="w-3.5 h-3.5" />
            {t("settings.conflictWith", { key: conflict })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        {mode && onModeChange && (
          <div className="w-[110px]">
            <Select
              value={mode}
              onChange={(value) => onModeChange(value as "global" | "local")}
              options={[
                { value: "global", label: t("settings.shortcutModeGlobal") },
                { value: "local", label: t("settings.shortcutModeLocal") },
              ]}
              className="h-9 text-xs"
            />
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={
            recording
              ? tempKeys.length > 0
                ? formatShortcut(tempKeys.join("+"))
                : t("settings.pressKeys")
              : formatShortcut(shortcut)
          }
          onFocus={() => setRecording(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`w-40 h-9 px-3 text-center text-xs font-medium rounded-md border shadow-sm cursor-pointer transition-all ${
            recording
              ? "border-primary ring-2 ring-primary/20 bg-primary/5 text-primary"
              : "border-input bg-card hover:bg-accent hover:text-accent-foreground"
          }`}
        />
        <div className="w-8 flex justify-center">
          {shortcut && (
            <button
              onClick={onClear}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title={t("settings.clearShortcut")}
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
