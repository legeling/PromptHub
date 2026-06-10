import { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={clsx(
          // Base styles
          // 基础样式
          'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-base',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          // Size
          // 尺寸
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-5 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          // Variants
          // 变体
          {
            'bg-primary text-white shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/30 hover:scale-[1.02] focus:ring-primary':
              variant === 'primary',
            'app-wallpaper-surface border border-border text-foreground hover:bg-accent focus:ring-border':
              variant === 'secondary',
            'bg-transparent text-foreground hover:bg-accent focus:ring-border':
              variant === 'ghost',
            'bg-destructive text-white shadow-sm shadow-destructive/25 hover:shadow-md hover:shadow-destructive/30 focus:ring-destructive':
              variant === 'danger',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
