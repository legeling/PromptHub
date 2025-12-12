import React from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, className = '', disabled = false }: CheckboxProps) {
  return (
    <label 
      className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        onChange(!checked);
      }}
    >
      <div className="relative flex items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          readOnly
          disabled={disabled}
        />
        <span
          className={`
            inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-background
            transition-colors duration-200
            peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary/50
            ${checked ? 'bg-primary border-primary' : 'hover:border-primary/50'}
          `}
          aria-hidden="true"
        >
          <svg
            className={`h-3 w-3 text-primary-foreground transition-opacity duration-200 ${checked ? 'opacity-100' : 'opacity-0'}`}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 6L5 9L10 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  );
}

